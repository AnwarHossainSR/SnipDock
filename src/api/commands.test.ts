import { emit } from "@tauri-apps/api/event";
import type { InvokeArgs } from "@tauri-apps/api/core";
import { describe, expect, test } from "bun:test";
import { mockTauri } from "../test/setup";
import { CommandError, commandNames, commands } from "./commands";
import { listenEvent } from "./events";
import type { LibraryItem } from "./types";

const item: LibraryItem = {
  id: "item-1",
  kind: "clipboard",
  title: "Example",
  description: null,
  content: "hello",
  notes: null,
  content_type: "plain_text",
  language: null,
  project_id: null,
  category_id: null,
  pinned: false,
  favorite: false,
  private: false,
  tag_ids: [],
  archived_at: null,
  expires_at: null,
  usage_count: 0,
  last_used_at: null,
  created_at: "2026-07-17T00:00:00.000Z",
  updated_at: "2026-07-17T00:00:00.000Z",
};

describe("typed Tauri commands", () => {
  test("wraps the complete stable command surface", () => {
    expect(commandNames).toEqual([
      "search_items",
      "set_item_flags",
      "delete_item",
      "restore_item",
      "clear_clipboard_history",
      "copy_item",
      "set_clipboard_tracking",
      "get_settings",
      "save_settings",
      "get_autostart",
      "set_autostart",
      "check_for_update",
      "install_update",
      "format_content",
      "run_tool",
      "export_data",
      "import_data",
      "create_backup",
      "restore_backup",
      "restart_app",
    ]);
  });

  test("passes clipboard tracking state to Rust", async () => {
    let received: InvokeArgs | undefined;
    mockTauri((command, args) => {
      expect(command).toBe("set_clipboard_tracking");
      received = args;
      return false;
    });

    expect(await commands.setClipboardTracking(false)).toBe(false);
    expect(received).toEqual({ enabled: false });
  });

  test("passes autostart state under the Rust parameter name", async () => {
    let call: { command: string; args: unknown } | undefined;
    mockTauri((command, args) => {
      call = { command, args };
      return true;
    });

    await expect(commands.setAutostart(true)).resolves.toBe(true);
    expect(call).toEqual({ command: "set_autostart", args: { enabled: true } });
  });

  test("normalizes structured backend errors", async () => {
    mockTauri(() => {
      throw { code: "internal", message: "database unavailable" };
    });

    const error = await commands.getSettings().catch((reason) => reason);

    expect(error).toBeInstanceOf(CommandError);
    expect(error).toMatchObject({
      code: "internal",
      message: "database unavailable",
    });
  });

  test("normalizes non-structured failures without exposing objects", async () => {
    mockTauri(() => {
      throw "offline";
    });

    await expect(commands.getSettings()).rejects.toMatchObject({
      code: "internal",
      message: "offline",
    });
  });
});

test("typed event listener receives payload and returns unlisten", async () => {
  mockTauri(() => undefined);
  const received: LibraryItem[] = [];
  const unlisten = await listenEvent<LibraryItem>("clipboard://captured", (payload) => {
    received.push(payload);
  });

  await emit("clipboard://captured", item);
  expect(received).toEqual([item]);

  await unlisten();
});
