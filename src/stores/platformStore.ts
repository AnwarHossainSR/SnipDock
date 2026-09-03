import { create } from "zustand";
import { commands } from "../api/commands";
import type { PlatformCapabilities } from "../api/types";

/**
 * What the running build can do, read once from the backend at startup.
 *
 * The backend is the only honest source: it is the half that would have to
 * answer the command behind a control, and on Android those commands are not
 * registered at all. A user-agent check would put the same knowledge in a
 * second place and drift the first time a capability lands on one platform
 * only, so nothing in the view layer sniffs one.
 */
export interface PlatformState {
  capabilities: PlatformCapabilities | null;
  status: "loading" | "ready" | "error";
  load: () => Promise<void>;
}

/**
 * Assumed until the real matrix arrives. The desktop set is the safe default:
 * the app has always been a desktop app, so a failed read renders what it
 * rendered before rather than hiding half the interface.
 */
export const DESKTOP_CAPABILITIES: PlatformCapabilities = {
  platform: "desktop",
  clipboard_capture: true,
  direct_paste: true,
  global_shortcuts: true,
  quick_paste: true,
  tray: true,
  autostart: true,
  cli: true,
  updater: true,
  resource_usage: true,
  source_app_detection: true,
  share_target: false,
  quick_settings_tile: false,
  sync: true,
};

export const usePlatformStore = create<PlatformState>((set) => ({
  capabilities: null,
  status: "loading",

  load: async () => {
    try {
      const capabilities = await commands.getPlatformCapabilities();
      set({ capabilities, status: "ready" });
    } catch {
      set({ capabilities: DESKTOP_CAPABILITIES, status: "error" });
    }
  },
}));

/** The matrix, falling back to the desktop set before the read lands. */
export function platformCapabilities(): PlatformCapabilities {
  return usePlatformStore.getState().capabilities ?? DESKTOP_CAPABILITIES;
}

/** Subscribe to one capability. `useCapability("tray")` in a component. */
export function useCapability(name: keyof Omit<PlatformCapabilities, "platform">): boolean {
  return usePlatformStore(
    (state) => (state.capabilities ?? DESKTOP_CAPABILITIES)[name],
  );
}

/** True on the Android build. Prefer a named capability where one exists. */
export function useIsAndroid(): boolean {
  return usePlatformStore(
    (state) => (state.capabilities ?? DESKTOP_CAPABILITIES).platform === "android",
  );
}

export function resetPlatformStore() {
  usePlatformStore.setState({ capabilities: null, status: "loading" });
}
