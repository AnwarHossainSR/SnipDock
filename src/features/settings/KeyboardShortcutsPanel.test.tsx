import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it } from "bun:test";
import { mockTauri } from "../../test/setup";
import KeyboardShortcutsPanel from "./KeyboardShortcutsPanel";
import type { Settings } from "../../api/types";

function baseSettings(custom_shortcuts: Record<string, string> = {}): Settings {
  return {
    clipboard_tracking: true,
    history_days: 30,
    max_items: 500,
    ignored_apps: [],
    ignored_patterns: [],
    ignored_content_types: [],
    theme: "system",
    minimize_to_tray: true,
    start_with_system: true,
    formatter_indent: 2,
    clipboard_page_size: 100,
    custom_shortcuts,
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

describe("KeyboardShortcutsPanel", () => {
  beforeEach(() => {
    mockTauri(() => undefined);
  });

  afterEach(() => {
    // mockTauri sets globals; clearMocks in setup.ts handles teardown
  });

  it("renders one row per documented shortcut", async () => {
    render(
      <KeyboardShortcutsPanel
        settings={baseSettings()}
        onSave={async () => {}}
      />,
    );

    expect(await screen.findByText("Open Quick Paste")).toBeDefined();
    expect(screen.getByText("Focus main-window search")).toBeDefined();
    expect(screen.getByText("Copy selected")).toBeDefined();
    expect(screen.getByText("Toggle pin")).toBeDefined();
    expect(screen.getByText("Delete selected")).toBeDefined();
    expect(screen.getByText("Toggle favorite")).toBeDefined();
    expect(screen.getByText("Navigate next")).toBeDefined();
    expect(screen.getByText("Navigate previous")).toBeDefined();
  });

  it("shows the documented default binding on each row", async () => {
    render(
      <KeyboardShortcutsPanel
        settings={baseSettings()}
        onSave={async () => {}}
      />,
    );

    // 8 rows; each row displays its formatted default binding.
    const text = document.body.textContent ?? "";
    expect(text).toMatch(/Ctrl \+ Shift \+ V/);
    expect(text).toMatch(/Ctrl \+ Shift \+ F/);
    expect(text).toMatch(/Ctrl \+ Shift \+ C/);
    expect(text).toMatch(/Ctrl \+ Shift \+ P/);
    expect(text).toMatch(/Ctrl \+ Shift \+ Backspace/);
    expect(text).toMatch(/Ctrl \+ Shift \+ D/);
    expect(text).toMatch(/Ctrl \+ Shift \+ Right/);
    expect(text).toMatch(/Ctrl \+ Shift \+ Left/);
  });

  it("persists a rebind through onSave when committed with Enter", async () => {
    const saves: Array<Record<string, string>> = [];
    render(
      <KeyboardShortcutsPanel
        settings={baseSettings()}
        onSave={async (next) => { saves.push(next); }}
      />,
    );

    const row = (await screen.findAllByRole("listitem")).find((li) =>
      li.textContent?.includes("Focus main-window search"),
    );
    expect(row).toBeDefined();
    const input = row!.querySelector("input") as HTMLInputElement;
    fireEvent.change(input, { target: { value: "CmdOrCtrl+Shift+K" } });
    fireEvent.keyDown(input, { key: "Enter" });

    await waitFor(() => expect(saves).toEqual([
      { focus_main_window_search: "CmdOrCtrl+Shift+K" },
    ]));
  });

  it("clears the override when the field is committed empty", async () => {
    const saves: Array<Record<string, string>> = [];
    render(
      <KeyboardShortcutsPanel
        settings={baseSettings({ focus_main_window_search: "CmdOrCtrl+Shift+K" })}
        onSave={async (next) => { saves.push(next); }}
      />,
    );

    const row = (await screen.findAllByRole("listitem")).find((li) =>
      li.textContent?.includes("Focus main-window search"),
    );
    expect(row).toBeDefined();
    const input = row!.querySelector("input") as HTMLInputElement;
    expect(input.value).toBe("CmdOrCtrl+Shift+K");
    fireEvent.change(input, { target: { value: "" } });
    fireEvent.keyDown(input, { key: "Enter" });

    await waitFor(() => expect(saves).toEqual([{}]));
  });

  it("rejects an invalid grammar and does not save", async () => {
    const saves: Array<Record<string, string>> = [];
    render(
      <KeyboardShortcutsPanel
        settings={baseSettings()}
        onSave={async (next) => { saves.push(next); }}
      />,
    );

    const row = (await screen.findAllByRole("listitem")).find((li) =>
      li.textContent?.includes("Copy selected"),
    );
    const input = row!.querySelector("input") as HTMLInputElement;
    fireEvent.change(input, { target: { value: "Click+Shift+F" } });
    fireEvent.keyDown(input, { key: "Enter" });

    await new Promise((resolve) => setTimeout(resolve, 30));
    expect(saves).toEqual([]);
    const alerts = await screen.findAllByRole("alert");
    expect(alerts.length).toBeGreaterThan(0);
  });

  it("rejects a binding that collides with another shortcut", async () => {
    const saves: Array<Record<string, string>> = [];
    render(
      <KeyboardShortcutsPanel
        settings={baseSettings()}
        onSave={async (next) => { saves.push(next); }}
      />,
    );

    const row = (await screen.findAllByRole("listitem")).find((li) =>
      li.textContent?.includes("Focus main-window search"),
    );
    const input = row!.querySelector("input") as HTMLInputElement;
    fireEvent.change(input, { target: { value: "CmdOrCtrl+Shift+V" } });
    fireEvent.keyDown(input, { key: "Enter" });

    await new Promise((resolve) => setTimeout(resolve, 30));
    expect(saves).toEqual([]);
    const alerts = await screen.findAllByRole("alert");
    expect(alerts.some((node) => /Open Quick Paste/i.test(node.textContent ?? ""))).toBe(true);
  });

  it("shows the override marker on rows with a saved override", async () => {
    render(
      <KeyboardShortcutsPanel
        settings={baseSettings({ focus_main_window_search: "CmdOrCtrl+Shift+K" })}
        onSave={async () => {}}
      />,
    );

    expect(await screen.findByText(/Custom/)).toBeDefined();
  });
});
