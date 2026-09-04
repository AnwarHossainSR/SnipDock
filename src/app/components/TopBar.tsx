import { useThemeStore } from "../../stores/themeStore";

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

/**
 * The window chrome above the workspace. Search used to live here; it moved
 * into the content column with the list it filters, which leaves this bar as
 * what it always was - the one control that belongs to the window rather than
 * to a page.
 */
export default function TopBar() {
  const theme = useThemeStore((state) => state.mode);
  const setMode = useThemeStore((state) => state.setMode);

  const cycleTheme = () => {
    setMode(theme === "system" ? "light" : theme === "light" ? "dark" : "system");
  };

  const ThemeIcon = theme === "dark" ? MoonIcon : theme === "light" ? SunIcon : MonitorIcon;
  const themeLabel = theme === "system" ? "System theme" : theme === "light" ? "Light theme" : "Dark theme";

  return (
    <header className="sticky top-0 z-20 flex min-h-[3.25rem] items-center gap-3 border-b border-border bg-background/85 px-[clamp(1rem,3vw,2.5rem)] backdrop-blur max-[31rem]:px-3">
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
