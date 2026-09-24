import { useMemo } from "react";
import { highlightLines } from "../lib/highlight";
import type { TokenKind } from "../lib/highlight";
import { cn } from "@/lib/utils";

// Semantic colours only: none of these follow the accent, so a keyword is the
// same purple whichever theme colour the user picked.
const tone: Record<TokenKind, string> = {
  plain: "",
  keyword: "text-[var(--code-keyword)]",
  string: "text-[var(--code-string)]",
  number: "text-[var(--code-number)]",
  key: "text-[var(--type-config)]",
  comment: "text-[var(--code-comment)] italic",
  punct: "text-[var(--text-muted)]",
  heading: "font-bold text-[var(--code-keyword)]",
};

/**
 * A capture shown in full, as code: a line-number gutter and the colours
 * `highlightLines` assigns. Lines wrap rather than scroll sideways - the rail
 * is narrow, and a horizontal scrollbar inside a vertical one hides the end
 * of every long line.
 */
export default function CodeView({
  content,
  contentType,
  className,
  textTestId,
}: {
  content: string;
  contentType: string;
  className?: string;
  /** Test id for the one plain copy of the text, which is what a test (or a
   *  screen reader) should read rather than the coloured lines. */
  textTestId?: string;
}) {
  const lines = useMemo(() => highlightLines(content, contentType), [content, contentType]);
  const gutter = String(lines.length).length;

  return (
    <div
      className={cn(
        "rounded-[9px] border border-border bg-card py-2.5 font-mono text-[0.72rem] leading-[1.7] text-foreground",
        className,
      )}
    >
      {/* Read once, as written. The coloured lines below would be read token
          by token, each prefixed with its line number. */}
      <pre className="sr-only" data-testid={textTestId}>{content}</pre>
      <div aria-hidden="true">
      {lines.map((line) => (
        <div key={line.number} className="flex pr-3">
          <span
            className="shrink-0 select-none pr-3 text-right text-[var(--text-muted)] opacity-60 tabular-nums"
            style={{ width: `calc(${gutter}ch + 1.5rem)` }}
          >
            {line.number}
          </span>
          <span className="min-w-0 whitespace-pre-wrap [overflow-wrap:anywhere]">
            {line.tokens.length === 0
              ? "​"
              : line.tokens.map((token, index) => (
                  <span key={index} className={tone[token.kind] || undefined}>
                    {token.text}
                  </span>
                ))}
          </span>
        </div>
      ))}
      </div>
    </div>
  );
}
