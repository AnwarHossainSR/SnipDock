import { describe, expect, it } from "bun:test";
import { matchExcerpt, normalizePreview, previewLine } from "./normalizePreview";

describe("normalizePreview", () => {
  it("removes leading and trailing blank lines", () => {
    expect(normalizePreview("\n\n\n/run-tests\n\n\n")).toBe("/run-tests");
  });

  it("drops runs of blank lines between paragraphs", () => {
    expect(normalizePreview("first\n\n\n\nsecond")).toBe("first\nsecond");
  });

  it("drops a single blank line between paragraphs", () => {
    // A row clamps to two lines, so a blank one costs half the preview.
    expect(normalizePreview("first\n\nsecond")).toBe("first\nsecond");
  });

  it("treats whitespace-only lines as blank", () => {
    expect(normalizePreview("  \t\nfirst\n   \n \t \nsecond\n  ")).toBe("first\nsecond");
  });

  it("returns an empty string for whitespace-only content", () => {
    expect(normalizePreview("\n   \n\t\n")).toBe("");
  });

  it("leaves single-line content untouched", () => {
    expect(normalizePreview("git status")).toBe("git status");
  });

  it("preserves indentation on content lines", () => {
    expect(normalizePreview("\nfn main() {\n    let x = 1;\n}\n")).toBe(
      "fn main() {\n    let x = 1;\n}",
    );
  });

  it("normalizes CRLF line endings", () => {
    expect(normalizePreview("\r\nfirst\r\n\r\n\r\nsecond\r\n")).toBe("first\nsecond");
  });
});

// Single-line rows used to take the first line, and for pretty-printed JSON
// that was a lone "{" - the newest capture identified nothing.
describe("previewLine", () => {
  it("flattens pretty-printed JSON onto one line", () => {
    const json = '{\n  "id": "ord_8f3k2m",\n  "status": "fulfilled"\n}';
    expect(previewLine(json, "json")).toBe('{ "id": "ord_8f3k2m", "status": "fulfilled" }');
  });

  it("flattens a JSON array too", () => {
    expect(previewLine("[\n  1,\n  2\n]", "json")).toBe("[ 1, 2 ]");
  });

  it("joins a punctuation-only first line to the next", () => {
    expect(previewLine("(\n  select 1\n)").split("\n")[0]).toBe("( select 1");
  });

  it("joins several punctuation-only lines until one says something", () => {
    expect(previewLine("[\n  {\n    \"a\": 1").split("\n")[0]).toBe('[ { "a": 1');
  });

  it("leaves an informative first line alone", () => {
    const code = "export function f() {\n  return 1;\n}";
    expect(previewLine(code, "code")).toBe(code);
    expect(previewLine(".card {\n  gap: 1rem;\n}", "css").split("\n")[0]).toBe(".card {");
  });

  it("counts any script's letters as saying something", () => {
    expect(previewLine("Привет\nмир").split("\n")[0]).toBe("Привет");
  });

  it("keeps punctuation-only content that has nothing to join", () => {
    expect(previewLine("{}")).toBe("{}");
    expect(previewLine("")).toBe("");
  });
});

describe("matchExcerpt", () => {
  const changelog = "## 2.4.0\n\n- Faster startup\n- Smaller installer\n- Faster order search\n- Fewer crashes";

  it("keeps the opening lines when the match is already among them", () => {
    expect(matchExcerpt("git status\ngit order", "shell", ["order"])).toBe("git status\ngit order");
  });

  it("starts at the line that matches when that line would be clamped away", () => {
    expect(matchExcerpt(changelog, "markdown", ["order"])).toBe("… - Faster order search\n- Fewer crashes");
  });

  it("drops the indentation of a line it starts at", () => {
    const sql = "SELECT id\nFROM users\n    WHERE status = 'open'";
    expect(matchExcerpt(sql, "sql", ["status"])).toBe("… WHERE status = 'open'");
  });

  it("brings a match far into a long line forward to a word boundary", () => {
    const json = `{ "id": "ord_8f3k2m", "customer": "c_1049", "currency": "EUR", "items": 3, "status": "fulfilled" }`;
    const excerpt = matchExcerpt(json, "json", ["fulfilled"]);
    expect(excerpt.startsWith("… ")).toBe(true);
    expect(excerpt).toContain('"status": "fulfilled" }');
    // Cut at a space, never through a word.
    expect(excerpt.slice(2, 3)).not.toBe(" ");
    expect(json).toContain(excerpt.slice(2));
  });

  it("matches without regard to case", () => {
    expect(matchExcerpt(changelog, "markdown", ["ORDER"])).toStartWith("… - Faster order");
  });

  it("keeps the opening lines when the text does not contain a term", () => {
    // A capture can match on its title or its source rather than its text.
    expect(matchExcerpt(changelog, "markdown", ["release"])).toBe(previewLine(changelog, "markdown"));
  });

  it("is the preview line when there is nothing to look for", () => {
    expect(matchExcerpt(changelog, "markdown", [])).toBe(previewLine(changelog, "markdown"));
  });
});
