import AppSidebar from "../components/AppSidebar";
import TopBar from "../components/TopBar";
import ClipboardPage from "../features/clipboard/ClipboardPage";

export default function App() {
  return (
    <div className="app-shell">
      <AppSidebar />
      <section className="workspace" aria-labelledby="workspace-title">
        <TopBar />
        <ClipboardPage />
      </section>
    </div>
  );
}
