import { create } from "zustand";
import { commands } from "../api/commands";
import {
  type Accent,
  type Mode,
  DEFAULT_ACCENT,
  DEFAULT_MODE,
  applyTheme,
  cacheTheme,
  isAccent,
  isMode,
  readCachedTheme,
  watchSystemMode,
} from "../lib/theme";

/**
 * Which accent and which mode are painted, and the one place that changes
 * either. Both are persisted in the settings store beside every other
 * preference; `localStorage` holds only a mirror for the pre-paint script.
 *
 * The store applies before it persists. A colour change that waited on a
 * database round trip would lag the click that asked for it, and the write is
 * not the part the user is looking at.
 */
export interface ThemeState {
  accent: Accent;
  /** The stored preference, which may be `system`. */
  mode: Mode;
  /** Reconciles against the stored settings. Called once, before first render. */
  load: () => Promise<void>;
  setAccent: (accent: Accent) => void;
  setMode: (mode: Mode) => void;
}

export const useThemeStore = create<ThemeState>((set, get) => ({
  // Seeded from the same mirror the pre-paint script read, so the store agrees
  // with what is already on screen rather than repainting on mount.
  ...readCachedTheme(),

  load: async () => {
    let settings;
    try {
      settings = await commands.getSettings();
    } catch {
      // Unreadable settings leave the cached pair in place: it is what is
      // already painted, and it is what the user last chose.
      return;
    }
    const accent = isAccent(settings?.accent) ? settings.accent : DEFAULT_ACCENT;
    const mode = isMode(settings?.theme) ? settings.theme : DEFAULT_MODE;
    set({ accent, mode });
    applyTheme(accent, mode);
    cacheTheme(accent, mode);
  },

  setAccent: (accent) => {
    const { mode } = get();
    set({ accent });
    applyTheme(accent, mode);
    cacheTheme(accent, mode);
    void commands.saveSettings({ values: { accent } }).catch(() => {
      // The paint stands; the next launch falls back to the mirror.
    });
  },

  setMode: (mode) => {
    const { accent } = get();
    set({ mode });
    applyTheme(accent, mode);
    cacheTheme(accent, mode);
    void commands.saveSettings({ values: { theme: mode } }).catch(() => {
      // As above.
    });
  },
}));

/**
 * Repaints when the OS flips light/dark, but only while the preference is
 * `system` - an explicit choice is not something the OS gets to override.
 * Registered once at module scope: the subscription lives as long as the app.
 */
watchSystemMode(() => {
  const { accent, mode } = useThemeStore.getState();
  if (mode === "system") applyTheme(accent, mode);
});
