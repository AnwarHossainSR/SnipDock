import { useCallback, useState } from "react";
import { commands } from "../api/commands";
import type { DeleteReceipt, LibraryItem } from "../api/types";

interface ActionCallbacks {
  onReplaceItem: (item: LibraryItem) => void;
  onRemoveItem: (id: string) => void;
  onRemoveItems: (ids: Set<string>) => void;
  onSetUndoReceipt: (receipt: DeleteReceipt) => void;
  onSetActionMessage: (message: string) => void;
  onSetActionError: (message: string) => void;
}

export function useClipboardActions(callbacks: ActionCallbacks) {
  const [busyId, setBusyId] = useState<string | null>(null);
  const [deleteSelectedBusy, setDeleteSelectedBusy] = useState(false);

  const runItemAction = useCallback(
    async <T>(
      id: string,
      command: () => Promise<T>,
      apply: (result: T) => void,
    ) => {
      setBusyId(id);
      callbacks.onSetActionError("");
      try {
        apply(await command());
      } catch {
        callbacks.onSetActionError("Could not update this clipboard item.");
      } finally {
        setBusyId(null);
      }
    },
    [callbacks],
  );

  const copyItem = useCallback(
    (item: LibraryItem) => {
      void runItemAction(
        item.id,
        () => commands.copyItem(item.id, "raw"),
        () => callbacks.onSetActionMessage("Copied to clipboard"),
      );
    },
    [runItemAction, callbacks],
  );

  const togglePin = useCallback(
    (item: LibraryItem) => {
      void runItemAction(
        item.id,
        () =>
          commands.setItemFlags(item.id, {
            pinned: !item.pinned,
            favorite: null,
            archived: null,
          }),
        callbacks.onReplaceItem,
      );
    },
    [runItemAction, callbacks],
  );

  const toggleFavorite = useCallback(
    (item: LibraryItem) => {
      void runItemAction(
        item.id,
        () =>
          commands.setItemFlags(item.id, {
            pinned: null,
            favorite: !item.favorite,
            archived: null,
          }),
        callbacks.onReplaceItem,
      );
    },
    [runItemAction, callbacks],
  );

  const deleteItem = useCallback(
    (item: LibraryItem) => {
      if (busyId || deleteSelectedBusy) return;
      void runItemAction(
        item.id,
        () => commands.deleteItem(item.id),
        (receipt) => {
          callbacks.onRemoveItem(item.id);
          callbacks.onSetUndoReceipt(receipt);
        },
      );
    },
    [busyId, deleteSelectedBusy, runItemAction, callbacks],
  );

  const deleteSelectedItems = useCallback(
    async (selectedIds: Set<string>) => {
      if (selectedIds.size === 0 || deleteSelectedBusy || busyId) return;
      setDeleteSelectedBusy(true);
      callbacks.onSetActionError("");
      try {
        const ids = Array.from(selectedIds);
        const receipt = await commands.deleteItems(ids);
        callbacks.onRemoveItems(selectedIds);
        callbacks.onSetUndoReceipt(receipt);
      } catch {
        callbacks.onSetActionError("Could not delete selected items.");
      } finally {
        setDeleteSelectedBusy(false);
      }
    },
    [deleteSelectedBusy, busyId, callbacks],
  );

  return {
    busyId,
    deleteSelectedBusy,
    copyItem,
    togglePin,
    toggleFavorite,
    deleteItem,
    deleteSelectedItems,
  };
}
