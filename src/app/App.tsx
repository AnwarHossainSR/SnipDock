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
import { parseBinding, SHORTCUT_SCHEMA } from "../lib/shortcuts";
import { useClipboardStore } from "../stores/clipboardStore";
import AppSidebar from "./components/AppSidebar";
import TopBar from "./components/TopBar";

const APP_SHOWN_EVENT = "app://shown";
const SETTINGS_CHANGED_EVENT = "settings://changed";
type Page = "clipboard" | "settings";

/**
 * The in-window action each documented shortcut fires, keyed by the action id
 * the Settings panel stores its overrides under. Only Quick Paste
 * (`Ctrl+Shift+V`) is registered OS-wide; these fire only while SnipDock has
 * focus so other apps keep their own shortcuts.
 */
const ACTION_EVENTS: Record<string, string> = {
  focus_main_window_search: ShortcutEvents.search,
  copy_selected: ShortcutEvents.copySelected,
  toggle_pin: ShortcutEvents.togglePin,
  delete_selected: ShortcutEvents.deleteSelected,
  toggle_favorite: ShortcutEvents.toggleFavorite,
  navigate_next: ShortcutEvents.navigateNext,
  navigate_previous: ShortcutEvents.navigatePrevious,
};

/** Accelerator key names that differ from the `KeyboardEvent.key` they arrive as. */
const EVENT_KEY_ALIASES: Record<string, string> = {
  left: "arrowleft",
  right: "arrowright",
  up: "arrowup",
  down: "arrowdown",
  space: " ",
  esc: "escape",
};

interface KeyBinding {
  key: string;
  shift: boolean;
  alt: boolean;
  eventName: string;
}

/**
 * Turns the saved action-id-to-binding map into the key-to-event dispatch
 * list the keydown handler matches against. `settings.custom_shortcuts` is
 * keyed by action id ("toggle_pin"), not by key, so merging it into a
 * key-keyed map left every override inert and the default still live.
 */
function buildShortcutBindings(overrides: Record<string, string>): KeyBinding[] {
  const bindings: KeyBinding[] = [];
  for (const entry of SHORTCUT_SCHEMA) {
    const eventName = ACTION_EVENTS[entry.actionId];
    if (!eventName) continue;
    const raw = overrides[entry.actionId]?.trim() || entry.defaultBinding;
    const parsed = parseBinding(raw);
    if (!parsed.ok) continue;
    const key = parsed.value.key.toLowerCase();
    bindings.push({
      key: EVENT_KEY_ALIASES[key] ?? key,
      shift: parsed.value.shift,
      alt: parsed.value.alt,
      eventName,
    });
  }
  return bindings;
}

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
  const [shortcutBindings, setShortcutBindings] = useState<KeyBinding[]>(() =>
    buildShortcutBindings({}),
  );
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
          setShortcutBindings(buildShortcutBindings(settings.custom_shortcuts ?? {}));
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
        setShortcutBindings(buildShortcutBindings(settings.custom_shortcuts ?? {}));
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
      if (!(event.ctrlKey || event.metaKey)) return;
      const pressed = event.key.toLowerCase();
      const match = shortcutBindings.find(
        (binding) =>
          binding.key === pressed &&
          binding.shift === event.shiftKey &&
          binding.alt === event.altKey,
      );
      if (!match) return;
      event.preventDefault();
      void emit(match.eventName);
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [shortcutBindings]);

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
