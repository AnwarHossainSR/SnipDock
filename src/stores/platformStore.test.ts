import { describe, expect, test } from "bun:test";
import { mockTauri } from "../test/setup";
import {
  DESKTOP_CAPABILITIES,
  platformCapabilities,
  resetPlatformStore,
  usePlatformStore,
} from "./platformStore";

describe("platform capability store", () => {
  test("reads the matrix from the backend once", async () => {
    let calls = 0;
    mockTauri((command) => {
      if (command === "get_platform_capabilities") {
        calls += 1;
        return DESKTOP_CAPABILITIES;
      }
      throw new Error(`unexpected command ${command}`);
    });
    resetPlatformStore();

    await usePlatformStore.getState().load();

    expect(calls).toBe(1);
    expect(usePlatformStore.getState().status).toBe("ready");
    expect(platformCapabilities()).toEqual(DESKTOP_CAPABILITIES);
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
