export interface Clip {
  id: number;
  content: string;
  created_at: string;
  is_pinned: number;
  source_app: string;
  is_sensitive: number;
  content_type: string;
  rank: number;
}

export interface GroupAccordionProps {
  id: string;
  title: string;
  icon?: React.ReactNode;
  group: Clip[];
  isOpen: boolean;
  onToggle: () => void;
  onInternalCopy: (text: string) => void;
  onDelete: (id: number) => void;
  onTogglePin: (id: number, currentStatus: number) => void;
  onSmartPaste?: (clip: Clip) => void;
  onTransform?: (clip: Clip, transformed: string) => void;
}

export interface ClipItemProps {
  clip: Clip;
  index: number;
  onInternalCopy: (text: string) => Promise<void>;
  onDelete: (id: number) => void | Promise<void>;
}

export interface AppSettings {
  dark_mode: boolean;
  db_folder: string;
  auto_start: boolean;
  monitor_enabled: boolean;
  max_history_items: number;
  retention_days: number;
  excluded_apps: string[];
  detect_sensitive: boolean;
  smart_paste: boolean;
  show_source_app: boolean;
}

export const DEFAULT_SETTINGS: AppSettings = {
  dark_mode: true,
  db_folder: "",
  auto_start: true,
  monitor_enabled: true,
  max_history_items: 1000,
  retention_days: 30,
  excluded_apps: [
    "com.1password.1password",
    "com.bitwarden.desktop",
    "com.agilebits.onepassword-osx",
    "com.apple.keychainaccess",
  ],
  detect_sensitive: true,
  smart_paste: true,
  show_source_app: true,
};
