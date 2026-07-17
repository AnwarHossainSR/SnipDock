import AppSidebar from "../components/AppSidebar";
import TopBar from "../components/TopBar";

type AppState = "empty" | "loading" | "error";

function ContentState({ state }: { state: AppState }) {
  if (state === "loading") {
    return (
      <div className="content-state" role="status" aria-busy="true">
        <span className="loading-ring" aria-hidden="true" />
        <p>Loading your workspace…</p>
      </div>
    );
  }

  if (state === "error") {
    return (
      <div className="content-state content-state-error" role="alert">
        <span className="state-mark" aria-hidden="true">
          !
        </span>
        <div>
          <h3>Workspace unavailable</h3>
          <p>Close and reopen SnipDock to try again.</p>
        </div>
      </div>
    );
  }

  return (
    <div className="content-state" role="status">
      <span className="empty-dock" aria-hidden="true">
        <span />
      </span>
      <div>
        <h3>Your clipboard is quiet</h3>
        <p>Copy text and it will appear here, ready when you need it.</p>
      </div>
    </div>
  );
}

export default function App({ state = "empty" }: { state?: AppState }) {
  return (
    <div className="app-shell">
      <AppSidebar />
      <section className="workspace" aria-labelledby="workspace-title">
        <TopBar />
        <main className="workspace-content">
          <header className="content-heading">
            <div>
              <p>Clipboard history</p>
              <h2 id="workspace-title">Recent captures</h2>
            </div>
            <span className="item-count">0 items</span>
          </header>
          <section className="content-panel" aria-label="Recent clipboard items">
            <ContentState state={state} />
          </section>
        </main>
      </section>
    </div>
  );
}
