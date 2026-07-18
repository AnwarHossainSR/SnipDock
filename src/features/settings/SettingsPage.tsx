import { useEffect, useState } from "react";
import { commands } from "../../lib/commands";
import type { JsonValue, Settings } from "../../lib/types";
import BackupPanel from "./BackupPanel";
import TransferPanel from "./TransferPanel";

type PageState =
  | { status: "loading"; settings: Settings | null }
  | { status: "ready"; settings: Settings }
  | { status: "error"; settings: Settings | null };

const GROUP_DEFAULTS: Record<string, Record<string, JsonValue>> = {
  clipboard: {
    clipboard_tracking: true,
    history_days: 30,
    max_items: 500,
    auto_delete_days: null,
  },
  shortcuts: {
    open_shortcut: "CmdOrCtrl+Shift+V",
    new_snippet_shortcut: "CmdOrCtrl+Shift+N",
  },
  appearance: {
    theme: "system",
    compact_mode: false,
    always_on_top: false,
  },
  behavior: {
    start_with_os: false,
    minimize_to_tray: true,
    notifications: true,
    formatter_indent: 2,
  },
  security: {
    auto_clear_secret_seconds: null,
    lock_after_minutes: null,
  },
  backup: {
    backup_interval_hours: 24,
    backup_retention: 7,
  },
};

function shortcutFromKeyboardEvent(event: React.KeyboardEvent): string | null {
  const key = event.key;
  if (["Control", "Meta", "Shift", "Alt"].includes(key)) return null;
  const parts: string[] = [];
  if (event.ctrlKey || event.metaKey) parts.push("CmdOrCtrl");
  if (event.altKey) parts.push("Alt");
  if (event.shiftKey) parts.push("Shift");
  if (parts.length === 0) return null;
  parts.push(key.length === 1 ? key.toUpperCase() : key);
  return parts.join("+");
}

export default function SettingsPage() {
  const [state, setState] = useState<PageState>({ status: "loading", settings: null });
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [capturing, setCapturing] = useState<"open_shortcut" | "new_snippet_shortcut" | null>(
    null,
  );

  useEffect(() => {
    let active = true;
    commands.getSettings().then(
      (settings) => {
        if (active) setState({ status: "ready", settings });
      },
      () => {
        if (active) setState({ status: "error", settings: null });
      },
    );
    return () => {
      active = false;
    };
  }, []);

  const settings = state.status === "ready" ? state.settings : null;

  async function patch(values: Record<string, JsonValue>, note: string) {
    setBusy(true);
    setError("");
    try {
      const updated = await commands.saveSettings({ values });
      setState({ status: "ready", settings: updated });
      setMessage(note);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Could not save settings.");
    } finally {
      setBusy(false);
    }
  }

  function update(key: keyof Settings, value: JsonValue) {
    void patch({ [key]: value }, "Setting saved.");
  }

  function resetGroup(group: string) {
    void patch(GROUP_DEFAULTS[group], "Group reset to defaults.");
  }

  function captureShortcut(
    field: "open_shortcut" | "new_snippet_shortcut",
    event: React.KeyboardEvent<HTMLInputElement>,
  ) {
    event.preventDefault();
    if (event.key === "Escape") {
      setCapturing(null);
      return;
    }
    const shortcut = shortcutFromKeyboardEvent(event);
    if (!shortcut) return;
    setCapturing(null);
    update(field, shortcut);
  }

  if (state.status === "loading") {
    return (
      <main className="workspace-content">
        <div className="content-state" role="status" aria-busy="true">
          <span className="loading-ring" aria-hidden="true" />
          <p>Loading settings...</p>
        </div>
      </main>
    );
  }

  if (state.status === "error" || !settings) {
    return (
      <main className="workspace-content">
        <div className="content-state" role="alert">
          <span className="state-mark" aria-hidden="true">!</span>
          <div>
            <h3>Settings unavailable</h3>
            <p>Close and reopen SnipDock to try again.</p>
          </div>
        </div>
      </main>
    );
  }

  return (
    <main className="workspace-content">
      <header className="content-heading">
        <div>
          <p>Preferences</p>
          <h2 id="workspace-title" tabIndex={-1}>Settings</h2>
        </div>
      </header>
      <div className="sr-only" aria-live="polite">{message}</div>
      {error && <p className="action-error" role="alert">{error}</p>}

      <TransferPanel />
      <BackupPanel />

      <section className="snippet-detail" aria-labelledby="settings-clipboard">
        <header className="snippet-detail__header">
          <div>
            <span className="snippet-detail__kind">Clipboard</span>
            <h3 id="settings-clipboard">History and retention</h3>
          </div>
          <button
            type="button"
            className="button-secondary"
            disabled={busy}
            onClick={() => resetGroup("clipboard")}
          >
            Reset group
          </button>
        </header>
        <div className="snippet-editor__field">
          <label htmlFor="setting-tracking">
            <input
              id="setting-tracking"
              type="checkbox"
              checked={settings.clipboard_tracking}
              disabled={busy}
              onChange={(event) => update("clipboard_tracking", event.target.checked)}
            />
            {" "}Track clipboard changes
          </label>
        </div>
        <div className="snippet-editor__field">
          <label htmlFor="setting-history-days">History retention (days, 1-365)</label>
          <input
            id="setting-history-days"
            type="number"
            min={1}
            max={365}
            value={settings.history_days}
            disabled={busy}
            onChange={(event) => update("history_days", Number(event.target.value))}
          />
        </div>
        <div className="snippet-editor__field">
          <label htmlFor="setting-max-items">Maximum items (10-10,000)</label>
          <input
            id="setting-max-items"
            type="number"
            min={10}
            max={10000}
            value={settings.max_items}
            disabled={busy}
            onChange={(event) => update("max_items", Number(event.target.value))}
          />
        </div>
        <div className="snippet-editor__field">
          <label htmlFor="setting-auto-delete">Auto-delete after (days, blank for never)</label>
          <input
            id="setting-auto-delete"
            type="number"
            min={1}
            max={365}
            value={settings.auto_delete_days ?? ""}
            disabled={busy}
            onChange={(event) =>
              update(
                "auto_delete_days",
                event.target.value === "" ? null : Number(event.target.value),
              )}
          />
        </div>
      </section>

      <section className="snippet-detail" aria-labelledby="settings-shortcuts">
        <header className="snippet-detail__header">
          <div>
            <span className="snippet-detail__kind">Shortcuts</span>
            <h3 id="settings-shortcuts">Global shortcuts</h3>
          </div>
          <button
            type="button"
            className="button-secondary"
            disabled={busy}
            onClick={() => resetGroup("shortcuts")}
          >
            Reset group
          </button>
        </header>
        {(["open_shortcut", "new_snippet_shortcut"] as const).map((field) => (
          <div className="snippet-editor__field" key={field}>
            <label htmlFor={`setting-${field}`}>
              {field === "open_shortcut" ? "Open SnipDock" : "New snippet"}
            </label>
            <input
              id={`setting-${field}`}
              value={capturing === field ? "Press keys… (Esc to cancel)" : settings[field]}
              readOnly
              disabled={busy}
              onFocus={() => setCapturing(field)}
              onBlur={() => setCapturing((current) => (current === field ? null : current))}
              onKeyDown={(event) => captureShortcut(field, event)}
            />
          </div>
        ))}
      </section>

      <section className="snippet-detail" aria-labelledby="settings-appearance">
        <header className="snippet-detail__header">
          <div>
            <span className="snippet-detail__kind">Appearance</span>
            <h3 id="settings-appearance">Theme and layout</h3>
          </div>
          <button
            type="button"
            className="button-secondary"
            disabled={busy}
            onClick={() => resetGroup("appearance")}
          >
            Reset group
          </button>
        </header>
        <div className="snippet-editor__field">
          <label htmlFor="setting-theme">Theme</label>
          <select
            id="setting-theme"
            value={settings.theme}
            disabled={busy}
            onChange={(event) => {
              document.documentElement.dataset.theme =
                event.target.value === "system" ? "" : event.target.value;
              update("theme", event.target.value);
            }}
          >
            <option value="system">System</option>
            <option value="light">Light</option>
            <option value="dark">Dark</option>
          </select>
        </div>
        <div className="snippet-editor__field">
          <label htmlFor="setting-compact">
            <input
              id="setting-compact"
              type="checkbox"
              checked={settings.compact_mode}
              disabled={busy}
              onChange={(event) => update("compact_mode", event.target.checked)}
            />
            {" "}Compact mode
          </label>
        </div>
        <div className="snippet-editor__field">
          <label htmlFor="setting-on-top">
            <input
              id="setting-on-top"
              type="checkbox"
              checked={settings.always_on_top}
              disabled={busy}
              onChange={(event) => update("always_on_top", event.target.checked)}
            />
            {" "}Always on top
          </label>
        </div>
      </section>

      <section className="snippet-detail" aria-labelledby="settings-behavior">
        <header className="snippet-detail__header">
          <div>
            <span className="snippet-detail__kind">Behavior</span>
            <h3 id="settings-behavior">Startup and notifications</h3>
          </div>
          <button
            type="button"
            className="button-secondary"
            disabled={busy}
            onClick={() => resetGroup("behavior")}
          >
            Reset group
          </button>
        </header>
        <div className="snippet-editor__field">
          <label htmlFor="setting-start-os">
            <input
              id="setting-start-os"
              type="checkbox"
              checked={settings.start_with_os}
              disabled={busy}
              onChange={(event) => update("start_with_os", event.target.checked)}
            />
            {" "}Start with the operating system
          </label>
        </div>
        <div className="snippet-editor__field">
          <label htmlFor="setting-min-tray">
            <input
              id="setting-min-tray"
              type="checkbox"
              checked={settings.minimize_to_tray}
              disabled={busy}
              onChange={(event) => update("minimize_to_tray", event.target.checked)}
            />
            {" "}Minimize to tray
          </label>
        </div>
        <div className="snippet-editor__field">
          <label htmlFor="setting-notifications">
            <input
              id="setting-notifications"
              type="checkbox"
              checked={settings.notifications}
              disabled={busy}
              onChange={(event) => update("notifications", event.target.checked)}
            />
            {" "}Show notifications
          </label>
        </div>
        <div className="snippet-editor__field">
          <label htmlFor="setting-indent">Formatter indent (spaces, 1-8)</label>
          <input
            id="setting-indent"
            type="number"
            min={1}
            max={8}
            value={settings.formatter_indent}
            disabled={busy}
            onChange={(event) => update("formatter_indent", Number(event.target.value))}
          />
        </div>
      </section>

      <section className="snippet-detail" aria-labelledby="settings-security">
        <header className="snippet-detail__header">
          <div>
            <span className="snippet-detail__kind">Security</span>
            <h3 id="settings-security">Lock and secrets</h3>
          </div>
          <button
            type="button"
            className="button-secondary"
            disabled={busy}
            onClick={() => resetGroup("security")}
          >
            Reset group
          </button>
        </header>
        <div className="snippet-editor__field">
          <label htmlFor="setting-auto-clear">
            Auto-clear secrets from clipboard (seconds, blank for never)
          </label>
          <input
            id="setting-auto-clear"
            type="number"
            min={5}
            max={3600}
            value={settings.auto_clear_secret_seconds ?? ""}
            disabled={busy}
            onChange={(event) =>
              update(
                "auto_clear_secret_seconds",
                event.target.value === "" ? null : Number(event.target.value),
              )}
          />
        </div>
        <div className="snippet-editor__field">
          <label htmlFor="setting-lock-after">Lock app after (minutes, blank for never)</label>
          <input
            id="setting-lock-after"
            type="number"
            min={1}
            max={480}
            value={settings.lock_after_minutes ?? ""}
            disabled={busy}
            onChange={(event) =>
              update(
                "lock_after_minutes",
                event.target.value === "" ? null : Number(event.target.value),
              )}
          />
        </div>
      </section>

      <section className="snippet-detail" aria-labelledby="settings-backup">
        <header className="snippet-detail__header">
          <div>
            <span className="snippet-detail__kind">Backup</span>
            <h3 id="settings-backup">Automatic backups</h3>
          </div>
          <button
            type="button"
            className="button-secondary"
            disabled={busy}
            onClick={() => resetGroup("backup")}
          >
            Reset group
          </button>
        </header>
        <div className="snippet-editor__field">
          <label htmlFor="setting-backup-interval">Backup every (hours, 1-168)</label>
          <input
            id="setting-backup-interval"
            type="number"
            min={1}
            max={168}
            value={settings.backup_interval_hours}
            disabled={busy}
            onChange={(event) => update("backup_interval_hours", Number(event.target.value))}
          />
        </div>
        <div className="snippet-editor__field">
          <label htmlFor="setting-backup-retention">Keep backups (count, 1-100)</label>
          <input
            id="setting-backup-retention"
            type="number"
            min={1}
            max={100}
            value={settings.backup_retention}
            disabled={busy}
            onChange={(event) => update("backup_retention", Number(event.target.value))}
          />
        </div>
      </section>
    </main>
  );
}
