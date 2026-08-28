import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { expect, test } from "bun:test";
import type { InvokeArgs } from "@tauri-apps/api/core";
import { mockTauri } from "../../test/setup";
import SettingsPage from "./SettingsPage";

const settings = {
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
  updates: {
    notify: true,
    frequency: "on_launch",
    skipped_version: null,
    last_checked_at: null,
  },
  backup: {
    schedule: "manual",
    local: true,
    local_dir: "",
    keep: 10,
    cloud: {
      provider: "none",
      bucket: "",
      region: "",
      endpoint: "",
      prefix: "",
      access_key_id: "",
      secret_access_key: "",
      passphrase: "",
    },
    last_run_at: null,
    last_result: null,
  },
};

/**
 * Commands the panels fire on mount that are not what any test here is about.
 * The window reads as hidden so the update hook does not run a check of its
 * own, whose `last_checked_at` write would show up as an extra saved setting.
 */
function ambientCommands(command: string): unknown | undefined {
  if (command === "get_autostart") return true;
  if (command === "plugin:app|version") return "0.1.12";
  if (command === "plugin:window|is_visible") return false;
  if (command === "check_for_update") return null;
  if (command === "list_local_backups") return [];
  return undefined;
}

/** Records every save and echoes the merged settings back, like the backend does. */
function mockSettings(options: { failSave?: boolean; holdSave?: boolean } = {}) {
  const saves: Record<string, unknown>[] = [];
  let current: Record<string, unknown> = { ...settings };
  let releaseSave: (() => void) | undefined;

  mockTauri((command, args?: InvokeArgs) => {
    const ambient = ambientCommands(command);
    if (ambient !== undefined) return ambient;
    if (command === "save_settings") {
      const values = (args as { input: { values: Record<string, unknown> } }).input.values;
      saves.push(values);
      if (options.failSave) throw new Error("Disk is full.");
      current = { ...current, ...values };
      if (options.holdSave) {
        const settled = { ...current };
        return new Promise((resolve) => {
          releaseSave = () => resolve(settled);
        });
      }
      return { ...current };
    }
    return { ...current };
  });

  return { saves, release: () => releaseSave?.() };
}

test("shows runtime-backed settings and omits persistence-only controls", async () => {
  mockTauri((command) => ambientCommands(command) ?? settings);
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
  for (const heading of ["Capture and retention", "Theme and window", "Import and export", "Backup and restore", "Local by default"]) {
    expect(screen.getByRole("heading", { name: heading })).toBeDefined();
  }
  expect(screen.queryByRole("heading", { name: "Runtime behavior" })).toBeNull();
  expect(screen.getByRole("navigation", { name: "Settings sections" })).toBeDefined();
  expect(screen.getByText(/Normal launches contact GitHub Releases only for signed updates/)).toBeDefined();
});

test("scopes the themed control styling to every settings panel", async () => {
  mockSettings();
  render(<SettingsPage />);

  await screen.findByLabelText("Track clipboard changes");
  // The Backup panel loads settings on its own, so waiting for the page's load
  // is not enough: its controls can still be a render behind.
  await screen.findByLabelText("Keep a copy on this computer");
  const form = document.querySelector(".settings-form");
  expect(form).not.toBeNull();
  for (const label of ["Track clipboard changes", "Theme", "Paste format", "Dry-run preview", "Keep a copy on this computer"]) {
    expect(screen.getByLabelText(label).closest(".settings-form")).toBe(form);
  }
});

test("saves a typed number once, on blur", async () => {
  const { saves } = mockSettings();
  render(<SettingsPage />);

  const field = await screen.findByLabelText(/History retention/);
  fireEvent.change(field, { target: { value: "3" } });
  fireEvent.change(field, { target: { value: "36" } });
  fireEvent.change(field, { target: { value: "365" } });
  expect(saves).toHaveLength(0);

  fireEvent.blur(field);

  await waitFor(() => expect(saves).toEqual([{ history_days: 365 }]));
});

test("commits a number on Enter", async () => {
  const { saves } = mockSettings();
  render(<SettingsPage />);

  const field = await screen.findByLabelText(/Formatter indent/);
  fireEvent.change(field, { target: { value: "4" } });
  fireEvent.keyDown(field, { key: "Enter" });

  await waitFor(() => expect(saves).toEqual([{ formatter_indent: 4 }]));

  // Leaving the field afterwards must not save the same value a second time.
  fireEvent.blur(field);
  await act(async () => {
    await new Promise((resolve) => setTimeout(resolve, 50));
  });
  expect(saves).toEqual([{ formatter_indent: 4 }]);
});

test("rejects an empty numeric field and restores the saved value", async () => {
  const { saves } = mockSettings();
  render(<SettingsPage />);

  const field = await screen.findByLabelText(/Maximum items/) as HTMLInputElement;
  fireEvent.change(field, { target: { value: "" } });
  fireEvent.blur(field);

  expect(saves).toHaveLength(0);
  await waitFor(() => expect(field.value).toBe("500"));
  expect(screen.getByText("Enter a whole number between 10 and 10,000.")).toBeDefined();
});

test("rejects an out-of-range value, then saves one inside the range", async () => {
  const { saves } = mockSettings();
  render(<SettingsPage />);

  const field = await screen.findByLabelText(/Maximum items/) as HTMLInputElement;
  fireEvent.change(field, { target: { value: "50000" } });
  fireEvent.blur(field);

  expect(saves).toHaveLength(0);
  const rangeMessage = await screen.findByText("Enter a whole number between 10 and 10,000.");
  expect(rangeMessage).toBeDefined();
  expect(field.getAttribute("aria-invalid")).toBe("true");

  fireEvent.change(field, { target: { value: "2000" } });
  fireEvent.blur(field);

  await waitFor(() => expect(saves).toEqual([{ max_items: 2000 }]));
  expect(screen.queryByText("Enter a whole number between 10 and 10,000.")).toBeNull();
});

test("saves a multi-line field once, on blur", async () => {
  const { saves } = mockSettings();
  render(<SettingsPage />);

  const field = await screen.findByLabelText("Ignored text patterns");
  fireEvent.change(field, { target: { value: "^ghp_" } });
  fireEvent.change(field, { target: { value: "^ghp_[A-Za-z0-9]{36}$" } });
  expect(saves).toHaveLength(0);

  fireEvent.blur(field);

  await waitFor(() => expect(saves).toEqual([{ ignored_patterns: ["^ghp_[A-Za-z0-9]{36}$"] }]));
});

test("saves a checkbox immediately", async () => {
  const { saves } = mockSettings();
  render(<SettingsPage />);

  fireEvent.click(await screen.findByLabelText("Track clipboard changes"));

  await waitFor(() => expect(saves).toEqual([{ clipboard_tracking: false }]));
});

test("shows a visible save confirmation that clears itself", async () => {
  mockSettings();
  render(<SettingsPage />);

  const field = await screen.findByLabelText(/History retention/);
  fireEvent.change(field, { target: { value: "60" } });
  fireEvent.blur(field);

  const status = await screen.findByText("Setting saved.");
  expect(status.closest(".sr-only")).toBeNull();
  expect(status.closest("[aria-live]")?.getAttribute("aria-live")).toBe("polite");

  // The message clears itself on a timer, with no user action.
  await act(async () => {
    await new Promise((resolve) => setTimeout(resolve, 3_200));
  });
  expect(screen.queryByText("Setting saved.")).toBeNull();
});

test("keeps a failure visible until the next edit", async () => {
  mockSettings({ failSave: true });
  render(<SettingsPage />);

  const field = await screen.findByLabelText(/History retention/);
  fireEvent.change(field, { target: { value: "60" } });
  fireEvent.blur(field);

  const alert = await screen.findByRole("alert");
  expect(alert.textContent).toBe("Disk is full.");

  await act(async () => {
    await new Promise((resolve) => setTimeout(resolve, 50));
  });
  expect(screen.getByRole("alert").textContent).toBe("Disk is full.");

  fireEvent.change(field, { target: { value: "90" } });
  fireEvent.blur(field);
  await waitFor(() => expect(screen.queryByText("Disk is full.")).toBeNull());
});

test("keeps text typed into another field while a save is in flight", async () => {
  const { release } = mockSettings({ holdSave: true });
  render(<SettingsPage />);

  const retention = await screen.findByLabelText(/History retention/);
  fireEvent.change(retention, { target: { value: "60" } });
  fireEvent.blur(retention);
  await screen.findByText("Saving…");

  // The user keeps typing in a different field before the save lands.
  const maxItems = screen.getByLabelText(/Maximum items/) as HTMLInputElement;
  fireEvent.change(maxItems, { target: { value: "2000" } });

  await act(async () => {
    release();
    await Promise.resolve();
  });
  await waitFor(() => expect(screen.queryByText("Saving…")).toBeNull());

  expect(maxItems.value).toBe("2000");
  expect((retention as HTMLInputElement).value).toBe("60");
});

test("shows a pending indicator while a save is in flight", async () => {
  const { release } = mockSettings({ holdSave: true });
  render(<SettingsPage />);

  const field = await screen.findByLabelText(/History retention/);
  fireEvent.change(field, { target: { value: "60" } });
  fireEvent.blur(field);

  expect(await screen.findByText("Saving…")).toBeDefined();

  await act(async () => {
    release();
    await Promise.resolve();
  });
  await waitFor(() => expect(screen.queryByText("Saving…")).toBeNull());
  expect(screen.getByText("Setting saved.")).toBeDefined();
});
