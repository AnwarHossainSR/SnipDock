import { describe, expect, it } from "bun:test";
import { HIGHLIGHT_LINE_LIMIT, highlightLines } from "./highlight";

const join = (content: string, type: string) =>
  highlightLines(content, type)
    .map((line) => line.tokens.map((token) => token.text).join(""))
    .join("\n");

const kinds = (line: string, type: string) =>
  highlightLines(line, type)[0].tokens.filter((token) => token.kind !== "plain" && token.kind !== "punct");

describe("highlightLines", () => {
  // Colour is display only. A preview that changed a character would show
  // something other than what copy puts on the clipboard.
  it("never changes the text, whatever it is handed", () => {
    const samples: [string, string][] = [
      ['{\n  "id": "ord_8f3k2m",\n  "total": 12900,\n  "ok": true\n}', "json"],
      ["SELECT c.id, COUNT(o.id) AS orders\nFROM customers c -- recent\nWHERE o.created_at >= NOW() - INTERVAL '30 days';", "sql"],
      ['curl -sS -X POST https://api.example.com \\\n  -H "Authorization: Bearer $TOKEN" | jq \'.status\'', "shell"],
      ["services:\n  api:\n    image: storefront/api:2.4.0\n    # comment\n    - \"8080:8080\"", "config"],
      ["## 2.4.0\n\n- Faster search\n1. First", "markdown"],
      ['<button class="btn" type="submit">\n  Place order\n</button>', "html"],
      [".card {\n  gap: 0.75rem;\n  border-radius: 12px;\n}", "css"],
      ["export function f(a: number) {\n  return a-- // decrement\n}", "code"],
      ['unterminated "string and \'another', "code"],
      ["just some words", "plain_text"],
    ];
    for (const [content, type] of samples) expect(join(content, type)).toBe(content);
  });

  it("numbers lines from one, keeping blank ones", () => {
    const lines = highlightLines("a\n\nb", "code");
    expect(lines.map((line) => line.number)).toEqual([1, 2, 3]);
    expect(lines[1].tokens).toEqual([]);
  });

  it("tells a JSON key from a JSON string", () => {
    expect(kinds('  "status": "fulfilled",', "json")).toEqual([
      { text: '"status"', kind: "key" },
      { text: '"fulfilled"', kind: "string" },
    ]);
  });

  it("reads SQL keywords in either case", () => {
    const found = kinds("select id from users where id = 1", "sql").map((token) => [token.text, token.kind]);
    expect(found).toEqual([
      ["select", "keyword"],
      ["from", "keyword"],
      ["where", "keyword"],
      ["1", "number"],
    ]);
  });

  it("marks a shell line's command, flags, strings, and variables", () => {
    const found = kinds('curl -sS -H "Accept: json" $URL', "shell").map((token) => token.kind);
    expect(found).toEqual(["keyword", "keyword", "keyword", "string", "string", "number"]);
  });

  it("marks config keys and markdown headings", () => {
    expect(kinds("  image: api:2.4", "config")[0]).toEqual({ text: "image", kind: "key" });
    expect(highlightLines("## Release", "markdown")[0].tokens).toEqual([{ text: "## Release", kind: "heading" }]);
  });

  it("leaves plain text plain", () => {
    expect(highlightLines("SELECT this sentence", "plain_text")[0].tokens).toEqual([
      { text: "SELECT this sentence", kind: "plain" },
    ]);
  });

  it("shows a very long capture plain rather than colouring every line", () => {
    const long = Array.from({ length: HIGHLIGHT_LINE_LIMIT + 1 }, (_, i) => `"k${i}": ${i},`).join("\n");
    const lines = highlightLines(long, "json");
    expect(lines).toHaveLength(HIGHLIGHT_LINE_LIMIT + 1);
    expect(lines.every((line) => line.tokens.every((token) => token.kind === "plain"))).toBe(true);
  });
});
