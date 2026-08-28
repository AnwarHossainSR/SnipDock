import { useCallback, useRef, useState } from "react";
import type { KeyboardEvent } from "react";
import { CommandError, commands } from "../api/commands";
import type { ContentType, DeleteReceipt } from "../api/types";

/**
 * Which captures a clear sweep touches. "images" and "text" send the matching
 * content types to the backend; "all" sends none, which clears every type.
 */
export type ClearScope = "all" | "images" | "text";

const IMAGE_TYPES: ContentType[] = ["image"];
const TEXT_TYPES: ContentType[] = [
  "plain_text", "code", "json", "sql", "html", "css", "xml", "shell",
  "markdown", "config",
];

export function contentTypesForScope(scope: ClearScope): ContentType[] {
  switch (scope) {
    case "images":
      return IMAGE_TYPES;
    case "text":
      return TEXT_TYPES;
    default:
      return [];
  }
}

interface ClearDialogCallbacks {
  onClearSuccess: (receipt: DeleteReceipt) => void;
  onClearItems: () => void;
  onSetActionError: (message: string) => void;
  onReload: () => void;
  onFocusHeading?: () => void;
}

function emptyScopeMessage(scope: ClearScope): string {
  switch (scope) {
    case "images":
      return "Nothing to clear — there are no images left, or the ones left are pinned or favorite.";
    case "text":
      return "Nothing to clear — there is no text left, or the text left is pinned or favorite.";
    default:
      return "Nothing to clear — the remaining items are pinned or favorite.";
  }
}

export function useClearDialog(callbacks: ClearDialogCallbacks) {
  const [confirmClear, setConfirmClear] = useState(false);
  const [includePinned, setIncludePinned] = useState(false);
  const [includeFavorite, setIncludeFavorite] = useState(false);
  const [scope, setScope] = useState<ClearScope>("all");
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
        contentTypesForScope(scope),
      );
      callbacks.onClearItems();
      callbacks.onClearSuccess(receipt);
      setConfirmClear(false);
      setIncludePinned(false);
      setIncludeFavorite(false);
      setScope("all");
      await callbacks.onReload();
      callbacks.onFocusHeading?.();
    } catch (error) {
      setConfirmClear(false);
      const isNotFound =
        (error instanceof CommandError && error.code === "not_found") ||
        (error instanceof Error && error.message?.includes("not_found")) ||
        (error instanceof Error && error.message?.includes("item not found"));
      callbacks.onSetActionError(
        isNotFound
          ? emptyScopeMessage(scope)
          : "Could not clear clipboard history.",
      );
      callbacks.onFocusHeading?.();
    } finally {
      setClearBusy(false);
    }
  }, [
    clearBusy,
    includePinned,
    includeFavorite,
    scope,
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
    scope,
    setScope,
    clearBusy,
    clearHistory,
    closeClearDialog,
    handleConfirmKeyDown,
    clearTrigger,
    confirmDialog,
  };
}
