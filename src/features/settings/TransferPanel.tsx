import { useState } from "react";
import { commands } from "../../api/commands";
import { Button } from "@/components/ui/button";

const fieldClass = "w-full rounded-sm border border-border bg-muted px-3 py-2 font-normal text-foreground focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring";
const labelClass = "grid gap-2 text-xs font-semibold text-muted-foreground";

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
    <section className="mb-4 grid min-w-0 content-start gap-4 overflow-auto rounded-lg border border-border bg-card p-5" aria-labelledby="settings-transfer">
      <header className="flex items-start justify-between gap-4 border-b border-border pb-4">
        <div>
          <span className="text-xs font-bold uppercase tracking-[0.06em] text-primary">Transfer</span>
          <h3 className="mt-1 text-xl font-semibold tracking-tight" id="settings-transfer">Import and export</h3>
        </div>
      </header>
      {error && <p className="text-xs text-destructive" role="alert">{error}</p>}
      {result && <p className="rounded-md border border-border bg-muted p-3 text-sm text-muted-foreground" role="status">{result}</p>}
      <div className="grid grid-cols-2 gap-3 max-[50rem]:grid-cols-1">
        <label className={labelClass}>
          <span>Export format</span>
          <select className={fieldClass} value={format} disabled={busy} onChange={(event) => setFormat(event.target.value)}>
            <option value="json">JSON</option>
            <option value="markdown">Markdown</option>
            <option value="text">Plain text</option>
          </select>
        </label>
        <label className={labelClass}>
          <span>Export path</span>
          <input className={fieldClass} value={exportPath} disabled={busy} onChange={(event) => setExportPath(event.target.value)} />
        </label>
      </div>
      <div className="flex items-center gap-2">
        <Button type="button" disabled={busy || !exportPath} onClick={() => void runExport()}>
          Export
        </Button>
      </div>
      <label className={labelClass}>
        <span>Import paths, one per line</span>
        <textarea className={`${fieldClass} min-h-20 resize-y`} value={importPaths} disabled={busy} onChange={(event) => setImportPaths(event.target.value)} />
      </label>
      <div className="grid grid-cols-2 gap-3 max-[50rem]:grid-cols-1">
        <label className={labelClass}>
          <span>Duplicate policy</span>
          <select className={fieldClass} value={duplicatePolicy} disabled={busy} onChange={(event) => setDuplicatePolicy(event.target.value)}>
            <option value="skip">Skip</option>
            <option value="keep_both">Keep both</option>
            <option value="replace">Replace</option>
          </select>
        </label>
        <label className="flex min-h-12 items-center justify-between gap-4 [&>span]:grid [&>span]:gap-1 [&_small]:font-normal [&_small]:text-muted-foreground" htmlFor="transfer-dry-run">
          <span><strong>Dry-run preview</strong><small>Inspect changes without writing records.</small></span>
          <input className="accent-primary" id="transfer-dry-run" aria-label="Dry-run preview" type="checkbox" checked={dryRun} disabled={busy} onChange={(event) => setDryRun(event.target.checked)} />
        </label>
      </div>
      <div className="flex items-center gap-2">
        <Button variant="outline" type="button" disabled={busy || !importPaths.trim()} onClick={() => void runImport()}>
          {dryRun ? "Preview import" : "Import"}
        </Button>
      </div>
    </section>
  );
}
