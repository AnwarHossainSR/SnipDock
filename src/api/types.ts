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
