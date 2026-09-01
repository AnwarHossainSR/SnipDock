import { invoke } from "@tauri-apps/api/core";
import type {
    BackupReceipt,
    BackupRequest,
    BackupRunReport,
    Category,
    ClearSensitiveResult,
    ContentType,
    CopyMode,
    CopyReceipt,
    DeleteReceipt,
    DuplicateGroup,
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
    Project,
    ResourceUsage,
    RestoreReport,
    RestoreRequest,
    SaveCategoryInput,
    SaveProjectInput,
    SaveSmartFolderInput,
    SaveTagInput,
    SearchQuery,
    Settings,
    SettingsPatch,
    SmartFolder,
    StorageSize,
    StoredImage,
    Tag,
    Transform,
    UpdateInfo,
    UsageAnalytics,
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
  "set_item_expiry",
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
  "largest_images",
  "get_resource_usage",
  "list_smart_folders",
  "get_smart_folder",
  "save_smart_folder",
  "delete_smart_folder",
  "reorder_smart_folders",
  "get_analytics",
  "find_duplicates",
  "merge_duplicates",
  "get_duplicate_count",
  "clear_sensitive_data",
  "move_item",
  "set_item_tags",
  "list_projects",
  "save_project",
  "list_categories",
  "save_category",
  "list_tags",
  "save_tag",
  "merge_tags",
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
   * while an empty list clears every type. `olderThanDays` spares anything
   * captured more recently than that.
   */
  clearClipboardHistoryWithOptions: (
    excludePinned: boolean,
    excludeFavorite: boolean,
    contentTypes: ContentType[] = [],
    olderThanDays: number | null = null,
  ) =>
    run<DeleteReceipt>("clear_clipboard_history_with_options", {
      excludePinned,
      excludeFavorite,
      contentTypes,
      olderThanDays,
    }),
  copyItem: (id: Id, mode: CopyMode, transform: Transform | null = null) =>
    run<CopyReceipt>("copy_item", { id, mode, transform }),
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
  directPaste: (id: Id, transform: Transform | null = null) =>
    run<CopyReceipt>("direct_paste", { id, transform }),
  directPasteSupported: () => run<boolean>("direct_paste_supported"),
  setClipboardTracking: (enabled: boolean) =>
    run<boolean>("set_clipboard_tracking", { enabled }),
  /**
   * Sets one capture's self-destruct time, or removes it with `null`. The
   * timestamp must be UTC RFC 3339; an expiry set here outranks a pin, because
   * it is the later and more specific instruction.
   */
  setItemExpiry: (id: Id, expiresAt: string | null) =>
    run<LibraryItem>("set_item_expiry", { id, expiresAt }),
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
  /** Stored images by the room they take, largest first. */
  largestImages: (limit = 20) => run<StoredImage[]>("largest_images", { limit }),
  /** Memory, CPU, and process count for SnipDock's own process tree. */
  getResourceUsage: () => run<ResourceUsage>("get_resource_usage"),
  /** Saved searches, in the order the user arranged them. */
  listSmartFolders: () => run<SmartFolder[]>("list_smart_folders"),
  getSmartFolder: (id: Id) => run<SmartFolder>("get_smart_folder", { id }),
  /** Creates when `input.id` is absent, updates when it is present. */
  saveSmartFolder: (input: SaveSmartFolderInput) =>
    run<SmartFolder>("save_smart_folder", { input }),
  deleteSmartFolder: (id: Id) => run<void>("delete_smart_folder", { id }),
  reorderSmartFolders: (ids: Id[]) => run<void>("reorder_smart_folders", { ids }),
  getAnalytics: () => run<UsageAnalytics>("get_analytics"),
  /** Groups of captures that share a content hash, largest group first. */
  findDuplicates: () => run<DuplicateGroup[]>("find_duplicates"),
  /**
   * Folds `duplicateIds` into `keepId`, adding their use counts to it, and
   * returns how many rows were removed.
   */
  mergeDuplicates: (keepId: Id, duplicateIds: Id[]) =>
    run<number>("merge_duplicates", { keepId, duplicateIds }),
  /** How many captures would disappear if every duplicate group were merged. */
  getDuplicateCount: () => run<number>("get_duplicate_count"),
  /**
   * Removes captures the backend flagged as sensitive that are older than
   * `maxAgeMinutes`. Passing 0 clears every one of them.
   */
  clearSensitiveData: (maxAgeMinutes: number) =>
    run<ClearSensitiveResult>("clear_sensitive_data", { maxAgeMinutes }),
  /** Files a capture under a project, or removes it from one with `null`. */
  moveItem: (id: Id, projectId: Id | null) =>
    run<LibraryItem>("move_item", { id, projectId }),
  /** Replaces the tags on a capture; an empty list removes them all. */
  setItemTags: (id: Id, tagIds: Id[]) =>
    run<LibraryItem>("set_item_tags", { id, tagIds }),
  listProjects: (includeArchived = false) =>
    run<Project[]>("list_projects", { includeArchived }),
  saveProject: (input: SaveProjectInput) => run<Project>("save_project", { input }),
  listCategories: () => run<Category[]>("list_categories"),
  saveCategory: (input: SaveCategoryInput) => run<Category>("save_category", { input }),
  /** Most-used first, so the sidebar lists the labels that earn their place. */
  listTags: () => run<Tag[]>("list_tags"),
  saveTag: (input: SaveTagInput) => run<Tag>("save_tag", { input }),
  /** Moves every assignment from `sourceId` onto `targetId` and drops the source. */
  mergeTags: (sourceId: Id, targetId: Id) =>
    run<Tag>("merge_tags", { sourceId, targetId }),
};
