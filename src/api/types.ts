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
  | "config"
  // For images, `content` holds the relative path of the stored PNG rather than
  // the pixels. Render it with the helpers in `lib/itemImage`, never as text.
  | "image";
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

export type GroupBy = "date" | "content_type" | "kind";

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
  group_by?: GroupBy;
}

export interface Page<T> {
  items: T[];
  total: number;
  limit: number;
  offset: number;
}

export interface ItemFlags {
  pinned: boolean | null;
  favorite: boolean | null;
  archived: boolean | null;
}

/**
 * A capture the user wrote or pasted into SnipDock rather than copying from
 * another application. The backend detects the content type and language, so
 * neither is passed here; `title` is optional and trimmed before it is stored.
 */
export interface ManualItemInput {
  content: string;
  title: string | null;
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

export type PasteFormat = "preserve" | "plain_text" | "strip_whitespace";

export interface SmartFolder {
  id: Id;
  name: string;
  description: string | null;
  query: SearchQuery;
  icon: string;
  color: string;
  position: number;
  created_at: string;
  updated_at: string;
}

export interface SaveSmartFolderInput {
  id?: Id;
  name: string;
  description?: string | null;
  query: SearchQuery;
  icon?: string;
  color?: string;
  position?: number;
}

export interface UsageAnalytics {
  total_items: number;
  total_copies: number;
  items_by_type: TypeCount[];
  items_by_content_type: ContentTypeCount[];
  most_used_items: MostUsedItem[];
  recent_activity: ActivityEntry[];
  storage_used_bytes: number;
}

export interface TypeCount {
  kind: string;
  count: number;
}

export interface ContentTypeCount {
  content_type: string;
  count: number;
}

export interface MostUsedItem {
  id: Id;
  title: string | null;
  content_type: string;
  usage_count: number;
  last_used_at: string | null;
}

export interface ActivityEntry {
  item_id: Id;
  action: string;
  timestamp: string;
}

export interface Project {
  id: Id;
  name: string;
  description: string | null;
  archived_at: string | null;
  created_at: string;
  updated_at: string;
}

export interface SaveProjectInput {
  id?: Id;
  name: string;
  description?: string | null;
  tag_ids: Id[];
  archived?: boolean;
}

export interface Tag {
  id: Id;
  name: string;
  color: string;
  /** Across items and projects both, computed on read. */
  usage_count: number;
}

export interface SaveTagInput {
  id?: Id;
  name: string;
  /** #RRGGBB; the repository refuses anything else. */
  color: string;
}

export interface Category {
  id: Id;
  name: string;
  built_in: boolean;
}

export interface SaveCategoryInput {
  id?: Id;
  name: string;
}

export interface DuplicateItem {
  id: Id;
  title: string | null;
  content_type: string;
  created_at: string;
  usage_count: number;
}

/** Captures that share a `content_hash`, newest first inside each group. */
export interface DuplicateGroup {
  content_hash: string;
  count: number;
  items: DuplicateItem[];
}

export interface ClearSensitiveResult {
  cleared_count: number;
  cleared_ids: Id[];
  /** Present only when something was swept, so the sweep can be undone. */
  receipt_id: Id | null;
  expires_at: string | null;
}

export interface Settings {
  clipboard_tracking: boolean;
  history_days: number;
  max_items: number;
  ignored_apps: string[];
  ignored_patterns: string[];
  ignored_content_types: ContentType[];
  theme: string;
  minimize_to_tray: boolean;
  start_with_system: boolean;
  formatter_indent: number;
  custom_shortcuts: Record<string, string>;
  paste_format: PasteFormat;
  encryption_enabled: boolean;
  auto_clear_sensitive_minutes: number | null;
  /** Rows the Clipboard page requests per page. */
  clipboard_page_size: number;
  updates: UpdateSettings;
  backup: BackupSettings;
}

export type UpdateFrequency = "on_launch" | "daily" | "weekly";

export interface UpdateSettings {
  notify: boolean;
  frequency: UpdateFrequency;
  /** Version the user chose to skip; the prompt stays quiet until a newer one. */
  skipped_version: string | null;
  last_checked_at: string | null;
}

export type BackupSchedule = "manual" | "daily" | "weekly";
export type CloudProvider = "none" | "s3" | "r2";

export interface CloudBackupSettings {
  provider: CloudProvider;
  bucket: string;
  region: string;
  /** Required for R2; empty for AWS, where the host comes from bucket + region. */
  endpoint: string;
  prefix: string;
  access_key_id: string;
  secret_access_key: string;
  /** Uploads are encrypted on this machine, so a provider needs a password. */
  passphrase: string;
}

export interface BackupSettings {
  schedule: BackupSchedule;
  local: boolean;
  /** Empty means the `backups` folder beside the database. */
  local_dir: string;
  keep: number;
  cloud: CloudBackupSettings;
  last_run_at: string | null;
  last_result: string | null;
}

/** What one backup run wrote, per destination. */
export interface BackupRunReport {
  local_path: string | null;
  cloud_url: string | null;
  bytes: number;
  created_at: string;
  warnings: string[];
}

/**
 * A recoverable file in the local backup folder. `pre_upgrade` marks the
 * snapshots SnipDock takes for itself before a schema upgrade, which retention
 * never deletes.
 */
export interface LocalBackup {
  path: string;
  name: string;
  bytes: number;
  modified_at: string | null;
  pre_upgrade: boolean;
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

export interface ExportRequest {
  format: "json" | "markdown" | "text" | "csv" | "html" | "project";
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
  duplicate_policy: "skip" | "keep_both" | "replace";
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
  passphrase: string;
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
  restart_required: boolean;
}

export interface UpdateInfo {
  version: string;
  notes: string | null;
  date: string | null;
}

export interface StorageSize {
  db_bytes: number;
  images_bytes: number;
  total_bytes: number;
}

/**
 * What SnipDock costs the machine right now. A Tauri app runs as several
 * processes — the Rust binary plus the platform webview's helpers — so every
 * figure covers the whole tree, with `main_memory_bytes` broken out.
 *
 * `cpu_percent` is a delta between two readings and is only meaningful once
 * `cpu_ready` is true; 100 means one core saturated.
 */
export interface ResourceUsage {
  memory_bytes: number;
  main_memory_bytes: number;
  cpu_percent: number;
  process_count: number;
  pid: number;
  cpu_ready: boolean;
}
