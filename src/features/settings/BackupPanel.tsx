import { useState } from "react";
import { commands } from "../../api/commands";
import { Button } from "@/components/ui/button";

const fieldClass = "w-full rounded-sm border border-border bg-muted px-3 py-2 font-normal text-foreground focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring";
const labelClass = "grid gap-2 text-xs font-semibold text-muted-foreground";

export default function BackupPanel() {
  const [path, setPath] = useState("");
  const [restorePath, setRestorePath] = useState("");
  const [dryRun, setDryRun] = useState(true);
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState("");
  const [error, setError] = useState("");

  async function createBackup() {
    setBusy(true);
    setError("");
    try {
      const receipt = await commands.createBackup({ path, encrypted: false });
      setResult(`Backup created: ${receipt.path}. Checksum ${receipt.checksum}.`);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Backup failed.");
    } finally {
      setBusy(false);
    }
  }

  async function restoreBackup() {
    if (!dryRun && !window.confirm("Restore imports backup records into the library. Continue?")) {
      return;
    }
    setBusy(true);
    setError("");
    try {
      const report = await commands.restoreBackup({
        path: restorePath,
        passphrase: null,
        dry_run: dryRun,
      });
      setResult(`${dryRun ? "Restore preview" : "Restore"}: ${report.item_count} items, schema ${report.schema_version}. ${report.warnings.join(" ")}`);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Restore failed.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="mb-4 grid min-w-0 content-start gap-4 overflow-auto rounded-lg border border-border bg-card p-5" aria-labelledby="settings-backup-actions">
      <header className="flex items-start justify-between gap-4 border-b border-border pb-4">
        <div>
          <span className="text-xs font-bold uppercase tracking-[0.06em] text-primary">Backup</span>
          <h3 className="mt-1 text-xl font-semibold tracking-tight" id="settings-backup-actions">Manual backup and restore</h3>
        </div>
      </header>
      {error && <p className="text-xs text-destructive" role="alert">{error}</p>}
      {result && <p className="rounded-md border border-border bg-muted p-3 text-sm text-muted-foreground" role="status">{result}</p>}
      <label className={labelClass}>
        <span>Backup path</span>
        <input className={fieldClass} value={path} disabled={busy} onChange={(event) => setPath(event.target.value)} />
      </label>
      <div className="flex items-center gap-2">
        <Button type="button" disabled={busy || !path} onClick={() => void createBackup()}>
          Create backup
        </Button>
      </div>
      <label className={labelClass}>
        <span>Restore path</span>
        <input className={fieldClass} value={restorePath} disabled={busy} onChange={(event) => setRestorePath(event.target.value)} />
      </label>
      <label className="flex min-h-12 items-center justify-between gap-4 [&>span]:grid [&>span]:gap-1 [&_small]:font-normal [&_small]:text-muted-foreground" htmlFor="restore-dry-run">
        <span><strong>Dry-run restore</strong><small>Inspect backup contents without importing records.</small></span>
        <input className="accent-primary" id="restore-dry-run" aria-label="Dry-run restore" type="checkbox" checked={dryRun} disabled={busy} onChange={(event) => setDryRun(event.target.checked)} />
      </label>
      <div className="flex items-center gap-2">
        <Button variant="outline" type="button" disabled={busy || !restorePath} onClick={() => void restoreBackup()}>
          {dryRun ? "Preview restore" : "Restore"}
        </Button>
      </div>
    </section>
  );
}
