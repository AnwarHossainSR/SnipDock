import { useEffect } from "react";
import type { DeleteReceipt } from "../../api/types";

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
    const expiresAt = Date.parse(receipt.expires_at);
    const remaining = Number.isFinite(expiresAt)
      ? Math.max(0, expiresAt - Date.now())
      : 30_000;
    const timeout = window.setTimeout(
      onDismiss,
      Math.min(remaining, 2_147_483_647),
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
