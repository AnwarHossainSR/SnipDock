import type { RenderTemplateResult } from "../../lib/types";

interface TemplateFillDialogProps {
  placeholders: string[];
  values: Record<string, string>;
  result: RenderTemplateResult | null;
  busy: boolean;
  message: string;
  onValueChange: (name: string, value: string) => void;
  onCopy: () => void;
  onSaveSnippet: () => void;
}

export default function TemplateFillDialog({
  placeholders,
  values,
  result,
  busy,
  message,
  onValueChange,
  onCopy,
  onSaveSnippet,
}: TemplateFillDialogProps) {
  const canUse = Boolean(result?.output) && !busy;

  return (
    <section className="template-fill" aria-label="Fill template values">
      <h3>Fill values</h3>
      {placeholders.length === 0 ? (
        <p className="template-preview__note">Add placeholders like {"{{name}}"}.</p>
      ) : (
        <div className="template-fill__fields">
          {placeholders.map((name) => (
            <label className="snippet-editor__field" key={name}>
              <span>{name}</span>
              <input
                value={values[name] ?? ""}
                onChange={(event) => onValueChange(name, event.target.value)}
                autoComplete="off"
              />
            </label>
          ))}
        </div>
      )}
      <div className="snippet-editor__actions">
        <button type="button" className="button-primary" disabled={!canUse} onClick={onCopy}>
          Copy rendered
        </button>
        <button type="button" disabled={!canUse} onClick={onSaveSnippet}>
          Save as snippet
        </button>
      </div>
      <p className="sr-only" aria-live="polite">{message}</p>
    </section>
  );
}
