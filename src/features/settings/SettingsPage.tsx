import { useEffect, useRef, useState } from "react";
import type { KeyboardEvent } from "react";
import { commands } from "../../api/commands";
import type { ContentType, JsonValue, Settings } from "../../api/types";
import BackupPanel from "./BackupPanel";
import ShortcutEditor from "./ShortcutEditor";
import TransferPanel from "./TransferPanel";
import UpdatesPanel from "./UpdatesPanel";
import { Button } from "@/components/ui/button";
import { ToggleSwitch } from "@/components/ui/toggle-switch";
import { NumberField } from "@/components/ui/number-field";
import { TogglePill } from "@/components/ui/toggle-pill";
import { cn } from "@/lib/utils";
import { getDensity, setDensity, type Density } from "../../lib/density";
import { PAGE_SIZES, useClipboardStore } from "../../stores/clipboardStore";

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

// Values `commands.saveSettings` would restore on a fresh install, per
// src-tauri/src/models/settings.rs's `impl Default for Settings`.
const CLIPBOARD_DEFAULTS: Record<string, JsonValue> = {
  clipboard_tracking: true,
  history_days: 30,
  max_items: 500,
  ignored_apps: [],
  ignored_patterns: [],
  ignored_content_types: [],
  paste_format: "preserve",
  clipboard_page_size: 100,
};
const APPEARANCE_DEFAULTS: Record<string, JsonValue> = {
  theme: "system",
  minimize_to_tray: true,
  formatter_indent: 2,
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

const panelClass = "mb-4 grid content-start gap-4 rounded-lg border border-border bg-card p-5 scroll-mt-4";
const headerClass = "grid gap-1 [&_h3]:m-0 [&_h3]:font-semibold [&>p:last-child]:mt-2 [&>p:last-child]:text-xs [&>p:last-child]:text-muted-foreground";
const labelClass = "grid content-start gap-2 text-xs font-semibold text-muted-foreground";
const fieldClass = "w-full min-h-8 rounded-sm border border-border bg-muted px-3 py-2 font-normal text-foreground focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring";
const toggleClass = "flex min-h-12 items-center justify-between gap-4 [&>span]:grid [&>span]:gap-1 [&_small]:font-normal [&_small]:text-muted-foreground";
const rangeHintClass = "font-normal normal-case tracking-normal text-[var(--color-text-subtle)]";

interface Section {
  id: string;
  label: string;
}

const sections: Section[] = [
  { id: "settings-clipboard", label: "Clipboard" },
  { id: "settings-appearance", label: "Appearance" },
  { id: "settings-shortcuts", label: "Keyboard" },
  { id: "settings-transfer", label: "Import & export" },
  { id: "settings-backup", label: "Backup & restore" },
  { id: "settings-updates-panel", label: "Updates" },
  { id: "settings-privacy", label: "Privacy" },
];

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
  const [density, setDensityState] = useState<Density>(() => getDensity());
  const [activeSection, setActiveSection] = useState(sections[0].id);
  const messageTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const sectionRefs = useRef(new Map<string, HTMLElement>());

  function sectionRef(id: string) {
    return (element: HTMLElement | null) => {
      if (element) sectionRefs.current.set(id, element);
      else sectionRefs.current.delete(id);
    };
  }

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

  // Scroll-tracking section rail: matches the IntersectionObserver pattern
  // already used for infinite-scroll pagination in ClipboardPage.tsx.
  useEffect(() => {
    if (!settings || typeof IntersectionObserver === "undefined") return;
    const visible = new Set<string>();
    const observer = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          const id = (entry.target as HTMLElement).id;
          if (entry.isIntersecting) visible.add(id);
          else visible.delete(id);
        }
        const topmost = sections.find((section) => visible.has(section.id));
        if (topmost) setActiveSection(topmost.id);
      },
      { rootMargin: "-10% 0px -70% 0px" },
    );
    for (const section of sections) {
      const element = sectionRefs.current.get(section.id);
      if (element) observer.observe(element);
    }
    return () => observer.disconnect();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [Boolean(settings)]);

  function scrollToSection(id: string) {
    sectionRefs.current.get(id)?.scrollIntoView({ behavior: "smooth", block: "start" });
  }

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

  function changeDensity(value: Density) {
    setDensity(value);
    setDensityState(value);
    setMessage("Density saved.");
  }

  async function resetClipboardSection() {
    await patch(CLIPBOARD_DEFAULTS, "Clipboard section reset to defaults.");
  }

  async function resetAppearanceSection() {
    document.documentElement.dataset.theme = "";
    await patch(APPEARANCE_DEFAULTS, "Appearance section reset to defaults.");
    if (autostart !== true) void updateAutostart(true);
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
    <main className="settings-form min-w-0 p-[clamp(1.25rem,3vw,2.5rem)] [overflow-wrap:anywhere] max-[31rem]:px-3 max-[31rem]:py-4">
      <header className="mb-5 flex items-end justify-between gap-4">
        <div><p className="mb-1 text-xs font-bold uppercase tracking-[0.08em] text-primary">Preferences</p><h2 className="m-0 font-display text-[clamp(1.45rem,3vw,1.9rem)] font-semibold tracking-[-0.035em]" id="workspace-title" tabIndex={-1}>Settings</h2></div>
        <p className="min-h-4 text-xs font-semibold text-[var(--color-positive)]" aria-live="polite">
          {busy ? <span className="text-muted-foreground">Saving…</span> : message}
        </p>
      </header>
      {error && <p className="mb-4 text-xs text-destructive" role="alert">{error}</p>}

      <div className="grid min-w-0 items-start gap-4 min-[64rem]:grid-cols-[minmax(0,820px)_19.5rem]">
        <div className="min-w-0">
          <section className={panelClass} aria-labelledby="settings-clipboard-heading" ref={sectionRef("settings-clipboard")} id="settings-clipboard">
            <div className="flex items-start justify-between gap-3">
              <header className={headerClass}><p className="text-[0.68rem] font-bold uppercase tracking-[0.08em] text-primary">Clipboard</p><h3 id="settings-clipboard-heading">Capture and retention</h3><p>Control what SnipDock stores locally.</p></header>
              <Button type="button" variant="ghost" size="sm" disabled={busy} onClick={() => void resetClipboardSection()}>Reset section</Button>
            </div>
            <label className={toggleClass} htmlFor="setting-tracking">
              <span><strong>Track clipboard changes</strong><small>Capture new clipboard text while SnipDock runs.</small></span>
              <ToggleSwitch id="setting-tracking" aria-label="Track clipboard changes" checked={settings.clipboard_tracking} disabled={busy}
                onCheckedChange={(checked) => update("clipboard_tracking", checked)} />
            </label>
            <div className="grid grid-cols-2 gap-3 max-[50rem]:grid-cols-1">
              <div className={labelClass}>
                <label htmlFor="setting-history-days">History retention</label>
                <NumberField id="setting-history-days" ariaLabel="History retention" min={1} max={365} value={draft.history_days} disabled={busy}
                  invalid={Boolean(fieldErrors.history_days)}
                  onChange={(value) => editDraft("history_days", value)}
                  onBlur={(value) => commit("history_days", value)}
                  onKeyDown={commitOnEnter("history_days")}
                  onStep={(next) => commit("history_days", String(next))} />
                <span className={rangeHintClass}>{fieldErrors.history_days || "1-365 days"}</span>
              </div>
              <div className={labelClass}>
                <label htmlFor="setting-max-items">Maximum items</label>
                <NumberField id="setting-max-items" ariaLabel="Maximum items" min={10} max={10000} value={draft.max_items} disabled={busy}
                  invalid={Boolean(fieldErrors.max_items)}
                  onChange={(value) => editDraft("max_items", value)}
                  onBlur={(value) => commit("max_items", value)}
                  onKeyDown={commitOnEnter("max_items")}
                  onStep={(next) => commit("max_items", String(next))} />
                <span className={rangeHintClass}>{fieldErrors.max_items || "10-10,000 items"}</span>
              </div>
              <label className={labelClass}>Ignored apps<textarea className={fieldClass} value={draft.ignored_apps} placeholder="One executable per line"
                onChange={(event) => editDraft("ignored_apps", event.target.value)}
                onBlur={(event) => commit("ignored_apps", event.target.value)} /></label>
              <label className={labelClass}>Ignored text patterns<textarea className={fieldClass} value={draft.ignored_patterns} placeholder="One regular expression per line"
                onChange={(event) => editDraft("ignored_patterns", event.target.value)}
                onBlur={(event) => commit("ignored_patterns", event.target.value)} /></label>
            </div>
            <fieldset className="grid gap-2">
              <legend className="mb-1 text-xs font-semibold text-muted-foreground">Ignored content types</legend>
              <div className="flex flex-wrap gap-2">
                {contentTypes.map((type) => (
                  <TogglePill
                    key={type}
                    pressed={settings.ignored_content_types.includes(type)}
                    disabled={busy}
                    onClick={() => update(
                      "ignored_content_types",
                      settings.ignored_content_types.includes(type)
                        ? settings.ignored_content_types.filter((value) => value !== type)
                        : [...settings.ignored_content_types, type],
                    )}
                  >
                    {type.replace("_", " ")}
                  </TogglePill>
                ))}
              </div>
            </fieldset>
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
            <div className={toggleClass}>
              <span><strong>Rows per page</strong><small>How many captures the Clipboard screen shows at once.</small></span>
              <div className="flex flex-wrap items-center gap-1" role="group" aria-label="Rows per page">
                {PAGE_SIZES.map((size) => (
                  <Button
                    key={size}
                    type="button"
                    variant="outline"
                    size="sm"
                    className={cn(
                      "h-7 px-2.5 font-mono text-xs tabular-nums",
                      settings.clipboard_page_size === size && "border-primary bg-accent text-primary",
                    )}
                    aria-label={`${size} rows per page`}
                    aria-pressed={settings.clipboard_page_size === size}
                    disabled={busy}
                    onClick={() => {
                      // The store owns this value: it drives the pager and
                      // persists the change itself, so saving it again here
                      // would only be a second write of the same thing.
                      useClipboardStore.getState().setPageSize(size);
                      setSettings({ ...settings, clipboard_page_size: size });
                    }}
                  >
                    {size}
                  </Button>
                ))}
              </div>
            </div>
            <div className={toggleClass}>
              <span><strong>List density</strong><small>Row spacing on the Clipboard screen.</small></span>
              <div className="flex items-center gap-1" role="group" aria-label="List density">
                {(["comfortable", "compact"] as const).map((value) => (
                  <Button
                    key={value}
                    type="button"
                    variant="outline"
                    size="sm"
                    className={cn("h-7 px-2.5 text-xs capitalize", density === value && "border-primary bg-accent text-primary")}
                    aria-pressed={density === value}
                    onClick={() => changeDensity(value)}
                  >
                    {value}
                  </Button>
                ))}
              </div>
            </div>
          </section>

          <section className={panelClass} aria-labelledby="settings-appearance-heading" ref={sectionRef("settings-appearance")} id="settings-appearance">
            <div className="flex items-start justify-between gap-3">
              <header className={headerClass}><p className="text-[0.68rem] font-bold uppercase tracking-[0.08em] text-primary">Appearance</p><h3 id="settings-appearance-heading">Theme and window</h3><p>Follow Windows or choose an explicit theme.</p></header>
              <Button type="button" variant="ghost" size="sm" disabled={busy} onClick={() => void resetAppearanceSection()}>Reset section</Button>
            </div>
            <label className={labelClass}>Theme<select className={`${fieldClass} max-w-80`} value={settings.theme} disabled={busy} onChange={(event) => { document.documentElement.dataset.theme = event.target.value === "system" ? "" : event.target.value; update("theme", event.target.value); }}><option value="system">System</option><option value="light">Light</option><option value="dark">Dark</option></select></label>
            <label className={toggleClass} htmlFor="setting-min-tray">
              <span><strong>Minimize to tray</strong><small>Keep capture available when the window is minimized.</small></span>
              <ToggleSwitch id="setting-min-tray" aria-label="Minimize to tray" checked={settings.minimize_to_tray} disabled={busy} onCheckedChange={(checked) => update("minimize_to_tray", checked)} />
            </label>
            <label className={toggleClass} htmlFor="setting-autostart">
              <span><strong>Start with Windows</strong><small>Run quietly after signing in so clipboard tracking stays active.</small></span>
              <ToggleSwitch id="setting-autostart" aria-label="Start with Windows" checked={autostart ?? false} disabled={autostart === null || autostartBusy} onCheckedChange={(checked) => void updateAutostart(checked)} />
            </label>
            <div className={labelClass}>
              <label htmlFor="setting-formatter-indent">Formatter indent</label>
              <NumberField id="setting-formatter-indent" ariaLabel="Formatter indent" min={1} max={8} value={draft.formatter_indent} disabled={busy}
                invalid={Boolean(fieldErrors.formatter_indent)}
                onChange={(value) => editDraft("formatter_indent", value)}
                onBlur={(value) => commit("formatter_indent", value)}
                onKeyDown={commitOnEnter("formatter_indent")}
                onStep={(next) => commit("formatter_indent", String(next))} />
              <span className={rangeHintClass}>{fieldErrors.formatter_indent || "1-8 spaces"}</span>
            </div>
          </section>

          <section className={panelClass} aria-labelledby="settings-shortcuts-heading" ref={sectionRef("settings-shortcuts")} id="settings-shortcuts">
            <header className={headerClass}>
              <p className="text-[0.68rem] font-bold uppercase tracking-[0.08em] text-primary">Keyboard</p>
              <h3 id="settings-shortcuts-heading">Shortcuts</h3>
              <p>Customize keyboard shortcuts for quick actions.</p>
            </header>
            <ShortcutEditor
              settings={settings}
              onSave={async (customShortcuts) => {
                await patch({ custom_shortcuts: customShortcuts }, "Shortcuts saved.");
              }}
            />
          </section>

          <div id="settings-transfer" ref={sectionRef("settings-transfer")}><TransferPanel /></div>
          <div id="settings-backup" ref={sectionRef("settings-backup")}><BackupPanel className={panelClass} /></div>
          <div id="settings-updates-panel" ref={sectionRef("settings-updates-panel")}><UpdatesPanel className={panelClass} /></div>
          <section className={panelClass} aria-labelledby="settings-privacy-heading" ref={sectionRef("settings-privacy")} id="settings-privacy"><header className={headerClass}><p className="text-[0.68rem] font-bold uppercase tracking-[0.08em] text-primary">Privacy</p><h3 id="settings-privacy-heading">Local by default</h3></header><p className="m-0 text-sm text-muted-foreground">Normal launches contact GitHub Releases only for signed updates. Clipboard content is never sent. Sensitive clipboard text may be rejected before storage.</p></section>
        </div>

        <nav aria-label="Settings sections" className="sticky top-[clamp(1.25rem,3vw,2.5rem)] hidden min-[64rem]:block">
          <p className="mb-2 px-1 text-[0.62rem] font-bold uppercase tracking-[0.05em] text-[var(--color-text-subtle)]">On this page</p>
          <ul className="grid gap-0.5 border-l border-border">
            {sections.map((section) => (
              <li key={section.id}>
                <button
                  type="button"
                  aria-current={activeSection === section.id ? "true" : undefined}
                  className={cn(
                    "block w-full -ml-px border-l-2 px-3 py-1.5 text-left text-xs font-semibold no-underline",
                    activeSection === section.id
                      ? "border-[var(--color-border-accent)] text-primary"
                      : "border-transparent text-muted-foreground hover:text-foreground",
                  )}
                  onClick={() => scrollToSection(section.id)}
                >
                  {section.label}
                </button>
              </li>
            ))}
          </ul>
        </nav>
      </div>
    </main>
  );
}
