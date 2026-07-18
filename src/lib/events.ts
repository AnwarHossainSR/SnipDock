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
 * shortcuts. `open`, `search`, and `newSnippet` also raise the main window;
 * the rest are dispatched to whichever page is currently on screen.
 */
export const ShortcutEvents = {
  open: "shortcut://open",
  search: "shortcut://search",
  copySelected: "shortcut://copy-selected",
  togglePin: "shortcut://toggle-pin",
  deleteSelected: "shortcut://delete-selected",
  newSnippet: "shortcut://new-snippet",
  toggleFavorite: "shortcut://toggle-favorite",
  navigateNext: "shortcut://navigate-next",
  navigatePrevious: "shortcut://navigate-previous",
} as const;
