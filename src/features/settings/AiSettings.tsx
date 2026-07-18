import { useState } from "react";

export default function AiSettings() {
  const [enabled, setEnabled] = useState(false);
  return (
    <section className="snippet-detail" aria-labelledby="settings-ai">
      <header className="snippet-detail__header">
        <div>
          <span className="snippet-detail__kind">AI</span>
          <h3 id="settings-ai">Provider boundary</h3>
        </div>
      </header>
      <label className="snippet-editor__field checkbox-line">
        <span>
          <input type="checkbox" checked={enabled} onChange={(event) => setEnabled(event.target.checked)} />
          {" "}Enable per-request AI review
        </span>
      </label>
      <p className="template-preview__note">
        Provider calls stay disabled until each action shows outbound content and receives consent.
      </p>
    </section>
  );
}
