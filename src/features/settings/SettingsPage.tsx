import { useEffect, useState } from "react";
import { commands } from "../../api/commands";
import type { ContentType, JsonValue, Settings } from "../../api/types";
import BackupPanel from "./BackupPanel";
import TransferPanel from "./TransferPanel";
import UpdatesPanel from "./UpdatesPanel";

const contentTypes: ContentType[] = [
  "plain_text", "code", "json", "sql", "html", "css", "xml", "shell", "markdown", "config",
];

const panelClass = "mb-4 grid content-start gap-4 rounded-lg border border-border bg-card p-5";
const headerClass = "grid gap-1 [&_h3]:m-0 [&_h3]:font-semibold [&>p:last-child]:mt-2 [&>p:last-child]:text-xs [&>p:last-child]:text-muted-foreground";
const labelClass = "grid content-start gap-2 text-xs font-semibold text-muted-foreground";
const fieldClass = "w-full min-h-8 rounded-sm border border-border bg-muted px-3 py-2 font-normal text-foreground focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring";
const toggleClass = "flex min-h-12 items-center justify-between gap-4 [&>span]:grid [&>span]:gap-1 [&_small]:font-normal [&_small]:text-muted-foreground";

export default function SettingsPage() {
  const [settings, setSettings] = useState<Settings | null>(null);
  const [failed, setFailed] = useState(false);
  const [busy, setBusy] = useState(false);
  const [autostart, setAutostart] = useState<boolean | null>(null);
  const [autostartBusy, setAutostartBusy] = useState(false);
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
    commands.getAutostart().then(setAutostart, () => setAutostart(false));
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

  async function updateAutostart(enabled: boolean) {
    setAutostartBusy(true);
    setError("");
    try {
      setAutostart(await commands.setAutostart(enabled));
      setMessage("Startup setting saved.");
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Could not change startup setting.");
    } finally {
      setAutostartBusy(false);
    }
  }

  if (!settings) {
    return (
      <main className="min-w-0 p-[clamp(1.25rem,3vw,2.5rem)] max-[31rem]:px-3 max-[31rem]:py-4">
        <div className="flex max-w-[30rem] items-center gap-5 p-8 text-muted-foreground max-[31rem]:flex-col max-[31rem]:text-center" role={failed ? "alert" : "status"} aria-busy={!failed}>
          <span className={failed ? "grid size-10 shrink-0 place-items-center rounded-full bg-destructive/10 font-bold text-destructive" : "size-6 animate-spin rounded-full border-2 border-border border-t-primary motion-reduce:animate-none"} aria-hidden="true">{failed ? "!" : ""}</span>
          <div>
            {failed && <h3 className="m-0 text-base font-semibold text-foreground">Settings unavailable</h3>}
            <p className="mt-2 text-sm">{failed ? "Close and reopen SnipDock to try again." : "Loading settings…"}</p>
          </div>
        </div>
      </main>
    );
  }

  return (
    <main className="min-w-0 max-w-[70rem] p-[clamp(1.25rem,3vw,2.5rem)] [overflow-wrap:anywhere] max-[31rem]:px-3 max-[31rem]:py-4">
      <header className="mb-5 flex items-end justify-between gap-4">
        <div><p className="mb-1 text-xs font-bold uppercase tracking-[0.08em] text-primary">Preferences</p><h2 className="m-0 font-display text-[clamp(1.45rem,3vw,1.9rem)] font-semibold tracking-[-0.035em]" id="workspace-title" tabIndex={-1}>Settings</h2></div>
      </header>
      <div className="sr-only" aria-live="polite">{message}</div>
      {error && <p className="mb-4 text-xs text-destructive" role="alert">{error}</p>}

      <section className={panelClass} aria-labelledby="settings-clipboard">
        <header className={headerClass}><p className="text-[0.68rem] font-bold uppercase tracking-[0.08em] text-primary">Clipboard</p><h3 id="settings-clipboard">Capture and retention</h3><p>Control what SnipDock stores locally.</p></header>
        <label className={toggleClass} htmlFor="setting-tracking">
          <span><strong>Track clipboard changes</strong><small>Capture new clipboard text while SnipDock runs.</small></span>
          <input className="accent-primary" id="setting-tracking" aria-label="Track clipboard changes" type="checkbox" checked={settings.clipboard_tracking} disabled={busy}
            onChange={(event) => update("clipboard_tracking", event.target.checked)} />
        </label>
        <div className="grid grid-cols-2 gap-3 max-[50rem]:grid-cols-1">
          <label className={labelClass}>History retention (days, 1-365)<input className={fieldClass} type="number" min={1} max={365} defaultValue={settings.history_days} disabled={busy} onBlur={(event) => update("history_days", Number(event.target.value))} /></label>
          <label className={labelClass}>Maximum items (10-10,000)<input className={fieldClass} type="number" min={10} max={10000} defaultValue={settings.max_items} disabled={busy} onBlur={(event) => update("max_items", Number(event.target.value))} /></label>
          <label className={labelClass}>Ignored apps<textarea className={fieldClass} defaultValue={settings.ignored_apps.join("\n")} disabled={busy} onBlur={(event) => update("ignored_apps", event.target.value.split("\n").map((v) => v.trim()).filter(Boolean))} placeholder="One executable per line" /></label>
          <label className={labelClass}>Ignored text patterns<textarea className={fieldClass} defaultValue={settings.ignored_patterns.join("\n")} disabled={busy} onBlur={(event) => update("ignored_patterns", event.target.value.split("\n").map((v) => v.trim()).filter(Boolean))} placeholder="One regular expression per line" /></label>
        </div>
        <fieldset className="flex flex-wrap gap-3 rounded-md border border-border p-3"><legend>Ignored content types</legend>{contentTypes.map((type) => <label className="flex items-center gap-1 text-sm" key={type}><input className="accent-primary" type="checkbox" checked={settings.ignored_content_types.includes(type)} disabled={busy} onChange={(event) => update("ignored_content_types", event.target.checked ? [...settings.ignored_content_types, type] : settings.ignored_content_types.filter((value) => value !== type))} /> {type.replace("_", " ")}</label>)}</fieldset>
      </section>

      <section className={panelClass} aria-labelledby="settings-appearance">
        <header className={headerClass}><p className="text-[0.68rem] font-bold uppercase tracking-[0.08em] text-primary">Appearance</p><h3 id="settings-appearance">Theme and window</h3><p>Follow Windows or choose an explicit theme.</p></header>
        <label className={labelClass}>Theme<select className={`${fieldClass} max-w-80`} value={settings.theme} disabled={busy} onChange={(event) => { document.documentElement.dataset.theme = event.target.value === "system" ? "" : event.target.value; update("theme", event.target.value); }}><option value="system">System</option><option value="light">Light</option><option value="dark">Dark</option></select></label>
        <label className={toggleClass} htmlFor="setting-min-tray"><span><strong>Minimize to tray</strong><small>Keep capture available when the window is minimized.</small></span><input className="accent-primary" id="setting-min-tray" aria-label="Minimize to tray" type="checkbox" checked={settings.minimize_to_tray} disabled={busy} onChange={(event) => update("minimize_to_tray", event.target.checked)} /></label>
        <label className={toggleClass} htmlFor="setting-autostart"><span><strong>Start with Windows</strong><small>Run quietly after signing in so clipboard tracking stays active.</small></span><input className="accent-primary" id="setting-autostart" aria-label="Start with Windows" type="checkbox" checked={autostart ?? false} disabled={autostart === null || autostartBusy} onChange={(event) => void updateAutostart(event.target.checked)} /></label>
        <label className={labelClass}>Formatter indent (spaces, 1-8)<input className={fieldClass} type="number" min={1} max={8} defaultValue={settings.formatter_indent} disabled={busy} onBlur={(event) => update("formatter_indent", Number(event.target.value))} /></label>
      </section>

      <div id="settings-transfer"><TransferPanel /></div>
      <div id="settings-backup"><BackupPanel /></div>
      <div id="settings-updates-panel"><UpdatesPanel /></div>
      <section className={panelClass} aria-labelledby="settings-privacy"><header className={headerClass}><p className="text-[0.68rem] font-bold uppercase tracking-[0.08em] text-primary">Privacy</p><h3 id="settings-privacy">Local by default</h3></header><p className="m-0 text-sm text-muted-foreground">Normal launches contact GitHub Releases only for signed updates. Clipboard content is never sent. Sensitive clipboard text may be rejected before storage.</p></section>
    </main>
  );
}
