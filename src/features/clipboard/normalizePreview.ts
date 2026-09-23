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
