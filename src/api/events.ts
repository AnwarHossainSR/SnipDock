import { listen, type UnlistenFn } from "@tauri-apps/api/event";

export type EventHandler<T> = (payload: T) => void;

export function listenEvent<T>(
  eventName: string,
  handler: EventHandler<T>,
): Promise<UnlistenFn> {
  return listen<T>(eventName, ({ payload }) => handler(payload));
}

/**
 * Names of the events emitted by SnipDock's keyboard shortcuts. Only `open`
 * (Quick Paste) comes from an OS-wide shortcut; the rest are emitted by the
 * main window's own key handler (see `src/app/App.tsx`) and dispatched to
 * whichever page is on screen.
 */
export const ShortcutEvents = {
  open: "shortcut://open",
  search: "shortcut://search",
  copySelected: "shortcut://copy-selected",
  togglePin: "shortcut://toggle-pin",
  deleteSelected: "shortcut://delete-selected",
  toggleFavorite: "shortcut://toggle-favorite",
  navigateNext: "shortcut://navigate-next",
  navigatePrevious: "shortcut://navigate-previous",
} as const;
