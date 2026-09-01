import { describe, expect, it } from "bun:test";
import {
  applyTransform,
  TRANSFORM_BY_SHORTCUT,
  TRANSFORM_KINDS,
  TransformError,
} from "./transforms";

describe("applyTransform", () => {
  it("strips only outer whitespace on trim", () => {
    expect(applyTransform("  hello  ", "trim")).toBe("hello");
    expect(applyTransform("  a  b  ", "trim")).toBe("a  b");
  });

  it("lowercases and uppercases the whole string", () => {
    expect(applyTransform("Hello WORLD", "lowercase")).toBe("hello world");
    expect(applyTransform("Hello WORLD", "uppercase")).toBe("HELLO WORLD");
  });

  it("sorts lines and dedupes, preserving a trailing newline", () => {
    expect(applyTransform("banana\napple\nbanana\ncherry\n", "sort_dedupe_lines"))
      .toBe("apple\nbanana\ncherry\n");
    expect(applyTransform("a\nb\na", "sort_dedupe_lines")).toBe("a\nb");
  });

  it("pretty-prints and minifies JSON symmetrically", () => {
    const pretty = applyTransform('{"a":2,"b":1}', "json_pretty");
    expect(pretty).toContain("\n");
    expect(applyTransform(pretty, "json_minify")).toBe('{"a":2,"b":1}');
  });

  it("rejects invalid JSON for json_pretty and json_minify", () => {
    expect(() => applyTransform("{not json", "json_pretty")).toThrow(TransformError);
    expect(() => applyTransform("{not json", "json_minify")).toThrow(TransformError);
  });

  it("round-trips base64 and rejects garbage", () => {
    const payload = "helloworld";
    const encoded = applyTransform(payload, "base64_encode");
    expect(applyTransform(encoded, "base64_decode")).toBe(payload);
    expect(() => applyTransform("@@@", "base64_decode")).toThrow(TransformError);
  });

  it("round-trips URL encoding and treats plus as space", () => {
    const payload = "hello world!";
    const encoded = applyTransform(payload, "url_encode");
    expect(encoded).toBe("hello%20world%21");
    expect(applyTransform(encoded, "url_decode")).toBe(payload);
    expect(applyTransform("a+b", "url_decode")).toBe("a b");
  });

  it("rejects invalid percent-encoded input", () => {
    expect(() => applyTransform("abc%", "url_decode")).toThrow(TransformError);
  });
});

describe("TRANSFORM_KINDS", () => {
  it("has a single-key shortcut for every variant", () => {
    for (const kind of TRANSFORM_KINDS) {
      expect(kind.shortcut).not.toBeNull();
    }
  });

  it("exposes every variant through the shortcut map", () => {
    for (const kind of TRANSFORM_KINDS) {
      expect(TRANSFORM_BY_SHORTCUT.get(kind.shortcut!)?.variant).toBe(kind.variant);
    }
  });
});
