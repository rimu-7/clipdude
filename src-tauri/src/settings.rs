use std::fs;
use std::path::Path;

use serde::{Deserialize, Serialize};
use serde_json::Value;

pub const SETTINGS_FILE_NAME: &str = "settings.json";
pub const DEFAULT_SHORTCUT: &str = "CommandOrControl+Shift+V";

const MAX_HISTORY_LIMIT: u32 = 100_000;
const MAX_RETENTION_DAYS: u32 = 3650;

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(default)]
pub struct Settings {
    pub dark_mode: bool,
    /// Folder that holds `clipboard.db`. Empty means the app data folder.
    pub db_folder: String,
    pub auto_start: bool,
    /// Open the window when ClipDude is launched at login instead of staying in the tray.
    pub show_on_login: bool,
    pub monitor_enabled: bool,
    /// 0 means unlimited.
    pub max_history_items: u32,
    /// 0 means keep forever.
    pub retention_days: u32,
    pub excluded_apps: Vec<String>,
    pub detect_sensitive: bool,
    pub skip_sensitive: bool,
    pub smart_paste: bool,
    pub show_source_app: bool,
    pub shortcut: String,
    pub auto_check_updates: bool,
    /// A version the user chose not to be reminded about.
    pub skipped_update_version: String,
}

impl Default for Settings {
    fn default() -> Self {
        Self {
            dark_mode: true,
            db_folder: String::new(),
            auto_start: false,
            show_on_login: false,
            monitor_enabled: true,
            max_history_items: 1000,
            retention_days: 30,
            excluded_apps: default_excluded_apps(),
            detect_sensitive: true,
            skip_sensitive: false,
            smart_paste: true,
            show_source_app: true,
            shortcut: DEFAULT_SHORTCUT.into(),
            auto_check_updates: true,
            skipped_update_version: String::new(),
        }
    }
}

impl Settings {
    /// Clamps values coming from disk or the UI into a valid range.
    pub fn normalize(&mut self) {
        self.max_history_items = self.max_history_items.min(MAX_HISTORY_LIMIT);
        self.retention_days = self.retention_days.min(MAX_RETENTION_DAYS);
        self.db_folder = self.db_folder.trim().to_string();
        if self.shortcut.trim().is_empty() {
            self.shortcut = DEFAULT_SHORTCUT.into();
        }

        let mut seen = std::collections::HashSet::new();
        self.excluded_apps = self
            .excluded_apps
            .iter()
            .map(|app| app.trim().to_string())
            .filter(|app| !app.is_empty() && seen.insert(app.to_lowercase()))
            .collect();
    }
}

fn default_excluded_apps() -> Vec<String> {
    let apps: &[&str] = if cfg!(target_os = "macos") {
        &[
            "com.1password.1password",
            "com.agilebits.onepassword-osx",
            "com.bitwarden.desktop",
            "com.apple.keychainaccess",
            "com.apple.Passwords",
            "org.keepassxc.keepassxc",
        ]
    } else if cfg!(windows) {
        &["1Password.exe", "Bitwarden.exe", "KeePass.exe", "KeePassXC.exe"]
    } else {
        &["1password", "bitwarden", "keepassxc"]
    };
    apps.iter().map(|app| app.to_string()).collect()
}

pub struct LoadedSettings {
    pub settings: Settings,
    /// False when the file did not record `auto_start`, so the OS registration should be trusted.
    pub has_auto_start: bool,
}

/// Reads settings written by this or an older version of ClipDude. Missing or corrupt
/// files fall back to defaults so the app always starts.
pub fn load(dir: &Path) -> LoadedSettings {
    let path = dir.join(SETTINGS_FILE_NAME);
    let mut raw = match fs::read_to_string(&path) {
        Ok(text) => serde_json::from_str::<Value>(&text).unwrap_or_else(|error| {
            eprintln!("Ignoring unreadable settings file {}: {error}", path.display());
            Value::Object(Default::default())
        }),
        Err(_) => Value::Object(Default::default()),
    };

    let has_auto_start = raw.get("auto_start").is_some_and(Value::is_boolean);

    if let Some(object) = raw.as_object_mut() {
        // Older builds stored the folder either as a string or as `{ "path": "..." }`.
        let folder = match object.get("db_folder") {
            Some(Value::String(path)) => path.clone(),
            Some(Value::Object(inner)) => inner
                .get("path")
                .and_then(Value::as_str)
                .unwrap_or_default()
                .to_string(),
            _ => String::new(),
        };
        object.insert("db_folder".into(), Value::String(folder));
        // Drop values with the wrong type instead of failing the whole file.
        let defaults = serde_json::to_value(Settings::default()).unwrap_or_default();
        object.retain(|key, value| match defaults.get(key) {
            Some(default) => same_kind(default, value),
            None => false,
        });
    }

    let mut settings: Settings = serde_json::from_value(raw).unwrap_or_default();
    settings.normalize();
    LoadedSettings {
        settings,
        has_auto_start,
    }
}

fn same_kind(a: &Value, b: &Value) -> bool {
    match (a, b) {
        (Value::Number(_), Value::Number(n)) => n.as_u64().is_some(),
        _ => std::mem::discriminant(a) == std::mem::discriminant(b),
    }
}

pub fn save(dir: &Path, settings: &Settings) -> Result<(), String> {
    fs::create_dir_all(dir).map_err(|e| format!("Could not create {}: {e}", dir.display()))?;
    let path = dir.join(SETTINGS_FILE_NAME);
    let tmp = dir.join(format!("{SETTINGS_FILE_NAME}.tmp"));
    let json = serde_json::to_string_pretty(settings).map_err(|e| e.to_string())?;
    fs::write(&tmp, json).map_err(|e| format!("Could not write settings: {e}"))?;
    fs::rename(&tmp, &path).map_err(|e| format!("Could not save settings: {e}"))
}
