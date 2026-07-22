import { listen, type UnlistenFn } from "@tauri-apps/api/event";

export type EventHandler<T> = (payload: T) => void;

export function listenEvent<T>(
  eventName: string,
  handler: EventHandler<T>,
): Promise<UnlistenFn> {
  return listen<T>(eventName, ({ payload }) => handler(payload));
}

/**
 * Names of the events emitted by SnipDock's global (OS-wide) keyboard
 * shortcuts. `open` shows Quick Paste, while `search` raises the main window.
 * The rest are dispatched to whichever main-window page is on screen.
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
