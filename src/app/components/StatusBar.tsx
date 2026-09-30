import { useEffect, useState } from "react";
import { commands } from "../../api/commands";
import { listenEvent } from "../../api/events";
import type { ResourceUsage } from "../../api/types";
import { useAppUpdate } from "../../hooks/useAppUpdate";
import { formatBytes } from "../../lib/formatBytes";
import { showSettingsSection } from "../../lib/settingsSection";
import { quickPasteShortcutHint } from "../../lib/shortcutHints";
import type { ShortcutOverrides } from "../../lib/shortcutHints";
import { ACCENTS } from "../../lib/theme";
import { useClipboardStore } from "../../stores/clipboardStore";
import { storageLevel, storagePercent, useStorageStore } from "../../stores/storageStore";
import { useThemeStore } from "../../stores/themeStore";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import ThemeToggle from "./ThemeToggle";
import UpdateAvailableModal from "./UpdateAvailableModal";

/** How often the strip re-reads SnipDock's own memory and CPU. */
const USAGE_POLL_MS = 5_000;
const SETTINGS_CHANGED_EVENT = "settings://changed";

/**
 * The six accents, one click away. Settings holds the full picker with names;
 * this is the quick one, next to the light/dark toggle it is used with. Each
 * swatch carries `data-accent`, so it paints from its own ramp in the current
 * mode instead of from a copied hex.
 */
function AccentSwatches() {
  const accent = useThemeStore((state) => state.accent);
  const setAccent = useThemeStore((state) => state.setAccent);
  return (
    <div role="radiogroup" aria-label="Theme accent" className="flex items-center gap-1.5">
      {ACCENTS.map((option) => {
        const checked = accent === option.id;
        return (
          <button
            key={option.id}
            type="button"
            role="radio"
            aria-checked={checked}
            aria-label={option.label}
            title={option.label}
            data-accent={option.id}
            onClick={() => setAccent(option.id)}
            className={cn(
              "size-3.5 min-h-0 rounded-full bg-[var(--accent)] transition-transform duration-100 ease-out hover:scale-[1.15] motion-reduce:transition-none",
              checked
                ? "ring-[1.5px] ring-[var(--accent)] ring-offset-2 ring-offset-[var(--page)]"
                : "shadow-[inset_0_0_0_1px_rgb(0_0_0/12%)]",
            )}
          />
        );
      })}
    </div>
  );
}

function Divider() {
  return <span aria-hidden="true" className="h-3.5 w-px shrink-0 bg-border" />;
}

/**
 * The strip along the foot of the window: what SnipDock is doing and what it
 * costs, and the quiet controls that belong to the window rather than to a
 * page - theme, accent, version, update.
 *
 * It holds everything the sidebar's status card did. Paper Desk has no
 * sidebar, and a status that sits in the same place on every page is easier
 * to glance at than one tucked under a library list.
 */
export default function StatusBar({
  trackingPaused,
  shortcutOverrides,
}: {
  trackingPaused?: boolean;
  shortcutOverrides?: ShortcutOverrides;
}) {
  const storageSize = useStorageStore((state) => state.size);
  const [usage, setUsage] = useState<ResourceUsage | null>(null);
  const [capturing, setCapturing] = useState<boolean | null>(null);
  const update = useAppUpdate();
  const quickPaste = quickPasteShortcutHint(shortcutOverrides);

  // A capture, a delete, or a new limit is what moves the reading, so those
  // are what re-read it: polling would cost the same stat per image each time.
  useEffect(() => {
    let active = true;
    let unlisten: (() => void) | null = null;
    const { refresh } = useStorageStore.getState();
    void refresh();
    const unsubscribe = useClipboardStore.subscribe((state) => state.libraryRevision, () => void refresh());
    void listenEvent<void>(SETTINGS_CHANGED_EVENT, () => void refresh())
      .then((stop) => {
        if (active) unlisten = stop;
        else stop();
      })
      .catch(() => {
        // No event bridge under the test IPC; library changes still refresh.
      });
    return () => {
      active = false;
      unsubscribe();
      unlisten?.();
    };
  }, []);

  useEffect(() => {
    let active = true;
    void commands.getSettings().then(
      (settings) => { if (active && settings) setCapturing(settings.clipboard_tracking); },
      () => {},
    );
    return () => { active = false; };
  }, []);

  // CPU is a delta between two readings, so this has to keep sampling to say
  // anything about it. Hidden windows are skipped - a minimised app polling
  // itself is exactly the cost this readout exists to keep honest.
  useEffect(() => {
    let active = true;
    function sample() {
      if (typeof document !== "undefined" && document.hidden) return;
      void commands.getResourceUsage().then(
        (next) => { if (active) setUsage(next); },
        () => {},
      );
    }
    sample();
    const timer = setInterval(sample, USAGE_POLL_MS);
    return () => {
      active = false;
      clearInterval(timer);
    };
  }, []);

  useEffect(() => {
    if (trackingPaused !== undefined) setCapturing(!trackingPaused);
  }, [trackingPaused]);

  const level = storageSize ? storageLevel(storageSize) : "ok";
  // Tracking is on but the backend is refusing every capture.
  const stopped = capturing === true && level === "full";

  return (
    <>
      <footer
        aria-label="Status"
        className="flex min-h-[34px] shrink-0 flex-wrap items-center gap-x-3.5 gap-y-1 border-t border-border bg-[color-mix(in_srgb,var(--surface-1)_55%,var(--page))] px-5 py-1.5 text-[0.72rem] text-muted-foreground max-[40rem]:px-3"
      >
        {capturing !== null && (
          <span
            className="inline-flex items-center gap-1.5"
            title={stopped ? "Storage full, capture stopped" : capturing ? "Tracking active" : "Tracking paused"}
          >
            <span
              aria-hidden="true"
              className={cn(
                "size-[7px] rounded-full",
                stopped ? "bg-destructive" : capturing ? "bg-[var(--success)] animate-[capture-pulse_2.2s_ease-in-out_infinite]" : "bg-[var(--text-muted)]",
              )}
            />
            <span className={cn("font-semibold", stopped ? "text-destructive" : capturing ? "text-[var(--success)]" : "text-muted-foreground")}>
              {stopped ? "Stopped" : capturing ? "Capturing" : "Paused"}
            </span>
            <span className={cn("text-[var(--text-muted)]", !stopped && "max-[40rem]:hidden")}>
              {stopped ? "· storage full" : "· stored locally"}
            </span>
          </span>
        )}

        {storageSize && storageSize.limit_bytes > 0 && (
          <span className="inline-flex items-center gap-2">
            <Divider />
            <span className="font-mono text-[0.66rem] tabular-nums">
              {formatBytes(storageSize.total_bytes)} / {formatBytes(storageSize.limit_bytes)}
            </span>
            <span
              role="meter"
              aria-label="Storage used"
              aria-valuemin={0}
              aria-valuemax={100}
              aria-valuenow={storagePercent(storageSize)}
              aria-valuetext={`${formatBytes(storageSize.total_bytes)} of ${formatBytes(storageSize.limit_bytes)}`}
              title={`${formatBytes(storageSize.db_bytes)} history, ${formatBytes(storageSize.images_bytes)} images`}
              className="block h-[4px] w-16 overflow-hidden rounded-full bg-[var(--surface-2)] max-[40rem]:hidden"
            >
              <span
                className={cn(
                  "block h-full rounded-full",
                  level === "full" ? "bg-destructive" : level === "warning" ? "bg-[var(--warning)]" : "bg-primary",
                )}
                style={{ width: `${Math.max(storagePercent(storageSize), storageSize.total_bytes > 0 ? 1 : 0)}%` }}
              />
            </span>
            {level !== "ok" && (
              <span
                role={level === "full" ? "alert" : "status"}
                className={cn("font-medium", level === "full" ? "text-destructive" : "text-[var(--warning)]")}
              >
                {level === "full"
                  ? "Storage full. New copies are not being saved."
                  : `Storage ${storagePercent(storageSize)}% full. Capture stops at ${formatBytes(storageSize.limit_bytes)}.`}{" "}
                <button
                  type="button"
                  onClick={() => showSettingsSection("settings-storage")}
                  className="min-h-0 font-semibold underline underline-offset-2 hover:text-foreground"
                >
                  {level === "full" ? "Free space" : "Manage"}
                </button>
              </span>
            )}
          </span>
        )}

        {usage && (
          <span
            className="inline-flex items-center gap-2 font-mono text-[0.66rem] tabular-nums text-[var(--text-muted)] max-[56rem]:hidden"
            // A Tauri app is the Rust binary plus the platform webview's own
            // processes, so the headline figure covers all of them and the
            // tooltip says how much of it is the main process.
            title={`${formatBytes(usage.main_memory_bytes)} in the main process, the rest in the webview`}
          >
            <Divider />
            <span>{formatBytes(usage.memory_bytes)}</span>
            {/* The first reading has nothing to compare against, so no CPU
                figure is shown rather than a misleading zero. */}
            {usage.cpu_ready && (
              <>
                <span aria-hidden="true">·</span>
                <span title={`Share of all ${usage.cpu_cores} cores, as Task Manager counts it`}>
                  {usage.cpu_percent.toFixed(1)}% CPU
                </span>
              </>
            )}
            <span aria-hidden="true">·</span>
            <span>
              {usage.process_count} {usage.process_count === 1 ? "process" : "processes"}
            </span>
          </span>
        )}

        <span className="flex-1" />

        {/* Quick Paste is not a page: it opens over whichever application had
            focus. What the window can usefully say is which keys open it. */}
        {quickPaste && (
          <span className="inline-flex items-center gap-1.5 max-[48rem]:hidden" title="Opens over any application">
            <kbd className="whitespace-nowrap rounded-[5px] border border-b-2 border-border bg-card px-1.5 py-px font-mono text-[0.62rem] font-medium">
              {quickPaste.replace(/\s*\+\s*/g, "").replace(/Shift/, "⇧")}
            </kbd>
            Quick Paste
          </span>
        )}
        <span className="inline-flex items-center gap-2">
          <ThemeToggle className="-my-1 size-7 min-h-0" />
          <AccentSwatches />
        </span>
        <Divider />
        {update.currentVersion && (
          <span className="font-mono text-[0.66rem] text-[var(--text-muted)]">v{update.currentVersion}</span>
        )}
        <span className="text-[var(--text-muted)] max-[40rem]:hidden">
          Built by{" "}
          <a
            className="text-muted-foreground hover:text-primary"
            href="https://github.com/AnwarHossainSR"
            target="_blank"
            rel="noreferrer"
          >
            Anwar Hossain
          </a>
        </span>
        {/* Shown for any available update, including one the user skipped or
            postponed: the prompt stays quiet, but the way to install it must
            not disappear along with it. */}
        {update.update && (
          <Button
            type="button"
            size="sm"
            disabled={update.installing}
            onClick={() => void update.install()}
            className="h-6 min-h-0 rounded-md px-2.5 text-[0.7rem]"
          >
            {update.installing ? "Installing update…" : `Update to v${update.update.version}`}
          </Button>
        )}
        {update.error && !update.showPrompt && (
          <span role="alert" className="text-destructive">
            {update.error}
          </span>
        )}
      </footer>
      {update.showPrompt && update.update && (
        <UpdateAvailableModal
          currentVersion={update.currentVersion}
          update={update.update}
          installing={update.installing}
          error={update.error}
          onInstall={() => void update.install()}
          onLater={update.later}
          onSkip={update.skip}
        />
      )}
    </>
  );
}
