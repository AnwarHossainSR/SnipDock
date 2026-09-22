import { describe, expect, test } from "bun:test";
import {
  clipboardShortcutHints,
  effectiveBinding,
  quickPasteShortcutHint,
  searchShortcutHint,
} from "./shortcutHints";

/**
 * These hints used to be literal combinations kept in step with
 * docs/keyboard-shortcuts.md by hand, which meant they ignored every rebind:
 * the row under the history and the cap beside the search box went on naming
 * combinations the app had stopped listening for.
 */
describe("shortcut hints", () => {
  test("fall back to the documented default when nothing is overridden", () => {
    expect(effectiveBinding("toggle_pin")).toBe("Ctrl + Shift + P");
    expect(searchShortcutHint()).toBe("Ctrl + Shift + F");
    expect(quickPasteShortcutHint()).toBe("Ctrl + Shift + V");
  });

  test("name the user's binding where one is stored", () => {
    const overrides = {
      toggle_pin: "CmdOrCtrl+Alt+P",
      focus_main_window_search: "CmdOrCtrl+Alt+F",
      open_quick_paste: "CmdOrCtrl+Alt+V",
    };

    expect(effectiveBinding("toggle_pin", overrides)).toBe("Ctrl + Alt + P");
    expect(searchShortcutHint(overrides)).toBe("Ctrl + Alt + F");
    expect(quickPasteShortcutHint(overrides)).toBe("Ctrl + Alt + V");
  });

  test("a blank override is not an override", () => {
    expect(effectiveBinding("toggle_pin", { toggle_pin: "   " })).toBe("Ctrl + Shift + P");
  });

  test("the history hint row carries every action it acts on", () => {
    const hints = clipboardShortcutHints({ delete_selected: "CmdOrCtrl+Alt+Backspace" });

    expect(hints.map((hint) => hint.action)).toEqual([
      "Copy",
      "Toggle pin",
      "Toggle favorite",
      "Delete",
      "Next",
      "Previous",
    ]);
    expect(hints.find((hint) => hint.action === "Delete")?.combo).toBe("Ctrl + Alt + Backspace");
  });

  test("an action outside the documented schema is never advertised", () => {
    expect(effectiveBinding("not_a_real_action")).toBeNull();
  });
});
