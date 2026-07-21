interface TopBarProps {
  query: string;
  onQueryChange: (query: string) => void;
  onClear: () => void;
}

export default function TopBar({ query, onQueryChange, onClear }: TopBarProps) {
  return (
    <header className="top-bar">
      <div className="search" role="search">
        <svg aria-hidden="true" viewBox="0 0 24 24"><circle cx="10.5" cy="10.5" r="6.5" /><path d="m15.5 15.5 5 5" /></svg>
        <label className="sr-only" htmlFor="workspace-search">Search clipboard</label>
        <input id="workspace-search" type="search" placeholder="Search clipboard" autoComplete="off" value={query}
          onChange={(event) => onQueryChange(event.target.value)} onKeyDown={(event) => { if (event.key === "Escape") onClear(); }} />
        {query && <button className="search-clear" type="button" onClick={onClear} aria-label="Clear search">×</button>}
      </div>
      <div className="privacy-status" title="SnipDock works offline"><span aria-hidden="true" />Offline</div>
    </header>
  );
}
