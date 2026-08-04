import { useEffect, useState } from "react";
import type { Ref } from "react";
import { commands } from "../../api/commands";

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
  const [theme, setTheme] = useState<"system" | "light" | "dark">("system");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    let active = true;
    commands.getSettings().then(
      (settings) => {
        if (active && typeof settings.theme === "string") {
          setTheme(settings.theme as "system" | "light" | "dark");
        }
      },
      () => {
        // Keep default on error
      },
    );
    return () => { active = false; };
  }, []);

  const cycleTheme = async () => {
    const next = theme === "system" ? "light" : theme === "light" ? "dark" : "system";
    setBusy(true);
    try {
      await commands.saveSettings({ values: { theme: next } });
      setTheme(next);
      document.documentElement.dataset.theme = next === "system" ? "" : next;
    } catch {
      // Revert on error
      setTheme(theme);
    } finally {
      setBusy(false);
    }
  };

  const ThemeIcon = theme === "dark" ? MoonIcon : theme === "light" ? SunIcon : MonitorIcon;
  const themeLabel = theme === "system" ? "System theme" : theme === "light" ? "Light theme" : "Dark theme";

  return (
    <header className="flex min-h-[4.75rem] items-center gap-5 border-b border-border px-[clamp(1rem,3vw,2.5rem)] max-[31rem]:min-h-16 max-[31rem]:px-3">
      <div
        role="search"
        className="flex h-[2.65rem] w-[min(36rem,100%)] items-center gap-3 rounded-md border border-border bg-card px-3"
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
      <button
        type="button"
        onClick={cycleTheme}
        disabled={busy}
        aria-label={themeLabel}
        title={themeLabel}
        className="grid size-8 place-items-center rounded-sm text-muted-foreground hover:bg-muted hover:text-foreground disabled:opacity-50"
      >
        <ThemeIcon />
      </button>
    </header>
  );
}
