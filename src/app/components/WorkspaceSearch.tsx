import type { Ref } from "react";
import { searchShortcutHint } from "../../lib/shortcutHints";

interface WorkspaceSearchProps {
  inputRef: Ref<HTMLInputElement>;
  query: string;
  onQueryChange: (query: string) => void;
  onClear: () => void;
}

/**
 * The history search field. It sits in the content column, directly under the
 * page heading, rather than in the window chrome: it belongs to the list it
 * filters, and up in the top bar it read as one more piece of chrome around
 * the captures instead of the way into them.
 */
export default function WorkspaceSearch({
  inputRef,
  query,
  onQueryChange,
  onClear,
}: WorkspaceSearchProps) {
  const shortcutHint = searchShortcutHint();

  return (
    <div
      role="search"
      className="mb-3 flex h-[42px] w-full items-center gap-3 rounded-lg border border-border bg-card px-3 transition-colors focus-within:border-primary focus-within:ring-2 focus-within:ring-ring/25 hover:border-[var(--border-strong)]"
    >
      <svg
        aria-hidden="true"
        viewBox="0 0 24 24"
        className="size-[1.1rem] shrink-0 fill-none stroke-current text-primary [stroke-linecap:round] [stroke-linejoin:round] [stroke-width:1.8]"
      >
        <circle cx="10.5" cy="10.5" r="6.5" />
        <path d="m15.5 15.5 5 5" />
      </svg>
      <label className="sr-only" htmlFor="workspace-search">Search clipboard</label>
      <input
        ref={inputRef}
        id="workspace-search"
        type="search"
        placeholder="Search clipboard"
        autoComplete="off"
        value={query}
        onChange={(event) => onQueryChange(event.target.value)}
        onKeyDown={(event) => { if (event.key === "Escape") onClear(); }}
        className="min-w-0 flex-1 border-0 bg-transparent text-sm text-foreground outline-none placeholder:text-muted-foreground"
      />
      {query ? (
        <button
          type="button"
          onClick={onClear}
          aria-label="Clear search"
          className="grid size-8 shrink-0 place-items-center rounded-sm text-muted-foreground hover:bg-muted hover:text-foreground"
        >
          ×
        </button>
      ) : (
        // Mirrors the Ctrl/Cmd+K handler in App - the shortcut is otherwise
        // undiscoverable from this screen.
        <kbd
          aria-hidden="true"
          className="hidden shrink-0 rounded-sm border border-border bg-background px-1.5 py-0.5 font-mono text-[0.62rem] font-semibold text-[var(--text-muted)] min-[31rem]:block"
        >
          {shortcutHint}
        </kbd>
      )}
    </div>
  );
}
