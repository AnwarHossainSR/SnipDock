import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { describe, expect, test } from "bun:test";
import { emit } from "@tauri-apps/api/event";
import type { UpdateSettings } from "../../api/types";
import StatusBar from "../../app/components/StatusBar";
import { mockTauri } from "../../test/setup";
import UpdatesPanel from "./UpdatesPanel";

/**
 * The panel mounts `useAppUpdate`, which reads the app version and settings and
 * may run its own background check, so every test needs those answered. Update
 * results are supplied per test through `update`.
 */
function mockUpdates(update: unknown, options: { visible?: boolean } = {}) {
  mockTauri((command) => {
    if (command === "plugin:app|version") return "0.1.12";
    // Hidden by default so the panel's own "Check for updates" is the only
    // check that runs, and assertions cannot race a background one.
    if (command === "plugin:window|is_visible") return options.visible ?? false;
    if (command === "get_settings") {
      return {
        updates: {
          notify: true,
          frequency: "on_launch",
          skipped_version: null,
          last_checked_at: null,
        },
      };
    }
    if (command === "check_for_update") {
      if (typeof update === "function") return (update as () => unknown)();
      return update;
    }
    return undefined;
  });
}

describe("UpdatesPanel", () => {
  test("shows the installed version before anything is checked", async () => {
    mockUpdates(null);
    render(<UpdatesPanel />);

    expect(await screen.findByText("v0.1.12")).toBeDefined();
    expect(screen.getByText("Never checked")).toBeDefined();
    expect((screen.getByRole("button", { name: "Install update" }) as HTMLButtonElement).disabled)
      .toBe(true);
  });

  test("reports when the app is already current", async () => {
    mockUpdates(null);
    render(<UpdatesPanel />);

    fireEvent.click(screen.getByRole("button", { name: "Check for updates" }));

    await screen.findByText("SnipDock is up to date. Nothing to install.");
  });

  test("a check run by hand moves Last checked", async () => {
    mockUpdates(null);
    render(<UpdatesPanel />);
    await screen.findByText("Never checked");

    fireEvent.click(screen.getByRole("button", { name: "Check for updates" }));

    expect(await screen.findByText(/^Last checked /)).toBeDefined();
  });

  test("shows the available version and release notes before installing", async () => {
    mockUpdates({ version: "0.2.0", notes: "- Faster search\n- Bug fixes", date: "2026-08-01" });
    render(<UpdatesPanel />);

    fireEvent.click(screen.getByRole("button", { name: "Check for updates" }));

    await screen.findByText(/Version 0.2.0 is available/);
    expect(screen.getByText(/released 2026-08-01/)).toBeDefined();
    expect(screen.getByText(/Faster search/)).toBeDefined();
  });

  /**
   * The install button used to be disabled unless the release body parsed into
   * changelog sections, so a release published with no notes -- or notes that
   * were plain prose -- could not be installed from here at all.
   */
  test("offers the install even when the release has no notes", async () => {
    mockUpdates({ version: "0.2.0", notes: "", date: null });
    render(<UpdatesPanel />);

    fireEvent.click(screen.getByRole("button", { name: "Check for updates" }));

    const install = (await screen.findByRole("button", {
      name: "Install v0.2.0 and restart",
    })) as HTMLButtonElement;
    expect(install.disabled).toBe(false);
    expect(screen.getByText("No release notes were published for this version.")).toBeDefined();
  });

  test("surfaces a failure when the update check errors", async () => {
    mockUpdates(() => {
      throw { code: "internal", message: "network unreachable" };
    });
    render(<UpdatesPanel />);

    fireEvent.click(screen.getByRole("button", { name: "Check for updates" }));

    await screen.findByText("network unreachable");
  });
});

/**
 * While Settings is open the status strip is on screen too, and both read the
 * update preferences. Each used to keep its own copy and write all of it back,
 * so the strip's stale copy could undo a choice made in this panel.
 */
describe("UpdatesPanel beside the status strip", () => {
  const HOUR = 60 * 60 * 1000;

  function mockBackend(initial: UpdateSettings, visible: boolean) {
    const calls: string[] = [];
    let stored = initial;
    mockTauri((command, args) => {
      calls.push(command);
      if (command === "plugin:app|version") return "0.1.12";
      if (command === "plugin:window|is_visible") return visible;
      if (command === "get_settings") return { updates: stored };
      if (command === "save_settings") {
        const values = (args as { input: { values: { updates?: UpdateSettings } } }).input.values;
        if (values.updates) stored = values.updates;
        return { updates: stored };
      }
      if (command === "check_for_update") return { version: "0.2.0", notes: null, date: null };
      return undefined;
    });
    return {
      checks: () => calls.filter((command) => command === "check_for_update").length,
      stored: () => stored,
    };
  }

  /** Lets an event's async handlers finish before asserting nothing happened. */
  async function settle() {
    await act(() => new Promise((resolve) => setTimeout(resolve, 50)));
  }

  test("notifications turned off here stay off when the strip checks later", async () => {
    // Daily and last checked yesterday: due, but the window starts hidden, so
    // nothing checks until it is shown from the tray.
    const backend = mockBackend(
      {
        notify: true,
        frequency: "daily",
        skipped_version: null,
        last_checked_at: new Date(Date.now() - 25 * HOUR).toISOString(),
      },
      false,
    );
    render(
      <>
        <StatusBar />
        <UpdatesPanel />
      </>,
    );

    const notify = await screen.findByRole("switch", { name: "Tell me when an update is available" });
    await waitFor(() => expect((notify as HTMLButtonElement).disabled).toBe(false));
    fireEvent.click(notify);
    await waitFor(() => expect(backend.stored().notify).toBe(false));

    await act(() => emit("app://shown"));
    await settle();

    expect(backend.stored().notify).toBe(false);
    expect(backend.checks()).toBe(0);
  });

  test("opening Settings is not another launch, and shows what the launch check found", async () => {
    const backend = mockBackend(
      { notify: true, frequency: "on_launch", skipped_version: null, last_checked_at: null },
      true,
    );
    render(<StatusBar />);
    await waitFor(() => expect(backend.checks()).toBe(1));

    render(<UpdatesPanel />);

    expect(await screen.findByText(/Version 0.2.0 is available/)).toBeDefined();
    await settle();
    expect(backend.checks()).toBe(1);
  });
});
