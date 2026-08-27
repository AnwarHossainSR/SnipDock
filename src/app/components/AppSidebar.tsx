import { getVersion } from "@tauri-apps/api/app";
import { getCurrentWindow } from "@tauri-apps/api/window";
import { useEffect, useState } from "react";
import { commands } from "../../api/commands";
import { listenEvent, ShortcutEvents } from "../../api/events";
import type { LibraryItem, ResourceUsage, SearchQuery, StorageSize, UpdateInfo } from "../../api/types";
import { parseChangelog } from "../../lib/changelog";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { useClipboardStore } from "../../stores/clipboardStore";
import { contentTypeTokenName } from "../../lib/contentTypeColors";
import { formatBytes } from "../../lib/formatBytes";
import UpdateAvailableModal from "./UpdateAvailableModal";

const SKIPPED_UPDATE_KEY = "snipdock.skippedUpdateVersion";
const AUTO_UPDATE_DISABLED_KEY = "snipdock.autoUpdateDisabled";
const UPDATE_FREQUENCY_KEY = "snipdock.updateFrequency";
const LAST_UPDATE_CHECK_KEY = "snipdock.lastUpdateCheck";
const APP_SHOWN_EVENT = "app://shown";
/** How often the footer re-reads SnipDock's own memory and CPU. */
const USAGE_POLL_MS = 5_000;

function shouldCheckForUpdate(frequency: string, lastCheck: string | null): boolean {
  if (frequency === "on_launch") return true;
  if (!lastCheck) return true;
  const lastCheckTime = parseInt(lastCheck, 10);
  if (isNaN(lastCheckTime)) return true;
  const now = Date.now();
  const elapsed = now - lastCheckTime;
  if (frequency === "daily") return elapsed >= 24 * 60 * 60 * 1000;
  if (frequency === "weekly") return elapsed >= 7 * 24 * 60 * 60 * 1000;
  return true;
}

const navigation = [
  { label: "Clipboard", href: "#clipboard", icon: "clipboard" },
  { label: "Settings", href: "#settings", icon: "settings" },
] as const;

// Number-key badge per destination, sourced from docs/keyboard-shortcuts.md.
// Neither destination has a documented number-key shortcut today, so both are
// left undefined rather than inventing one - the lookup exists so a future
// documented shortcut only needs an entry added here.
const navigationShortcutBadge: Partial<Record<(typeof navigation)[number]["href"], string>> = {};

const PINNED_LIMIT = 8;
function pinnedQuery(): SearchQuery {
  return {
    text: null,
    kinds: ["clipboard"],
    content_types: [],
    languages: [],
    project_ids: [],
    category_ids: [],
    tag_ids: [],
    pinned: true,
    favorite: null,
    created_from: null,
    created_to: null,
    sort: "newest",
    limit: PINNED_LIMIT,
    offset: 0,
  };
}

type IconName = (typeof navigation)[number]["icon"];

const strokeIcon =
  "fill-none stroke-current [stroke-linecap:round] [stroke-linejoin:round] [stroke-width:1.8]";
const positiveDot =
  "size-[0.45rem] rounded-full bg-[var(--color-positive)] shadow-[0_0_0_3px_color-mix(in_srgb,var(--color-positive)_14%,transparent)]";

function NavIcon({ name }: { name: IconName }) {
  const paths: Record<IconName, React.ReactNode> = {
    clipboard: (
      <>
        <path d="M9.25 3.5h5.5v2.75h-5.5z" />
        <path d="M9.25 4.9H7.5v14.6h9V4.9h-1.75" />
        <path d="M10 9h4.25M10 12h4.25" />
      </>
    ),
    settings: <path d="M12 8.5a3.5 3.5 0 1 0 0 7 3.5 3.5 0 0 0 0-7Zm0-5v2m0 13v2m8.5-8.5h-2m-13 0h-2m14-6-1.5 1.5m-8.5 8.5L6 17.5m12 0L16.5 16M7.5 7.5 6 6" />,
  };

  return (
    <svg aria-hidden="true" viewBox="0 0 24 24" className={cn("size-5 shrink-0", strokeIcon)}>
      {paths[name]}
    </svg>
  );
}

export default function AppSidebar({
  suppressUpdatePrompt = false,
  trackingPaused,
}: {
  suppressUpdatePrompt?: boolean;
  trackingPaused?: boolean;
}) {
  const [currentVersion, setCurrentVersion] = useState("");
  const [storageSize, setStorageSize] = useState<StorageSize | null>(null);
  const [usage, setUsage] = useState<ResourceUsage | null>(null);
  const [availableUpdate, setAvailableUpdate] = useState<UpdateInfo | null>(null);
  const [installing, setInstalling] = useState(false);
  const [updateError, setUpdateError] = useState(false);
  const [dismissedUpdate, setDismissedUpdate] = useState<string | null>(null);
  const [pinnedItems, setPinnedItems] = useState<LibraryItem[]>([]);
  const [capturing, setCapturing] = useState<boolean | null>(null);
  const currentHref = navigation.some((item) => item.href === window.location.hash)
    ? window.location.hash
    : "#clipboard";
  const hasChangelog = availableUpdate
    ? availableUpdate.notes === null || parseChangelog(availableUpdate.notes).hasContent
    : false;
  const autoUpdateDisabled = localStorage.getItem(AUTO_UPDATE_DISABLED_KEY) === "true";
  const showUpdateModal = !suppressUpdatePrompt
    && availableUpdate !== null
    && hasChangelog
    && !autoUpdateDisabled
    && availableUpdate.version !== dismissedUpdate
    && availableUpdate.version !== localStorage.getItem(SKIPPED_UPDATE_KEY);

  useEffect(() => {
    let active = true;
    let checked = false;
    let unlisten: (() => void)[] = [];

    function checkForUpdate() {
      if (!active || checked) return;
      const frequency = localStorage.getItem(UPDATE_FREQUENCY_KEY) || "on_launch";
      const lastCheck = localStorage.getItem(LAST_UPDATE_CHECK_KEY);
      if (!shouldCheckForUpdate(frequency, lastCheck)) return;
      checked = true;
      localStorage.setItem(LAST_UPDATE_CHECK_KEY, Date.now().toString());
      void commands.checkForUpdate().then(
        (update) => { if (active && update && typeof update.version === "string") setAvailableUpdate(update); },
        () => {},
      );
    }

    getVersion().then(
      (version) => { if (active && typeof version === "string") setCurrentVersion(version); },
      () => {},
    );
    void commands.getStorageSize().then(
      (size) => { if (active) setStorageSize(size); },
      () => {},
    );
    void Promise.all([
      listenEvent<void>(APP_SHOWN_EVENT, checkForUpdate),
      listenEvent<void>(ShortcutEvents.search, checkForUpdate),
    ]).then(
      (stops) => {
        if (!active) {
          stops.forEach((stop) => stop());
          return;
        }
        unlisten = stops;
        void getCurrentWindow().isVisible().then(
          (visible) => { if (visible) checkForUpdate(); },
          () => {},
        );
      },
      () => {},
    );
    return () => {
      active = false;
      unlisten.forEach((stop) => stop());
    };
  }, []);

  useEffect(() => {
    let active = true;
    function refreshPinned() {
      void commands.searchItems(pinnedQuery()).then(
        (result) => { if (active) setPinnedItems(result?.items ?? []); },
        () => {},
      );
    }
    refreshPinned();
    // Pin/unpin happens on the Clipboard page via the shared store; a store
    // change is the signal to re-fetch rather than duplicating pin-tracking.
    const unsubscribe = useClipboardStore.subscribe((state) => state.items, refreshPinned);
    return () => {
      active = false;
      unsubscribe();
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

  async function installUpdate() {
    setInstalling(true);
    setUpdateError(false);
    try {
      const installed = await commands.installUpdate();
      if (!installed) {
        setAvailableUpdate(null);
        setInstalling(false);
      }
    } catch {
      setUpdateError(true);
      setInstalling(false);
    }
  }

  // The Clipboard page owns selection and scrolling, so a click here only
  // records which item to reveal; App routes to the page and clears any search
  // that would otherwise be showing results instead of the history.
  function showPinnedItem(id: string) {
    useClipboardStore.getState().requestFocusItem(id);
  }

  function skipUpdate() {
    if (!availableUpdate) return;
    localStorage.setItem(SKIPPED_UPDATE_KEY, availableUpdate.version);
    setDismissedUpdate(availableUpdate.version);
  }

  return (
    <>
      {/* `min-w-0` + `overflow-hidden`: the sidebar is a fixed grid track, and
          without both a long pinned label would widen the track's content and
          spill over the workspace beside it. */}
      <aside className="sticky top-0 flex h-screen w-full min-w-0 flex-col overflow-hidden border-r border-border bg-sidebar px-3 py-5 max-[47rem]:px-2">
      <a
        className="flex min-h-10 items-center gap-3 rounded-md px-2 no-underline max-[47rem]:justify-center max-[47rem]:px-0"
        href="#clipboard"
        aria-label="SnipDock home"
      >
        <span
          aria-hidden="true"
          className="grid size-8 shrink-0 place-items-center rounded-sm bg-primary font-bold text-white shadow-[0_7px_18px_color-mix(in_srgb,var(--color-accent)_28%,transparent)]"
        >
          <svg viewBox="0 0 24 24" className={cn("size-6", strokeIcon)}>
            <path d="M9.25 3.5h5.5v2.75h-5.5z" />
            <path d="M9.25 4.9H7.5v9.85h9V4.9h-1.75" />
            <path d="M10 8.75h4.25M10 11.5h4.25" />
            <path d="M4.5 14.25h4l1.25 1.75h4.5l1.25-1.75h4v5.5a.75.75 0 0 1-.75.75H5.25a.75.75 0 0 1-.75-.75z" />
          </svg>
        </span>
        <h1 className="font-display text-base font-bold tracking-[-0.02em] max-[47rem]:sr-only">SnipDock</h1>
      </a>

      <nav aria-label="Primary" className="mt-8 grid min-w-0 gap-1">
        {navigation.map((item) => {
          const active = item.href === currentHref;
          const badge = navigationShortcutBadge[item.href];
          return (
            <a
              key={item.href}
              href={item.href}
              aria-current={active ? "page" : undefined}
              className={cn(
                // The left bar is the active marker: it reads at a glance and
                // needs no always-on rail behind the icons.
                "relative flex min-h-10 items-center gap-3 rounded-md px-3 text-sm font-semibold no-underline transition-colors",
                "before:absolute before:left-0 before:top-1/2 before:h-5 before:w-[3px] before:-translate-y-1/2 before:rounded-full before:content-['']",
                "max-[47rem]:justify-center max-[47rem]:px-0",
                active
                  ? "bg-accent text-accent-foreground before:bg-primary"
                  : "text-muted-foreground before:bg-transparent hover:bg-muted hover:text-foreground",
              )}
            >
              <NavIcon name={item.icon} />
              <span className="max-[47rem]:sr-only">{item.label}</span>
              {badge && (
                <span
                  aria-hidden="true"
                  className="ml-auto rounded-sm border border-primary/40 px-1.5 py-0.5 font-mono text-[0.62rem] font-bold text-primary max-[47rem]:hidden"
                >
                  {badge}
                </span>
              )}
            </a>
          );
        })}
      </nav>

      <div className="mt-6 grid min-h-0 min-w-0 gap-1 max-[47rem]:hidden">
        <p className="flex items-center gap-2 px-3 text-[0.62rem] font-bold uppercase tracking-[0.06em] text-[var(--color-text-subtle)]">
          Pinned
          {pinnedItems.length > 0 && (
            <span className="rounded-full bg-muted px-1.5 font-mono text-[0.6rem] tabular-nums text-muted-foreground">
              {pinnedItems.length}
            </span>
          )}
        </p>
        {pinnedItems.length === 0 ? (
          <p className="px-3 text-xs leading-relaxed text-muted-foreground">
            Pin a capture to keep it one click away.
          </p>
        ) : (
          <ul className="grid min-w-0 gap-0.5 overflow-y-auto">
            {pinnedItems.map((item) => (
              <li key={item.id} className="min-w-0">
                <button
                  type="button"
                  // Jumping to the item is the point of the list; a plain
                  // `#clipboard` link did nothing once the page was already open.
                  onClick={() => showPinnedItem(item.id)}
                  className="flex min-h-8 w-full min-w-0 items-center gap-2 rounded-md px-3 text-left text-xs text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
                  title={item.content_type === "image" ? "Pinned image" : item.content.slice(0, 200)}
                >
                  <span
                    aria-hidden="true"
                    className="size-[0.4rem] shrink-0 rounded-full"
                    style={{ backgroundColor: `var(--color-type-${contentTypeTokenName(item.content_type)})` }}
                  />
                  <span className="min-w-0 flex-1 truncate">
                    {item.content_type === "image" ? "Image" : item.content.replace(/\s+/g, " ").trim().slice(0, 60) || "Empty"}
                  </span>
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>

      <div className="mt-auto grid min-w-0 gap-2 rounded-md border border-border/70 bg-card/40 p-3 max-[47rem]:border-0 max-[47rem]:bg-transparent max-[47rem]:justify-items-center max-[47rem]:px-0">
        {capturing !== null && (
          <div
            className={cn(
              "flex items-center gap-2 text-xs font-semibold max-[47rem]:justify-center",
              capturing ? "text-[var(--color-positive)]" : "text-muted-foreground",
            )}
            title={capturing ? "Tracking active" : "Tracking paused"}
          >
            <span
              aria-hidden="true"
              className={capturing ? positiveDot : "size-[0.45rem] rounded-full bg-current"}
            />
            <span className="max-[47rem]:sr-only">{capturing ? "Capturing" : "Paused"}</span>
          </div>
        )}
        <div className="flex items-center gap-2 text-xs text-muted-foreground max-[47rem]:justify-center">
          <span aria-hidden="true" className={positiveDot} />
          <span className="max-[47rem]:sr-only">Stored locally</span>
        </div>
        {currentVersion && (
          <span className="font-mono text-[0.68rem] text-muted-foreground max-[47rem]:sr-only">
            v{currentVersion}
          </span>
        )}
        {storageSize && storageSize.total_bytes > 0 && (
          <div className="grid gap-1 max-[47rem]:sr-only">
            <div className="flex items-baseline justify-between gap-2 font-mono text-[0.62rem] uppercase tracking-[0.05em] text-[var(--color-text-subtle)]">
              <span>Local storage</span>
              <span className="tabular-nums text-muted-foreground">{formatBytes(storageSize.total_bytes)}</span>
            </div>
            {/* Split of what is stored, not a share of a quota - there is no cap to measure against. */}
            <div
              className="flex h-1 overflow-hidden rounded-full bg-[var(--color-surface-raised)]"
              role="img"
              aria-label={`${formatBytes(storageSize.db_bytes)} database, ${formatBytes(storageSize.images_bytes)} images`}
            >
              <span
                className="bg-primary"
                style={{ width: `${(storageSize.db_bytes / storageSize.total_bytes) * 100}%` }}
              />
              <span
                className="bg-[var(--color-border-strong)]"
                style={{ width: `${(storageSize.images_bytes / storageSize.total_bytes) * 100}%` }}
              />
            </div>
            <div className="flex gap-3 font-mono text-[0.62rem] tabular-nums text-[var(--color-text-subtle)]">
              <span>DB {formatBytes(storageSize.db_bytes)}</span>
              <span>Images {formatBytes(storageSize.images_bytes)}</span>
            </div>
          </div>
        )}
        {usage && (
          <div
            className="grid gap-1 max-[47rem]:sr-only"
            // A Tauri app is the Rust binary plus the platform webview's own
            // processes, so the headline figure covers all of them and the
            // tooltip says how much of it is the main process.
            title={`${formatBytes(usage.main_memory_bytes)} in the main process, the rest in the webview`}
          >
            <div className="flex items-baseline justify-between gap-2 font-mono text-[0.62rem] uppercase tracking-[0.05em] text-[var(--color-text-subtle)]">
              <span>Memory</span>
              <span className="tabular-nums text-muted-foreground">{formatBytes(usage.memory_bytes)}</span>
            </div>
            <div className="flex gap-3 font-mono text-[0.62rem] tabular-nums text-[var(--color-text-subtle)]">
              <span>
                {usage.process_count} {usage.process_count === 1 ? "process" : "processes"}
              </span>
              {/* The first reading has nothing to compare against, so no CPU
                  figure is shown rather than a misleading zero. */}
              {usage.cpu_ready && <span>{usage.cpu_percent.toFixed(1)}% CPU</span>}
            </div>
          </div>
        )}
        <span className="text-[0.68rem] text-[var(--color-text-subtle)] max-[47rem]:sr-only">
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
        {availableUpdate && hasChangelog && (
          <Button
            type="button"
            size="sm"
            disabled={installing}
            onClick={() => void installUpdate()}
            className="max-[47rem]:w-9 max-[47rem]:px-0"
          >
            <span className="max-[47rem]:sr-only">
              {installing ? "Installing update…" : `Update to v${availableUpdate.version}`}
            </span>
            <span aria-hidden="true" className="hidden max-[47rem]:inline">
              ↑
            </span>
          </Button>
        )}
        {updateError && !showUpdateModal && (
          <span role="alert" className="text-[0.68rem] text-destructive max-[47rem]:sr-only">
            Update failed
          </span>
        )}
      </div>
      </aside>
      {showUpdateModal && currentVersion && (
        <UpdateAvailableModal
          currentVersion={currentVersion}
          update={availableUpdate}
          installing={installing}
          error={updateError}
          onInstall={() => void installUpdate()}
          onLater={() => setDismissedUpdate(availableUpdate.version)}
          onSkip={skipUpdate}
        />
      )}
    </>
  );
}
