import { invoke } from "@tauri-apps/api/core";
import type {
    BackupReceipt,
    BackupRequest,
    BackupRunReport,
    ContentType,
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
    LocalBackup,
    ManualItemInput,
    Page,
    ResourceUsage,
    RestoreReport,
    RestoreRequest,
    SearchQuery,
    Settings,
    SettingsPatch,
    StorageSize,
    UpdateInfo,
} from "./types";

export const commandNames = [
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
  "run_backup_now",
  "test_backup_destination",
  "list_local_backups",
  "restore_local_backup",
  "restart_app",
  "get_storage_size",
  "get_resource_usage",
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
  deleteItems: (ids: Id[]) => run<DeleteReceipt>("delete_items", { ids }),
  restoreItem: (receiptId: Id) =>
    run<LibraryItem>("restore_item", { receiptId }),
  clearClipboardHistory: () =>
    run<DeleteReceipt>("clear_clipboard_history"),
  /**
   * Clears clipboard history. `contentTypes` narrows the sweep to those types
   * only - `["image"]` clears the captured images and leaves everything else -
   * while an empty list clears every type.
   */
  clearClipboardHistoryWithOptions: (
    excludePinned: boolean,
    excludeFavorite: boolean,
    contentTypes: ContentType[] = [],
  ) =>
    run<DeleteReceipt>("clear_clipboard_history_with_options", {
      excludePinned,
      excludeFavorite,
      contentTypes,
    }),
  copyItem: (id: Id, mode: CopyMode) =>
    run<CopyReceipt>("copy_item", { id, mode }),
  /**
   * Stores content the user entered by hand. The backend detects its type and
   * files it as an ordinary clipboard item, so it behaves exactly like a
   * capture from here on.
   */
  saveManualItem: (input: ManualItemInput) =>
    run<LibraryItem>("save_manual_item", {
      content: input.content,
      title: input.title,
    }),
  /** Current system clipboard text, for the manual save form's paste button. */
  readClipboardText: () => run<string>("read_clipboard_text"),
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
  /** Backs up to every destination turned on in Settings and records the run. */
  runBackupNow: () => run<BackupRunReport>("run_backup_now"),
  /**
   * Writes and removes a probe object, so a misconfigured bucket is caught in
   * Settings rather than at the first scheduled run.
   */
  testBackupDestination: () => run<string>("test_backup_destination"),
  /** Scheduled copies and pre-upgrade snapshots, newest first. */
  listLocalBackups: () => run<LocalBackup[]>("list_local_backups"),
  /**
   * Stages one of the files `listLocalBackups` returned. Only those paths are
   * accepted, and the swap happens on the next launch so a bad snapshot can
   * still be rolled back.
   */
  restoreLocalBackup: (path: string, dryRun: boolean) =>
    run<RestoreReport>("restore_local_backup", { path, dryRun }),
  restartApp: () => run<void>("restart_app"),
  getStorageSize: () => run<StorageSize>("get_storage_size"),
  /** Memory, CPU, and process count for SnipDock's own process tree. */
  getResourceUsage: () => run<ResourceUsage>("get_resource_usage"),
};
