import { useEffect, useMemo, useState } from "react";
import { commands } from "../../lib/commands";
import type { LibraryItem, RenderTemplateResult, SaveItemInput } from "../../lib/types";
import TemplateFillDialog from "./TemplateFillDialog";
import TemplatePreview from "./TemplatePreview";

const BUILT_INS = new Set(["date", "time", "uuid"]);

function extractPlaceholders(template: string) {
  const names = new Set<string>();
  const pattern = /(^|[^\\]){{\s*([A-Za-z0-9_-]+)\s*}}/g;
  for (const match of template.matchAll(pattern)) {
    if (!BUILT_INS.has(match[2])) names.add(match[2]);
  }
  return [...names].sort((a, b) => a.localeCompare(b));
}

function saveInput(input: {
  id?: string | null;
  kind: "template" | "snippet";
  title: string;
  content: string;
}): SaveItemInput {
  return {
    id: input.id ?? null,
    kind: input.kind,
    title: input.title.trim() || null,
    description: null,
    content: input.content,
    notes: null,
    project_id: null,
    category_id: null,
    tag_ids: [],
    private: false,
    expires_at: null,
  };
}

export default function TemplateEditor() {
  const [templateItem, setTemplateItem] = useState<LibraryItem | null>(null);
  const [title, setTitle] = useState("Untitled template");
  const [template, setTemplate] = useState("");
  const [values, setValues] = useState<Record<string, string>>({});
  const [result, setResult] = useState<RenderTemplateResult | null>(null);
  const [rendering, setRendering] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const placeholders = useMemo(() => extractPlaceholders(template), [template]);

  useEffect(() => {
    setValues((current) => Object.fromEntries(
      placeholders.map((name) => [name, current[name] ?? ""]),
    ));
  }, [placeholders]);

  useEffect(() => {
    let active = true;
    setRendering(true);
    setError("");
    commands.renderTemplate({ template, values }).then(
      (next) => {
        if (active) setResult(next);
      },
      () => {
        if (active) setError("Template could not be rendered.");
      },
    ).finally(() => {
      if (active) setRendering(false);
    });
    return () => {
      active = false;
    };
  }, [template, values]);

  async function createFromClipboard() {
    setError("");
    try {
      const text = await navigator.clipboard.readText();
      setTemplate(text);
      setMessage("Clipboard text loaded.");
    } catch {
      setError("Clipboard text unavailable.");
    }
  }

  async function saveTemplate() {
    if (!template.trim()) {
      setError("Template content is required.");
      return;
    }
    setBusy(true);
    setError("");
    try {
      const saved = await commands.saveItem(saveInput({
        id: templateItem?.id,
        kind: "template",
        title,
        content: template,
      }));
      setTemplateItem(saved);
      setMessage("Template saved.");
    } catch {
      setError("Could not save template.");
    } finally {
      setBusy(false);
    }
  }

  async function copyRendered() {
    if (!result?.output) return;
    await navigator.clipboard.writeText(result.output);
    setMessage("Rendered text copied.");
  }

  async function saveSnippet() {
    if (!result?.output) return;
    setBusy(true);
    setError("");
    try {
      await commands.saveItem(saveInput({
        kind: "snippet",
        title: `${title.trim() || "Rendered template"} output`,
        content: result.output,
      }));
      setMessage("Rendered text saved as snippet.");
    } catch {
      setError("Could not save rendered snippet.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <main className="workspace-content">
      <header className="content-heading snippet-heading">
        <div>
          <p>Templates</p>
          <h2 id="workspace-title" tabIndex={-1}>Fill reusable text</h2>
        </div>
        <div className="snippet-heading__actions">
          <button type="button" className="button-primary" onClick={() => void createFromClipboard()}>
            From clipboard
          </button>
        </div>
      </header>

      <section className="template-workspace">
        <form
          className="snippet-editor template-editor"
          onSubmit={(event) => {
            event.preventDefault();
            void saveTemplate();
          }}
        >
          <header className="snippet-editor__header">
            <div>
              <p className="snippet-editor__eyebrow">Template editor</p>
              <h3>{templateItem ? "Saved template" : "Draft template"}</h3>
            </div>
            <div className="snippet-editor__actions">
              <button type="submit" className="button-primary" disabled={busy}>
                {busy ? "Saving..." : "Save template"}
              </button>
            </div>
          </header>
          {error && <p className="snippet-editor__save-error" role="alert">{error}</p>}
          <label className="snippet-editor__field">
            <span>Title</span>
            <input value={title} onChange={(event) => setTitle(event.target.value)} />
          </label>
          <label className="snippet-editor__field snippet-editor__content">
            <span>Template</span>
            <textarea
              value={template}
              onChange={(event) => setTemplate(event.target.value)}
              spellCheck={false}
              placeholder="Hello {{name}}, your build {{status}}."
            />
          </label>
        </form>

        <div className="template-side">
          <TemplateFillDialog
            placeholders={placeholders}
            values={values}
            result={result}
            busy={busy}
            message={message}
            onValueChange={(name, value) => setValues((current) => ({ ...current, [name]: value }))}
            onCopy={() => void copyRendered()}
            onSaveSnippet={() => void saveSnippet()}
          />
          <TemplatePreview result={result} rendering={rendering} error={error} />
        </div>
      </section>
    </main>
  );
}
