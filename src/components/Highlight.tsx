import { parseSearchQuery } from "../lib/searchParser";

/** The literal terms of a query, for marking. Only a literal query has
 *  substrings to point at; a regex one matches shapes rather than text, so
 *  nothing is marked for it. Operators (`type:json`) are not terms, which is
 *  why `parseSearchQuery` is what splits them off. */
export function highlightTerms(query: string, mode: "literal" | "regex"): string[] {
  return mode === "regex" ? [] : parseSearchQuery(query).text.filter(Boolean);
}

function pattern(terms: string[]): RegExp | null {
  const source = terms
    .map((term) => term.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"))
    .filter(Boolean)
    .join("|");
  return source ? new RegExp(`(${source})`, "gi") : null;
}

/**
 * The typed terms, marked inside a row's text. Seeing why a row matched is
 * the difference between reading the list and trusting it.
 */
export default function Highlight({
  text,
  terms,
  selected = false,
}: {
  text: string;
  terms: string[];
  selected?: boolean;
}) {
  const matcher = terms.length ? pattern(terms) : null;
  if (!matcher) return <>{text}</>;
  const parts = text.split(matcher);
  const lowered = terms.map((term) => term.toLowerCase());
  return (
    <>
      {parts.map((part, index) =>
        lowered.includes(part.toLowerCase()) ? (
          // A tint of the accent itself. This was a fraction of
          // --accent-subtle, which is already the palest tint there is: a
          // fifth of it over a card was no mark at all, and on a selected
          // row - painted --accent-subtle whole - it vanished entirely.
          // --accent-ink is the text colour tuned for that family of tints.
          <mark
            key={index}
            className="rounded-[2px] px-px text-[var(--accent-ink)]"
            style={{
              background: `color-mix(in srgb, var(--accent) ${selected ? 30 : 20}%, transparent)`,
            }}
          >
            {part}
          </mark>
        ) : (
          part
        ),
      )}
    </>
  );
}
