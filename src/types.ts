export type ViewMode = "all" | "pinned" | "settings";
export type Platform = "macos" | "windows" | "linux";

export interface Clip {
  id: number;
  /** First few hundred characters; masked when the clip is sensitive. */
  preview: string;
  length: number;
  is_pinned: boolean;
  is_sensitive: boolean;
  source_app: string;
  /** Unix time in milliseconds of the last copy. */
  last_used: number;
}

export interface ClipPage {
  clips: Clip[];
  has_more: boolean;
}

export interface Stats {
  total: number;
  pinned: number;
}

export interface AppSettings {
  dark_mode: boolean;
  db_folder: string;
  auto_start: boolean;
  show_on_login: boolean;
  monitor_enabled: boolean;
  /** 0 means unlimited. */
  max_history_items: number;
  /** 0 means keep forever. */
  retention_days: number;
  excluded_apps: string[];
  detect_sensitive: boolean;
  skip_sensitive: boolean;
  smart_paste: boolean;
  show_source_app: boolean;
  shortcut: string;
  auto_check_updates: boolean;
  skipped_update_version: string;
}

export interface DatabaseInfo {
  available: boolean;
  path: string;
  folder: string;
  size_bytes: number;
  is_default: boolean;
  warning: string | null;
}

export interface Bootstrap {
  settings: AppSettings;
  database: DatabaseInfo;
  stats: Stats;
  shortcut_error: string | null;
  update: UpdateStatus;
  platform: Platform;
  version: string;
}

export interface CopyResult {
  pasted: boolean;
  message: string | null;
}

export interface MoveResult {
  action: "moved" | "opened" | "unchanged";
  database: DatabaseInfo;
}

export type UpdatePhase =
  | "idle"
  | "checking"
  | "up_to_date"
  | "available"
  | "downloading"
  | "installing"
  | "error";

export interface UpdateStatus {
  phase: UpdatePhase;
  current_version: string;
  version: string | null;
  notes: string | null;
  /** Release date in Unix milliseconds. */
  date: number | null;
  downloaded: number;
  total: number | null;
  error: string | null;
  /** Unix milliseconds of the last finished check. */
  last_checked: number | null;
}
