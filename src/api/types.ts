export type Id = string;
export type ItemKind = "clipboard" | "snippet" | "command" | "template" | "note";
export type ContentType =
  | "plain_text"
  | "code"
  | "json"
  | "sql"
  | "html"
  | "css"
  | "xml"
  | "shell"
  | "markdown"
  | "config";
export type SortOrder = "newest" | "oldest" | "most_used";
export type JsonValue =
  | null
  | boolean
  | number
  | string
  | JsonValue[]
  | { [key: string]: JsonValue };

export interface LibraryItem {
  id: Id;
  kind: ItemKind;
  title: string | null;
  description: string | null;
  content: string;
  notes: string | null;
  content_type: ContentType;
  language: string | null;
  project_id: Id | null;
  category_id: Id | null;
  pinned: boolean;
  favorite: boolean;
  private: boolean;
  tag_ids: Id[];
  archived_at: string | null;
  expires_at: string | null;
  usage_count: number;
  last_used_at: string | null;
  created_at: string;
  updated_at: string;
}

export interface SearchQuery {
  text: string | null;
  kinds: ItemKind[];
  content_types: ContentType[];
  languages: string[];
  project_ids: Id[];
  category_ids: Id[];
  tag_ids: Id[];
  pinned: boolean | null;
  favorite: boolean | null;
  created_from: string | null;
  created_to: string | null;
  sort: SortOrder;
  limit: number;
  offset: number;
}

export interface Page<T> {
  items: T[];
  total: number;
  limit: number;
  offset: number;
}

export interface Project {
  id: Id;
  name: string;
  description: string | null;
  archived_at: string | null;
  created_at: string;
  updated_at: string;
}

export interface Tag {
  id: Id;
  name: string;
  color: string;
  usage_count: number;
}

export interface Category {
  id: Id;
  name: string;
  built_in: boolean;
}

export interface SaveItemInput {
  id: Id | null;
  kind: ItemKind;
  title: string | null;
  description: string | null;
  content: string;
  notes: string | null;
  project_id: Id | null;
  category_id: Id | null;
  tag_ids: Id[];
  private: boolean;
  expires_at: string | null;
}

export interface ItemFlags {
  pinned: boolean | null;
  favorite: boolean | null;
  archived: boolean | null;
}

export type CopyMode = "raw" | "formatted" | "rendered_template";

export interface CopyReceipt {
  item_id: Id;
  copied_at: string;
  auto_clear_at: string | null;
}

export interface DeleteReceipt {
  id: Id;
  item_count: number;
  expires_at: string;
}

export interface SaveProjectInput {
  id: Id | null;
  name: string;
  description: string | null;
  tag_ids: Id[];
  archived?: boolean | null;
}

export interface SaveTagInput {
  id: Id | null;
  name: string;
  color: string;
}

export interface SaveCategoryInput {
  id: Id | null;
  name: string;
}

export interface Settings {
  clipboard_tracking: boolean;
  history_days: number;
  max_items: number;
  ignored_apps: string[];
  ignored_patterns: string[];
  ignored_content_types: ContentType[];
  auto_delete_days: number | null;
  open_shortcut: string;
  new_snippet_shortcut: string;
  theme: string;
  start_with_os: boolean;
  minimize_to_tray: boolean;
  always_on_top: boolean;
  compact_mode: boolean;
  notifications: boolean;
  formatter_indent: number;
  backup_interval_hours: number;
  backup_retention: number;
  auto_clear_secret_seconds: number | null;
  lock_after_minutes: number | null;
}

export interface SettingsPatch {
  values: Record<string, JsonValue>;
}

export type FormatOperation = "pretty" | "minify" | "validate";

export interface FormatRequest {
  content: string;
  content_type: ContentType;
  operation: FormatOperation;
}

export interface Diagnostic {
  message: string;
  line: number | null;
  column: number | null;
}

export interface FormatResult {
  output: string;
  valid: boolean;
  diagnostics: Diagnostic[];
}

export interface RenderTemplateRequest {
  template: string;
  values: Record<string, string>;
}

export interface RenderTemplateResult {
  output: string | null;
  missing: string[];
  diagnostics: Diagnostic[];
}

export interface ToolRequest {
  tool: string;
  input: JsonValue;
}

export interface ToolResult {
  output: JsonValue;
  warnings: string[];
}

export interface ExportRequest {
  format: string;
  item_ids: Id[];
  project_ids: Id[];
  path: string;
}

export interface ExportReceipt {
  path: string;
  item_count: number;
  warnings: string[];
}

export interface ImportRequest {
  paths: string[];
  duplicate_policy: string;
  dry_run: boolean;
}

export interface ImportReport {
  created: number;
  updated: number;
  skipped: number;
  warnings: string[];
}

export interface BackupRequest {
  path: string;
  encrypted: boolean;
}

export interface BackupReceipt {
  path: string;
  checksum: string;
  created_at: string;
}

export interface RestoreRequest {
  path: string;
  passphrase: string | null;
  dry_run: boolean;
}

export interface RestoreReport {
  schema_version: number;
  item_count: number;
  warnings: string[];
}

export interface UnlockRequest {
  pin: string | null;
  use_biometric: boolean;
}

export interface UnlockResult {
  unlocked: boolean;
  retry_after_seconds: number | null;
}

export interface AiRequest {
  action: string;
  content: string;
  consent: boolean;
}

export interface AiResult {
  output: string;
  warnings: string[];
}

export interface SyncStatus {
  enabled: boolean;
  device_id: Id;
  pending: number;
  conflicts: string[];
}
