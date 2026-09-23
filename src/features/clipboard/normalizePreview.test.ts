import { describe, expect, it } from "bun:test";
import { normalizePreview, previewLine } from "./normalizePreview";

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
