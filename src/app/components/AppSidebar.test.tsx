import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, expect, test } from "bun:test";
import { emit } from "@tauri-apps/api/event";
import { mockTauri } from "../../test/setup";
import { resetClipboardStore, useClipboardStore } from "../../stores/clipboardStore";
import { useStorageStore } from "../../stores/storageStore";
import type { UpdateSettings } from "../../api/types";
import AppSidebar from "./AppSidebar";

let storedUpdates: UpdateSettings;

beforeEach(() => {
  localStorage.clear();
  resetClipboardStore();
  useStorageStore.setState({ size: null });
  window.location.hash = "";
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
  // The Sources section in the sidebar reads this on mount; an empty list is
  // the right answer for every test that does not care about sources.
  if (command === "get_source_app_counts") return [];
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

const GIB = 1024 ** 3;

function mockStorage(total: number, full = false) {
  mockTauri((command) => {
    if (command === "plugin:app|version") return "0.1.0";
    if (command === "plugin:window|is_visible") return true;
    if (command === "get_storage_size") {
      return { db_bytes: total / 4, images_bytes: (total * 3) / 4, total_bytes: total, limit_bytes: GIB, full };
    }
    return undefined;
  });
}

test("measures storage against the configured limit", async () => {
  mockStorage(120_000_000);

  render(<AppSidebar trackingPaused={false} />);

  expect(await screen.findByText("114 MB / 1.0 GB")).toBeDefined();
  const meter = screen.getByRole("meter", { name: "Storage used" });
  expect(meter.getAttribute("aria-valuenow")).toBe("11");
  expect(meter.getAttribute("aria-valuetext")).toBe("114 MB of 1.0 GB");
  expect(screen.queryByRole("status")).toBeNull();
  expect(screen.getByText("Capturing")).toBeDefined();
});

test("warns once storage passes three quarters of the limit", async () => {
  mockStorage(0.8 * GIB);

  render(<AppSidebar trackingPaused={false} />);

  expect((await screen.findByRole("status")).textContent).toContain(
    "Storage 80% full. Capture stops at 1.0 GB.",
  );
  // Still recording until the limit itself is reached.
  expect(screen.getByText("Capturing")).toBeDefined();
});

test("says capture has stopped when storage is full, and leads to the limit", async () => {
  mockStorage(GIB, true);

  render(<AppSidebar trackingPaused={false} />);

  expect((await screen.findByRole("alert")).textContent).toContain(
    "Storage full. New copies are not being saved.",
  );
  expect(screen.getByText("Stopped")).toBeDefined();
  expect(screen.getByText("· storage full")).toBeDefined();
  expect(screen.queryByText("Capturing")).toBeNull();

  fireEvent.click(screen.getByRole("button", { name: "Free space" }));
  expect(window.location.hash).toBe("#settings");
});

test("a paused session reads as paused, not stopped, when storage is full", async () => {
  mockStorage(GIB, true);

  render(<AppSidebar trackingPaused />);

  await screen.findByRole("alert");
  expect(screen.getByText("Paused")).toBeDefined();
  expect(screen.queryByText("Stopped")).toBeNull();
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
        cpu_cores: 8,
        process_count: 3,
        pid: 4242,
        cpu_ready: readings > 1,
      };
    }
    return undefined;
  });

  render(<AppSidebar />);

  expect(await screen.findByText("141 MB")).toBeDefined();
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
        cpu_cores: 8,
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

// Each library section used to be a shrinkable flex child of the fixed-height
// sidebar, so flexbox squeezed all of them to fit and none scrolled: a saved
// search was cut through its text, and Projects vanished behind the status
// card. They now share one scroll region, with the status card outside it.
test("keeps every library section in one scroll region, above the status card", async () => {
  // Saved searches, tags and projects each render nothing when empty, so this
  // needs one of each to have a section to find.
  const stamp = "2026-07-17T10:00:00.000Z";
  mockTauri((command, args) => {
    if (command === "list_smart_folders") {
      return [{ id: "f1", name: "Deploy commands", description: null, query: {}, icon: "terminal", color: "#12695a", position: 0, created_at: stamp, updated_at: stamp }];
    }
    if (command === "list_tags") return [{ id: "t1", name: "api", color: "#12695a", usage_count: 1 }];
    if (command === "list_projects") {
      return [{ id: "p1", name: "Storefront", description: null, archived_at: null, created_at: stamp, updated_at: stamp }];
    }
    return updateSettingsStore(command, args);
  });
  render(<AppSidebar />);

  const library = await screen.findByTestId("sidebar-library");
  for (const heading of ["Pinned", "Saved searches", "Tags", "Projects"]) {
    await waitFor(() =>
      expect(
        [...library.querySelectorAll("p")].some((p) => p.textContent?.trim().startsWith(heading)),
        `${heading} is outside the scroll region`,
      ).toBe(true),
    );
  }
  expect(library.className).toContain("overflow-y-auto");
  // The status card has to stay put while the library scrolls.
  const status = screen.getByText(/stored locally/).closest("div.rounded-lg");
  expect(status).not.toBeNull();
  expect(library.contains(status)).toBe(false);
});
