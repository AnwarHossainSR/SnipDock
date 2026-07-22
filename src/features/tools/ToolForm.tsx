import { useState } from "react";
import { commands } from "../../api/commands";
import type { JsonValue } from "../../api/types";
import { Button } from "@/components/ui/button";

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

  return (
    <section className="min-w-0 overflow-auto p-5" aria-label={label}>
      {error && <p className="mb-4 text-xs text-destructive" role="alert">{error}</p>}
      {warnings.map((warning) => <p className="mb-4 rounded-md border border-border bg-muted p-3 text-sm text-muted-foreground" role="status" key={warning}>{warning}</p>)}
      {tool === "regex" && (
        <label className="grid gap-2 text-xs font-semibold text-muted-foreground">
          <span>Pattern</span>
          <input className="w-full rounded-sm border border-border bg-muted px-3 py-2 font-normal text-foreground focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring" value={pattern} disabled={busy} onChange={(event) => setPattern(event.target.value)} />
        </label>
      )}
      <label className="mt-4 grid gap-2 text-xs font-semibold text-muted-foreground">
        <span>{tool === "diff" ? "Left" : "Input"}</span>
        <textarea className="min-h-72 w-full resize-y rounded-sm border border-border bg-muted px-3 py-2 font-normal leading-relaxed text-foreground [tab-size:2] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring" value={text} disabled={busy} onChange={(event) => setText(event.target.value)} />
      </label>
      {tool === "diff" && (
        <label className="mt-4 grid gap-2 text-xs font-semibold text-muted-foreground">
          <span>Right</span>
          <textarea className="min-h-72 w-full resize-y rounded-sm border border-border bg-muted px-3 py-2 font-normal leading-relaxed text-foreground [tab-size:2] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring" value={right} disabled={busy} onChange={(event) => setRight(event.target.value)} />
        </label>
      )}
      <div className="mt-4 flex items-center gap-2 max-[38rem]:w-full [&>*]:max-[38rem]:flex-1">
        <Button type="button" disabled={busy} onClick={() => void run()}>
          Run
        </Button>
        <Button type="button" variant="outline" disabled={!output} onClick={() => void navigator.clipboard.writeText(output)}>
          Copy
        </Button>
      </div>
      <pre className="mt-5 min-h-40 overflow-auto whitespace-pre-wrap rounded-md border border-border bg-muted p-4 font-mono text-sm leading-relaxed text-foreground [overflow-wrap:anywhere]" aria-live="polite">{busy ? "Running…" : output || "Run this tool to see output."}</pre>
    </section>
  );
}
