import type { Diagnostic, RenderTemplateResult } from "../../lib/types";

interface TemplatePreviewProps {
  result: RenderTemplateResult | null;
  rendering: boolean;
  error: string;
}

function diagnosticText(diagnostic: Diagnostic) {
  if (diagnostic.line === null) return diagnostic.message;
  const column = diagnostic.column === null ? "" : `, column ${diagnostic.column}`;
  return `${diagnostic.message} (line ${diagnostic.line}${column})`;
}

export default function TemplatePreview({ result, rendering, error }: TemplatePreviewProps) {
  const output = result?.output ?? "";
  const missing = result?.missing ?? [];
  const diagnostics = result?.diagnostics ?? [];

  return (
    <section className="template-preview" aria-label="Template preview">
      <div className="template-preview__status">
        <h3>Preview</h3>
        {rendering && <span role="status">Rendering...</span>}
        {!rendering && result?.output && <span>Ready to copy</span>}
        {!rendering && !result?.output && <span>Needs values</span>}
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
    </section>
  );
}
