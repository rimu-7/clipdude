use std::fs;
use std::path::{Path, PathBuf};
use std::sync::atomic::AtomicBool;
use std::sync::{Mutex, MutexGuard};
use std::time::Instant;

use tauri::{AppHandle, Emitter, Manager};

use crate::db::{Database, DB_FILE_NAME};
use crate::settings::Settings;
use crate::TRAY_ID;

pub struct AppState {
    /// The app data folder: settings live here, and so does the database by default.
    pub data_dir: PathBuf,
    pub settings: Mutex<Settings>,
    pub db: Mutex<Option<Database>>,
    /// Explains why the configured database could not be used, if it could not.
    pub db_warning: Mutex<Option<String>>,
    /// The last clipboard text ClipDude saw or wrote, so it is not recorded twice.
    pub last_text: Mutex<String>,
    pub last_blur: Mutex<Option<Instant>>,
    pub shortcut_error: Mutex<Option<String>>,
    pub frontend_ready: AtomicBool,
}

impl AppState {
    pub fn new(data_dir: PathBuf, settings: Settings, db: Option<Database>, db_warning: Option<String>) -> Self {
        Self {
            data_dir,
            settings: Mutex::new(settings),
            db: Mutex::new(db),
            db_warning: Mutex::new(db_warning),
            last_text: Mutex::new(String::new()),
            last_blur: Mutex::new(None),
            shortcut_error: Mutex::new(None),
            frontend_ready: AtomicBool::new(false),
        }
    }

    pub fn settings(&self) -> Settings {
        lock(&self.settings).clone()
    }

    pub fn with_db<T>(&self, f: impl FnOnce(&Database) -> rusqlite::Result<T>) -> Result<T, String> {
        let guard = lock(&self.db);
        let db = guard
            .as_ref()
            .ok_or_else(|| "The clipboard database is not available.".to_string())?;
        f(db).map_err(|e| format!("Database error: {e}"))
    }

    pub fn configured_folder(&self, settings: &Settings) -> PathBuf {
        if settings.db_folder.is_empty() {
            self.data_dir.clone()
        } else {
            PathBuf::from(&settings.db_folder)
        }
    }
}

pub fn lock<T>(mutex: &Mutex<T>) -> MutexGuard<'_, T> {
    mutex.lock().unwrap_or_else(|poisoned| poisoned.into_inner())
}

pub fn open_in(folder: &Path) -> Result<Database, String> {
    fs::create_dir_all(folder)
        .map_err(|e| format!("Could not create {}: {e}", folder.display()))?;
    let path = folder.join(DB_FILE_NAME);
    Database::open(&path).map_err(|e| format!("Could not open {}: {e}", path.display()))
}

/// Opens the configured database, falling back to the default location so that
/// history keeps working when a custom folder (e.g. an unplugged drive) is missing.
pub fn open_database(data_dir: &Path, db_folder: &str) -> (Option<Database>, Option<String>) {
    let configured = if db_folder.is_empty() {
        data_dir.to_path_buf()
    } else {
        PathBuf::from(db_folder)
    };
    match open_in(&configured) {
        Ok(db) => (Some(db), None),
        Err(error) if configured != data_dir => match open_in(data_dir) {
            Ok(db) => (
                Some(db),
                Some(format!("{error}. Using the default location until it is available again.")),
            ),
            Err(fallback_error) => (None, Some(format!("{error}. {fallback_error}"))),
        },
        Err(error) => (None, Some(error)),
    }
}

/// Tells the UI that history changed and refreshes the tray tooltip.
pub fn notify_clips_changed(app: &AppHandle) {
    let _ = app.emit("clips-changed", ());
    let Some(state) = app.try_state::<AppState>() else {
        return;
    };
    if let (Ok(stats), Some(tray)) = (state.with_db(|db| db.stats()), app.tray_by_id(TRAY_ID)) {
        let _ = tray.set_tooltip(Some(format!("ClipDude — {} clips", stats.total)));
    }
}

/// Deletes clips that fall outside the retention settings.
pub fn run_retention(app: &AppHandle) {
    let Some(state) = app.try_state::<AppState>() else {
        return;
    };
    let settings = state.settings();
    match state.with_db(|db| db.apply_retention(settings.retention_days, settings.max_history_items)) {
        Ok(0) => {}
        Ok(_) => notify_clips_changed(app),
        Err(error) => eprintln!("Retention cleanup failed: {error}"),
    }
}
