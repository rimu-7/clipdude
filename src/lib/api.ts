import { invoke } from "@tauri-apps/api/core";
import type {
  AppSettings,
  Bootstrap,
  ClipPage,
  CopyResult,
  DatabaseInfo,
  MoveResult,
  Stats,
  UpdateStatus,
} from "@/types";

/** Typed wrappers around ClipDude's Rust commands. */
export const api = {
  frontendReady: () => invoke<void>("frontend_ready"),
  bootstrap: () => invoke<Bootstrap>("get_bootstrap"),

  listClips: (query: string, pinnedOnly: boolean, offset: number, limit: number) =>
    invoke<ClipPage>("list_clips", { query, pinnedOnly, offset, limit }),
  stats: () => invoke<Stats>("get_stats"),
  clipContent: (id: number) => invoke<string>("get_clip_content", { id }),
  copyClip: (id: number, paste: boolean) => invoke<CopyResult>("copy_clip", { id, paste }),
  copyText: (text: string, paste: boolean) => invoke<CopyResult>("copy_text", { text, paste }),
  togglePin: (id: number) => invoke<boolean>("toggle_pin", { id }),
  deleteClip: (id: number) => invoke<void>("delete_clip", { id }),

  clearHistory: (includePinned: boolean) => invoke<number>("clear_history", { includePinned }),
  retentionImpact: (retentionDays: number, maxItems: number) =>
    invoke<number>("retention_impact", { retentionDays, maxItems }),
  optimizeDatabase: () => invoke<DatabaseInfo>("optimize_database"),
  databaseInfo: () => invoke<DatabaseInfo>("get_database_info"),
  retryDatabase: () => invoke<DatabaseInfo>("retry_database"),
  setDatabaseFolder: (folder: string | null) =>
    invoke<MoveResult>("set_database_folder", { folder }),

  updateSettings: (patch: Partial<AppSettings>) =>
    invoke<AppSettings>("update_settings", { patch }),
  resetSettings: () => invoke<AppSettings>("reset_settings"),

  hideWindow: () => invoke<void>("hide_window"),
  quit: () => invoke<void>("quit_app"),
  updateStatus: () => invoke<UpdateStatus>("get_update_status"),
  checkForUpdate: () => invoke<UpdateStatus>("check_for_update"),
  installUpdate: () => invoke<void>("install_update"),
  openReleasePage: (version: string | null) => invoke<void>("open_release_page", { version }),
};

export function errorMessage(error: unknown): string {
  if (typeof error === "string") return error;
  if (error instanceof Error) return error.message;
  return "Something went wrong.";
}

export function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  const units = ["KB", "MB", "GB"];
  let value = bytes / 1024;
  let unit = 0;
  while (value >= 1024 && unit < units.length - 1) {
    value /= 1024;
    unit++;
  }
  return `${value.toFixed(value < 10 ? 1 : 0)} ${units[unit]}`;
}

const MAC_SYMBOLS: Record<string, string> = {
  commandorcontrol: "⌘",
  cmdorctrl: "⌘",
  command: "⌘",
  cmd: "⌘",
  super: "⌘",
  control: "⌃",
  ctrl: "⌃",
  alt: "⌥",
  option: "⌥",
  shift: "⇧",
};

/** Turns an accelerator such as "CommandOrControl+Shift+KeyV" into a readable label. */
export function formatShortcut(accelerator: string, platform: string): string {
  const parts = accelerator.split("+").map((part) => {
    const key = part.trim();
    const lower = key.toLowerCase();
    if (platform === "macos" && MAC_SYMBOLS[lower]) return MAC_SYMBOLS[lower];
    if (lower === "commandorcontrol" || lower === "cmdorctrl" || lower === "control") return "Ctrl";
    if (lower === "super" || lower === "command" || lower === "cmd") {
      return platform === "windows" ? "Win" : "Super";
    }
    return key.replace(/^Key/, "").replace(/^Digit/, "");
  });
  return platform === "macos" ? parts.join("") : parts.join("+");
}
