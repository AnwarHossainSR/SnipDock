import { useState } from "react";
import { commands } from "../../api/commands";

export default function TransferPanel() {
  const [format, setFormat] = useState("json");
  const [exportPath, setExportPath] = useState("");
  const [importPaths, setImportPaths] = useState("");
  const [duplicatePolicy, setDuplicatePolicy] = useState("skip");
  const [dryRun, setDryRun] = useState(true);
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState("");
  const [error, setError] = useState("");

  async function runExport() {
    setBusy(true);
    setError("");
    try {
      const receipt = await commands.exportData({
        format,
        item_ids: [],
        project_ids: [],
        path: exportPath,
      });
      setResult(`Exported ${receipt.item_count} items to ${receipt.path}. ${receipt.warnings.join(" ")}`);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Export failed.");
    } finally {
      setBusy(false);
    }
  }

  async function runImport() {
    if (duplicatePolicy === "replace" && !window.confirm("Replace mode can update matching records. Continue?")) {
      return;
    }
    setBusy(true);
    setError("");
    try {
      const report = await commands.importData({
        paths: importPaths.split(/\r?\n/).map((path) => path.trim()).filter(Boolean),
        duplicate_policy: duplicatePolicy,
        dry_run: dryRun,
      });
      setResult(
        `${dryRun ? "Preview" : "Import"}: ${report.created} created, ${report.updated} updated, ${report.skipped} skipped. ${report.warnings.join(" ")}`,
      );
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Import failed.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="snippet-detail" aria-labelledby="settings-transfer">
      <header className="snippet-detail__header">
        <div>
          <span className="snippet-detail__kind">Transfer</span>
          <h3 id="settings-transfer">Import and export</h3>
        </div>
      </header>
      {error && <p className="action-error" role="alert">{error}</p>}
      {result && <p className="template-preview__note" role="status">{result}</p>}
      <div className="settings-grid">
        <label className="snippet-editor__field">
          <span>Export format</span>
          <select value={format} disabled={busy} onChange={(event) => setFormat(event.target.value)}>
            <option value="json">JSON</option>
            <option value="markdown">Markdown</option>
            <option value="text">Plain text</option>
            <option value="project">Project collection</option>
          </select>
        </label>
        <label className="snippet-editor__field">
          <span>Export path</span>
          <input value={exportPath} disabled={busy} onChange={(event) => setExportPath(event.target.value)} />
        </label>
      </div>
      <div className="snippet-editor__actions">
        <button type="button" className="button-primary" disabled={busy || !exportPath} onClick={() => void runExport()}>
          Export
        </button>
      </div>
      <label className="snippet-editor__field">
        <span>Import paths, one per line</span>
        <textarea value={importPaths} disabled={busy} onChange={(event) => setImportPaths(event.target.value)} />
      </label>
      <div className="settings-grid">
        <label className="snippet-editor__field">
          <span>Duplicate policy</span>
          <select value={duplicatePolicy} disabled={busy} onChange={(event) => setDuplicatePolicy(event.target.value)}>
            <option value="skip">Skip</option>
            <option value="keep_both">Keep both</option>
            <option value="replace">Replace</option>
          </select>
        </label>
        <label className="snippet-editor__field checkbox-line">
          <span>
            <input type="checkbox" checked={dryRun} disabled={busy} onChange={(event) => setDryRun(event.target.checked)} />
            {" "}Dry-run preview
          </span>
        </label>
      </div>
      <div className="snippet-editor__actions">
        <button type="button" className="button-primary" disabled={busy || !importPaths.trim()} onClick={() => void runImport()}>
          {dryRun ? "Preview import" : "Import"}
        </button>
      </div>
    </section>
  );
}
