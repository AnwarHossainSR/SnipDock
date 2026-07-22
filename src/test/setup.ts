import { GlobalRegistrator } from "@happy-dom/global-registrator";
import { afterEach } from "bun:test";
import { clearMocks, mockIPC, mockWindows } from "@tauri-apps/api/mocks";
import type { InvokeArgs } from "@tauri-apps/api/core";

GlobalRegistrator.register();

const { cleanup } = await import("@testing-library/react");

export function mockTauri(
  handler: (command: string, args?: InvokeArgs) => unknown,
) {
  mockWindows("main", "quick-paste");
  mockIPC(handler, { shouldMockEvents: true });
}

afterEach(() => {
  cleanup();
  clearMocks();
});
