import { invoke } from "@tauri-apps/api/core";
import type {
  BackupReceipt,
  BackupRequest,
  Category,
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
  Project,
  RenderTemplateRequest,
  RenderTemplateResult,
  RestoreReport,
  RestoreRequest,
  SaveCategoryInput,
  SaveItemInput,
  SaveProjectInput,
  SaveTagInput,
  SearchQuery,
  Settings,
  SettingsPatch,
  Tag,
  ToolRequest,
  ToolResult,
  UnlockRequest,
  UnlockResult,
} from "./types";

export const commandNames = [
  "search_items",
  "get_item",
  "save_item",
  "duplicate_item",
  "set_item_flags",
  "move_item",
  "delete_item",
  "restore_item",
  "clear_clipboard_history",
  "copy_item",
  "list_projects",
  "save_project",
  "list_tags",
  "save_tag",
  "merge_tags",
  "list_categories",
  "save_category",
  "get_settings",
  "save_settings",
  "format_content",
  "render_template",
  "run_tool",
  "export_data",
  "import_data",
  "create_backup",
  "restore_backup",
  "lock_app",
  "unlock_app",
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
  getItem: (id: Id) => run<LibraryItem>("get_item", { id }),
  saveItem: (input: SaveItemInput) => run<LibraryItem>("save_item", { input }),
  duplicateItem: (id: Id) => run<LibraryItem>("duplicate_item", { id }),
  setItemFlags: (id: Id, flags: ItemFlags) =>
    run<LibraryItem>("set_item_flags", { id, flags }),
  moveItem: (id: Id, projectId: Id | null) =>
    run<LibraryItem>("move_item", { id, projectId }),
  deleteItem: (id: Id) => run<DeleteReceipt>("delete_item", { id }),
  restoreItem: (receiptId: Id) =>
    run<LibraryItem>("restore_item", { receiptId }),
  clearClipboardHistory: () =>
    run<DeleteReceipt>("clear_clipboard_history"),
  copyItem: (id: Id, mode: CopyMode) =>
    run<CopyReceipt>("copy_item", { id, mode }),
  listProjects: (includeArchived: boolean) =>
    run<Project[]>("list_projects", { includeArchived }),
  saveProject: (input: SaveProjectInput) =>
    run<Project>("save_project", { input }),
  listTags: () => run<Tag[]>("list_tags"),
  saveTag: (input: SaveTagInput) => run<Tag>("save_tag", { input }),
  mergeTags: (sourceId: Id, targetId: Id) =>
    run<Tag>("merge_tags", { sourceId, targetId }),
  listCategories: () => run<Category[]>("list_categories"),
  saveCategory: (input: SaveCategoryInput) =>
    run<Category>("save_category", { input }),
  getSettings: () => run<Settings>("get_settings"),
  saveSettings: (input: SettingsPatch) =>
    run<Settings>("save_settings", { input }),
  formatContent: (input: FormatRequest) =>
    run<FormatResult>("format_content", { input }),
  renderTemplate: (input: RenderTemplateRequest) =>
    run<RenderTemplateResult>("render_template", { input }),
  runTool: (input: ToolRequest) => run<ToolResult>("run_tool", { input }),
  exportData: (input: ExportRequest) =>
    run<ExportReceipt>("export_data", { input }),
  importData: (input: ImportRequest) =>
    run<ImportReport>("import_data", { input }),
  createBackup: (input: BackupRequest) =>
    run<BackupReceipt>("create_backup", { input }),
  restoreBackup: (input: RestoreRequest) =>
    run<RestoreReport>("restore_backup", { input }),
  lockApp: () => run<void>("lock_app"),
  unlockApp: (input: UnlockRequest) =>
    run<UnlockResult>("unlock_app", { input }),
};
