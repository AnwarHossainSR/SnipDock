import { useEffect, useMemo, useState } from "react";
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
const GROUPS = [
  ["Encoding", ["base64_encode", "base64_decode", "url_encode", "url_decode", "jwt_decode"]],
  ["Generators", ["uuid", "sha256"]],
  ["Text and data", ["unix_time", "case", "env", "json_pretty", "regex", "cron", "markdown", "diff"]],
] as const;

export default function ToolsPage() {
  const [query, setQuery] = useState("");
  const [tool, setTool] = useState<ToolId>(TOOLS[0][0]);
  const filtered = useMemo(
    () => TOOLS.filter((entry) => entry[1].toLowerCase().includes(query.toLowerCase())),
    [query],
  );
  const current = TOOLS.find((entry) => entry[0] === tool) ?? TOOLS[0];

  useEffect(() => {
    if (filtered.length && !filtered.some(([id]) => id === tool)) setTool(filtered[0][0]);
  }, [filtered, tool]);

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
            {GROUPS.map(([group, ids]) => {
              const entries = filtered.filter(([id]) => (ids as readonly string[]).includes(id));
              return entries.length ? <section className="tool-group" aria-labelledby={`tool-group-${group}`} key={group}><h3 id={`tool-group-${group}`}>{group}</h3>{entries.map(([id, label]) => (
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
              ))}</section> : null;
            })}
          </div>
        </div>
        <ToolForm tool={current[0]} label={current[1]} />
      </section>
    </main>
  );
}
