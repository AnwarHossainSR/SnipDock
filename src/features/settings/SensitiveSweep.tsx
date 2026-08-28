import { useState } from "react";
import { commands } from "../../api/commands";
import { Button } from "@/components/ui/button";
import { SegmentedRadio } from "@/components/ui/radio-group";

type Age = "0" | "60" | "1440";

const ageOptions: { value: Age; label: string }[] = [
  { value: "0", label: "Everything" },
  { value: "60", label: "Older than 1h" },
  { value: "1440", label: "Older than a day" },
];

/**
 * Sweeps captures the backend recognises as credentials - passwords, API keys,
 * tokens, private keys, connection strings, card numbers. The sweep lands in
 * the trash under one receipt, so the Undo below can take it back.
 */
export default function SensitiveSweep() {
  const [age, setAge] = useState<Age>("0");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [swept, setSwept] = useState<{ count: number; receiptId: string | null } | null>(null);
  const [restored, setRestored] = useState(false);

  async function sweep() {
    setBusy(true);
    setError("");
    setRestored(false);
    try {
      const result = await commands.clearSensitiveData(Number(age));
      setSwept({ count: result.cleared_count, receiptId: result.receipt_id });
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Nothing was swept.");
    } finally {
      setBusy(false);
    }
  }

  async function undo(receiptId: string) {
    setBusy(true);
    setError("");
    try {
      await commands.restoreItem(receiptId);
      setSwept(null);
      setRestored(true);
    } catch {
      // The 30-second window is the same one the clipboard undo uses, and it
      // is the only thing that can have run out here.
      setError("That sweep can no longer be undone.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="grid gap-3 rounded-sm border border-border bg-muted p-4">
      <div className="grid gap-0.5">
        <span className="text-sm font-semibold text-foreground">Clear saved credentials</span>
        <span className="text-xs leading-snug text-muted-foreground">
          Removes captures that look like passwords, API keys, tokens, private keys, connection
          strings, or card numbers. Captures you marked private are left alone.
        </span>
      </div>

      <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-2">
        <span className="text-xs font-semibold text-muted-foreground">How far back to sweep</span>
        <SegmentedRadio
          name="sensitive-age"
          ariaLabel="How far back to sweep"
          value={age}
          options={ageOptions}
          onChange={setAge}
          disabled={busy}
        />
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <Button type="button" variant="outline" disabled={busy} onClick={() => void sweep()}>
          {busy ? "Working…" : "Clear now"}
        </Button>
        {swept && swept.count > 0 && swept.receiptId && (
          <Button type="button" variant="ghost" size="sm" disabled={busy} onClick={() => void undo(swept.receiptId!)}>
            Undo
          </Button>
        )}
        {swept && (
          <span className="text-xs text-muted-foreground" role="status">
            {swept.count === 0
              ? "Nothing matched."
              : `${swept.count} ${swept.count === 1 ? "capture" : "captures"} cleared. Undo is open for 30 seconds.`}
          </span>
        )}
        {restored && (
          <span className="text-xs text-muted-foreground" role="status">
            Put back.
          </span>
        )}
      </div>

      {error && (
        <p role="alert" className="m-0 text-sm text-destructive">
          {error}
        </p>
      )}
    </div>
  );
}
