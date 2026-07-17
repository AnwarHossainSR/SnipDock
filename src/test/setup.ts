import { GlobalRegistrator } from "@happy-dom/global-registrator";
import { afterEach } from "bun:test";
import { clearMocks, mockIPC } from "@tauri-apps/api/mocks";
import type { InvokeArgs } from "@tauri-apps/api/core";

GlobalRegistrator.register();

export function mockTauri(
  handler: (command: string, args?: InvokeArgs) => unknown,
) {
  mockIPC(handler, { shouldMockEvents: true });
}

afterEach(clearMocks);
