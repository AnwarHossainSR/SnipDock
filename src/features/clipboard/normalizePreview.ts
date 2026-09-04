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
