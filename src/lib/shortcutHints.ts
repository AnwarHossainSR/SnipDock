import { formatBinding, isMac, parseBinding, SHORTCUT_SCHEMA } from "./shortcuts";

/**
 * The shortcuts the Clipboard history page acts on, in the order the hint row
 * shows them. These are action ids, not bindings: the binding is whatever is
 * in force, which is the user's override where one is stored and the
 * documented default otherwise.
 *
 * Holding the combinations here as literals - which is what this module used
 * to do - duplicated `docs/keyboard-shortcuts.md` by hand and ignored every
 * rebind, so the row under the history advertised combinations the app had
 * stopped listening for.
 */
const CLIPBOARD_ACTIONS: { action: string; actionId: string }[] = [
  { action: "Copy", actionId: "copy_selected" },
  { action: "Toggle pin", actionId: "toggle_pin" },
  { action: "Toggle favorite", actionId: "toggle_favorite" },
  { action: "Delete", actionId: "delete_selected" },
  { action: "Next", actionId: "navigate_next" },
  { action: "Previous", actionId: "navigate_previous" },
];

export type ShortcutOverrides = Record<string, string>;

/**
 * The binding actually in force for an action, formatted for this platform.
 * Returns null when the action is not in the documented schema at all, so a
 * caller never renders a hint for something the app does not register.
 */
export function effectiveBinding(
  actionId: string,
  overrides: ShortcutOverrides = {},
): string | null {
  const entry = SHORTCUT_SCHEMA.find((candidate) => candidate.actionId === actionId);
  if (!entry) return null;
  const raw = overrides[actionId]?.trim() || entry.defaultBinding;
  const parsed = parseBinding(raw);
  return parsed.ok ? formatBinding(parsed.value, isMac()) : raw;
}

/**
 * The accelerator that focuses the search field. Ctrl/Cmd+K also focuses it,
 * but only the documented action is ever shown - the UI never advertises an
 * undocumented shortcut.
 */
export function searchShortcutHint(overrides: ShortcutOverrides = {}): string {
  return effectiveBinding("focus_main_window_search", overrides) ?? "";
}

/** The accelerator that opens Quick Paste, which is registered OS-wide. */
export function quickPasteShortcutHint(overrides: ShortcutOverrides = {}): string | null {
  return effectiveBinding("open_quick_paste", overrides);
}

export function clipboardShortcutHints(
  overrides: ShortcutOverrides = {},
): { action: string; combo: string }[] {
  return CLIPBOARD_ACTIONS.flatMap(({ action, actionId }) => {
    const combo = effectiveBinding(actionId, overrides);
    return combo ? [{ action, combo }] : [];
  });
}
