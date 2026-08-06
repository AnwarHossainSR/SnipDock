import { useEffect, useRef, useState } from "react";
import type { KeyboardEvent } from "react";
import { commands } from "../../api/commands";
import type { ContentType, JsonValue, Settings } from "../../api/types";
import BackupPanel from "./BackupPanel";
import ShortcutEditor from "./ShortcutEditor";
import TransferPanel from "./TransferPanel";
import UpdatesPanel from "./UpdatesPanel";

// Listed so images can be excluded from capture like any other content type.
const contentTypes: ContentType[] = [
  "plain_text", "code", "json", "sql", "html", "css", "xml", "shell", "markdown", "config", "image",
];

// Fields the user types into. They are held as draft strings so a half-typed
// value never reaches the backend; everything commits on blur or Enter.
const draftKeys = ["history_days", "max_items", "formatter_indent", "ignored_apps", "ignored_patterns"] as const;
type DraftKey = (typeof draftKeys)[number];
type Draft = Record<DraftKey, string>;

const numericRanges: Record<string, { min: number; max: number }> = {
  history_days: { min: 1, max: 365 },
  max_items: { min: 10, max: 10_000 },
  formatter_indent: { min: 1, max: 8 },
};

function draftFrom(settings: Settings): Draft {
  return {
    history_days: String(settings.history_days),
    max_items: String(settings.max_items),
    formatter_indent: String(settings.formatter_indent),
    ignored_apps: settings.ignored_apps.join("\n"),
    ignored_patterns: settings.ignored_patterns.join("\n"),
  };
}

function toLines(value: string): string[] {
  return value.split("\n").map((line) => line.trim()).filter(Boolean);
}

const SAVED_MESSAGE_MS = 3_000;

const panelClass = "mb-4 grid content-start gap-4 rounded-lg border border-border bg-card p-5";
const headerClass = "grid gap-1 [&_h3]:m-0 [&_h3]:font-semibold [&>p:last-child]:mt-2 [&>p:last-child]:text-xs [&>p:last-child]:text-muted-foreground";
const labelClass = "grid content-start gap-2 text-xs font-semibold text-muted-foreground";
const fieldClass = "w-full min-h-8 rounded-sm border border-border bg-muted px-3 py-2 font-normal text-foreground focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring";
const toggleClass = "flex min-h-12 items-center justify-between gap-4 [&>span]:grid [&>span]:gap-1 [&_small]:font-normal [&_small]:text-muted-foreground";

export default function SettingsPage() {
  const [settings, setSettings] = useState<Settings | null>(null);
  const [draft, setDraft] = useState<Draft | null>(null);
  const [fieldErrors, setFieldErrors] = useState<Partial<Record<DraftKey, string>>>({});
  const [failed, setFailed] = useState(false);
  const [busy, setBusy] = useState(false);
  const [autostart, setAutostart] = useState<boolean | null>(null);
  const [autostartBusy, setAutostartBusy] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const messageTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    let active = true;
    commands.getSettings().then(
      (loaded) => {
        if (!active) return;
        setSettings(loaded);
        setDraft(draftFrom(loaded));
        document.documentElement.dataset.theme = loaded.theme === "system" ? "" : loaded.theme;
      },
      () => active && setFailed(true),
    );
    commands.getAutostart().then(setAutostart, () => setAutostart(false));
    return () => { active = false; };
  }, []);

  // A success message clears itself; a newer save cancels the pending timer so a
  // stale message can never outlive the save that replaced it.
  useEffect(() => () => {
    if (messageTimer.current) clearTimeout(messageTimer.current);
  }, []);

  function announce(note: string) {
    if (messageTimer.current) clearTimeout(messageTimer.current);
    setMessage(note);
    messageTimer.current = setTimeout(() => {
      messageTimer.current = null;
      setMessage("");
    }, SAVED_MESSAGE_MS);
  }

  async function patch(values: Record<string, JsonValue>, note = "Setting saved.") {
    setBusy(true);
    setError("");
    if (messageTimer.current) {
      clearTimeout(messageTimer.current);
      messageTimer.current = null;
    }
    setMessage("");
    try {
      const saved = await commands.saveSettings({ values });
      setSettings(saved);
      // Re-seed only the fields this request carried. Typed fields stay editable
      // while a save is in flight, so replacing the whole draft would discard
      // text the user entered in another field after the request started.
      setDraft((current) => {
        const seeded = draftFrom(saved);
        if (!current) return seeded;
        const next = { ...current };
        for (const key of draftKeys) {
          if (key in values) next[key] = seeded[key];
        }
        return next;
      });
      announce(note);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Could not save settings.");
    } finally {
      setBusy(false);
    }
  }

  function update(key: keyof Settings, value: JsonValue) {
    void patch({ [key]: value });
  }

  function setFieldError(key: DraftKey, note: string) {
    setFieldErrors((current) => {
      if (!note && !current[key]) return current;
      const next = { ...current };
      if (note) next[key] = note;
      else delete next[key];
      return next;
    });
  }

  /**
   * The single write path for edited fields. Every control funnels through here
   * so no control can reach `patch` without validation.
   */
  function commit(key: DraftKey, rawValue: string) {
    if (!settings) return;
    setError("");
    const range = numericRanges[key];

    if (range) {
      const raw = rawValue.trim();
      const value = Number(raw);
      const valid = raw !== "" && Number.isInteger(value) && value >= range.min && value <= range.max;
      if (!valid) {
        setFieldError(key, `Enter a whole number between ${range.min} and ${range.max.toLocaleString()}.`);
        setDraft((current) => (current ? { ...current, [key]: String(settings[key]) } : current));
        return;
      }
      setFieldError(key, "");
      if (value === settings[key]) return;
      void patch({ [key]: value });
      return;
    }

    const lines = toLines(rawValue);
    setFieldError(key, "");
    const saved = settings[key] as string[];
    if (lines.length === saved.length && lines.every((line, index) => line === saved[index])) {
      setDraft((current) => (current ? { ...current, [key]: saved.join("\n") } : current));
      return;
    }
    void patch({ [key]: lines });
  }

  function editDraft(key: DraftKey, value: string) {
    setDraft((current) => (current ? { ...current, [key]: value } : current));
  }

  function commitOnEnter(key: DraftKey) {
    return (event: KeyboardEvent<HTMLInputElement>) => {
      if (event.key !== "Enter") return;
      event.preventDefault();
      commit(key, event.currentTarget.value);
    };
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

  if (!settings || !draft) {
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
    <main className="settings-form min-w-0 max-w-[70rem] p-[clamp(1.25rem,3vw,2.5rem)] [overflow-wrap:anywhere] max-[31rem]:px-3 max-[31rem]:py-4">
      <header className="mb-5 flex items-end justify-between gap-4">
        <div><p className="mb-1 text-xs font-bold uppercase tracking-[0.08em] text-primary">Preferences</p><h2 className="m-0 font-display text-[clamp(1.45rem,3vw,1.9rem)] font-semibold tracking-[-0.035em]" id="workspace-title" tabIndex={-1}>Settings</h2></div>
        <p className="min-h-4 text-xs font-semibold text-[var(--color-positive)]" aria-live="polite">
          {busy ? <span className="text-muted-foreground">Saving…</span> : message}
        </p>
      </header>
      {error && <p className="mb-4 text-xs text-destructive" role="alert">{error}</p>}

      <section className={panelClass} aria-labelledby="settings-clipboard">
        <header className={headerClass}><p className="text-[0.68rem] font-bold uppercase tracking-[0.08em] text-primary">Clipboard</p><h3 id="settings-clipboard">Capture and retention</h3><p>Control what SnipDock stores locally.</p></header>
        <label className={toggleClass} htmlFor="setting-tracking">
          <span><strong>Track clipboard changes</strong><small>Capture new clipboard text while SnipDock runs.</small></span>
          <input className="accent-primary" id="setting-tracking" aria-label="Track clipboard changes" type="checkbox" checked={settings.clipboard_tracking} disabled={busy}
            onChange={(event) => update("clipboard_tracking", event.target.checked)} />
        </label>
        <div className="grid grid-cols-2 gap-3 max-[50rem]:grid-cols-1">
          <label className={labelClass}>History retention (days, 1-365)
            <input className={fieldClass} type="number" min={1} max={365} value={draft.history_days} aria-invalid={Boolean(fieldErrors.history_days)}
              onChange={(event) => editDraft("history_days", event.target.value)}
              onBlur={(event) => commit("history_days", event.target.value)}
              onKeyDown={commitOnEnter("history_days")} />
            {fieldErrors.history_days && <span className="font-normal text-destructive" role="alert">{fieldErrors.history_days}</span>}
          </label>
          <label className={labelClass}>Maximum items (10-10,000)
            <input className={fieldClass} type="number" min={10} max={10000} value={draft.max_items} aria-invalid={Boolean(fieldErrors.max_items)}
              onChange={(event) => editDraft("max_items", event.target.value)}
              onBlur={(event) => commit("max_items", event.target.value)}
              onKeyDown={commitOnEnter("max_items")} />
            {fieldErrors.max_items && <span className="font-normal text-destructive" role="alert">{fieldErrors.max_items}</span>}
          </label>
          <label className={labelClass}>Ignored apps<textarea className={fieldClass} value={draft.ignored_apps} placeholder="One executable per line"
            onChange={(event) => editDraft("ignored_apps", event.target.value)}
            onBlur={(event) => commit("ignored_apps", event.target.value)} /></label>
          <label className={labelClass}>Ignored text patterns<textarea className={fieldClass} value={draft.ignored_patterns} placeholder="One regular expression per line"
            onChange={(event) => editDraft("ignored_patterns", event.target.value)}
            onBlur={(event) => commit("ignored_patterns", event.target.value)} /></label>
        </div>
        <fieldset className="flex flex-wrap gap-3 rounded-md border border-border p-3"><legend>Ignored content types</legend>{contentTypes.map((type) => <label className="flex cursor-pointer items-center gap-2 text-xs font-semibold capitalize text-muted-foreground" key={type}><input className="accent-primary" type="checkbox" checked={settings.ignored_content_types.includes(type)} disabled={busy} onChange={(event) => update("ignored_content_types", event.target.checked ? [...settings.ignored_content_types, type] : settings.ignored_content_types.filter((value) => value !== type))} /> {type.replace("_", " ")}</label>)}</fieldset>
        <label className={labelClass}>
          <span>Paste format</span>
          <select className={`${fieldClass} max-w-80`} value={settings.paste_format} disabled={busy} onChange={(event) => update("paste_format", event.target.value)}>
            <option value="preserve">Preserve original</option>
            <option value="plain_text">Plain text (strip formatting)</option>
            <option value="strip_whitespace">Strip extra whitespace</option>
          </select>
        </label>
        <p className="text-xs text-muted-foreground">
          Controls how content is formatted when copied to clipboard.
        </p>
      </section>

      <section className={panelClass} aria-labelledby="settings-appearance">
        <header className={headerClass}><p className="text-[0.68rem] font-bold uppercase tracking-[0.08em] text-primary">Appearance</p><h3 id="settings-appearance">Theme and window</h3><p>Follow Windows or choose an explicit theme.</p></header>
        <label className={labelClass}>Theme<select className={`${fieldClass} max-w-80`} value={settings.theme} disabled={busy} onChange={(event) => { document.documentElement.dataset.theme = event.target.value === "system" ? "" : event.target.value; update("theme", event.target.value); }}><option value="system">System</option><option value="light">Light</option><option value="dark">Dark</option></select></label>
        <label className={toggleClass} htmlFor="setting-min-tray"><span><strong>Minimize to tray</strong><small>Keep capture available when the window is minimized.</small></span><input className="accent-primary" id="setting-min-tray" aria-label="Minimize to tray" type="checkbox" checked={settings.minimize_to_tray} disabled={busy} onChange={(event) => update("minimize_to_tray", event.target.checked)} /></label>
        <label className={toggleClass} htmlFor="setting-autostart"><span><strong>Start with Windows</strong><small>Run quietly after signing in so clipboard tracking stays active.</small></span><input className="accent-primary" id="setting-autostart" aria-label="Start with Windows" type="checkbox" checked={autostart ?? false} disabled={autostart === null || autostartBusy} onChange={(event) => void updateAutostart(event.target.checked)} /></label>
        <label className={labelClass}>Formatter indent (spaces, 1-8)
          <input className={fieldClass} type="number" min={1} max={8} value={draft.formatter_indent} aria-invalid={Boolean(fieldErrors.formatter_indent)}
            onChange={(event) => editDraft("formatter_indent", event.target.value)}
            onBlur={(event) => commit("formatter_indent", event.target.value)}
            onKeyDown={commitOnEnter("formatter_indent")} />
          {fieldErrors.formatter_indent && <span className="font-normal text-destructive" role="alert">{fieldErrors.formatter_indent}</span>}
        </label>
      </section>

      <section className={panelClass} aria-labelledby="settings-shortcuts">
        <header className={headerClass}>
          <p className="text-[0.68rem] font-bold uppercase tracking-[0.08em] text-primary">Keyboard</p>
          <h3 id="settings-shortcuts">Shortcuts</h3>
          <p>Customize keyboard shortcuts for quick actions.</p>
        </header>
        <ShortcutEditor
          settings={settings}
          onSave={async (customShortcuts) => {
            await patch({ custom_shortcuts: customShortcuts }, "Shortcuts saved.");
          }}
        />
      </section>

      <div id="settings-transfer"><TransferPanel /></div>
      <div id="settings-backup"><BackupPanel /></div>
      <div id="settings-updates-panel"><UpdatesPanel /></div>
      <section className={panelClass} aria-labelledby="settings-privacy"><header className={headerClass}><p className="text-[0.68rem] font-bold uppercase tracking-[0.08em] text-primary">Privacy</p><h3 id="settings-privacy">Local by default</h3></header><p className="m-0 text-sm text-muted-foreground">Normal launches contact GitHub Releases only for signed updates. Clipboard content is never sent. Sensitive clipboard text may be rejected before storage.</p></section>
    </main>
  );
}
