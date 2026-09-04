import { describe, expect, it } from "bun:test";
import { normalizePreview } from "./normalizePreview";

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
