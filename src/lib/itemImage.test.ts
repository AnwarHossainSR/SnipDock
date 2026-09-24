import { describe, expect, test } from "bun:test";
import { thumbPathFor } from "./itemImage";

describe("thumbPathFor", () => {
  test("mirrors images::relative_thumb_path", () => {
    expect(thumbPathFor("images/abc123.png")).toBe("images/abc123.thumb.png");
  });
  test("leaves a non-png path alone", () => {
    expect(thumbPathFor("images/abc123")).toBe("images/abc123");
  });
});
