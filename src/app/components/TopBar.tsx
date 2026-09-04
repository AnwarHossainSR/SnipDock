import type { Ref } from "react";
import { searchShortcutHint } from "../../lib/shortcutHints";
import { useThemeStore } from "../../stores/themeStore";

interface TopBarProps {
  inputRef: Ref<HTMLInputElement>;
  query: string;
  onQueryChange: (query: string) => void;
  onClear: () => void;
}

function SunIcon() {
  return (
    <svg
      aria-hidden="true"
      viewBox="0 0 24 24"
      className="size-4 fill-none stroke-current [stroke-linecap:round] [stroke-linejoin:round] [stroke-width:1.8]"
    >
      <circle cx="12" cy="12" r="5" />
      <path d="M12 1v2M12 21v2M4.22 4.22l1.42 1.42M18.36 18.36l1.42 1.42M1 12h2M21 12h2M4.22 19.78l1.42-1.42M18.36 5.64l1.42-1.42" />
    </svg>
  );
}

function MoonIcon() {
  return (
    <svg
      aria-hidden="true"
      viewBox="0 0 24 24"
      className="size-4 fill-none stroke-current [stroke-linecap:round] [stroke-linejoin:round] [stroke-width:1.8]"
    >
      <path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z" />
    </svg>
  );
}

function MonitorIcon() {
  return (
    <svg
      aria-hidden="true"
      viewBox="0 0 24 24"
      className="size-4 fill-none stroke-current [stroke-linecap:round] [stroke-linejoin:round] [stroke-width:1.8]"
    >
      <rect x="2" y="3" width="20" height="14" rx="2" ry="2" />
      <line x1="8" y1="21" x2="16" y2="21" />
      <line x1="12" y1="17" x2="12" y2="21" />
    </svg>
  );
}

export default function TopBar({ inputRef, query, onQueryChange, onClear }: TopBarProps) {
  const theme = useThemeStore((state) => state.mode);
  const setMode = useThemeStore((state) => state.setMode);

  const cycleTheme = () => {
    setMode(theme === "system" ? "light" : theme === "light" ? "dark" : "system");
  };

  const shortcutHint = searchShortcutHint();
  const ThemeIcon = theme === "dark" ? MoonIcon : theme === "light" ? SunIcon : MonitorIcon;
  const themeLabel = theme === "system" ? "System theme" : theme === "light" ? "Light theme" : "Dark theme";

  return (
    <header className="sticky top-0 z-20 flex min-h-[4.75rem] items-center gap-3 border-b border-border bg-background/85 px-[clamp(1rem,3vw,2.5rem)] backdrop-blur max-[31rem]:min-h-16 max-[31rem]:px-3">
      <div
        role="search"
        className="flex h-[2.65rem] w-[min(36rem,100%)] items-center gap-3 rounded-md border border-border bg-card px-3 transition-colors focus-within:border-primary focus-within:ring-2 focus-within:ring-ring/25 hover:border-[var(--border-strong)]"
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
            className="hidden shrink-0 rounded-sm border border-border bg-muted px-1.5 py-0.5 font-mono text-[0.62rem] font-semibold text-[var(--text-muted)] min-[31rem]:block"
          >
            {shortcutHint}
          </kbd>
        )}
      </div>
      <button
        type="button"
        onClick={cycleTheme}
        aria-label={themeLabel}
        title={themeLabel}
        className="ml-auto grid size-9 shrink-0 place-items-center rounded-md border border-transparent text-muted-foreground transition-colors hover:border-border hover:bg-muted hover:text-foreground"
      >
        <ThemeIcon />
      </button>
    </header>
  );
}
