export default function TopBar() {
  return (
    <header className="top-bar">
      <div className="search" role="search">
        <svg aria-hidden="true" viewBox="0 0 24 24">
          <circle cx="10.5" cy="10.5" r="6.5" />
          <path d="m15.5 15.5 5 5" />
        </svg>
        <label className="sr-only" htmlFor="workspace-search">
          Search clipboard history and snippets
        </label>
        <input
          id="workspace-search"
          type="search"
          placeholder="Search clipboard and snippets"
          autoComplete="off"
        />
      </div>
      <div className="privacy-status" title="SnipDock works offline by default">
        <span aria-hidden="true" />
        Offline
      </div>
    </header>
  );
}
