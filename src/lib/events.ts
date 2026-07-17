import { listen, type UnlistenFn } from "@tauri-apps/api/event";

export type EventHandler<T> = (payload: T) => void;

export function listenEvent<T>(
  eventName: string,
  handler: EventHandler<T>,
): Promise<UnlistenFn> {
  return listen<T>(eventName, ({ payload }) => handler(payload));
}
