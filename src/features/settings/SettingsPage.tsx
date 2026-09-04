import { useEffect, useRef, useState } from "react";
import type { KeyboardEvent } from "react";
import { commands } from "../../api/commands";
import type { JsonValue, Settings } from "../../api/types";
import AnalyticsPanel from "./AnalyticsPanel";
import BackupPanel from "./BackupPanel";
import DuplicatesPanel from "./DuplicatesPanel";
import { useCapability } from "../../stores/platformStore";
import IgnoredAppsPanel from "./IgnoredAppsPanel";
import KeyboardShortcutsPanel from "./KeyboardShortcutsPanel";
import SensitiveSweep from "./SensitiveSweep";
import TransferPanel from "./TransferPanel";
import UpdatesPanel from "./UpdatesPanel";
import { Button } from "@/components/ui/button";
import { ToggleSwitch } from "@/components/ui/toggle-switch";
import { NumberField } from "@/components/ui/number-field";
import { TogglePill } from "@/components/ui/toggle-pill";
import { RadioCard, SegmentedRadio } from "@/components/ui/radio-group";
import {
  SettingRow,
  SettingSection,
  SettingStatusPill,
} from "@/components/ui/setting-section";
import { cn } from "@/lib/utils";
// Listed so images can be excluded from capture like any other content type.
import { contentTypes } from "../../lib/contentTypeColors";
import { getDensity, setDensity, type Density } from "../../lib/density";
import { PAGE_SIZES, useClipboardStore, type PageSize } from "../../stores/clipboardStore";
import { useThemeStore } from "../../stores/themeStore";
import { ACCENTS, DEFAULT_ACCENT, DEFAULT_MODE, type Accent, type Mode } from "../../lib/theme";

// Fields the user types into. They are held as draft strings so a half-typed
// value never reaches the backend; everything commits on blur or Enter.
const draftKeys = ["history_days", "max_items", "formatter_indent", "ignored_patterns"] as const;
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
  theme: DEFAULT_MODE,
  accent: DEFAULT_ACCENT,
  minimize_to_tray: true,
  formatter_indent: 2,
};

function draftFrom(settings: Settings): Draft {
  return {
    history_days: String(settings.history_days),
    max_items: String(settings.max_items),
    formatter_indent: String(settings.formatter_indent),
    ignored_patterns: settings.ignored_patterns.join("\n"),
  };
}

function toLines(value: string): string[] {
  return value.split("\n").map((line) => line.trim()).filter(Boolean);
}

const SAVED_MESSAGE_MS = 3_000;

const panelClass = "mb-4 grid content-start gap-4 rounded-lg border border-border bg-card p-5 shadow-[var(--shadow-panel)] scroll-mt-4";
// A `SettingSection` already draws the card: its own border, ground, and
// padding. Panels built from one take the placement only, or the page would
// wrap a card in a second card.
const sectionPanelClass = "mb-4 shadow-[var(--shadow-panel)] scroll-mt-4";
// A borderless reset sat in the panel header reading as a second heading.
// An outline at the quietest weight says "control" without competing with
// the section title beside it.
const resetButtonClass =
  "h-7 shrink-0 self-start rounded-sm border border-border px-2.5 text-[0.7rem] font-semibold text-muted-foreground hover:border-[var(--border-strong)] hover:bg-muted hover:text-foreground";
const sectionIconClass = "size-4 fill-none stroke-current [stroke-linecap:round] [stroke-linejoin:round] [stroke-width:1.9]";
const fieldClass = "w-full min-h-8 rounded-sm border border-border bg-muted px-3 py-2 font-normal text-foreground focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring";

const themeOptions = [
  { value: "system", label: "System", hint: "Follow the Windows setting" },
  { value: "light", label: "Light", hint: "Always the light palette" },
  { value: "dark", label: "Dark", hint: "Always the dark palette" },
] as const;

interface Section {
  id: string;
  label: string;
}

const sections: Section[] = [
  { id: "settings-clipboard", label: "Clipboard" },
  { id: "settings-appearance", label: "Appearance" },
  { id: "settings-shortcuts", label: "Keyboard" },
  { id: "settings-duplicates", label: "Duplicates" },
  { id: "settings-usage", label: "Usage" },
  { id: "settings-transfer", label: "Import & export" },
  { id: "settings-backup", label: "Backup & restore" },
  { id: "settings-updates-panel", label: "Updates" },
  { id: "settings-privacy", label: "Privacy" },
];

/**
 * A miniature of the app chrome - sidebar block, top bar, content area -
 * painted in a mode's own surfaces. `data-mode` on the tile makes it read the
 * neutrals for the mode it represents rather than the one currently applied,
 * the same way an accent swatch carries `data-accent`. "System" shows both
 * halves, split down the middle.
 */
function ThemeHalf({ mode }: { mode: "light" | "dark" }) {
  return (
    <span data-mode={mode} className="flex h-full flex-1 flex-col bg-card">
      <span className="h-2 w-full border-b border-border bg-background" />
      <span className="flex h-full">
        <span className="h-full w-4 border-r border-border bg-background" />
        <span className="m-1 h-3 flex-1 rounded-[2px] bg-muted" />
      </span>
    </span>
  );
}

function ThemePreview({ theme }: { theme: "system" | "light" | "dark" }) {
  return (
    <span
      aria-hidden="true"
      className="flex h-[78px] w-full overflow-hidden rounded-sm border border-border"
    >
      {theme === "dark" ? (
        <ThemeHalf mode="dark" />
      ) : theme === "light" ? (
        <ThemeHalf mode="light" />
      ) : (
        <>
          <ThemeHalf mode="light" />
          <ThemeHalf mode="dark" />
        </>
      )}
    </span>
  );
}

export default function SettingsPage() {
  const sourceAppDetection = useCapability("source_app_detection");
  const [settings, setSettings] = useState<Settings | null>(null);
  // Read from the store, not from `settings`: the store is what is painted,
  // and it is already correct before the settings round trip returns.
  const accent = useThemeStore((state) => state.accent);
  const mode = useThemeStore((state) => state.mode);
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

  async function patch(values: Record<string, JsonValue>, note = "Setting saved."): Promise<boolean> {
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
      return true;
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Could not save settings.");
      return false;
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

  /* Both appearance controls go through the theme store: it paints the
     attribute, mirrors it for the next launch, and persists it. Writing any of
     those three here as well is how the copy on screen and the copy on disk
     drift apart. */
  function changeMode(value: Mode) {
    setSettings((current) => (current ? { ...current, theme: value } : current));
    useThemeStore.getState().setMode(value);
    setMessage("Theme saved.");
  }

  function changeAccent(value: Accent) {
    setSettings((current) => (current ? { ...current, accent: value } : current));
    useThemeStore.getState().setAccent(value);
    setMessage("Accent saved.");
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
    useThemeStore.getState().setMode(DEFAULT_MODE);
    useThemeStore.getState().setAccent(DEFAULT_ACCENT);
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
        <div>
          <p className="mb-1 text-xs font-bold uppercase tracking-[0.08em] text-primary">Preferences</p>
          <h2 className="m-0 font-display text-[clamp(1.45rem,3vw,1.9rem)] font-semibold tracking-[-0.035em]" id="workspace-title" tabIndex={-1}>Settings</h2>
        </div>
        <p className="min-h-4 text-xs font-semibold text-[var(--success)]" aria-live="polite">
          {busy ? <span className="text-muted-foreground">Saving…</span> : message}
        </p>
      </header>
      {error && <p className="mb-4 text-xs text-destructive" role="alert">{error}</p>}

      <div className="grid min-w-0 items-start gap-4 min-[64rem]:grid-cols-[minmax(0,820px)_19.5rem]">
        <div className="min-w-0">
          <div id="settings-clipboard" ref={sectionRef("settings-clipboard")} className="grid gap-4 scroll-mt-4">
            <SettingSection
              className={sectionPanelClass}
              title="Capture"
              titleId="settings-clipboard-heading"
              description="What SnipDock picks up while it runs."
              icon={
                <svg aria-hidden="true" viewBox="0 0 24 24" className={sectionIconClass}>
                  <path d="M9.25 3.5h5.5v2.75h-5.5z" />
                  <path d="M9.25 4.9H7.5v14.6h9V4.9h-1.75" />
                </svg>
              }
              action={
                <div className="flex items-center gap-2">
                  <SettingStatusPill tone={settings.clipboard_tracking ? "var(--success)" : "var(--text-muted)"}>
                    {settings.clipboard_tracking ? "Active" : "Paused"}
                  </SettingStatusPill>
                  <Button type="button" variant="ghost" size="sm" className={resetButtonClass} disabled={busy} onClick={() => void resetClipboardSection()}>Reset section</Button>
                </div>
              }
            >
              <SettingRow
                title={<label htmlFor="setting-tracking">Track clipboard changes</label>}
                description="Capture new clipboard text while SnipDock runs."
                control={
                  <ToggleSwitch id="setting-tracking" aria-label="Track clipboard changes" checked={settings.clipboard_tracking} disabled={busy}
                    onCheckedChange={(checked) => update("clipboard_tracking", checked)} />
                }
              />
              <SettingRow
                title={<label htmlFor="setting-paste-format">Paste format</label>}
                description="How content is shaped when it goes back to the clipboard."
                control={
                  <select id="setting-paste-format" className={cn(fieldClass, "w-56 max-w-full")} value={settings.paste_format} disabled={busy} onChange={(event) => update("paste_format", event.target.value)}>
                    <option value="preserve">Preserve original</option>
                    <option value="plain_text">Plain text (strip formatting)</option>
                    <option value="strip_whitespace">Strip extra whitespace</option>
                  </select>
                }
              />
              <SettingRow
                title="Rows per page"
                description="How many captures the Clipboard screen shows at once."
                control={
                  <SegmentedRadio
                    name="clipboard-page-size"
                    ariaLabel="Rows per page"
                    mono
                    value={String(settings.clipboard_page_size)}
                    disabled={busy}
                    options={PAGE_SIZES.map((size) => ({ value: String(size), label: String(size) }))}
                    onChange={(value) => {
                      // The store owns this value: it drives the pager and
                      // persists the change itself, so saving it again here
                      // would only be a second write of the same thing.
                      const size = Number(value) as PageSize;
                      useClipboardStore.getState().setPageSize(size);
                      setSettings({ ...settings, clipboard_page_size: size });
                    }}
                  />
                }
              />
              <SettingRow
                title="List density"
                description="Row spacing on the Clipboard screen."
                control={
                  <SegmentedRadio
                    name="list-density"
                    ariaLabel="List density"
                    value={density}
                    options={[
                      { value: "comfortable", label: "Comfortable" },
                      { value: "compact", label: "Compact" },
                    ]}
                    onChange={(value) => changeDensity(value as Density)}
                  />
                }
              />
            </SettingSection>

            <SettingSection
              className={sectionPanelClass}
              title="Retention"
              titleId="settings-retention-heading"
              description="How long a capture is kept, and how many are kept at once."
              tone="var(--warning)"
              icon={
                <svg aria-hidden="true" viewBox="0 0 24 24" className={sectionIconClass}>
                  <circle cx="12" cy="12" r="7.5" />
                  <path d="M12 8v4.5l3 1.5" />
                </svg>
              }
            >
              <SettingRow
                title={<label htmlFor="setting-history-days">History retention</label>}
                description={fieldErrors.history_days || "Captures older than this are pruned. 1-365 days."}
                control={
                  <NumberField id="setting-history-days" ariaLabel="History retention" min={1} max={365} value={draft.history_days} disabled={busy}
                    invalid={Boolean(fieldErrors.history_days)}
                    onChange={(value) => editDraft("history_days", value)}
                    onBlur={(value) => commit("history_days", value)}
                    onKeyDown={commitOnEnter("history_days")}
                    onStep={(next) => commit("history_days", String(next))} />
                }
              />
              <SettingRow
                title={<label htmlFor="setting-max-items">Maximum items</label>}
                description={fieldErrors.max_items || "The oldest capture drops off past this count. 10-10,000 items."}
                control={
                  <NumberField id="setting-max-items" ariaLabel="Maximum items" min={10} max={10000} value={draft.max_items} disabled={busy}
                    invalid={Boolean(fieldErrors.max_items)}
                    onChange={(value) => editDraft("max_items", value)}
                    onBlur={(value) => commit("max_items", value)}
                    onKeyDown={commitOnEnter("max_items")}
                    onStep={(next) => commit("max_items", String(next))} />
                }
              />
            </SettingSection>

            <SettingSection
              className={sectionPanelClass}
              title="Exclusions"
              titleId="settings-exclusions-heading"
              description="Content SnipDock drops before it is ever stored."
              tone="var(--type-secret)"
              icon={
                <svg aria-hidden="true" viewBox="0 0 24 24" className={sectionIconClass}>
                  <circle cx="12" cy="12" r="7.5" />
                  <path d="m7 17 10-10" />
                </svg>
              }
            >
              <SettingRow title={<label htmlFor="setting-ignored-patterns">Ignored text patterns</label>}>
                <textarea id="setting-ignored-patterns" className={fieldClass} rows={3} value={draft.ignored_patterns} placeholder="One regular expression per line"
                  onChange={(event) => editDraft("ignored_patterns", event.target.value)}
                  onBlur={(event) => commit("ignored_patterns", event.target.value)} />
              </SettingRow>
              <SettingRow title="Ignored content types">
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
              </SettingRow>
            </SettingSection>

            {/* Ignoring an app needs a foreground lookup to name one. Where
                the platform has none, the control could only ever collect
                entries that never match. */}
            {sourceAppDetection ? (
              <IgnoredAppsPanel
                settings={settings}
                onSave={(next) => update("ignored_apps", next as JsonValue)}
                className={sectionPanelClass}
              />
            ) : null}
          </div>

          <SettingSection
            className={sectionPanelClass}
            titleId="settings-appearance-heading"
            title="Theme and window"
            description="Pick an accent, and follow Windows or choose an explicit mode."
            tone="var(--type-image)"
            icon={
              <svg aria-hidden="true" viewBox="0 0 24 24" className={sectionIconClass}>
                <circle cx="12" cy="12" r="7.5" />
                <path d="M12 4.5v15" />
              </svg>
            }
            action={
              <Button type="button" variant="ghost" size="sm" className={resetButtonClass} disabled={busy} onClick={() => void resetAppearanceSection()}>Reset section</Button>
            }
          >
            <div ref={sectionRef("settings-appearance")} id="settings-appearance" className="scroll-mt-4" />
            <SettingRow title="Theme">
              {/* Each tile paints a miniature of the app chrome in that
                  theme's own surfaces: the choice is easier to see than to
                  read. "System" shows both halves. */}
              <div className="grid grid-cols-3 gap-2 max-[40rem]:grid-cols-1">
                {themeOptions.map((option) => (
                  <RadioCard
                    key={option.value}
                    name="setting-theme"
                    value={option.value}
                    checked={mode === option.value}
                    disabled={busy}
                    label={option.label}
                    hint={option.hint}
                    preview={<ThemePreview theme={option.value} />}
                    onChange={(value) => changeMode(value as Mode)}
                  />
                ))}
              </div>
            </SettingRow>

            <SettingRow title="Accent">
              <div
                role="radiogroup"
                aria-label="Accent"
                className="flex flex-wrap gap-2 rounded-md bg-background p-2"
              >
                {ACCENTS.map((option) => {
                  const checked = accent === option.id;
                  return (
                    <button
                      key={option.id}
                      type="button"
                      role="radio"
                      aria-checked={checked}
                      disabled={busy}
                      onClick={() => changeAccent(option.id)}
                      /* `data-accent` on the button itself makes the swatch
                         paint from that theme's own ramp, so each one shows the
                         colours it would apply rather than a hardcoded copy of
                         them that could fall out of step. */
                      data-accent={option.id}
                      title={option.label}
                      className={cn(
                        "flex items-center gap-2 rounded-md px-2 py-1.5 text-xs font-semibold transition-colors",
                        "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--accent)]",
                        "disabled:cursor-not-allowed disabled:opacity-50",
                        checked ? "text-foreground" : "text-muted-foreground hover:bg-muted hover:text-foreground",
                      )}
                    >
                      <span
                        aria-hidden="true"
                        className={cn(
                          "size-[26px] rounded-full bg-[var(--accent)]",
                          checked && "ring-2 ring-[var(--accent)] ring-offset-2 ring-offset-[var(--surface-1)]",
                        )}
                      />
                      {option.label}
                    </button>
                  );
                })}
              </div>
            </SettingRow>

            <SettingRow
              title={<label htmlFor="setting-min-tray">Minimize to tray</label>}
              description="Keep capture available when the window is minimized."
              control={
                <ToggleSwitch id="setting-min-tray" aria-label="Minimize to tray" checked={settings.minimize_to_tray} disabled={busy} onCheckedChange={(checked) => update("minimize_to_tray", checked)} />
              }
            />
            <SettingRow
              title={<label htmlFor="setting-autostart">Start with Windows</label>}
              description="Run quietly after signing in so clipboard tracking stays active."
              control={
                <ToggleSwitch id="setting-autostart" aria-label="Start with Windows" checked={autostart ?? false} disabled={autostart === null || autostartBusy} onCheckedChange={(checked) => void updateAutostart(checked)} />
              }
            />
            <SettingRow
              title={<label htmlFor="setting-formatter-indent">Formatter indent</label>}
              description={fieldErrors.formatter_indent || "Spaces the formatter uses per level. 1-8 spaces."}
              control={
                <NumberField id="setting-formatter-indent" ariaLabel="Formatter indent" min={1} max={8} value={draft.formatter_indent} disabled={busy}
                  invalid={Boolean(fieldErrors.formatter_indent)}
                  onChange={(value) => editDraft("formatter_indent", value)}
                  onBlur={(value) => commit("formatter_indent", value)}
                  onKeyDown={commitOnEnter("formatter_indent")}
                  onStep={(next) => commit("formatter_indent", String(next))} />
              }
            />
          </SettingSection>

          <SettingSection
            className={sectionPanelClass}
            titleId="settings-shortcuts-heading"
            title="Shortcuts"
            description="Customize keyboard shortcuts for quick actions."
            tone="var(--type-shell)"
            icon={
              <svg aria-hidden="true" viewBox="0 0 24 24" className={sectionIconClass}>
                <rect x="3.5" y="6.5" width="17" height="11" rx="2" />
                <path d="M8 10h.01M12 10h.01M16 10h.01M8 14h8" />
              </svg>
            }
          >
            <div ref={sectionRef("settings-shortcuts")} id="settings-shortcuts" className="scroll-mt-4" />
            <SettingRow>
              <KeyboardShortcutsPanel
                settings={settings}
                onSave={async (customShortcuts) => {
                  const ok = await patch({ custom_shortcuts: customShortcuts }, "Shortcuts saved.");
                  if (!ok) throw new Error("Shortcuts failed to save.");
                }}
              />
            </SettingRow>
          </SettingSection>

          <div id="settings-duplicates" ref={sectionRef("settings-duplicates")}><DuplicatesPanel className={sectionPanelClass} /></div>
          <div id="settings-usage" ref={sectionRef("settings-usage")}><AnalyticsPanel className={sectionPanelClass} /></div>
          <div id="settings-transfer" ref={sectionRef("settings-transfer")}><TransferPanel className={sectionPanelClass} /></div>
          <div id="settings-backup" ref={sectionRef("settings-backup")}><BackupPanel className={panelClass} /></div>
          <div id="settings-updates-panel" ref={sectionRef("settings-updates-panel")}><UpdatesPanel className={panelClass} /></div>

          <div id="settings-privacy" ref={sectionRef("settings-privacy")} className="scroll-mt-4">
            <SettingSection
              className={sectionPanelClass}
              titleId="settings-privacy-heading"
              title="Local by default"
              description="Normal launches contact GitHub Releases only for signed updates. Clipboard content is never sent."
              tone="var(--type-secret)"
              icon={
                <svg aria-hidden="true" viewBox="0 0 24 24" className={sectionIconClass}>
                  <path d="M12 3.5 5.5 6v6c0 4 2.8 7.1 6.5 8.5 3.7-1.4 6.5-4.5 6.5-8.5V6L12 3.5Z" />
                </svg>
              }
            >
              <SettingRow>
                <p className="m-0 text-sm leading-relaxed text-muted-foreground">
                  Sensitive clipboard text may be rejected before storage.
                </p>
              </SettingRow>
              <SettingRow>
                <SensitiveSweep />
              </SettingRow>
            </SettingSection>
          </div>
        </div>

        <nav aria-label="Settings sections" className="sticky top-[clamp(1.25rem,3vw,2.5rem)] hidden min-[64rem]:block">
          <div className="rounded-lg border border-border bg-card p-2 shadow-[var(--shadow-panel)]">
            <p className="mb-1.5 px-2 pt-1 text-[0.62rem] font-bold uppercase tracking-[0.06em] text-[var(--text-muted)]">On this page</p>
            <ul className="grid gap-0.5">
              {sections.map((section) => (
                <li key={section.id}>
                  <button
                    type="button"
                    aria-current={activeSection === section.id ? "true" : undefined}
                    className={cn(
                      "flex w-full items-center gap-2.5 rounded-md px-2.5 py-1.5 text-left text-[0.78rem] no-underline transition-colors",
                      activeSection === section.id
                        ? "bg-muted font-semibold text-foreground"
                        : "font-medium text-muted-foreground hover:bg-muted hover:text-foreground",
                    )}
                    onClick={() => scrollToSection(section.id)}
                  >
                    {/* The dot is the marker the eye follows down the index;
                        the label weight alone was too quiet to find. */}
                    <span
                      aria-hidden="true"
                      className={cn(
                        "size-[5px] shrink-0 rounded-full transition-colors",
                        activeSection === section.id ? "bg-primary" : "bg-[var(--border-strong)]",
                      )}
                    />
                    {section.label}
                  </button>
                </li>
              ))}
            </ul>
          </div>
        </nav>
      </div>
    </main>
  );
}
