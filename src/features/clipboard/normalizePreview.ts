const BLANK = /^\s*$/;

/**
 * Display-only whitespace normalization for history previews.
 *
 * Blank lines are dropped entirely - leading, trailing, and between
 * paragraphs. A row shows two lines of the capture, so a blank one spends
 * half the preview saying nothing; dropping it puts the second line of real
 * content on screen instead. Indentation on content lines is preserved, and
 * stored content is never changed - copy, export, and detail paths keep the
 * original bytes.
 */
export function normalizePreview(content: string): string {
  return content
    .replace(/\r\n/g, "\n")
    .split("\n")
    .filter((line) => !BLANK.test(line))
    .join("\n");
}

/** A line that says nothing on its own: only brackets, punctuation, space. */
const PUNCTUATION_ONLY = /^[^\p{L}\p{N}]*$/u;

/**
 * The preview for a row that shows a single line - code-shaped content in the
 * history, and every row in Quick Paste.
 *
 * Those rows took the first line, which for code is usually the right summary
 * (a signature, a `SELECT`) and for pretty-printed JSON was a lone `{`: the
 * newest capture, and Quick Paste's default selection, identified nothing.
 *
 * - JSON is flattened whole. Its line breaks are formatting - a newline inside
 *   a string is escaped - so collapsing them loses nothing and puts the first
 *   keys on the line.
 * - Anything else keeps its first line unless that line is punctuation only,
 *   in which case it is joined to the next one: `(` + `select 1` reads as
 *   `( select 1`. A first line with any letter or digit is left alone.
 *
 * Display only, like `normalizePreview`; stored content is never changed.
 */
export function previewLine(content: string, contentType?: string): string {
  if (contentType === "json") return content.replace(/\s+/g, " ").trim();
  const lines = normalizePreview(content).split("\n");
  while (lines.length > 1 && PUNCTUATION_ONLY.test(lines[0])) {
    lines.splice(0, 2, `${lines[0].trim()} ${lines[1].trim()}`);
  }
  return lines.join("\n");
}

/** How far into a line a match may sit before the excerpt starts nearer it:
 *  about the width a result row shows before it wraps. */
const LEAD = 48;

function firstMatch(line: string, terms: string[]): number {
  const lowered = line.toLowerCase();
  let at = -1;
  for (const term of terms) {
    const index = lowered.indexOf(term);
    if (index >= 0 && (at < 0 || index < at)) at = index;
  }
  return at;
}

/**
 * The preview a search result shows: the capture from where it first matches.
 *
 * A result clamps to two lines, like a history row, and when the match sat
 * below them - line 30 of a changelog, the twentieth key of a one-line JSON
 * body - the row showed nothing that said why it was there. The opening lines
 * are kept when the match is already among them; otherwise the excerpt starts
 * at the line that matches, and a match far into a long line is brought
 * forward to a word boundary shortly before it. Either cut is marked with an
 * ellipsis. A capture that matched on something other than its text (its
 * title, its source) keeps its opening lines.
 *
 * Display only, like `previewLine`, which it starts from.
 */
export function matchExcerpt(
  content: string,
  contentType: string,
  terms: string[],
  keep = 2,
): string {
  const text = previewLine(content, contentType);
  const lowered = terms.map((term) => term.toLowerCase()).filter(Boolean);
  if (lowered.length === 0) return text;
  const lines = text.split("\n");
  const row = lines.findIndex((line) => firstMatch(line, lowered) >= 0);
  if (row < 0) return text;

  const from = row < keep ? 0 : row;
  const rest = lines.slice(from);
  let head = from > 0 ? rest[0].trimStart() : rest[0];
  let cut = from > 0;
  const at = firstMatch(head, lowered);
  if (at > LEAD) {
    const space = head.lastIndexOf(" ", at - 16);
    head = head.slice(space > 0 ? space + 1 : at - 16);
    cut = true;
  }
  return (cut ? "… " : "") + [head, ...rest.slice(1)].join("\n");
}
