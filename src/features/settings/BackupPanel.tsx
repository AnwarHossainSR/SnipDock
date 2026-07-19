import { useState } from "react";
import { commands } from "../../api/commands";

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
    <section className="snippet-detail" aria-labelledby="settings-backup-actions">
      <header className="snippet-detail__header">
        <div>
          <span className="snippet-detail__kind">Backup</span>
          <h3 id="settings-backup-actions">Manual backup and restore</h3>
        </div>
      </header>
      {error && <p className="action-error" role="alert">{error}</p>}
      {result && <p className="template-preview__note" role="status">{result}</p>}
      <label className="snippet-editor__field">
        <span>Backup path</span>
        <input value={path} disabled={busy} onChange={(event) => setPath(event.target.value)} />
      </label>
      <div className="snippet-editor__actions">
        <button type="button" className="button-primary" disabled={busy || !path} onClick={() => void createBackup()}>
          Create backup
        </button>
      </div>
      <label className="snippet-editor__field">
        <span>Restore path</span>
        <input value={restorePath} disabled={busy} onChange={(event) => setRestorePath(event.target.value)} />
      </label>
      <label className="toggle-row" htmlFor="restore-dry-run">
        <span><strong>Dry-run restore</strong><small>Inspect backup contents without importing records.</small></span>
        <input id="restore-dry-run" aria-label="Dry-run restore" type="checkbox" checked={dryRun} disabled={busy} onChange={(event) => setDryRun(event.target.checked)} />
      </label>
      <div className="snippet-editor__actions">
        <button type="button" className="button-secondary" disabled={busy || !restorePath} onClick={() => void restoreBackup()}>
          {dryRun ? "Preview restore" : "Restore"}
        </button>
      </div>
    </section>
  );
}
