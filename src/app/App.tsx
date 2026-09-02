import { emit } from "@tauri-apps/api/event";
import { getCurrentWindow } from "@tauri-apps/api/window";
import { useEffect, useRef, useState } from "react";
import { commands } from "../api/commands";
import { listenEvent, ShortcutEvents } from "../api/events";
import ClipboardPage from "../features/clipboard/ClipboardPage";
import QuickPastePage from "../features/clipboard/QuickPastePage";
import SearchResultsPage from "../features/search/SearchResultsPage";
import SettingsPage from "../features/settings/SettingsPage";
import { useDebounce } from "../hooks/useDebounce";
import { useClipboardStore } from "../stores/clipboardStore";
import AppSidebar from "./components/AppSidebar";
import TopBar from "./components/TopBar";

const APP_SHOWN_EVENT = "app://shown";
const SETTINGS_CHANGED_EVENT = "settings://changed";
type Page = "clipboard" | "settings";

/**
 * Default in-window `Ctrl/Cmd+Shift` accelerators, keyed by lowercase
 * `event.key`. Only Quick Paste (`Ctrl+Shift+V`) is registered OS-wide;
 * these fire only while SnipDock has focus so other apps keep their own
 * shortcuts.
 */
const DEFAULT_SHORTCUTS: Record<string, string> = {
  f: ShortcutEvents.search,
  c: ShortcutEvents.copySelected,
  p: ShortcutEvents.togglePin,
  backspace: ShortcutEvents.deleteSelected,
  d: ShortcutEvents.toggleFavorite,
  arrowright: ShortcutEvents.navigateNext,
  arrowleft: ShortcutEvents.navigatePrevious,
};

function currentPage(): Page {
  const hash = window.location.hash;
  if (hash === "#settings") return "settings";
  return "clipboard";
}

function renderPage(page: Page, trackingPaused: boolean, onTrackingChanged?: (paused: boolean) => void) {
  if (page === "settings") return <SettingsPage />;
  return <ClipboardPage trackingPaused={trackingPaused} onTrackingChanged={onTrackingChanged} />;
}

function MainApp() {
  const [page, setPage] = useState(currentPage);
  const [query, setQuery] = useState("");
  const debouncedQuery = useDebounce(query, 300);
  const [trackingPaused, setTrackingPaused] = useState(false);
  const [shortcutKeys, setShortcutKeys] = useState<Record<string, string>>(DEFAULT_SHORTCUTS);
  const searchInput = useRef<HTMLInputElement>(null);

  useEffect(() => {
    const updatePage = () => setPage(currentPage());
    window.addEventListener("hashchange", updatePage);
    return () => window.removeEventListener("hashchange", updatePage);
  }, []);

  // A pinned entry in the sidebar asks for one item to be revealed. Routing
  // lives here because only this level can leave the search results and put
  // the Clipboard page back on screen; the page itself does the scrolling.
  useEffect(
    () =>
      useClipboardStore.subscribe(
        (state) => state.focusRequest,
        (request) => {
          if (!request) return;
          setQuery("");
          if (window.location.hash === "#clipboard") setPage("clipboard");
          else window.location.hash = "#clipboard";
        },
      ),
    [],
  );

  // The `settings://changed` event is emitted by `save_settings` after a
  // successful commit, so a rebind in the Keyboard shortcuts panel takes
  // effect without a restart. The current keypress layer keeps the
  // documented defaults; the panel itself is the surface that re-reads the
  // map on every render, so the round-trip is observable from the UI even
  // when the keypress layer is unchanged.
  useEffect(() => {
    let active = true;
    let unlisten: (() => void) | null = null;
    void listenEvent<void>(SETTINGS_CHANGED_EVENT, () => {
      if (!active) return;
      commands
        .getSettings()
        .then((settings) => {
          if (!active || !settings) return;
          setShortcutKeys({ ...DEFAULT_SHORTCUTS, ...(settings.custom_shortcuts ?? {}) });
        })
        .catch(() => {
          // The next emit will retry.
        });
    })
      .then((stop) => {
        if (active) unlisten = stop;
        else stop();
      })
      .catch(() => {
        // The mock IPC used in some tests does not implement `listen`; the
        // initial load below is enough to pick up the saved overrides and
        // a real launch will deliver the event through the Tauri runtime.
      });
    return () => {
      active = false;
      if (unlisten) unlisten();
    };
  }, []);

  useEffect(() => {
    commands
      .getSettings()
      .then((settings) => {
        if (!settings) return;
        setShortcutKeys({ ...DEFAULT_SHORTCUTS, ...(settings.custom_shortcuts ?? {}) });
      })
      .catch(() => {
        // Keep defaults on error.
      });
  }, []);

  // Ctrl/Cmd+K jumps to the search field rather than opening a second search
  // surface - the top bar already is the one, and Quick Paste covers the
  // out-of-app case.
  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (!(event.ctrlKey || event.metaKey) || event.altKey || event.shiftKey) return;
      if (event.key.toLowerCase() !== "k") return;
      event.preventDefault();
      searchInput.current?.focus();
      searchInput.current?.select();
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, []);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (!(event.ctrlKey || event.metaKey) || !event.shiftKey || event.altKey) return;
      const eventName = shortcutKeys[event.key.toLowerCase()];
      if (!eventName) return;
      event.preventDefault();
      void emit(eventName);
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [shortcutKeys]);

  useEffect(() => {
    let active = true;
    let unlisten: (() => void)[] = [];
    void Promise.all([
      listenEvent<void>(APP_SHOWN_EVENT, () => searchInput.current?.focus()),
      listenEvent<void>(ShortcutEvents.search, () => searchInput.current?.focus()),
    ])
      .then((stops) => {
        if (active) unlisten = stops;
        else stops.forEach((stop) => stop());
      })
      .catch((error) => console.error("Could not register window focus listeners", error));
    return () => {
      active = false;
      unlisten.forEach((stop) => stop());
    };
  }, []);

  return (
    <div className="grid min-h-screen grid-cols-[var(--sidebar-width)_minmax(0,1fr)] max-[47rem]:grid-cols-[var(--sidebar-collapsed)_minmax(0,1fr)]">
      <AppSidebar trackingPaused={trackingPaused} />
      <section className="min-w-0" aria-labelledby="workspace-title">
        <TopBar inputRef={searchInput} query={query} onQueryChange={setQuery} onClear={() => setQuery("")} />
        {query.trim() ? <SearchResultsPage query={debouncedQuery} /> : renderPage(page, trackingPaused, setTrackingPaused)}
      </section>
    </div>
  );
}

export default function App() {
  return getCurrentWindow().label === "quick-paste" ? <QuickPastePage /> : <MainApp />;
}
