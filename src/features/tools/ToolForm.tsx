import { useState } from "react";
import { commands } from "../../lib/commands";
import type { JsonValue } from "../../lib/types";

interface ToolFormProps {
  tool: string;
  label: string;
}

function outputText(value: JsonValue) {
  return typeof value === "string" ? value : JSON.stringify(value, null, 2);
}

export default function ToolForm({ tool, label }: ToolFormProps) {
  const [text, setText] = useState("");
  const [pattern, setPattern] = useState("");
  const [right, setRight] = useState("");
  const [output, setOutput] = useState("");
  const [warnings, setWarnings] = useState<string[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  async function run() {
    setBusy(true);
    setError("");
    try {
      const input: JsonValue = tool === "regex"
        ? { text, pattern }
        : tool === "diff"
        ? { left: text, right }
        : { text };
      const result = await commands.runTool({ tool, input });
      setOutput(outputText(result.output));
      setWarnings(result.warnings);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Tool failed.");
    } finally {
      setBusy(false);
    }
  }

  async function createSnippet() {
    if (!output) return;
    await commands.saveItem({
      id: null,
      kind: "snippet",
      title: `${label} result`,
      description: null,
      content: output,
      notes: null,
      project_id: null,
      category_id: null,
      tag_ids: [],
      private: false,
      expires_at: null,
    });
  }

  return (
    <section className="tool-form" aria-label={label}>
      {error && <p className="action-error" role="alert">{error}</p>}
      {warnings.map((warning) => <p className="template-preview__note" key={warning}>{warning}</p>)}
      {tool === "regex" && (
        <label className="snippet-editor__field">
          <span>Pattern</span>
          <input value={pattern} disabled={busy} onChange={(event) => setPattern(event.target.value)} />
        </label>
      )}
      <label className="snippet-editor__field snippet-editor__content">
        <span>{tool === "diff" ? "Left" : "Input"}</span>
        <textarea value={text} disabled={busy} onChange={(event) => setText(event.target.value)} />
      </label>
      {tool === "diff" && (
        <label className="snippet-editor__field snippet-editor__content">
          <span>Right</span>
          <textarea value={right} disabled={busy} onChange={(event) => setRight(event.target.value)} />
        </label>
      )}
      <div className="snippet-editor__actions">
        <button type="button" className="button-primary" disabled={busy} onClick={() => void run()}>
          Run
        </button>
        <button type="button" disabled={!output} onClick={() => void navigator.clipboard.writeText(output)}>
          Copy
        </button>
        <button type="button" disabled={!output} onClick={() => void createSnippet()}>
          Create snippet
        </button>
      </div>
      <pre className="snippet-detail__content">{output || "Output appears here."}</pre>
    </section>
  );
}
