/**
 * Accent and mode: the two attributes that select a palette.
 *
 * Switching either one writes a single attribute on `<html>`. No component
 * takes a colour prop, nothing re-renders, and no style is injected from JS -
 * the ramps in tokens.css do all the work off `[data-accent]` and
 * `[data-mode]`.
 *
 * Settings live in SQLite behind an async IPC call, which is a round trip too
 * slow to beat the first paint. So the pair is mirrored into `localStorage`
 * and replayed by an inline script in index.html before the first frame; the
 * stored settings remain authoritative and reconcile on load. The mirror is a
 * cache, never the source of truth.
 */

export const ACCENTS = [
  { id: "teal", label: "Teal" },
  { id: "indigo", label: "Indigo" },
  { id: "clay", label: "Clay" },
  { id: "amber", label: "Amber" },
  { id: "plum", label: "Plum" },
  { id: "slate", label: "Slate" },
] as const;

export type Accent = (typeof ACCENTS)[number]["id"];

/** What the user chose. `system` defers to the OS and tracks it live. */
export type Mode = "light" | "dark" | "system";

/** What actually gets painted - `system` is always resolved to one of these. */
export type ResolvedMode = "light" | "dark";

export const DEFAULT_ACCENT: Accent = "teal";
export const DEFAULT_MODE: Mode = "system";

const ACCENT_KEY = "snipdock.accent";
const MODE_KEY = "snipdock.mode";
const DARK_QUERY = "(prefers-color-scheme: dark)";

const accentIds = ACCENTS.map((a) => a.id) as readonly string[];

export function isAccent(value: unknown): value is Accent {
  return typeof value === "string" && accentIds.includes(value);
}

export function isMode(value: unknown): value is Mode {
  return value === "light" || value === "dark" || value === "system";
}

/** The OS preference, or `light` where it cannot be read. */
export function systemMode(): ResolvedMode {
  if (typeof window === "undefined" || !window.matchMedia) return "light";
  return window.matchMedia(DARK_QUERY).matches ? "dark" : "light";
}

export function resolveMode(mode: Mode): ResolvedMode {
  return mode === "system" ? systemMode() : mode;
}

/**
 * Paints a theme. Both attributes are always written, so a half-applied pair
 * cannot leave the app on one theme's accent and another's neutrals.
 */
export function applyTheme(accent: Accent, mode: Mode): void {
  if (typeof document === "undefined") return;
  const root = document.documentElement;
  root.dataset.accent = accent;
  root.dataset.mode = resolveMode(mode);
}

/** Mirrors the pair for the pre-paint script. Private-mode failures are not
 *  worth an error: the cost is one frame of the default theme on next launch. */
export function cacheTheme(accent: Accent, mode: Mode): void {
  try {
    localStorage.setItem(ACCENT_KEY, accent);
    localStorage.setItem(MODE_KEY, mode);
  } catch {
    // Storage unavailable or full; the stored settings still persist.
  }
}

export function readCachedTheme(): { accent: Accent; mode: Mode } {
  let accent: unknown;
  let mode: unknown;
  try {
    accent = localStorage.getItem(ACCENT_KEY);
    mode = localStorage.getItem(MODE_KEY);
  } catch {
    // Fall through to the defaults.
  }
  return {
    accent: isAccent(accent) ? accent : DEFAULT_ACCENT,
    mode: isMode(mode) ? mode : DEFAULT_MODE,
  };
}

/**
 * Keeps `system` honest. The OS theme can change while the app is open - at
 * sunset, on a schedule - and a stored preference of `system` that only read
 * the OS once would be wrong for the rest of the session.
 *
 * Returns an unsubscribe function.
 */
export function watchSystemMode(onChange: (resolved: ResolvedMode) => void): () => void {
  if (typeof window === "undefined" || !window.matchMedia) return () => {};
  const query = window.matchMedia(DARK_QUERY);
  const handler = (event: MediaQueryListEvent) => onChange(event.matches ? "dark" : "light");
  query.addEventListener("change", handler);
  return () => query.removeEventListener("change", handler);
}
