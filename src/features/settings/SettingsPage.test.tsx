import { render, screen } from "@testing-library/react";
import { expect, test } from "bun:test";
import { mockTauri } from "../../test/setup";
import SettingsPage from "./SettingsPage";

const settings = {
  clipboard_tracking: true,
  history_days: 30,
  max_items: 500,
  ignored_apps: [],
  ignored_patterns: [],
  ignored_content_types: [],
  auto_delete_days: null,
  open_shortcut: "CmdOrCtrl+Shift+V",
  new_snippet_shortcut: "CmdOrCtrl+Shift+N",
  theme: "system",
  minimize_to_tray: true,
  start_with_system: true,
  always_on_top: false,
  compact_mode: false,
  notifications: true,
  formatter_indent: 2,
  backup_interval_hours: 24,
  backup_retention: 7,
  auto_clear_secret_seconds: null,
  lock_after_minutes: null,
};

test("shows runtime-backed settings and omits persistence-only controls", async () => {
  mockTauri((command) => (command === "get_autostart" ? true : settings));
  render(<SettingsPage />);

  expect(await screen.findByLabelText("Track clipboard changes")).toBeDefined();
  expect(screen.getByLabelText("Theme")).toBeDefined();
  expect(screen.getByLabelText(/Formatter indent/)).toBeDefined();
  expect(screen.getByLabelText("Minimize to tray")).toBeDefined();
  expect(screen.queryByLabelText("Compact mode")).toBeNull();
  expect(screen.queryByLabelText("Always on top")).toBeNull();
  expect(screen.getByLabelText("Start with Windows")).toBeDefined();
  expect(screen.queryByLabelText("Show notifications")).toBeNull();
  expect(screen.queryByLabelText(/Auto-clear secrets/)).toBeNull();
  expect(screen.queryByLabelText(/Lock app after/)).toBeNull();
  expect(screen.queryByLabelText(/Backup every/)).toBeNull();
  expect(screen.queryByLabelText(/Keep backups/)).toBeNull();
  for (const heading of ["Capture and retention", "Theme and window", "Import and export", "Manual backup and restore", "Local by default"]) {
    expect(screen.getByRole("heading", { name: heading })).toBeDefined();
  }
  expect(screen.queryByRole("heading", { name: "Runtime behavior" })).toBeNull();
  expect(screen.queryByRole("navigation", { name: "Settings sections" })).toBeNull();
  expect(screen.getByText(/Normal launches contact GitHub Releases only for signed updates/)).toBeDefined();
});
