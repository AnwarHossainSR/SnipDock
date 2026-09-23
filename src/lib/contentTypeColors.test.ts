import { describe, expect, it } from "bun:test";
import { displayTypeLabel, typeGlyph } from "./contentTypeColors";

describe("typeGlyph", () => {
  const item = (content_type: string, content = "x", priv = false) => ({ content_type, content, private: priv });

  it("gives each code-shaped type a glyph in its own colour", () => {
    expect(typeGlyph(item("json"))).toEqual({ glyph: "{ }", token: "json" });
    expect(typeGlyph(item("shell"))).toEqual({ glyph: ">_", token: "shell" });
    expect(typeGlyph(item("sql"))).toEqual({ glyph: "SQL", token: "text" });
  });

  it("shows a picture, a link, or a lock where a glyph would not read", () => {
    expect(typeGlyph(item("image"))).toEqual({ icon: "image", token: "image" });
    expect(typeGlyph(item("plain_text", "https://example.com/a?b=1"))).toEqual({ icon: "link", token: "config" });
    // A private capture says so before anything else, whatever its type.
    expect(typeGlyph(item("json", "{}", true))).toEqual({ icon: "lock", token: "secret" });
  });

  it("only calls plain text a link when it is nothing but one address", () => {
    expect(typeGlyph(item("plain_text", "see https://example.com")).glyph).toBe("Aa");
    expect(displayTypeLabel({ content_type: "plain_text", content: " https://example.com ", language: null })).toBe("Link");
    expect(displayTypeLabel({ content_type: "plain_text", content: "hello", language: null })).toBe("Plain text");
  });
});
