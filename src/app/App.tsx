import { getVersion } from "@tauri-apps/api/app";
import { emit } from "@tauri-apps/api/event";
import { getCurrentWindow } from "@tauri-apps/api/window";
import { useEffect, useRef, useState } from "react";
import { listenEvent, ShortcutEvents } from "../api/events";
import { whatsNewToShow, type ReleaseNote } from "../api/releaseNotes";
import ClipboardPage from "../features/clipboard/ClipboardPage";
import QuickPastePage from "../features/clipboard/QuickPastePage";
import SearchResultsPage from "../features/search/SearchResultsPage";
import SettingsPage from "../features/settings/SettingsPage";
import AppSidebar from "./components/AppSidebar";
import TopBar from "./components/TopBar";
import WhatsNewModal from "./components/WhatsNewModal";

const APP_SHOWN_EVENT = "app://shown";
const SEEN_VERSION_KEY = "snipdock.lastSeenVersion";
type Page = "clipboard" | "settings";

/**
 * In-window `Ctrl/Cmd+Shift` accelerators, keyed by lowercase `event.key`.
 * Only Quick Paste (`Ctrl+Shift+V`) is registered OS-wide; these fire only
 * while SnipDock has focus so other apps keep their own shortcuts.
 */
const SHORTCUT_KEYS: Record<string, string> = {
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

function renderPage(page: Page) {
  if (page === "settings") return <SettingsPage />;
  return <ClipboardPage />;
}

function MainApp() {
  const [page, setPage] = useState(currentPage);
  const [query, setQuery] = useState("");
  const [whatsNew, setWhatsNew] = useState<ReleaseNote | null>(null);
  const [whatsNewReady, setWhatsNewReady] = useState(false);
  const searchInput = useRef<HTMLInputElement>(null);

  useEffect(() => {
    const updatePage = () => setPage(currentPage());
    window.addEventListener("hashchange", updatePage);
    return () => window.removeEventListener("hashchange", updatePage);
  }, []);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (!(event.ctrlKey || event.metaKey) || !event.shiftKey || event.altKey) return;
      const eventName = SHORTCUT_KEYS[event.key.toLowerCase()];
      if (!eventName) return;
      event.preventDefault();
      void emit(eventName);
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, []);

  useEffect(() => {
    let active = true;
    getVersion().then(
      (version) => {
        if (!active || typeof version !== "string") return;
        const seen = localStorage.getItem(SEEN_VERSION_KEY);
        const note = whatsNewToShow(version, seen);
        if (note) setWhatsNew(note);
        else localStorage.setItem(SEEN_VERSION_KEY, version);
        setWhatsNewReady(true);
      },
      () => setWhatsNewReady(true),
    );
    return () => { active = false; };
  }, []);

  function dismissWhatsNew(version: string) {
    localStorage.setItem(SEEN_VERSION_KEY, version);
    setWhatsNew(null);
  }

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
      <AppSidebar suppressUpdatePrompt={!whatsNewReady || Boolean(whatsNew)} />
      <section className="min-w-0" aria-labelledby="workspace-title">
        <TopBar inputRef={searchInput} query={query} onQueryChange={setQuery} onClear={() => setQuery("")} />
        {query.trim() ? <SearchResultsPage query={query} /> : renderPage(page)}
      </section>
      {whatsNew && <WhatsNewModal note={whatsNew} onClose={() => dismissWhatsNew(whatsNew.version)} />}
    </div>
  );
}

export default function App() {
  return getCurrentWindow().label === "quick-paste" ? <QuickPastePage /> : <MainApp />;
}
