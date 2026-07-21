import { getVersion } from "@tauri-apps/api/app";
import { useEffect, useRef, useState } from "react";
import { listenEvent } from "../api/events";
import { whatsNewToShow, type ReleaseNote } from "../api/releaseNotes";
import ClipboardPage from "../features/clipboard/ClipboardPage";
import SearchResultsPage from "../features/search/SearchResultsPage";
import SettingsPage from "../features/settings/SettingsPage";
import ToolsPage from "../features/tools/ToolsPage";
import AppSidebar from "./components/AppSidebar";
import TopBar from "./components/TopBar";
import WhatsNewModal from "./components/WhatsNewModal";

const APP_SHOWN_EVENT = "app://shown";
const SEEN_VERSION_KEY = "snipdock.lastSeenVersion";
type Page = "clipboard" | "tools" | "settings";

function currentPage(): Page {
  const hash = window.location.hash;
  if (hash === "#tools") return "tools";
  if (hash === "#settings") return "settings";
  return "clipboard";
}

function renderPage(page: Page) {
  if (page === "tools") return <ToolsPage />;
  if (page === "settings") return <SettingsPage />;
  return <ClipboardPage />;
}

export default function App() {
  const [page, setPage] = useState(currentPage);
  const [query, setQuery] = useState("");
  const [whatsNew, setWhatsNew] = useState<ReleaseNote | null>(null);
  const searchInput = useRef<HTMLInputElement>(null);

  useEffect(() => {
    const updatePage = () => setPage(currentPage());
    window.addEventListener("hashchange", updatePage);
    return () => window.removeEventListener("hashchange", updatePage);
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
      },
      () => {},
    );
    return () => { active = false; };
  }, []);

  function dismissWhatsNew(version: string) {
    localStorage.setItem(SEEN_VERSION_KEY, version);
    setWhatsNew(null);
  }

  useEffect(() => {
    let active = true;
    let unlisten: (() => void) | undefined;
    void listenEvent<void>(APP_SHOWN_EVENT, () => searchInput.current?.focus())
      .then((stop) => {
        if (active) unlisten = stop;
        else stop();
      })
      .catch((error) => console.error("Could not register app shown listener", error));
    return () => {
      active = false;
      unlisten?.();
    };
  }, []);

  return (
    <div className="app-shell">
      <AppSidebar />
      <section className="workspace" aria-labelledby="workspace-title">
        <TopBar inputRef={searchInput} query={query} onQueryChange={setQuery} onClear={() => setQuery("")} />
        {query.trim() ? <SearchResultsPage query={query} /> : renderPage(page)}
      </section>
      {whatsNew && <WhatsNewModal note={whatsNew} onClose={() => dismissWhatsNew(whatsNew.version)} />}
    </div>
  );
}
