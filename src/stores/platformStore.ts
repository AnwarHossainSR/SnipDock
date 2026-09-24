import { create } from "zustand";
import { commands } from "../api/commands";
import type { OperatingSystem, PlatformCapabilities } from "../api/types";

/**
 * What the running build can do, read once from the backend at startup.
 *
 * The backend is the only honest source: it is the half that would have to
 * answer the command behind a control. A user-agent check would put the same
 * knowledge in a second place and drift the first time a capability lands on
 * one platform only, so nothing in the view layer sniffs one.
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
  // Only a placeholder so the fallback is a complete matrix. Nothing reads the
  // OS through it: `useOsName` deliberately reads the *loaded* matrix, so a
  // label never names the wrong system while the real answer is in flight.
  os: "windows",
  clipboard_capture: true,
  // Windows-only in the real matrix; the desktop fallback is the permissive
  // one by design, since it only stands in until the backend answers.
  direct_paste: true,
  global_shortcuts: true,
  quick_paste: true,
  tray: true,
  autostart: true,
  cli: true,
  updater: true,
  resource_usage: true,
  source_app_detection: true,
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

/** Subscribe to one capability. `useCapability("tray")` in a component.
 *  `platform` and `os` are descriptions rather than capabilities, so they are
 *  excluded here; `useOsName` is the way to the latter. */
export function useCapability(
  name: keyof Omit<PlatformCapabilities, "platform" | "os">,
): boolean {
  return usePlatformStore(
    (state) => (state.capabilities ?? DESKTOP_CAPABILITIES)[name],
  );
}

const OS_NAMES: Record<OperatingSystem, string> = {
  windows: "Windows",
  macos: "macOS",
  linux: "Linux",
};

/**
 * What to call the operating system in a label, or null until the backend has
 * said which one it is.
 *
 * Reads `state.capabilities` rather than the desktop fallback on purpose: the
 * fallback exists so controls stay rendered before the matrix lands, and
 * guessing an OS there would put the wrong name on screen - which is the bug
 * this exists to fix, just with a shorter lifetime. Callers phrase the null
 * case neutrally.
 */
export function useOsName(): string | null {
  return usePlatformStore((state) =>
    state.capabilities ? OS_NAMES[state.capabilities.os] : null,
  );
}

export function resetPlatformStore() {
  usePlatformStore.setState({ capabilities: null, status: "loading" });
}
