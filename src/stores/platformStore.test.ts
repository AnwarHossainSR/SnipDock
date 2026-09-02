import { describe, expect, test } from "bun:test";
import { mockTauri } from "../test/setup";
import type { PlatformCapabilities } from "../api/types";
import {
  DESKTOP_CAPABILITIES,
  platformCapabilities,
  resetPlatformStore,
  usePlatformStore,
} from "./platformStore";

const android: PlatformCapabilities = {
  platform: "android",
  clipboard_capture: false,
  direct_paste: false,
  global_shortcuts: false,
  quick_paste: false,
  tray: false,
  autostart: false,
  cli: false,
  updater: false,
  resource_usage: false,
  source_app_detection: false,
  share_target: true,
  quick_settings_tile: true,
  sync: true,
};

describe("platform capability store", () => {
  test("reads the matrix from the backend once", async () => {
    let calls = 0;
    mockTauri((command) => {
      if (command === "get_platform_capabilities") {
        calls += 1;
        return android;
      }
      throw new Error(`unexpected command ${command}`);
    });
    resetPlatformStore();

    await usePlatformStore.getState().load();

    expect(calls).toBe(1);
    expect(usePlatformStore.getState().status).toBe("ready");
    expect(platformCapabilities()).toEqual(android);
  });

  test("an Android matrix hides the capabilities the platform cannot provide", async () => {
    mockTauri(() => android);
    resetPlatformStore();

    await usePlatformStore.getState().load();

    const capabilities = platformCapabilities();
    expect(capabilities.clipboard_capture).toBe(false);
    expect(capabilities.direct_paste).toBe(false);
    expect(capabilities.global_shortcuts).toBe(false);
    expect(capabilities.quick_paste).toBe(false);
    expect(capabilities.tray).toBe(false);
    expect(capabilities.autostart).toBe(false);
    expect(capabilities.cli).toBe(false);
    expect(capabilities.updater).toBe(false);
  });

  test("falls back to the desktop set when the read fails", async () => {
    mockTauri(() => {
      throw new Error("no backend");
    });
    resetPlatformStore();

    await usePlatformStore.getState().load();

    expect(usePlatformStore.getState().status).toBe("error");
    expect(platformCapabilities()).toEqual(DESKTOP_CAPABILITIES);
  });

  test("reads as desktop before the matrix arrives", () => {
    resetPlatformStore();
    expect(usePlatformStore.getState().capabilities).toBeNull();
    expect(platformCapabilities()).toEqual(DESKTOP_CAPABILITIES);
  });
});
