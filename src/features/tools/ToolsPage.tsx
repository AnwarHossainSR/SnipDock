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
    <main className="min-w-0 p-[clamp(1.25rem,3vw,2.5rem)] [overflow-wrap:anywhere] max-[31rem]:px-3 max-[31rem]:py-4">
      <header className="mb-5 flex items-end justify-between gap-4">
        <div>
          <p className="mb-1 text-xs font-bold uppercase tracking-[0.08em] text-primary">Developer tools</p>
          <h2 className="m-0 font-display text-[clamp(1.45rem,3vw,1.9rem)] font-semibold tracking-[-0.035em]" id="workspace-title" tabIndex={-1}>Offline utilities</h2>
        </div>
      </header>
      <section className="grid min-h-[min(34rem,calc(100vh-10rem))] grid-cols-[minmax(13rem,18rem)_minmax(0,1fr)] overflow-hidden rounded-lg border border-border bg-card max-[50rem]:grid-cols-1">
        <div className="min-w-0 overflow-auto border-r border-border bg-muted max-[50rem]:max-h-64 max-[50rem]:border-b max-[50rem]:border-r-0">
          <label className="grid gap-2 border-b border-border bg-card p-4 text-xs font-semibold text-muted-foreground">
            <span>Search tools</span>
            <input className="w-full rounded-sm border border-border bg-muted px-3 py-2 font-normal text-foreground focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring" value={query} onChange={(event) => setQuery(event.target.value)} />
          </label>
          <div role="listbox" aria-label="Tools">
            {GROUPS.map(([group, ids]) => {
              const entries = filtered.filter(([id]) => (ids as readonly string[]).includes(id));
              return entries.length ? <section className="py-2" aria-labelledby={`tool-group-${group}`} key={group}><h3 className="m-0 px-4 py-2 font-sans text-[0.67rem] uppercase tracking-[0.08em] text-[var(--color-text-subtle)]" id={`tool-group-${group}`}>{group}</h3>{entries.map(([id, label]) => (
              <button
                id={`tool-${id}`}
                className="relative grid w-full gap-2 border-0 border-b border-border bg-transparent p-4 text-left text-foreground before:absolute before:inset-y-0 before:left-0 before:w-[3px] before:bg-transparent hover:bg-card aria-selected:bg-accent aria-selected:before:bg-primary focus-visible:z-[1] focus-visible:outline-offset-[-2px]"
                type="button"
                role="option"
                aria-selected={id === tool}
                onClick={() => setTool(id)}
                key={id}
              >
                <span className="overflow-hidden text-sm font-semibold text-ellipsis whitespace-nowrap">{label}</span>
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
