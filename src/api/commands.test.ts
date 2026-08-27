import type { InvokeArgs } from "@tauri-apps/api/core";
import { emit } from "@tauri-apps/api/event";
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
      "delete_items",
      "restore_item",
      "clear_clipboard_history",
      "clear_clipboard_history_with_options",
      "copy_item",
      "save_manual_item",
      "read_clipboard_text",
      "direct_paste",
      "direct_paste_supported",
      "set_clipboard_tracking",
      "get_settings",
      "save_settings",
      "get_autostart",
      "set_autostart",
      "check_for_update",
      "install_update",
      "format_content",
      "export_data",
      "import_data",
      "create_backup",
      "restore_backup",
      "restart_app",
      "get_storage_size",
      "get_resource_usage",
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

  test("passes clear-history options as camelCase for Tauri's arg conversion", async () => {
    let received: InvokeArgs | undefined;
    mockTauri((command, args) => {
      expect(command).toBe("clear_clipboard_history_with_options");
      received = args;
      return { id: "receipt-1", item_count: 1, expires_at: "soon" };
    });

    await commands.clearClipboardHistoryWithOptions(true, false);
    expect(received).toEqual({ excludePinned: true, excludeFavorite: false });
  });

  test("sends manual saves with a null title rather than omitting it", async () => {
    let call: { command: string; args: unknown } | undefined;
    mockTauri((command, args) => {
      call = { command, args };
      return item;
    });

    await commands.saveManualItem({ content: "hello", title: null });

    expect(call).toEqual({
      command: "save_manual_item",
      args: { content: "hello", title: null },
    });
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
