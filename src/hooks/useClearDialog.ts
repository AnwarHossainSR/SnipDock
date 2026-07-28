import { useCallback, useRef, useState } from "react";
import type { KeyboardEvent } from "react";
import { CommandError, commands } from "../api/commands";
import type { DeleteReceipt } from "../api/types";

interface ClearDialogCallbacks {
  onClearSuccess: (receipt: DeleteReceipt) => void;
  onClearItems: () => void;
  onSetActionError: (message: string) => void;
  onReload: () => void;
  onFocusHeading?: () => void;
}

export function useClearDialog(callbacks: ClearDialogCallbacks) {
  const [confirmClear, setConfirmClear] = useState(false);
  const [includePinned, setIncludePinned] = useState(false);
  const [includeFavorite, setIncludeFavorite] = useState(false);
  const [clearBusy, setClearBusy] = useState(false);
  const clearTrigger = useRef<HTMLButtonElement>(null);
  const confirmDialog = useRef<HTMLDivElement>(null);

  const closeClearDialog = useCallback(() => {
    clearTrigger.current?.focus();
    setConfirmClear(false);
  }, []);

  const clearHistory = useCallback(async () => {
    if (clearBusy) return;
    setClearBusy(true);
    confirmDialog.current?.focus();
    callbacks.onSetActionError("");
    try {
      const receipt = await commands.clearClipboardHistoryWithOptions(
        !includePinned,
        !includeFavorite,
      );
      callbacks.onClearItems();
      callbacks.onClearSuccess(receipt);
      closeClearDialog();
      setIncludePinned(false);
      setIncludeFavorite(false);
      await callbacks.onReload();
      callbacks.onFocusHeading?.();
    } catch (error) {
      closeClearDialog();
      callbacks.onSetActionError(
        error instanceof CommandError && error.code === "not_found"
          ? "Nothing to clear — the remaining items are pinned or favorite."
          : "Could not clear clipboard history.",
      );
    } finally {
      setClearBusy(false);
    }
  }, [
    clearBusy,
    includePinned,
    includeFavorite,
    callbacks,
    closeClearDialog,
  ]);

  const handleConfirmKeyDown = useCallback(
    (event: KeyboardEvent<HTMLDivElement>) => {
      if (event.key === "Escape" && !clearBusy) {
        event.preventDefault();
        closeClearDialog();
        return;
      }
      if (event.key !== "Tab") return;

      const focusable = Array.from(
        event.currentTarget.querySelectorAll<HTMLElement>(
          "input:not(:disabled), button:not(:disabled)",
        ),
      );
      const first = focusable[0];
      const last = focusable.at(-1);
      if (!first || !last) {
        event.preventDefault();
        event.currentTarget.focus();
        return;
      }
      if (
        (!event.shiftKey && document.activeElement === last) ||
        (event.shiftKey && document.activeElement === first)
      ) {
        event.preventDefault();
        (event.shiftKey ? last : first)?.focus();
      }
    },
    [clearBusy, closeClearDialog],
  );

  return {
    confirmClear,
    setConfirmClear,
    includePinned,
    setIncludePinned,
    includeFavorite,
    setIncludeFavorite,
    clearBusy,
    clearHistory,
    closeClearDialog,
    handleConfirmKeyDown,
    clearTrigger,
    confirmDialog,
  };
}
