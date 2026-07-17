import { useEffect, useState } from "react";
import AppSidebar from "../components/AppSidebar";
import TopBar from "../components/TopBar";
import ClipboardPage from "../features/clipboard/ClipboardPage";
import SnippetPage from "../features/snippets/SnippetPage";

function currentPage() {
  return window.location.hash === "#snippets" ? "snippets" : "clipboard";
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
        {page === "snippets" ? <SnippetPage /> : <ClipboardPage />}
      </section>
    </div>
  );
}
