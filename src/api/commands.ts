import { invoke } from "@tauri-apps/api/core";
import type {
    BackupReceipt,
    BackupRequest,
    CopyMode,
    CopyReceipt,
    DeleteReceipt,
    ExportReceipt,
    ExportRequest,
    FormatRequest,
    FormatResult,
    Id,
    ImportReport,
    ImportRequest,
    ItemFlags,
    LibraryItem,
    Page,
    RestoreReport,
    RestoreRequest,
    SearchQuery,
    Settings,
    SettingsPatch,
    UpdateInfo,
} from "./types";

export const commandNames = [
  "search_items",
  "set_item_flags",
  "delete_item",
  "restore_item",
  "clear_clipboard_history",
  "clear_clipboard_history_with_options",
  "copy_item",
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
] as const;

type CommandName = (typeof commandNames)[number];

export class CommandError extends Error {
  readonly code: string;

  constructor(code: string, message: string, cause?: unknown) {
    super(message, { cause });
    this.name = "CommandError";
    this.code = code;
  }
}

function normalizeError(error: unknown): CommandError {
  if (error instanceof CommandError) return error;
  if (
    typeof error === "object" &&
    error !== null &&
    "code" in error &&
    "message" in error &&
    typeof error.code === "string" &&
    typeof error.message === "string"
  ) {
    return new CommandError(error.code, error.message, error);
  }
  if (error instanceof Error) {
    return new CommandError("internal", error.message, error);
  }
  return new CommandError(
    "internal",
    typeof error === "string" ? error : "Command failed",
    error,
  );
}

async function run<T>(command: CommandName, args?: Record<string, unknown>): Promise<T> {
  try {
    return await invoke<T>(command, args);
  } catch (error) {
    throw normalizeError(error);
  }
}

export const commands = {
  searchItems: (query: SearchQuery) =>
    run<Page<LibraryItem>>("search_items", { query }),
  setItemFlags: (id: Id, flags: ItemFlags) =>
    run<LibraryItem>("set_item_flags", { id, flags }),
  deleteItem: (id: Id) => run<DeleteReceipt>("delete_item", { id }),
  restoreItem: (receiptId: Id) =>
    run<LibraryItem>("restore_item", { receiptId }),
  clearClipboardHistory: () =>
    run<DeleteReceipt>("clear_clipboard_history"),
  clearClipboardHistoryWithOptions: (excludePinned: boolean, excludeFavorite: boolean) =>
    run<DeleteReceipt>("clear_clipboard_history_with_options", {
      exclude_pinned: excludePinned,
      exclude_favorite: excludeFavorite,
    }),
  copyItem: (id: Id, mode: CopyMode) =>
    run<CopyReceipt>("copy_item", { id, mode }),
  directPaste: (id: Id) => run<CopyReceipt>("direct_paste", { id }),
  directPasteSupported: () => run<boolean>("direct_paste_supported"),
  setClipboardTracking: (enabled: boolean) =>
    run<boolean>("set_clipboard_tracking", { enabled }),
  getSettings: () => run<Settings>("get_settings"),
  saveSettings: (input: SettingsPatch) =>
    run<Settings>("save_settings", { input }),
  getAutostart: () => run<boolean>("get_autostart"),
  setAutostart: (enabled: boolean) => run<boolean>("set_autostart", { enabled }),
  checkForUpdate: () => run<UpdateInfo | null>("check_for_update"),
  installUpdate: () => run<boolean>("install_update"),
  formatContent: (input: FormatRequest) =>
    run<FormatResult>("format_content", { input }),
  exportData: (input: ExportRequest) =>
    run<ExportReceipt>("export_data", { input }),
  importData: (input: ImportRequest) =>
    run<ImportReport>("import_data", { input }),
  createBackup: (input: BackupRequest) =>
    run<BackupReceipt>("create_backup", { input }),
  restoreBackup: (input: RestoreRequest) =>
    run<RestoreReport>("restore_backup", { input }),
  restartApp: () => run<void>("restart_app"),
};
