import type { Ref } from "react";

interface TopBarProps {
  inputRef: Ref<HTMLInputElement>;
  query: string;
  onQueryChange: (query: string) => void;
  onClear: () => void;
}

export default function TopBar({ inputRef, query, onQueryChange, onClear }: TopBarProps) {
  return (
    <header className="flex min-h-[4.75rem] items-center gap-5 border-b border-border px-[clamp(1rem,3vw,2.5rem)] max-[31rem]:min-h-16 max-[31rem]:px-3">
      <div
        role="search"
        className="flex h-[2.65rem] w-[min(36rem,100%)] items-center gap-3 rounded-md border border-border bg-card px-3 focus-within:border-[var(--color-focus)] focus-within:shadow-[0_0_0_3px_color-mix(in_srgb,var(--color-focus)_15%,transparent)]"
      >
        <svg
          aria-hidden="true"
          viewBox="0 0 24 24"
          className="size-[1.1rem] shrink-0 fill-none stroke-current text-muted-foreground [stroke-linecap:round] [stroke-linejoin:round] [stroke-width:1.8]"
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
          className="min-w-0 flex-1 border-0 bg-transparent text-foreground outline-none placeholder:text-muted-foreground"
        />
        {query && (
          <button
            type="button"
            onClick={onClear}
            aria-label="Clear search"
            className="grid size-8 place-items-center rounded-sm text-muted-foreground hover:bg-muted"
          >
            ×
          </button>
        )}
      </div>
      <div
        title="Clipboard data stays on this device"
        className="ml-auto flex items-center gap-2 text-xs font-semibold text-muted-foreground max-[31rem]:hidden"
      >
        <span
          aria-hidden="true"
          className="size-[0.45rem] rounded-full bg-[var(--color-positive)] shadow-[0_0_0_3px_color-mix(in_srgb,var(--color-positive)_14%,transparent)]"
        />
        Local-first
      </div>
    </header>
  );
}
