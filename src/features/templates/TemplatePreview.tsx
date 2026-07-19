import type { Diagnostic, RenderTemplateResult } from "../../api/types";

interface TemplatePreviewProps {
  result: RenderTemplateResult | null;
  rendering: boolean;
  error: string;
  busy: boolean;
  message: string;
  onCopy: () => void;
  onSaveSnippet: () => void;
}

function diagnosticText(diagnostic: Diagnostic) {
  if (diagnostic.line === null) return diagnostic.message;
  const column = diagnostic.column === null ? "" : `, column ${diagnostic.column}`;
  return `${diagnostic.message} (line ${diagnostic.line}${column})`;
}

export default function TemplatePreview({ result, rendering, error, busy, message, onCopy, onSaveSnippet }: TemplatePreviewProps) {
  const output = result?.output ?? "";
  const missing = result?.missing ?? [];
  const diagnostics = result?.diagnostics ?? [];

  return (
    <section className="template-preview" aria-label="Template preview">
      <div className="template-preview__status">
        <h3>Preview</h3>
        {rendering && <span className="type-badge" role="status">Rendering...</span>}
        {!rendering && result?.output && <span className="type-badge">Ready to copy</span>}
        {!rendering && !result?.output && <span className="type-badge">Needs values</span>}
      </div>
      {error && <p className="action-error" role="alert">{error}</p>}
      {missing.length > 0 && (
        <p className="template-preview__note" role="status">
          Missing {missing.join(", ")}
        </p>
      )}
      {diagnostics.length > 0 && (
        <div role="alert">
          {diagnostics.map((diagnostic, index) => (
            <p className="action-error" key={`${diagnostic.message}-${index}`}>
              {diagnosticText(diagnostic)}
            </p>
          ))}
        </div>
      )}
      <pre className="snippet-detail__content">
        {output || "Complete every placeholder to preview rendered text."}
      </pre>
      <div className="snippet-editor__actions"><button type="button" className="button-primary" disabled={!output || busy} onClick={onCopy}>Copy rendered</button><button type="button" className="button-secondary" disabled={!output || busy} onClick={onSaveSnippet}>Save as snippet</button></div>
      <p className="sr-only" aria-live="polite">{message}</p>
    </section>
  );
}
