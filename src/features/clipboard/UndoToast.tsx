import { useEffect, useRef } from "react";
import type { DeleteReceipt } from "../../api/types";
import { Toast, ToastAction } from "@/components/ui/toast";

const UNDO_TOAST_DURATION_MS = 5_000;

export function getUndoToastDuration(expiresAt: string, now = Date.now()) {
  const expiry = Date.parse(expiresAt);
  return Number.isFinite(expiry)
    ? Math.min(Math.max(0, expiry - now), UNDO_TOAST_DURATION_MS)
    : UNDO_TOAST_DURATION_MS;
}

export default function UndoToast({
  receipt,
  busy,
  onUndo,
  onDismiss,
}: {
  receipt: DeleteReceipt;
  busy: boolean;
  onUndo: () => void;
  onDismiss: () => void;
}) {
  // Use a ref so the timeout always fires the latest onDismiss without
  // being reset when the parent re-renders with a new function identity.
  const onDismissRef = useRef(onDismiss);
  onDismissRef.current = onDismiss;

  useEffect(() => {
    const timeout = window.setTimeout(
      () => onDismissRef.current(),
      getUndoToastDuration(receipt.expires_at),
    );
    return () => window.clearTimeout(timeout);
  }, [receipt.expires_at]);

  return (
    <Toast
      action={
        <ToastAction disabled={busy} onClick={onUndo}>
          {busy ? "Restoring…" : "Undo"}
        </ToastAction>
      }
    >
      {receipt.item_count} {receipt.item_count === 1 ? "item" : "items"} removed
    </Toast>
  );
}
