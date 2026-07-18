import { useState } from "react";
import { commands } from "../../lib/commands";
import type { ContentType, FormatOperation, FormatResult } from "../../lib/types";

const FORMATTABLE: Set<ContentType> = new Set([
  "json",
  "code",
  "sql",
  "html",
  "css",
  "xml",
]);

interface FormatActionsProps {
  content: string;
  contentType: ContentType;
  busy?: boolean;
  /** Called only when the user explicitly chooses to save the formatted output. */
  onApply: (formatted: string) => void;
}

/**
 * Validate / pretty / minify actions with a side-by-side raw vs formatted
 * preview. The stored content is never modified until the user explicitly
 * applies the formatted output.
 */
export default function FormatActions({
  content,
  contentType,
  busy,
  onApply,
}: FormatActionsProps) {
  const [result, setResult] = useState<FormatResult | null>(null);
  const [error, setError] = useState("");

  if (!FORMATTABLE.has(contentType)) return null;

  async function run(operation: FormatOperation) {
    setError("");
    try {
      const outcome = await commands.formatContent({
        content,
        content_type: contentType,
        operation,
      });
      setResult(outcome);
    } catch {
      setError("Could not format this content.");
    }
  }

  const changed = result !== null && result.valid && result.output !== content;

  return (
    <section className="snippet-detail__notes" aria-label="Formatting">
      <h4>Format</h4>
      <div className="snippet-heading__actions">
        <button
          type="button"
          className="button-secondary"
          disabled={busy}
          onClick={() => void run("validate")}
        >
          Validate
        </button>
        <button
          type="button"
          className="button-secondary"
          disabled={busy}
          onClick={() => void run("pretty")}
        >
          Pretty
        </button>
        <button
          type="button"
          className="button-secondary"
          disabled={busy}
          onClick={() => void run("minify")}
        >
          Minify
        </button>
      </div>
      {error && <p className="action-error" role="alert">{error}</p>}
      {result && !result.valid && (
        <div role="alert">
          {result.diagnostics.map((diagnostic, index) => (
            <p className="action-error" key={index}>
              {diagnostic.message}
              {diagnostic.line !== null &&
                ` (line ${diagnostic.line}${
                  diagnostic.column !== null ? `, column ${diagnostic.column}` : ""
                })`}
            </p>
          ))}
        </div>
      )}
      {result?.valid && (
        <p role="status">
          {changed ? "Formatted preview below — original is unchanged." : "Content is valid."}
        </p>
      )}
      {changed && result && (
        <>
          <pre className="snippet-detail__content" aria-label="Formatted preview">
            {result.output}
          </pre>
          <div className="snippet-heading__actions">
            <button
              type="button"
              className="button-primary"
              disabled={busy}
              onClick={() => {
                onApply(result.output);
                setResult(null);
              }}
            >
              Save formatted
            </button>
            <button
              type="button"
              className="button-secondary"
              disabled={busy}
              onClick={() => void navigator.clipboard?.writeText(result.output)}
            >
              Copy formatted
            </button>
            <button
              type="button"
              className="button-secondary"
              disabled={busy}
              onClick={() => setResult(null)}
            >
              Discard
            </button>
          </div>
        </>
      )}
    </section>
  );
}
