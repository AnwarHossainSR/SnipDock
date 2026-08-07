// Sourced from docs/keyboard-shortcuts.md's "selected-item shortcuts [that]
// act on the Clipboard History page" - kept in sync with that document by
// hand since it is a dev-facing doc, not a bundled runtime asset.
const CLIPBOARD_HINTS: { action: string; combo: string }[] = [
  { action: "Copy", combo: "CmdOrCtrl+Shift+C" },
  { action: "Toggle pin", combo: "CmdOrCtrl+Shift+P" },
  { action: "Toggle favorite", combo: "CmdOrCtrl+Shift+D" },
  { action: "Delete", combo: "CmdOrCtrl+Shift+Backspace" },
  { action: "Next", combo: "CmdOrCtrl+Shift+Right" },
  { action: "Previous", combo: "CmdOrCtrl+Shift+Left" },
];

function formatCombo(combo: string): string {
  const isMac = navigator.platform.startsWith("Mac");
  return combo.replace("CmdOrCtrl", isMac ? "Cmd" : "Ctrl");
}

export function clipboardShortcutHints(): { action: string; combo: string }[] {
  return CLIPBOARD_HINTS.map(({ action, combo }) => ({ action, combo: formatCombo(combo) }));
}
