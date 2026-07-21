import { useEffect, useState } from "react";
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

  useEffect(() => {
    const updatePage = () => setPage(currentPage());
    window.addEventListener("hashchange", updatePage);
    return () => window.removeEventListener("hashchange", updatePage);
  }, []);

  useEffect(() => {
    let unlisten: (() => void) | undefined;
    listenEvent<void>(APP_SHOWN_EVENT, () => document.getElementById("workspace-search")?.focus()).then((fn) => { unlisten = fn; });
    return () => unlisten?.();
  }, []);

  return (
    <div className="app-shell">
      <AppSidebar />
      <section className="workspace" aria-labelledby="workspace-title">
        <TopBar query={query} onQueryChange={setQuery} onClear={() => setQuery("")} />
        {query.trim() ? <SearchResultsPage query={query} /> : renderPage(page)}
      </section>
    </div>
  );
}
