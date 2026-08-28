import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { describe, expect, test } from "bun:test";
import { mockTauri } from "../../test/setup";
import type { BackupSettings } from "../../api/types";
import BackupPanel from "./BackupPanel";

function backupSettings(overrides: Partial<BackupSettings> = {}): BackupSettings {
  return {
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
    ...overrides,
  };
}

const snapshot = {
  path: "D:/data/backups/backup-20260828T090000Z.sqlite",
  name: "backup-20260828T090000Z.sqlite",
  bytes: 2_400_000,
  modified_at: "2026-08-28T09:00:00.000Z",
  pre_upgrade: false,
};

const preUpgrade = {
  path: "D:/data/backups/pre-upgrade-20260810T080000Z-schema5-to6.sqlite",
  name: "pre-upgrade-20260810T080000Z-schema5-to6.sqlite",
  bytes: 2_100_000,
  modified_at: "2026-08-10T08:00:00.000Z",
  pre_upgrade: true,
};

describe("BackupPanel", () => {
  test("saves the whole backup object so untouched fields survive an edit", async () => {
    const saved: unknown[] = [];
    mockTauri((command, args) => {
      if (command === "get_settings") {
        return { backup: backupSettings({ cloud: { ...backupSettings().cloud, bucket: "keep-me" } }) };
      }
      if (command === "save_settings") {
        const values = (args as { input?: { values?: Record<string, unknown> } })?.input?.values;
        saved.push(values?.backup);
        return { backup: values?.backup };
      }
      if (command === "list_local_backups") return [];
      return undefined;
    });

    render(<BackupPanel />);
    fireEvent.click(await screen.findByRole("button", { name: "Weekly" }));

    // A patch replaces the `backup` key outright, so a partial write here would
    // blank every field the form did not touch.
    await waitFor(() => expect(saved).toHaveLength(1));
    expect(saved[0]).toMatchObject({
      schedule: "weekly",
      local: true,
      keep: 10,
      cloud: { bucket: "keep-me" },
    });
  });

  test("reports where a backup was written", async () => {
    mockTauri((command) => {
      if (command === "get_settings") return { backup: backupSettings() };
      if (command === "list_local_backups") return [snapshot];
      if (command === "run_backup_now") {
        return {
          local_path: "D:/data/backups/backup-20260828T090000Z.sqlite",
          cloud_url: null,
          bytes: 2_400_000,
          created_at: "2026-08-28T09:00:00.000Z",
          warnings: [],
        };
      }
      return undefined;
    });

    render(<BackupPanel />);
    fireEvent.click(await screen.findByRole("button", { name: "Back up now" }));

    expect((await screen.findByRole("status")).textContent).toContain(
      "saved to D:/data/backups/backup-20260828T090000Z.sqlite",
    );
  });

  test("marks the snapshots taken before an update and offers to restore them", async () => {
    const calls: Array<{ command: string; args: unknown }> = [];
    mockTauri((command, args) => {
      calls.push({ command, args });
      if (command === "get_settings") return { backup: backupSettings() };
      if (command === "list_local_backups") return [snapshot, preUpgrade];
      if (command === "restore_local_backup") {
        return { schema_version: 6, item_count: 812, warnings: [], restart_required: true };
      }
      return undefined;
    });
    const originalConfirm = window.confirm;
    window.confirm = () => true;
    try {
      render(<BackupPanel />);

      // The automatic snapshot is labelled: it is the safety net, and telling it
      // apart from a scheduled copy is the whole reason to list them together.
      expect(await screen.findByText(preUpgrade.name)).toBeDefined();
      expect(screen.getByText("Before update")).toBeDefined();

      fireEvent.click(screen.getAllByRole("button", { name: "Restore" })[1]);

      await waitFor(() =>
        expect(calls.map((call) => call.command)).toContain("restore_local_backup"),
      );
      const restore = calls.find((call) => call.command === "restore_local_backup");
      expect(restore?.args).toEqual({ path: preUpgrade.path, dryRun: false });
      await waitFor(() => expect(calls.map((call) => call.command)).toContain("restart_app"));
    } finally {
      window.confirm = originalConfirm;
    }
  });

  test("previews a restore from an encrypted file without restarting", async () => {
    const calls: Array<{ command: string; args: unknown }> = [];
    mockTauri((command, args) => {
      calls.push({ command, args });
      if (command === "get_settings") return { backup: backupSettings() };
      if (command === "list_local_backups") return [];
      if (command === "restore_backup") {
        return { schema_version: 2, item_count: 3, warnings: [], restart_required: false };
      }
      return undefined;
    });

    render(<BackupPanel />);
    fireEvent.change(await screen.findByLabelText("Backup file path"), {
      target: { value: "D:/safe.backup" },
    });
    fireEvent.change(screen.getByLabelText("Backup password"), { target: { value: "password" } });
    fireEvent.click(screen.getByRole("button", { name: "Preview" }));

    await screen.findByText(/Preview: 3 items/);
    expect(calls.find((call) => call.command === "restore_backup")?.args).toEqual({
      input: { path: "D:/safe.backup", passphrase: "password", dry_run: true },
    });
    expect(calls.map((call) => call.command)).not.toContain("restart_app");
  });

  test("exports a one-off encrypted file through create_backup", async () => {
    const calls: Array<{ command: string; args: unknown }> = [];
    mockTauri((command, args) => {
      calls.push({ command, args });
      if (command === "get_settings") return { backup: backupSettings() };
      if (command === "list_local_backups") return [];
      if (command === "create_backup") {
        return { path: "D:/snipdock.backup", checksum: "abc", created_at: "1" };
      }
      return undefined;
    });

    render(<BackupPanel />);
    fireEvent.change(await screen.findByLabelText("Save to"), {
      target: { value: "D:/snipdock.backup" },
    });
    fireEvent.change(screen.getByLabelText("Password for this file"), {
      target: { value: "password" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Create backup" }));

    await screen.findByText(/Checksum abc/);
    expect(calls.find((call) => call.command === "create_backup")?.args).toEqual({
      input: { path: "D:/snipdock.backup", passphrase: "password" },
    });
  });

  test("checks a cloud destination before trusting it with a scheduled backup", async () => {
    mockTauri((command) => {
      if (command === "get_settings") {
        return {
          backup: backupSettings({
            cloud: {
              provider: "r2",
              bucket: "snipdock",
              region: "auto",
              endpoint: "https://account.r2.cloudflarestorage.com",
              prefix: "",
              access_key_id: "key",
              secret_access_key: "secret",
              passphrase: "pass",
            },
          }),
        };
      }
      if (command === "list_local_backups") return [];
      if (command === "test_backup_destination") {
        return "Wrote and removed https://account.r2.cloudflarestorage.com/snipdock/.snipdock-connection-test.snipdock.";
      }
      return undefined;
    });

    render(<BackupPanel />);
    fireEvent.click(await screen.findByRole("button", { name: "Test connection" }));

    expect((await screen.findByRole("status")).textContent).toContain("Wrote and removed");
  });
});
