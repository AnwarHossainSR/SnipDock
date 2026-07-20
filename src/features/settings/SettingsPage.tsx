import { useEffect, useState } from "react";
import { commands } from "../../api/commands";
import type { ContentType, JsonValue, Settings } from "../../api/types";
import BackupPanel from "./BackupPanel";
import TransferPanel from "./TransferPanel";

const contentTypes: ContentType[] = [
  "plain_text", "code", "json", "sql", "html", "css", "xml", "shell", "markdown", "config",
];

export default function SettingsPage() {
  const [settings, setSettings] = useState<Settings | null>(null);
  const [failed, setFailed] = useState(false);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");

  useEffect(() => {
    let active = true;
    commands.getSettings().then(
      (loaded) => {
        if (!active) return;
        setSettings(loaded);
        document.documentElement.dataset.theme = loaded.theme === "system" ? "" : loaded.theme;
      },
      () => active && setFailed(true),
    );
    return () => { active = false; };
  }, []);

  async function patch(values: Record<string, JsonValue>, note = "Setting saved.") {
    setBusy(true);
    setError("");
    try {
      setSettings(await commands.saveSettings({ values }));
      setMessage(note);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Could not save settings.");
    } finally {
      setBusy(false);
    }
  }

  function update(key: keyof Settings, value: JsonValue) {
    void patch({ [key]: value });
  }

  if (!settings) {
    return (
      <main className="workspace-content">
        <div className="content-state" role={failed ? "alert" : "status"} aria-busy={!failed}>
          <span className={failed ? "state-mark" : "loading-ring"} aria-hidden="true">{failed ? "!" : ""}</span>
          <div>
            {failed && <h3>Settings unavailable</h3>}
            <p>{failed ? "Close and reopen SnipDock to try again." : "Loading settings…"}</p>
          </div>
        </div>
      </main>
    );
  }

  return (
    <main className="workspace-content settings-page">
      <header className="content-heading">
        <div><p>Preferences</p><h2 id="workspace-title" tabIndex={-1}>Settings</h2></div>
      </header>
      <div className="sr-only" aria-live="polite">{message}</div>
      {error && <p className="action-error" role="alert">{error}</p>}

      <nav className="settings-index" aria-label="Settings sections">
        <a href="#settings-clipboard">Clipboard</a><a href="#settings-appearance">Appearance</a>
        <a href="#settings-transfer">Transfer</a><a href="#settings-backup">Backup</a><a href="#settings-privacy">Privacy</a>
      </nav>

      <section className="section-panel" aria-labelledby="settings-clipboard">
        <header><p className="panel-label">Clipboard</p><h3 id="settings-clipboard">Capture and retention</h3><p>Control what SnipDock stores locally.</p></header>
        <label className="toggle-row" htmlFor="setting-tracking">
          <span><strong>Track clipboard changes</strong><small>Capture new clipboard text while SnipDock runs.</small></span>
          <input id="setting-tracking" aria-label="Track clipboard changes" type="checkbox" checked={settings.clipboard_tracking} disabled={busy}
            onChange={(event) => update("clipboard_tracking", event.target.checked)} />
        </label>
        <div className="settings-grid">
          <label>History retention (days, 1-365)<input type="number" min={1} max={365} value={settings.history_days} disabled={busy} onChange={(event) => update("history_days", Number(event.target.value))} /></label>
          <label>Maximum items (10-10,000)<input type="number" min={10} max={10000} value={settings.max_items} disabled={busy} onChange={(event) => update("max_items", Number(event.target.value))} /></label>
          <label>Ignored apps<textarea value={settings.ignored_apps.join("\n")} disabled={busy} onChange={(event) => update("ignored_apps", event.target.value.split("\n").map((v) => v.trim()).filter(Boolean))} placeholder="One executable per line" /></label>
          <label>Ignored text patterns<textarea value={settings.ignored_patterns.join("\n")} disabled={busy} onChange={(event) => update("ignored_patterns", event.target.value.split("\n").map((v) => v.trim()).filter(Boolean))} placeholder="One regular expression per line" /></label>
        </div>
        <fieldset className="settings-checks"><legend>Ignored content types</legend>{contentTypes.map((type) => <label key={type}><input type="checkbox" checked={settings.ignored_content_types.includes(type)} disabled={busy} onChange={(event) => update("ignored_content_types", event.target.checked ? [...settings.ignored_content_types, type] : settings.ignored_content_types.filter((value) => value !== type))} /> {type.replace("_", " ")}</label>)}</fieldset>
      </section>

      <section className="section-panel" aria-labelledby="settings-appearance">
        <header><p className="panel-label">Appearance</p><h3 id="settings-appearance">Appearance</h3><p>Follow Windows or choose an explicit theme.</p></header>
        <label>Theme<select value={settings.theme} disabled={busy} onChange={(event) => { document.documentElement.dataset.theme = event.target.value === "system" ? "" : event.target.value; update("theme", event.target.value); }}><option value="system">System</option><option value="light">Light</option><option value="dark">Dark</option></select></label>
        <label className="toggle-row" htmlFor="setting-min-tray"><span><strong>Minimize to tray</strong><small>Keep capture available when the window is minimized.</small></span><input id="setting-min-tray" aria-label="Minimize to tray" type="checkbox" checked={settings.minimize_to_tray} disabled={busy} onChange={(event) => update("minimize_to_tray", event.target.checked)} /></label>
        <label>Formatter indent (spaces, 1-8)<input type="number" min={1} max={8} value={settings.formatter_indent} disabled={busy} onChange={(event) => update("formatter_indent", Number(event.target.value))} /></label>
      </section>

      <div id="settings-transfer"><TransferPanel /></div>
      <div id="settings-backup"><BackupPanel /></div>
      <section className="section-panel" aria-labelledby="settings-privacy"><header><p className="panel-label">Privacy</p><h3 id="settings-privacy">Local by default</h3></header><p>SnipDock makes no network requests. Private items cannot be exported. Sensitive clipboard text may be rejected before storage.</p></section>
    </main>
  );
}
