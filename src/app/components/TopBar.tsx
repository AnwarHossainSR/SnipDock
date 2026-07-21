import type { Ref } from "react";

interface TopBarProps {
  inputRef: Ref<HTMLInputElement>;
  query: string;
  onQueryChange: (query: string) => void;
  onClear: () => void;
}

export default function TopBar({ inputRef, query, onQueryChange, onClear }: TopBarProps) {
  return (
    <header className="top-bar">
      <div className="search" role="search">
        <svg aria-hidden="true" viewBox="0 0 24 24"><circle cx="10.5" cy="10.5" r="6.5" /><path d="m15.5 15.5 5 5" /></svg>
        <label className="sr-only" htmlFor="workspace-search">Search clipboard</label>
        <input ref={inputRef} id="workspace-search" type="search" placeholder="Search clipboard" autoComplete="off" value={query}
          onChange={(event) => onQueryChange(event.target.value)} onKeyDown={(event) => { if (event.key === "Escape") onClear(); }} />
        {query && <button className="search-clear" type="button" onClick={onClear} aria-label="Clear search">×</button>}
      </div>
      <div className="privacy-status" title="Clipboard data stays on this device"><span aria-hidden="true" />Local-first</div>
    </header>
  );
}
