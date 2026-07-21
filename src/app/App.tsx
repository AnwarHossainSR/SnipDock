import { useEffect, useRef, useState } from "react";
import { listenEvent } from "../api/events";
import ClipboardPage from "../features/clipboard/ClipboardPage";
import SearchResultsPage from "../features/search/SearchResultsPage";
import SettingsPage from "../features/settings/SettingsPage";
import ToolsPage from "../features/tools/ToolsPage";
import AppSidebar from "./components/AppSidebar";
import TopBar from "./components/TopBar";

const APP_SHOWN_EVENT = "app://shown";
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
  const searchInput = useRef<HTMLInputElement>(null);

  useEffect(() => {
    const updatePage = () => setPage(currentPage());
    window.addEventListener("hashchange", updatePage);
    return () => window.removeEventListener("hashchange", updatePage);
  }, []);

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
    </div>
  );
}
