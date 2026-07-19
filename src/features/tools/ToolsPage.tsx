import { useMemo, useState } from "react";
import ToolForm from "./ToolForm";

const TOOLS = [
  ["base64_encode", "Base64 encode"],
  ["base64_decode", "Base64 decode"],
  ["url_encode", "URL encode"],
  ["url_decode", "URL decode"],
  ["jwt_decode", "JWT decode"],
  ["uuid", "UUID"],
  ["sha256", "SHA-256"],
  ["unix_time", "Unix time"],
  ["case", "Text case"],
  ["env", "Environment"],
  ["json_pretty", "JSON pretty"],
  ["regex", "Regex tester"],
  ["cron", "Cron helper"],
  ["markdown", "Markdown preview"],
  ["diff", "Text diff"],
] as const;

type ToolId = (typeof TOOLS)[number][0];

export default function ToolsPage() {
  const [query, setQuery] = useState("");
  const [tool, setTool] = useState<ToolId>(TOOLS[0][0]);
  const filtered = useMemo(
    () => TOOLS.filter((entry) => entry[1].toLowerCase().includes(query.toLowerCase())),
    [query],
  );
  const current = TOOLS.find((entry) => entry[0] === tool) ?? TOOLS[0];

  return (
    <main className="workspace-content">
      <header className="content-heading">
        <div>
          <p>Developer tools</p>
          <h2 id="workspace-title" tabIndex={-1}>Offline utilities</h2>
        </div>
      </header>
      <section className="tool-layout">
        <div className="snippet-list">
          <label className="snippet-editor__field tool-search">
            <span>Search tools</span>
            <input value={query} onChange={(event) => setQuery(event.target.value)} />
          </label>
          <div className="snippet-list__items" role="listbox" aria-label="Tools">
            {filtered.map(([id, label]) => (
              <button
                id={`tool-${id}`}
                className="snippet-list__item"
                type="button"
                role="option"
                aria-selected={id === tool}
                onClick={() => setTool(id)}
                key={id}
              >
                <span className="snippet-list__title">{label}</span>
              </button>
            ))}
          </div>
        </div>
        <ToolForm tool={current[0]} label={current[1]} />
      </section>
    </main>
  );
}
