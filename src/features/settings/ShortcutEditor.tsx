import { useCallback, useEffect, useState } from "react";
import { ShortcutEvents } from "../../api/events";
import type { Settings } from "../../api/types";

const SHORTCUT_DEFINITIONS = [
  { key: "f", event: ShortcutEvents.search, label: "Focus Search", defaultKey: "Ctrl+Shift+F" },
  { key: "c", event: ShortcutEvents.copySelected, label: "Copy Selected", defaultKey: "Ctrl+Shift+C" },
  { key: "p", event: ShortcutEvents.togglePin, label: "Toggle Pin", defaultKey: "Ctrl+Shift+P" },
  { key: "backspace", event: ShortcutEvents.deleteSelected, label: "Delete Selected", defaultKey: "Ctrl+Shift+Backspace" },
  { key: "d", event: ShortcutEvents.toggleFavorite, label: "Toggle Favorite", defaultKey: "Ctrl+Shift+D" },
  { key: "arrowright", event: ShortcutEvents.navigateNext, label: "Navigate Next", defaultKey: "Ctrl+Shift+Right" },
  { key: "arrowleft", event: ShortcutEvents.navigatePrevious, label: "Navigate Previous", defaultKey: "Ctrl+Shift+Left" },
];

interface ShortcutEditorProps {
  settings: Settings;
  onSave: (customShortcuts: Record<string, string>) => Promise<void>;
}

export default function ShortcutEditor({ settings, onSave }: ShortcutEditorProps) {
  const [customShortcuts, setCustomShortcuts] = useState<Record<string, string>>(
    settings.custom_shortcuts || {}
  );
  const [recording, setRecording] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");

  const formatKeyDisplay = useCallback((key: string) => {
    return key
      .replace("ctrl", "Ctrl")
      .replace("shift", "Shift")
      .replace("alt", "Alt")
      .replace("meta", "Cmd")
      .replace("arrowright", "Right")
      .replace("arrowleft", "Left")
      .replace("backspace", "Backspace")
      .replace("+", " + ");
  }, []);

  const handleRecord = useCallback((shortcutKey: string) => {
    setRecording(shortcutKey);
    setMessage("");
    setError("");
  }, []);

  const handleKeyDown = useCallback((event: KeyboardEvent) => {
    if (!recording) return;
    
    // Ignore modifier-only keys
    if (["Control", "Shift", "Alt", "Meta"].includes(event.key)) return;
    
    event.preventDefault();
    event.stopPropagation();
    
    const parts: string[] = [];
    if (event.ctrlKey || event.metaKey) parts.push("ctrl");
    if (event.shiftKey) parts.push("shift");
    if (event.altKey) parts.push("alt");
    
    const key = event.key.toLowerCase();
    if (!["control", "shift", "alt", "meta"].includes(key)) {
      parts.push(key);
    }
    
    if (parts.length > 1) { // At least one modifier + a key
      const combination = parts.join("+");
      setCustomShortcuts(prev => ({
        ...prev,
        [recording]: combination,
      }));
      setRecording(null);
      setMessage(`Shortcut updated to ${formatKeyDisplay(combination)}`);
    }
  }, [recording, formatKeyDisplay]);

  useEffect(() => {
    if (recording) {
      document.addEventListener("keydown", handleKeyDown, true);
      return () => document.removeEventListener("keydown", handleKeyDown, true);
    }
  }, [recording, handleKeyDown]);

  const handleReset = useCallback((shortcutKey: string) => {
    setCustomShortcuts(prev => {
      const next = { ...prev };
      delete next[shortcutKey];
      return next;
    });
    setMessage("Shortcut reset to default");
  }, []);

  const handleResetAll = useCallback(() => {
    setCustomShortcuts({});
    setMessage("All shortcuts reset to defaults");
  }, []);

  const handleSave = useCallback(async () => {
    setBusy(true);
    setError("");
    try {
      await onSave(customShortcuts);
      setMessage("Shortcuts saved successfully");
    } catch {
      setError("Could not save shortcuts");
    } finally {
      setBusy(false);
    }
  }, [customShortcuts, onSave]);

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h4 className="text-sm font-semibold">Keyboard Shortcuts</h4>
          <p className="text-xs text-muted-foreground">
            Click "Record" then press a key combination to customize
          </p>
        </div>
        <button
          type="button"
          className="text-xs text-muted-foreground hover:text-foreground"
          onClick={handleResetAll}
          disabled={busy || recording !== null}
        >
          Reset all to defaults
        </button>
      </div>

      {message && (
        <p className="text-xs text-green-600 dark:text-green-400">{message}</p>
      )}
      {error && (
        <p className="text-xs text-destructive" role="alert">{error}</p>
      )}

      <div className="space-y-2">
        {SHORTCUT_DEFINITIONS.map((def) => {
          const currentKey = customShortcuts[def.key] || def.defaultKey;
          const isRecording = recording === def.key;
          
          return (
            <div
              key={def.key}
              className="flex items-center justify-between rounded-md border border-border p-2"
            >
              <span className="text-sm">{def.label}</span>
              <div className="flex items-center gap-2">
                <span className="font-mono text-xs text-muted-foreground">
                  {formatKeyDisplay(currentKey)}
                </span>
                {isRecording ? (
                  <span className="text-xs text-primary animate-pulse">
                    Press keys...
                  </span>
                ) : (
                  <>
                    <button
                      type="button"
                      className="rounded-sm border border-border px-2 py-1 text-xs hover:bg-muted"
                      onClick={() => handleRecord(def.key)}
                      disabled={busy}
                    >
                      Record
                    </button>
                    {customShortcuts[def.key] && (
                      <button
                        type="button"
                        className="text-xs text-muted-foreground hover:text-foreground"
                        onClick={() => handleReset(def.key)}
                        disabled={busy}
                      >
                        Reset
                      </button>
                    )}
                  </>
                )}
              </div>
            </div>
          );
        })}
      </div>

      <div className="flex justify-end">
        <button
          type="button"
          className="rounded-md bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground hover:bg-primary/90 disabled:opacity-50"
          onClick={handleSave}
          disabled={busy || recording !== null}
        >
          {busy ? "Saving..." : "Save Shortcuts"}
        </button>
      </div>
    </div>
  );
}
