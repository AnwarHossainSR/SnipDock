import { useEffect, useState } from "react";
import AppSidebar from "../components/AppSidebar";
import TopBar from "../components/TopBar";
import ClipboardPage from "../features/clipboard/ClipboardPage";
import SnippetPage from "../features/snippets/SnippetPage";
import ProjectsPanel from "../features/library/ProjectsPanel";
import SettingsPage from "../features/settings/SettingsPage";
import TemplateEditor from "../features/templates/TemplateEditor";
import { listenEvent } from "../lib/events";

const APP_SHOWN_EVENT = "app://shown";

type Page = "clipboard" | "snippets" | "projects" | "templates" | "settings";

function currentPage(): Page {
  if (window.location.hash === "#snippets") return "snippets";
  if (window.location.hash === "#projects") return "projects";
  if (window.location.hash === "#templates") return "templates";
  if (window.location.hash === "#settings") return "settings";
  return "clipboard";
}

function renderPage(page: Page) {
  if (page === "snippets") return <SnippetPage />;
  if (page === "projects") return <ProjectsPanel />;
  if (page === "templates") return <TemplateEditor />;
  if (page === "settings") return <SettingsPage />;
  return <ClipboardPage />;
}

export default function App() {
  const [page, setPage] = useState(currentPage);

  useEffect(() => {
    const updatePage = () => setPage(currentPage());
    window.addEventListener("hashchange", updatePage);
    return () => window.removeEventListener("hashchange", updatePage);
  }, []);

  useEffect(() => {
    let unlisten: (() => void) | undefined;
    listenEvent<void>(APP_SHOWN_EVENT, () => {
      document.getElementById("workspace-search")?.focus();
    }).then((fn) => {
      unlisten = fn;
    });
    return () => unlisten?.();
  }, []);

  return (
    <div className="app-shell">
      <AppSidebar />
      <section className="workspace" aria-labelledby="workspace-title">
        <TopBar />
        {renderPage(page)}
      </section>
    </div>
  );
}
