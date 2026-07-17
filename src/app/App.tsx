import { useEffect, useState } from "react";
import AppSidebar from "../components/AppSidebar";
import TopBar from "../components/TopBar";
import ClipboardPage from "../features/clipboard/ClipboardPage";
import SnippetPage from "../features/snippets/SnippetPage";
import ProjectsPanel from "../features/library/ProjectsPanel";

type Page = "clipboard" | "snippets" | "projects";

function currentPage(): Page {
  if (window.location.hash === "#snippets") return "snippets";
  if (window.location.hash === "#projects") return "projects";
  return "clipboard";
}

function renderPage(page: Page) {
  if (page === "snippets") return <SnippetPage />;
  if (page === "projects") return <ProjectsPanel />;
  return <ClipboardPage />;
}

export default function App() {
  const [page, setPage] = useState(currentPage);

  useEffect(() => {
    const updatePage = () => setPage(currentPage());
    window.addEventListener("hashchange", updatePage);
    return () => window.removeEventListener("hashchange", updatePage);
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
