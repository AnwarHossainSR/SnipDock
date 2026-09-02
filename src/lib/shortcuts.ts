import keyboardShortcuts from "../../docs/keyboard-shortcuts.md?raw";

export interface ShortcutEntry {
  actionId: string;
  label: string;
  defaultBinding: string;
}

export interface ParsedBinding {
  modifier: "CmdOrCtrl";
  shift: boolean;
  alt: boolean;
  key: string;
}

export type ParseResult =
  | { ok: true; value: ParsedBinding }
  | { ok: false; reason: string };

export type ValidationResult =
  | { ok: true; value: ParsedBinding }
  | { ok: false; reason: string };

/**
 * Per-platform reserved bindings the app cannot use. macOS `Cmd+Q` quits the
 * frontmost app; Windows `Alt+F4` closes the active window. Both are grabbed
 * by the OS before the app sees the keypress, so a rebind would silently do
 * nothing and the user would think the rebind worked. Reject upfront.
 */
const OS_RESERVED: Record<"mac" | "other", string[]> = {
  mac: ["CmdOrCtrl+Q", "CmdOrCtrl+W", "CmdOrCtrl+H", "CmdOrCtrl+M", "CmdOrCtrl+Space"],
  other: ["CmdOrCtrl+Alt+F4", "CmdOrCtrl+Alt+Delete", "CmdOrCtrl+Esc"],
};

const NAMED_KEYS = new Set([
  "Backspace",
  "Tab",
  "Enter",
  "Escape",
  "Home",
  "End",
  "PageUp",
  "PageDown",
  "Left",
  "Right",
  "Up",
  "Down",
  "Space",
  "F1",
  "F2",
  "F3",
  "F4",
  "F5",
  "F6",
  "F7",
  "F8",
  "F9",
  "F10",
  "F11",
  "F12",
]);

function isNamedKey(candidate: string): boolean {
  if (NAMED_KEYS.has(candidate)) return true;
  return /^[A-Z]$/.test(candidate);
}

export function isMac(): boolean {
  if (typeof navigator === "undefined") return false;
  return navigator.platform.startsWith("Mac");
}

function toActionId(label: string): string {
  return label
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_|_$/g, "");
}

/**
 * Parse the dev-facing doc into the schema the Settings panel renders. The
 * doc is the single source of truth, so adding a bullet is enough to make a
 * new shortcut show up in the panel without a code change to the panel.
 *
 * Recognised bullet shape: `- Label: `CmdOrCtrl+Shift+X`` (the binding is
 * inside backticks, modifiers and a single key joined with `+`). Anything
 * that doesn't fit is silently skipped so the doc can grow explanatory
 * paragraphs below the bullet list without breaking parsing.
 */
export function parseShortcutSchema(doc: string): ShortcutEntry[] {
  const entries: ShortcutEntry[] = [];
  const bullet = /^\s*-\s+([A-Z][A-Za-z0-9 -]+?):\s+`([^`]+)`/gm;
  let match: RegExpExecArray | null;
  while ((match = bullet.exec(doc)) !== null) {
    const label = match[1].trim();
    const defaultBinding = match[2].trim();
    entries.push({
      actionId: toActionId(label),
      label,
      defaultBinding,
    });
  }
  return entries;
}

export const SHORTCUT_SCHEMA: ShortcutEntry[] = parseShortcutSchema(keyboardShortcuts);

export function parseBinding(raw: string): ParseResult {
  const trimmed = raw.trim();
  if (!trimmed) return { ok: false, reason: "Enter a binding." };
  const parts = trimmed.split("+").map((part) => part.trim());
  if (parts.length < 2) {
    return { ok: false, reason: "Use the form Ctrl+Shift+F." };
  }
  const key = parts[parts.length - 1];
  const modifiers = parts.slice(0, -1);
  const order = ["CmdOrCtrl", "Shift", "Alt"];
  for (const modifier of modifiers) {
    if (!order.includes(modifier)) {
      return { ok: false, reason: `Unknown modifier: ${modifier}.` };
    }
  }
  if (modifiers[0] !== "CmdOrCtrl") {
    return { ok: false, reason: "Start with CmdOrCtrl." };
  }
  // The grammar is a prefix of `CmdOrCtrl, Shift, Alt`, in that order and
  // without repeats. Comparing the whole sequence rejects `Shift+CmdOrCtrl+F`
  // and `CmdOrCtrl+Shift+Shift+F`, which a per-modifier check let through.
  const expected = order.filter((modifier) => modifiers.includes(modifier));
  if (modifiers.length !== expected.length || modifiers.some((modifier, index) => modifier !== expected[index])) {
    return { ok: false, reason: "Modifiers must be in the order CmdOrCtrl, Shift, Alt, with no repeats." };
  }
  if (!isNamedKey(key)) {
    return { ok: false, reason: `Unknown key: ${key}.` };
  }
  return {
    ok: true,
    value: {
      modifier: "CmdOrCtrl",
      shift: modifiers.includes("Shift"),
      alt: modifiers.includes("Alt"),
      key,
    },
  };
}

export function formatBinding(parsed: ParsedBinding, mac: boolean): string {
  const pieces: string[] = [mac ? "Cmd" : "Ctrl"];
  if (parsed.shift) pieces.push("Shift");
  if (parsed.alt) pieces.push("Alt");
  pieces.push(parsed.key);
  return pieces.join(" + ");
}

/**
 * Validate a candidate binding against the bindings actually in force.
 * `excludeActionId` lets the row being edited reuse its own binding without
 * self-collision. `overrides` is the saved custom map: a collision has to be
 * checked against the effective binding of every other action, not only the
 * documented default, or two actions can end up sharing one custom binding.
 */
export function validateBinding(
  raw: string,
  excludeActionId: string,
  schema: ShortcutEntry[] = SHORTCUT_SCHEMA,
  overrides: Record<string, string> = {},
): ValidationResult {
  const parsed = parseBinding(raw);
  if (!parsed.ok) return parsed;
  const candidate = raw.trim();
  const reserved = OS_RESERVED[isMac() ? "mac" : "other"];
  if (reserved.includes(candidate)) {
    return { ok: false, reason: `${candidate} is reserved by the operating system.` };
  }
  for (const entry of schema) {
    if (entry.actionId === excludeActionId) continue;
    const effective = overrides[entry.actionId]?.trim() || entry.defaultBinding;
    if (effective === candidate) {
      return { ok: false, reason: `${candidate} is already used by ${entry.label}.` };
    }
  }
  return { ok: true, value: parsed.value };
}
