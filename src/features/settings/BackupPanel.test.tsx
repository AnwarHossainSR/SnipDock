import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { describe, expect, test } from "bun:test";
import { mockTauri } from "../../test/setup";
import BackupPanel from "./BackupPanel";

describe("BackupPanel encrypted backup flow", () => {
  test("creates an encrypted backup with the entered password", async () => {
    let call: { command: string; args: unknown } | undefined;
    mockTauri((command, args) => {
      call = { command, args };
      return { path: "D:/safe.backup", checksum: "abc", created_at: "1" };
    });
    render(<BackupPanel />);

    const create = screen.getByRole("button", { name: "Create backup" }) as HTMLButtonElement;
    expect(create.disabled).toBe(true);
    fireEvent.change(screen.getByLabelText("Backup path"), {
      target: { value: "D:/safe.backup" },
    });
    fireEvent.change(screen.getByLabelText("Backup password"), {
      target: { value: "correct horse battery staple" },
    });
    fireEvent.click(create);

    await screen.findByText(/Checksum abc/);
    expect(call).toEqual({
      command: "create_backup",
      args: {
        input: {
          path: "D:/safe.backup",
          passphrase: "correct horse battery staple",
        },
      },
    });
  });

  test("previews restore without restarting", async () => {
    const calls: Array<{ command: string; args: unknown }> = [];
    mockTauri((command, args) => {
      calls.push({ command, args });
      return { schema_version: 2, item_count: 3, warnings: [], restart_required: false };
    });
    render(<BackupPanel />);

    fireEvent.change(screen.getByLabelText("Restore path"), {
      target: { value: "D:/safe.backup" },
    });
    fireEvent.change(screen.getByLabelText("Restore password"), {
      target: { value: "password" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Preview restore" }));

    await screen.findByText(/Restore preview: 3 items/);
    expect(calls).toEqual([{
      command: "restore_backup",
      args: { input: { path: "D:/safe.backup", passphrase: "password", dry_run: true } },
    }]);
  });

  test("restarts only after successful full restore", async () => {
    const calls: string[] = [];
    mockTauri((command) => {
      calls.push(command);
      if (command === "restore_backup") {
        return { schema_version: 2, item_count: 3, warnings: [], restart_required: true };
      }
    });
    const originalConfirm = window.confirm;
    window.confirm = () => true;
    try {
      render(<BackupPanel />);
      fireEvent.change(screen.getByLabelText("Restore path"), {
        target: { value: "D:/safe.backup" },
      });
      fireEvent.change(screen.getByLabelText("Restore password"), {
        target: { value: "password" },
      });
      fireEvent.click(screen.getByLabelText("Dry-run restore"));
      fireEvent.click(screen.getByRole("button", { name: "Restore" }));

      await waitFor(() => expect(calls).toEqual(["restore_backup", "restart_app"]));
    } finally {
      window.confirm = originalConfirm;
    }
  });
});
