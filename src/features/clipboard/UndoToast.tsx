import { useEffect } from "react";
import type { DeleteReceipt } from "../../api/types";

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
  useEffect(() => {
    const timeout = window.setTimeout(
      onDismiss,
      getUndoToastDuration(receipt.expires_at),
    );
    return () => window.clearTimeout(timeout);
  }, [onDismiss, receipt.expires_at]);

  return (
    <div className="undo-toast" role="status" aria-live="polite">
      <span>
        {receipt.item_count} {receipt.item_count === 1 ? "item" : "items"} removed
      </span>
      <button type="button" disabled={busy} onClick={onUndo}>
        {busy ? "Restoring…" : "Undo"}
      </button>
    </div>
  );
}
