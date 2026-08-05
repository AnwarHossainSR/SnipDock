import { useEffect, useRef } from "react";
import type { DeleteReceipt } from "../../api/types";
import { Button } from "@/components/ui/button";

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
    <div className="fixed bottom-5 right-5 z-40 flex items-center gap-4 rounded-md border border-input bg-[var(--color-surface-raised)] px-4 py-3 text-[0.8rem] font-semibold text-foreground shadow-[var(--shadow-panel)]" role="status" aria-live="polite">
      <span>
        {receipt.item_count} {receipt.item_count === 1 ? "item" : "items"} removed
      </span>
      <Button className="h-auto min-h-0 border-primary/35 bg-accent px-3 py-2 text-primary" variant="outline" size="sm" type="button" disabled={busy} onClick={onUndo}>
        {busy ? "Restoring…" : "Undo"}
      </Button>
    </div>
  );
}
