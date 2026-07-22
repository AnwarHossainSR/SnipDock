import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { describe, expect, test } from "bun:test";
import { mockTauri } from "../../test/setup";
import BackupPanel from "./BackupPanel";
import TransferPanel from "./TransferPanel";

describe("TransferPanel", () => {
  test("exports to the selected path and reports warnings", async () => {
    let call: { command: string; args: unknown } | undefined;
    mockTauri((command, args) => {
      call = { command, args };
      return { path: "D:/out.json", item_count: 2, warnings: ["plain text loses metadata"] };
    });
    render(<TransferPanel />);

    fireEvent.change(screen.getByLabelText("Export path"), {
      target: { value: "D:/out.json" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Export" }));

    await screen.findByText(/Exported 2 items/);
    expect(call).toEqual({
      command: "export_data",
      args: {
        input: {
          format: "json",
          item_ids: [],
          project_ids: [],
          path: "D:/out.json",
        },
      },
    });
  });

  test("previews import paths without replacing records by default", async () => {
    let call: { command: string; args: unknown } | undefined;
    mockTauri((command, args) => {
      call = { command, args };
      return { created: 1, updated: 0, skipped: 1, warnings: [] };
    });
    render(<TransferPanel />);

    fireEvent.change(screen.getByLabelText("Import paths, one per line"), {
      target: { value: "D:/a.md\nD:/b.json" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Preview import" }));

    await screen.findByText(/Preview: 1 created/);
    expect(call).toEqual({
      command: "import_data",
      args: {
        input: {
          paths: ["D:/a.md", "D:/b.json"],
          duplicate_policy: "skip",
          dry_run: true,
        },
      },
    });
  });
});

describe("BackupPanel", () => {
  test("creates and previews backups through typed commands", async () => {
    const calls: string[] = [];
    mockTauri((command) => {
      calls.push(command);
      if (command === "create_backup") {
        return { path: "D:/snipdock.backup", checksum: "abc", created_at: "1" };
      }
      return { schema_version: 1, item_count: 3, warnings: ["dry run"] };
    });
    render(<BackupPanel />);

    fireEvent.change(screen.getByLabelText("Backup path"), {
      target: { value: "D:/snipdock.backup" },
    });
    fireEvent.change(screen.getByLabelText("Backup password"), {
      target: { value: "password" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Create backup" }));
    await screen.findByText(/Checksum abc/);

    fireEvent.change(screen.getByLabelText("Restore path"), {
      target: { value: "D:/snipdock.backup" },
    });
    fireEvent.change(screen.getByLabelText("Restore password"), {
      target: { value: "password" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Preview restore" }));

    await waitFor(() => expect(calls).toEqual(["create_backup", "restore_backup"]));
  });
});
