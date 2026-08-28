import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, test } from "bun:test";
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
