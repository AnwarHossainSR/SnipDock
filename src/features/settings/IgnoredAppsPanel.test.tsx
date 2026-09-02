import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it } from "bun:test";
import { mockTauri } from "../../test/setup";
import IgnoredAppsPanel from "./IgnoredAppsPanel";
import type { Settings } from "../../api/types";

function baseSettings(ignored_apps: string[]): Settings {
  return {
    clipboard_tracking: true,
    history_days: 30,
    max_items: 500,
    ignored_apps,
    ignored_patterns: [],
    ignored_content_types: [],
    theme: "system",
    minimize_to_tray: true,
    start_with_system: true,
    formatter_indent: 2,
    clipboard_page_size: 100,
    custom_shortcuts: {},
    paste_format: "preserve",
    encryption_enabled: false,
    auto_clear_sensitive_minutes: null,
    updates: { notify: true, frequency: "on_launch", skipped_version: null, last_checked_at: null },
    backup: {
      schedule: "manual",
      local: true,
      local_dir: "",
      keep: 10,
      cloud: {
        provider: "none", bucket: "", region: "", endpoint: "", prefix: "",
        access_key_id: "", secret_access_key: "", passphrase: "",
      },
      last_run_at: null,
      last_result: null,
    },
  };
}

describe("IgnoredAppsPanel", () => {
  beforeEach(() => {
    // No foreground app by default; individual tests can override.
    mockTauri((command) => {
      if (command === "get_foreground_executable") return null;
      return undefined;
    });
  });

  it("renders an empty-state when no apps are listed", async () => {
    render(
      <IgnoredAppsPanel
        settings={baseSettings([])}
        onSave={async () => {}}
        className="grid gap-3"
      />,
    );

    expect(
      await screen.findByText(/No apps are being ignored/),
    ).toBeDefined();
    expect(screen.queryByRole("button", { name: /Add Code.exe/i })).toBeNull();
  });

  it("renders one row per entry with a Remove action", async () => {
    render(
      <IgnoredAppsPanel
        settings={baseSettings(["Code.exe", "firefox"])}
        onSave={async () => {}}
        className="grid gap-3"
      />,
    );

    expect(await screen.findByText("Code.exe")).toBeDefined();
    expect(screen.getByText("firefox")).toBeDefined();
    expect(screen.getByRole("button", { name: /Remove Code.exe/i })).toBeDefined();
    expect(screen.getByRole("button", { name: /Remove firefox/i })).toBeDefined();
  });

  it("persists a typed name on Add and clears the field", async () => {
    const saves: string[][] = [];
    render(
      <IgnoredAppsPanel
        settings={baseSettings([])}
        onSave={async (next) => { saves.push(next); }}
        className="grid gap-3"
      />,
    );

    const input = await screen.findByLabelText(/Add by executable name/i);
    fireEvent.change(input, { target: { value: "Code.exe" } });
    fireEvent.click(screen.getByRole("button", { name: /Add the typed executable/i }));

    await waitFor(() => expect(saves).toEqual([["Code.exe"]]));
    expect((input as HTMLInputElement).value).toBe("");
  });

  it("trims whitespace before saving", async () => {
    const saves: string[][] = [];
    render(
      <IgnoredAppsPanel
        settings={baseSettings([])}
        onSave={async (next) => { saves.push(next); }}
        className="grid gap-3"
      />,
    );

    const input = await screen.findByLabelText(/Add by executable name/i);
    fireEvent.change(input, { target: { value: "  Code.exe  " } });
    fireEvent.keyDown(input, { key: "Enter" });

    await waitFor(() => expect(saves).toEqual([["Code.exe"]]));
  });

  it("rejects an empty submission with an inline message and no save", async () => {
    const saves: string[][] = [];
    render(
      <IgnoredAppsPanel
        settings={baseSettings([])}
        onSave={async (next) => { saves.push(next); }}
        className="grid gap-3"
      />,
    );

    const input = await screen.findByLabelText(/Add by executable name/i);
    fireEvent.change(input, { target: { value: "   " } });
    fireEvent.keyDown(input, { key: "Enter" });

    expect(saves).toHaveLength(0);
    expect(await screen.findByText(/Type an executable name first/)).toBeDefined();
  });

  it("treats a duplicate typed entry as a no-op (no save, field clears)", async () => {
    const saves: string[][] = [];
    render(
      <IgnoredAppsPanel
        settings={baseSettings(["Code.exe"])}
        onSave={async (next) => { saves.push(next); }}
        className="grid gap-3"
      />,
    );

    const input = await screen.findByLabelText(/Add by executable name/i);
    fireEvent.change(input, { target: { value: "Code.exe" } });
    fireEvent.keyDown(input, { key: "Enter" });

    await new Promise((resolve) => setTimeout(resolve, 30));
    expect(saves).toHaveLength(0);
    expect((input as HTMLInputElement).value).toBe("");
  });

  it("removes an entry through its Remove action", async () => {
    const saves: string[][] = [];
    render(
      <IgnoredAppsPanel
        settings={baseSettings(["Code.exe", "firefox"])}
        onSave={async (next) => { saves.push(next); }}
        className="grid gap-3"
      />,
    );

    fireEvent.click(await screen.findByRole("button", { name: /Remove firefox/i }));

    await waitFor(() => expect(saves).toEqual([["Code.exe"]]));
  });

  it("appends the focused app when one is available", async () => {
    const saves: string[][] = [];
    mockTauri((command) => {
      if (command === "get_foreground_executable") return "Code.exe";
      return undefined;
    });
    render(
      <IgnoredAppsPanel
        settings={baseSettings([])}
        onSave={async (next) => { saves.push(next); }}
        className="grid gap-3"
      />,
    );

    const button = await screen.findByRole("button", { name: /Add currently focused app|Detect/i });
    expect((button as HTMLButtonElement).disabled).toBe(false);
    fireEvent.click(button);

    await waitFor(() => expect(saves).toEqual([["Code.exe"]]));
  });

  it("disables the focused-app button when no foreground executable resolves", async () => {
    render(
      <IgnoredAppsPanel
        settings={baseSettings([])}
        onSave={async () => {}}
        className="grid gap-3"
      />,
    );

    const button = await screen.findByRole("button", { name: /Add currently focused app|Detect/i });
    expect((button as HTMLButtonElement).disabled).toBe(false);
    expect(button.getAttribute("title")).toBe("Click to detect the currently focused app");
    fireEvent.click(button);

    await waitFor(() => expect(button.getAttribute("title")).toContain("No foreground app"));
    await waitFor(() => expect((button as HTMLButtonElement).disabled).toBe(true));
  });

  it("does not duplicate the entry when the focused app is already listed", async () => {
    const saves: string[][] = [];
    mockTauri((command) => {
      if (command === "get_foreground_executable") return "Code.exe";
      return undefined;
    });
    render(
      <IgnoredAppsPanel
        settings={baseSettings(["Code.exe"])}
        onSave={async (next) => { saves.push(next); }}
        className="grid gap-3"
      />,
    );

    const button = await screen.findByRole("button", { name: /Add currently focused app|Detect/i });
    expect((button as HTMLButtonElement).disabled).toBe(false);
    fireEvent.click(button);

    await waitFor(() => expect(screen.getByText(/already in the list/i)).toBeDefined());
    expect(saves).toHaveLength(0);
  });
});
