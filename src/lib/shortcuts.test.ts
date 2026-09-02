import { describe, expect, it } from "bun:test";
import shortcuts from "../../docs/keyboard-shortcuts.md?raw";
import {
  formatBinding,
  isMac,
  parseBinding,
  parseShortcutSchema,
  validateBinding,
} from "./shortcuts";

describe("parseShortcutSchema", () => {
  it("parses every documented shortcut from the doc", () => {
    const schema = parseShortcutSchema(shortcuts);
    expect(schema).toHaveLength(8);
    const ids = schema.map((entry) => entry.actionId);
    expect(ids).toEqual([
      "open_quick_paste",
      "focus_main_window_search",
      "copy_selected",
      "toggle_pin",
      "delete_selected",
      "toggle_favorite",
      "navigate_next",
      "navigate_previous",
    ]);
    expect(schema[1].defaultBinding).toBe("CmdOrCtrl+Shift+F");
    expect(schema[0].label).toBe("Open Quick Paste");
  });

  it("rebuilds the schema from a tiny inline document", () => {
    const doc = [
      "# Keyboard Shortcuts",
      "",
      "Default shortcuts:",
      "",
      "- Open Quick Paste: `CmdOrCtrl+Shift+V` — global accelerator",
      "- Focus search: `CmdOrCtrl+Shift+F`",
    ].join("\n");
    const schema = parseShortcutSchema(doc);
    expect(schema).toHaveLength(2);
    expect(schema[0].actionId).toBe("open_quick_paste");
    expect(schema[1].actionId).toBe("focus_search");
  });

  it("returns an empty list when the document has no shortcut bullets", () => {
    expect(parseShortcutSchema("# Heading\n\nNo list here.\n")).toEqual([]);
  });
});

describe("parseBinding", () => {
  it("parses a documented grammar", () => {
    expect(parseBinding("CmdOrCtrl+Shift+F")).toEqual({
      ok: true,
      value: {
        modifier: "CmdOrCtrl",
        shift: true,
        alt: false,
        key: "F",
      },
    });
  });

  it("parses Alt and a single-character key", () => {
    expect(parseBinding("CmdOrCtrl+Alt+F4")).toEqual({
      ok: true,
      value: {
        modifier: "CmdOrCtrl",
        shift: false,
        alt: true,
        key: "F4",
      },
    });
  });

  it("rejects multi-key sequences", () => {
    expect(parseBinding("CmdOrCtrl+Shift+F+V").ok).toBe(false);
  });

  it("rejects grammar without the required CmdOrCtrl", () => {
    expect(parseBinding("Shift+F").ok).toBe(false);
  });

  it("rejects grammar with a trailing modifier", () => {
    expect(parseBinding("CmdOrCtrl+Shift+").ok).toBe(false);
  });

  it("rejects bare digits that are not named keys", () => {
    expect(parseBinding("CmdOrCtrl+Shift+1").ok).toBe(false);
  });
});

describe("formatBinding", () => {
  it("renders Cmd on macOS and Ctrl elsewhere", () => {
    const parsed = parseBinding("CmdOrCtrl+Shift+F");
    if (!parsed.ok) throw new Error("expected parse ok");
    expect(formatBinding(parsed.value, true)).toBe("Cmd + Shift + F");
    expect(formatBinding(parsed.value, false)).toBe("Ctrl + Shift + F");
  });

  it("keeps the named key as-is on both platforms", () => {
    const parsed = parseBinding("CmdOrCtrl+Shift+Backspace");
    if (!parsed.ok) throw new Error("expected parse ok");
    expect(formatBinding(parsed.value, true)).toBe("Cmd + Shift + Backspace");
    expect(formatBinding(parsed.value, false)).toBe("Ctrl + Shift + Backspace");
  });

  it("isMac reads the current platform", () => {
    expect(typeof isMac()).toBe("boolean");
  });
});

describe("validateBinding", () => {
  const schema = parseShortcutSchema(shortcuts);

  it("accepts the documented grammar and a non-empty key", () => {
    const result = validateBinding("CmdOrCtrl+Shift+K", "focus_search", schema);
    expect(result.ok).toBe(true);
  });

  it("rejects an empty string as an invalid grammar", () => {
    const result = validateBinding("", "focus_search", schema);
    expect(result.ok).toBe(false);
  });

  it("rejects a string that is not the documented grammar", () => {
    const result = validateBinding("Click+Shift+F", "focus_main_window_search", schema);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.reason.length).toBeGreaterThan(0);
  });

  it("rejects a binding that collides with another app shortcut", () => {
    const result = validateBinding("CmdOrCtrl+Shift+V", "focus_main_window_search", schema);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.reason).toMatch(/Open Quick Paste/i);
  });

  it("allows the same binding the row is being edited from", () => {
    const result = validateBinding("CmdOrCtrl+Shift+F", "focus_main_window_search", schema);
    expect(result.ok).toBe(true);
  });

  it("rejects the OS-reserved binding for the current platform", () => {
    const reserved = isMac() ? "CmdOrCtrl+Q" : "CmdOrCtrl+Alt+F4";
    const result = validateBinding(reserved, "copy_selected", schema);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.reason).toMatch(/reserved/i);
  });
});
