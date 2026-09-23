import { GlobalRegistrator } from "@happy-dom/global-registrator";
import { afterEach } from "bun:test";
import { clearMocks, mockIPC, mockWindows } from "@tauri-apps/api/mocks";
import type { InvokeArgs } from "@tauri-apps/api/core";

GlobalRegistrator.register();

const { cleanup } = await import("@testing-library/react");
const { resetClipboardStore } = await import("../stores/clipboardStore");
const { resetPlatformStore } = await import("../stores/platformStore");

export function mockTauri(
  handler: (command: string, args?: InvokeArgs) => unknown,
) {
  mockWindows("main", "quick-paste");
  mockIPC(handler, { shouldMockEvents: true });
}

// Every test file runs in one process, so the stores are shared by all of
// them. A test that left a filter set - SourceAppList's last one leaves the
// source filter on "Code.exe" - handed it to whatever file ran next, and an
// App test then found "Nothing from this source" where it expected the empty
// history; capabilities an App test loaded likewise put "Start with Windows"
// where a Settings test expected the neutral label. Which file runs next
// depends on the machine: the first failed in CI only, and the second under
// `bun test --randomize`. Resetting here means no test depends on its
// neighbours.
afterEach(() => {
  cleanup();
  clearMocks();
  resetClipboardStore();
  resetPlatformStore();
});
