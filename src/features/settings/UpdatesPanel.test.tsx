import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, test } from "bun:test";
import { mockTauri } from "../../test/setup";
import UpdatesPanel from "./UpdatesPanel";

describe("UpdatesPanel", () => {
  test("reports when the app is already current", async () => {
    mockTauri((command) => {
      expect(command).toBe("check_for_update");
      return null;
    });
    render(<UpdatesPanel />);

    fireEvent.click(screen.getByRole("button", { name: "Check for updates" }));

    await screen.findByText("SnipDock is up to date.");
  });

  test("shows the available version and release notes before installing", async () => {
    mockTauri((command) => {
      expect(command).toBe("check_for_update");
      return { version: "0.2.0", notes: "- Faster search\n- Bug fixes", date: "2026-08-01" };
    });
    render(<UpdatesPanel />);

    fireEvent.click(screen.getByRole("button", { name: "Check for updates" }));

    await screen.findByText(/Version 0.2.0 is available/);
    expect(screen.getByText(/Released 2026-08-01/)).toBeDefined();
    expect(screen.getByText(/Faster search/)).toBeDefined();
    expect(screen.getByRole("button", { name: "Install and restart" })).toBeDefined();
  });

  test("surfaces a failure when the update check errors", async () => {
    mockTauri(() => {
      throw { code: "internal", message: "network unreachable" };
    });
    render(<UpdatesPanel />);

    fireEvent.click(screen.getByRole("button", { name: "Check for updates" }));

    await screen.findByText("network unreachable");
  });
});
