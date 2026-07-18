import { useState } from "react";
import { commands } from "../../lib/commands";
import type { LibraryItem } from "../../lib/types";

interface AiActionsProps {
  item: LibraryItem;
  onSave: (content: string) => void;
}

export default function AiActions({ item, onSave }: AiActionsProps) {
  const [action, setAction] = useState("explain");
  const [consent, setConsent] = useState(false);
  const [output, setOutput] = useState("");
  const [error, setError] = useState("");

  async function run() {
    if (item.private) {
      setError("Private items cannot use AI actions.");
      return;
    }
    setError("");
    try {
      const result = await commands.runAiAction({ action, content: item.content, consent });
      setOutput(result.output);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "AI action failed.");
    }
  }

  return (
    <section className="snippet-detail__notes" aria-label="AI actions">
      <h4>AI review</h4>
      {error && <p className="action-error" role="alert">{error}</p>}
      <div className="settings-grid">
        <label className="snippet-editor__field">
          <span>Action</span>
          <select value={action} onChange={(event) => setAction(event.target.value)}>
            <option value="explain">Explain</option>
            <option value="improve_command">Improve command</option>
            <option value="document">Document</option>
            <option value="secret_review">Secret review</option>
          </select>
        </label>
        <label className="snippet-editor__field checkbox-line">
          <span>
            <input type="checkbox" checked={consent} onChange={(event) => setConsent(event.target.checked)} />
            {" "}I reviewed outbound content
          </span>
        </label>
      </div>
      <pre className="snippet-detail__content">{output || item.content}</pre>
      <div className="snippet-editor__actions">
        <button type="button" className="button-primary" disabled={!consent} onClick={() => void run()}>
          Run review
        </button>
        <button type="button" disabled={!output} onClick={() => void navigator.clipboard.writeText(output)}>
          Copy
        </button>
        <button type="button" disabled={!output} onClick={() => onSave(output)}>
          Save result
        </button>
      </div>
      {action === "improve_command" && (
        <p className="template-preview__note">Review output before using it. SnipDock never executes commands.</p>
      )}
    </section>
  );
}
