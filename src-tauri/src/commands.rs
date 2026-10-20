use std::path::{Path, PathBuf};
use std::sync::atomic::Ordering;
use std::time::Duration;

use serde::Serialize;
use serde_json::Value;
use tauri::{AppHandle, Emitter, State};
use tauri_plugin_autostart::ManagerExt as _;
use tauri_plugin_clipboard_manager::ClipboardExt;
use tauri_plugin_global_shortcut::{GlobalShortcutExt, Shortcut};

use crate::db::{ClipPage, Stats, DB_FILE_NAME};
use crate::settings::{self, Settings};
use crate::state::{self, lock, AppState};
use crate::updates::{self, UpdateStatus};
use crate::{monitor, platform};

type CmdResult<T> = Result<T, String>;

/// Time for the previous app to regain focus before the paste keystroke is sent.
const PASTE_DELAY: Duration = Duration::from_millis(180);

#[derive(Serialize)]
pub struct DatabaseInfo {
    available: bool,
    path: String,
    folder: String,
    size_bytes: u64,
    is_default: bool,
    warning: Option<String>,
}

#[derive(Serialize)]
pub struct Bootstrap {
    settings: Settings,
    database: DatabaseInfo,
    stats: Stats,
    shortcut_error: Option<String>,
    update: UpdateStatus,
    platform: &'static str,
    version: String,
}

#[derive(Serialize)]
pub struct CopyResult {
    pasted: bool,
    message: Option<String>,
}

#[derive(Serialize)]
pub struct MoveResult {
    /// "moved" (history copied into the folder), "opened" (existing file used), or "unchanged".
    action: &'static str,
    database: DatabaseInfo,
}

fn platform_name() -> &'static str {
    if cfg!(target_os = "macos") {
        "macos"
    } else if cfg!(windows) {
        "windows"
    } else {
        "linux"
    }
}

fn database_info(state: &AppState) -> DatabaseInfo {
    let warning = lock(&state.db_warning).clone();
    let guard = lock(&state.db);
    match guard.as_ref() {
        Some(db) => {
            let folder = db.path().parent().map(Path::to_path_buf).unwrap_or_default();
            DatabaseInfo {
                available: true,
                path: db.path().display().to_string(),
                is_default: folder == state.data_dir,
                folder: folder.display().to_string(),
                size_bytes: db.size_bytes(),
                warning,
            }
        }
        None => {
            let settings = state.settings();
            let folder = state.configured_folder(&settings);
            DatabaseInfo {
                available: false,
                path: folder.join(DB_FILE_NAME).display().to_string(),
                folder: folder.display().to_string(),
                size_bytes: 0,
                is_default: settings.db_folder.is_empty(),
                warning,
            }
        }
    }
}

#[tauri::command]
pub fn frontend_ready(state: State<'_, AppState>) {
    state.frontend_ready.store(true, Ordering::Release);
}

#[tauri::command]
pub async fn get_bootstrap(app: AppHandle, state: State<'_, AppState>) -> CmdResult<Bootstrap> {
    Ok(Bootstrap {
        settings: state.settings(),
        database: database_info(&state),
        stats: state.with_db(|db| db.stats()).unwrap_or_default(),
        shortcut_error: lock(&state.shortcut_error).clone(),
        update: updates::status(&app),
        platform: platform_name(),
        version: app.package_info().version.to_string(),
    })
}

#[tauri::command]
pub async fn list_clips(
    state: State<'_, AppState>,
    query: String,
    pinned_only: bool,
    offset: u32,
    limit: u32,
) -> CmdResult<ClipPage> {
    let limit = limit.clamp(1, 500);
    state.with_db(|db| db.list(&query, pinned_only, offset, limit))
}

#[tauri::command]
pub async fn get_stats(state: State<'_, AppState>) -> CmdResult<Stats> {
    state.with_db(|db| db.stats())
}

#[tauri::command]
pub async fn get_clip_content(state: State<'_, AppState>, id: i64) -> CmdResult<String> {
    state
        .with_db(|db| db.content(id))?
        .ok_or_else(|| "This clip no longer exists.".into())
}

/// Puts `content` on the clipboard and, when asked, pastes it into the previous app.
fn write_and_paste(app: &AppHandle, state: &AppState, content: &str, paste: bool) -> CmdResult<CopyResult> {
    *lock(&state.last_text) = content.to_string();
    app.clipboard()
        .write_text(content)
        .map_err(|e| format!("Could not write to the clipboard: {e}"))?;
    state::notify_clips_changed(app);

    if !paste {
        return Ok(CopyResult { pasted: false, message: None });
    }
    if let Err(message) = platform::ensure_paste_permission() {
        return Ok(CopyResult { pasted: false, message: Some(message) });
    }
    crate::hide_main_window(app);
    platform::restore_foreground();
    std::thread::sleep(PASTE_DELAY);
    Ok(match platform::send_paste() {
        Ok(()) => CopyResult { pasted: true, message: None },
        Err(message) => CopyResult { pasted: false, message: Some(message) },
    })
}

#[tauri::command]
pub async fn copy_clip(app: AppHandle, state: State<'_, AppState>, id: i64, paste: bool) -> CmdResult<CopyResult> {
    let content = state
        .with_db(|db| {
            let content = db.content(id)?;
            if content.is_some() {
                db.touch(id)?;
            }
            Ok(content)
        })?
        .ok_or_else(|| "This clip no longer exists.".to_string())?;
    write_and_paste(&app, &state, &content, paste)
}

/// Copies new text (e.g. a transformed clip) and adds it to history.
#[tauri::command]
pub async fn copy_text(app: AppHandle, state: State<'_, AppState>, text: String, paste: bool) -> CmdResult<CopyResult> {
    if text.is_empty() {
        return Err("Nothing to copy.".into());
    }
    monitor::store_clip(&state, &text, "")?;
    write_and_paste(&app, &state, &text, paste)
}

#[tauri::command]
pub async fn toggle_pin(app: AppHandle, state: State<'_, AppState>, id: i64) -> CmdResult<bool> {
    let pinned = state.with_db(|db| db.toggle_pin(id))?;
    state::notify_clips_changed(&app);
    Ok(pinned)
}

#[tauri::command]
pub async fn delete_clip(app: AppHandle, state: State<'_, AppState>, id: i64) -> CmdResult<()> {
    state.with_db(|db| db.delete(id))?;
    state::notify_clips_changed(&app);
    Ok(())
}

#[tauri::command]
pub async fn clear_history(app: AppHandle, state: State<'_, AppState>, include_pinned: bool) -> CmdResult<usize> {
    let removed = state.with_db(|db| db.clear(include_pinned))?;
    state::notify_clips_changed(&app);
    Ok(removed)
}

#[tauri::command]
pub async fn retention_impact(state: State<'_, AppState>, retention_days: u32, max_items: u32) -> CmdResult<i64> {
    state.with_db(|db| db.retention_impact(retention_days, max_items))
}

#[tauri::command]
pub async fn optimize_database(state: State<'_, AppState>) -> CmdResult<DatabaseInfo> {
    state.with_db(|db| db.optimize())?;
    Ok(database_info(&state))
}

#[tauri::command]
pub async fn get_database_info(state: State<'_, AppState>) -> CmdResult<DatabaseInfo> {
    Ok(database_info(&state))
}

/// Reopens the configured database, e.g. after a missing drive is reconnected.
#[tauri::command]
pub async fn retry_database(app: AppHandle, state: State<'_, AppState>) -> CmdResult<DatabaseInfo> {
    let settings = state.settings();
    let (db, warning) = state::open_database(&state.data_dir, &settings.db_folder);
    *lock(&state.db) = db;
    *lock(&state.db_warning) = warning;
    state::run_retention(&app);
    state::notify_clips_changed(&app);
    Ok(database_info(&state))
}

fn same_file(a: &Path, b: &Path) -> bool {
    match (a.canonicalize(), b.canonicalize()) {
        (Ok(a), Ok(b)) => a == b,
        _ => false,
    }
}

/// Uses `folder` for the database. An existing `clipboard.db` there is opened as is;
/// otherwise the current history is copied into it. The old file is left untouched.
#[tauri::command]
pub async fn set_database_folder(app: AppHandle, state: State<'_, AppState>, folder: Option<String>) -> CmdResult<MoveResult> {
    let folder = match folder.as_deref().map(str::trim) {
        Some(path) if !path.is_empty() => PathBuf::from(path),
        _ => state.data_dir.clone(),
    };
    if !folder.is_absolute() {
        return Err("Choose an absolute folder path.".into());
    }
    std::fs::create_dir_all(&folder)
        .map_err(|e| format!("Could not use {}: {e}", folder.display()))?;
    let target = folder.join(DB_FILE_NAME);

    let action = {
        let mut guard = lock(&state.db);
        if guard.as_ref().is_some_and(|db| same_file(db.path(), &target)) {
            "unchanged"
        } else {
            let action = if target.exists() {
                "opened"
            } else if let Some(db) = guard.as_ref() {
                db.copy_to(&target)
                    .map_err(|e| format!("Could not copy history to {}: {e}", folder.display()))?;
                "moved"
            } else {
                "opened"
            };
            *guard = Some(state::open_in(&folder)?);
            action
        }
    };
    *lock(&state.db_warning) = None;

    {
        let mut settings = lock(&state.settings);
        settings.db_folder = if folder == state.data_dir {
            String::new()
        } else {
            folder.display().to_string()
        };
        settings::save(&state.data_dir, &settings)?;
    }

    state::run_retention(&app);
    state::notify_clips_changed(&app);
    Ok(MoveResult {
        action,
        database: database_info(&state),
    })
}

fn set_autostart(app: &AppHandle, enabled: bool) -> CmdResult<()> {
    let autolaunch = app.autolaunch();
    let result = if enabled {
        autolaunch.enable()
    } else {
        autolaunch.disable()
    };
    result.map_err(|e| format!("Could not update launch at login: {e}"))
}

/// Swaps the global shortcut, restoring the previous one if the new one is taken.
pub fn register_shortcut(app: &AppHandle, previous: Option<&str>, next: &str) -> CmdResult<()> {
    let shortcuts = app.global_shortcut();
    let next_shortcut: Shortcut = next
        .parse()
        .map_err(|e| format!("{next} is not a valid shortcut: {e}"))?;
    let previous_shortcut = previous.and_then(|p| p.parse::<Shortcut>().ok());
    if let Some(previous) = previous_shortcut {
        let _ = shortcuts.unregister(previous);
    }
    if let Err(error) = shortcuts.register(next_shortcut) {
        if let Some(previous) = previous_shortcut {
            let _ = shortcuts.register(previous);
        }
        return Err(format!(
            "{next} could not be registered. Another app may already use it. ({error})"
        ));
    }
    if let Some(state) = tauri::Manager::try_state::<AppState>(app) {
        *lock(&state.shortcut_error) = None;
    }
    Ok(())
}

/// Saves `next` and applies whatever changed compared to the current settings.
pub fn apply_settings(app: &AppHandle, state: &AppState, mut next: Settings) -> CmdResult<Settings> {
    next.normalize();
    let previous = state.settings();
    if next == previous {
        return Ok(next);
    }
    if next.auto_start != previous.auto_start {
        set_autostart(app, next.auto_start)?;
    }
    if next.shortcut != previous.shortcut {
        register_shortcut(app, Some(&previous.shortcut), &next.shortcut)?;
    }
    settings::save(&state.data_dir, &next)?;
    *lock(&state.settings) = next.clone();

    if next.dark_mode != previous.dark_mode {
        crate::apply_theme(app, next.dark_mode);
    }
    if next.monitor_enabled != previous.monitor_enabled {
        crate::sync_tray_pause(app, next.monitor_enabled);
    }
    if next.retention_days != previous.retention_days
        || next.max_history_items != previous.max_history_items
    {
        state::run_retention(app);
    }
    let _ = app.emit("settings-changed", &next);
    Ok(next)
}

/// Merges a partial settings object from the UI into the current settings.
#[tauri::command]
pub async fn update_settings(app: AppHandle, state: State<'_, AppState>, patch: Value) -> CmdResult<Settings> {
    let mut merged = serde_json::to_value(state.settings()).map_err(|e| e.to_string())?;
    let (Some(target), Some(changes)) = (merged.as_object_mut(), patch.as_object()) else {
        return Err("Settings update must be an object.".into());
    };
    for (key, value) in changes {
        // The database folder has its own command because it moves data.
        if key != "db_folder" && target.contains_key(key) {
            target.insert(key.clone(), value.clone());
        }
    }
    let next: Settings =
        serde_json::from_value(merged).map_err(|e| format!("Invalid setting value: {e}"))?;
    apply_settings(&app, &state, next)
}

#[tauri::command]
pub async fn reset_settings(app: AppHandle, state: State<'_, AppState>) -> CmdResult<Settings> {
    let next = Settings {
        db_folder: state.settings().db_folder,
        ..Settings::default()
    };
    apply_settings(&app, &state, next)
}

#[tauri::command]
pub fn hide_window(app: AppHandle) {
    crate::hide_main_window(&app);
}

#[tauri::command]
pub fn quit_app(app: AppHandle) {
    app.exit(0);
}

#[tauri::command]
pub fn get_update_status(app: AppHandle) -> UpdateStatus {
    updates::status(&app)
}

#[tauri::command]
pub async fn check_for_update(app: AppHandle) -> CmdResult<UpdateStatus> {
    Ok(updates::check(&app, true).await)
}

#[tauri::command]
pub async fn install_update(app: AppHandle) -> CmdResult<()> {
    updates::install(&app).await
}

#[tauri::command]
pub fn open_release_page(app: AppHandle, version: Option<String>) -> CmdResult<()> {
    updates::open_release_page(&app, version.as_deref())
}
