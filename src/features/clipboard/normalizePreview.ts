const BLANK = /^\s*$/;

/**
 * Display-only whitespace normalization for history previews.
 *
 * Drops leading and trailing blank lines and collapses runs of blank lines to a
 * single one, so every row occupies a predictable height. Indentation on
 * content lines is preserved, and stored content is never changed - copy,
 * export, and detail paths keep the original bytes.
 */
export function normalizePreview(content: string): string {
  const lines = content.replace(/\r\n/g, "\n").split("\n");

  let start = 0;
  let end = lines.length;
  while (start < end && BLANK.test(lines[start])) start += 1;
  while (end > start && BLANK.test(lines[end - 1])) end -= 1;

  const normalized: string[] = [];
  for (let index = start; index < end; index += 1) {
    const line = lines[index];
    const blank = BLANK.test(line);
    if (blank && normalized.length > 0 && BLANK.test(normalized[normalized.length - 1])) continue;
    normalized.push(blank ? "" : line);
  }

  return normalized.join("\n");
}
