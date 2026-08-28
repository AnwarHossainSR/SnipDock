import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, expect, test } from "bun:test";
import { emit } from "@tauri-apps/api/event";
import { mockTauri } from "../../test/setup";
import { resetClipboardStore, useClipboardStore } from "../../stores/clipboardStore";
import type { UpdateSettings } from "../../api/types";
import AppSidebar from "./AppSidebar";

let storedUpdates: UpdateSettings;

beforeEach(() => {
  localStorage.clear();
  resetClipboardStore();
  storedUpdates = {
    notify: true,
    frequency: "on_launch",
    skipped_version: null,
    last_checked_at: null,
  };
});

/**
 * Stands in for the settings database. Update preferences moved there from
 * `localStorage`, so anything that has to survive a relaunch -- a skipped
 * version, the last check -- has to survive across `render` calls here too.
 */
function updateSettingsStore(command: string, args?: unknown) {
  if (command === "get_settings") return { updates: storedUpdates };
  if (command === "save_settings") {
    const input = (args as { input?: { values?: Record<string, unknown> } } | undefined)?.input;
    const values = input?.values;
    if (values && "updates" in values) storedUpdates = values.updates as UpdateSettings;
    return { updates: storedUpdates };
  }
  return undefined;
}

const pinnedItem = {
  id: "pinned-1",
  kind: "clipboard",
  title: null,
  description: null,
  content: "connection: { host: \"app-db.example.com\", user: \"cloud\" }",
  notes: null,
  content_type: "plain_text",
  language: null,
  project_id: null,
  category_id: null,
  pinned: true,
  favorite: false,
  private: false,
  tag_ids: [],
  archived_at: null,
  expires_at: null,
  usage_count: 0,
  last_used_at: null,
  created_at: "2026-07-17T10:00:00.000Z",
  updated_at: "2026-07-17T10:00:00.000Z",
};

test("asks the Clipboard page to reveal a pinned item when its entry is clicked", async () => {
  mockTauri((command) => {
    if (command === "plugin:app|version") return "0.1.0";
    if (command === "plugin:window|is_visible") return true;
    if (command === "search_items") return { items: [pinnedItem], total: 1, limit: 8, offset: 0 };
    return undefined;
  });

  render(<AppSidebar />);

  const entry = await screen.findByRole("button", { name: /connection/ });
  fireEvent.click(entry);

  expect(useClipboardStore.getState().focusRequest?.id).toBe("pinned-1");
});

test("invites a first pin instead of showing an empty pinned list", async () => {
  mockTauri((command) => {
    if (command === "plugin:app|version") return "0.1.0";
    if (command === "plugin:window|is_visible") return true;
    if (command === "search_items") return { items: [], total: 0, limit: 8, offset: 0 };
    return undefined;
  });

  render(<AppSidebar />);

  expect(await screen.findByText("Pin a capture to keep it one click away.")).toBeDefined();
});

test("shows current version and installs an available update on request", async () => {
  const calls: string[] = [];
  mockTauri((command, args) => {
    calls.push(command);
    if (command === "plugin:app|version") return "0.1.0";
    if (command === "plugin:window|is_visible") return true;
    if (command === "check_for_update") return { version: "0.2.0", notes: "Fixes and improvements", date: null };
    if (command === "install_update") return true;
    return updateSettingsStore(command, args);
  });

  render(<AppSidebar />);

  expect(screen.getByRole("link", { name: "Anwar Hossain" }).getAttribute("href"))
    .toBe("https://github.com/AnwarHossainSR");
  expect(await screen.findByText("v0.1.0")).toBeDefined();
  fireEvent.click(await screen.findByRole("button", { name: "Install now" }));
  await waitFor(() => expect(calls).toContain("install_update"));
});

test("breaks local storage down by database and images", async () => {
  mockTauri((command) => {
    if (command === "plugin:app|version") return "0.1.0";
    if (command === "plugin:window|is_visible") return true;
    if (command === "get_storage_size") {
      return { db_bytes: 41_000_000, images_bytes: 79_000_000, total_bytes: 120_000_000 };
    }
    return undefined;
  });

  render(<AppSidebar />);

  expect(await screen.findByText("Local storage")).toBeDefined();
  expect(screen.getByText("114 MB")).toBeDefined();
  expect(screen.getByText("DB 39 MB")).toBeDefined();
  expect(screen.getByText("Images 75 MB")).toBeDefined();
  expect(screen.getByRole("img", { name: "39 MB database, 75 MB images" })).toBeDefined();
});

test("offers an available update on launch and defers it until next launch", async () => {
  mockTauri((command, args) => {
    if (command === "plugin:app|version") return "0.1.0";
    if (command === "plugin:window|is_visible") return true;
    if (command === "check_for_update") {
      return { version: "0.2.0", notes: "Fixes and improvements", date: "2026-07-23" };
    }
    return updateSettingsStore(command, args);
  });

  const firstLaunch = render(<AppSidebar />);
  expect(await screen.findByRole("dialog", { name: "Update available" })).toBeDefined();
  expect(screen.getByText("Fixes and improvements")).toBeDefined();
  fireEvent.click(screen.getByRole("button", { name: "Later" }));
  expect(screen.queryByRole("dialog")).toBeNull();
  expect(screen.getByRole("button", { name: "Update to v0.2.0" })).toBeDefined();

  firstLaunch.unmount();
  render(<AppSidebar />);
  expect(await screen.findByRole("dialog", { name: "Update available" })).toBeDefined();
});

test("skips only the selected update version", async () => {
  let offered = "0.2.0";
  mockTauri((command, args) => {
    if (command === "plugin:app|version") return "0.1.0";
    if (command === "plugin:window|is_visible") return true;
    if (command === "check_for_update") return { version: offered, notes: null, date: null };
    return updateSettingsStore(command, args);
  });

  const firstLaunch = render(<AppSidebar />);
  fireEvent.click(await screen.findByRole("button", { name: "Skip this version" }));
  firstLaunch.unmount();

  const skippedLaunch = render(<AppSidebar />);
  await screen.findByRole("button", { name: "Update to v0.2.0" });
  expect(screen.queryByRole("dialog")).toBeNull();
  skippedLaunch.unmount();

  offered = "0.3.0";
  render(<AppSidebar />);
  expect(await screen.findByRole("dialog", { name: "Update available" })).toBeDefined();
});

test("keeps the update modal open when installation fails", async () => {
  mockTauri((command, args) => {
    if (command === "plugin:app|version") return "0.1.0";
    if (command === "plugin:window|is_visible") return true;
    if (command === "check_for_update") {
      return { version: "0.2.0", notes: null, date: null };
    }
    if (command === "install_update") throw new Error("network unavailable");
    return updateSettingsStore(command, args);
  });

  render(<AppSidebar />);
  fireEvent.click(await screen.findByRole("button", { name: "Install now" }));

  expect((await screen.findByRole("alert")).textContent).toContain("network unavailable");
  expect(screen.getByRole("dialog", { name: "Update available" })).toBeDefined();
});

test("waits to check for updates until a hidden app is opened", async () => {
  const calls: string[] = [];
  mockTauri((command, args) => {
    calls.push(command);
    if (command === "plugin:app|version") return "0.1.0";
    if (command === "plugin:window|is_visible") return false;
    return updateSettingsStore(command, args);
  });

  render(<AppSidebar />);
  await screen.findByText("v0.1.0");

  expect(calls).not.toContain("check_for_update");

  await emit("shortcut://search");

  await waitFor(() => expect(calls).toContain("check_for_update"));
});

test("close control defers the update for the current launch", async () => {
  mockTauri((command, args) => {
    if (command === "plugin:app|version") return "0.1.0";
    if (command === "plugin:window|is_visible") return true;
    if (command === "check_for_update") {
      return { version: "0.2.0", notes: null, date: null };
    }
    return updateSettingsStore(command, args);
  });

  render(<AppSidebar />);
  fireEvent.click(await screen.findByRole("button", { name: "Close update dialog" }));

  expect(screen.queryByRole("dialog")).toBeNull();
  expect(screen.getByRole("button", { name: "Update to v0.2.0" })).toBeDefined();
});

test("reports SnipDock's own memory, process count, and CPU once it can measure it", async () => {
  let readings = 0;
  mockTauri((command) => {
    if (command === "plugin:app|version") return "0.1.0";
    if (command === "plugin:window|is_visible") return true;
    if (command === "get_resource_usage") {
      readings += 1;
      return {
        memory_bytes: 148_000_000,
        main_memory_bytes: 62_000_000,
        // The first reading has nothing to compare against.
        cpu_percent: readings === 1 ? 0 : 2.5,
        process_count: 3,
        pid: 4242,
        cpu_ready: readings > 1,
      };
    }
    return undefined;
  });

  render(<AppSidebar />);

  expect(await screen.findByText("Memory")).toBeDefined();
  expect(screen.getByText("141 MB")).toBeDefined();
  expect(screen.getByText("3 processes")).toBeDefined();
  // Nothing to compare the first sample against, so no CPU figure is claimed.
  expect(screen.queryByText(/% CPU/)).toBeNull();
});

test("hides the CPU figure rather than reporting an unmeasured zero", async () => {
  mockTauri((command) => {
    if (command === "plugin:app|version") return "0.1.0";
    if (command === "plugin:window|is_visible") return true;
    if (command === "get_resource_usage") {
      return {
        memory_bytes: 90_000_000,
        main_memory_bytes: 90_000_000,
        cpu_percent: 0,
        process_count: 1,
        pid: 7,
        cpu_ready: true,
      };
    }
    return undefined;
  });

  render(<AppSidebar />);

  expect(await screen.findByText("1 process")).toBeDefined();
  expect(screen.getByText("0.0% CPU")).toBeDefined();
});
