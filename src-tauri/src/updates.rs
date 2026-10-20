//! Background update checks, download progress, and installation.
//!
//! Status lives here (not in the UI) so the tray menu, the window, and a system
//! notification all describe the same update.

use std::sync::Mutex;
use std::time::{Duration, Instant};

use serde::Serialize;
use tauri::{AppHandle, Emitter, Manager};
use tauri_plugin_notification::NotificationExt;
use tauri_plugin_opener::OpenerExt;
use tauri_plugin_updater::{Update, UpdaterExt};

use crate::db::now_ms;
use crate::state::{lock, AppState};

pub const RELEASES_URL: &str = "https://github.com/rimu-7/clipdude/releases";
const FIRST_CHECK_DELAY: Duration = Duration::from_secs(15);
/// Measured in wall-clock time, so checks catch up after the computer sleeps.
const CHECK_INTERVAL_MS: i64 = 6 * 60 * 60 * 1000;
const PROGRESS_EMIT_INTERVAL: Duration = Duration::from_millis(100);

#[derive(Debug, Clone, Copy, Default, PartialEq, Serialize)]
#[serde(rename_all = "snake_case")]
pub enum Phase {
    #[default]
    Idle,
    Checking,
    UpToDate,
    Available,
    Downloading,
    Installing,
    Error,
}

#[derive(Debug, Clone, Default, Serialize)]
pub struct UpdateStatus {
    pub phase: Phase,
    pub current_version: String,
    /// The newer version, once one has been found.
    pub version: Option<String>,
    pub notes: Option<String>,
    /// Release date in Unix milliseconds.
    pub date: Option<i64>,
    pub downloaded: u64,
    pub total: Option<u64>,
    pub error: Option<String>,
    /// Unix milliseconds of the last finished check.
    pub last_checked: Option<i64>,
}

pub struct Updates {
    status: Mutex<UpdateStatus>,
    pending: Mutex<Option<Update>>,
    notified_version: Mutex<Option<String>>,
}

impl Updates {
    pub fn new(current_version: String) -> Self {
        Self {
            status: Mutex::new(UpdateStatus {
                current_version,
                ..UpdateStatus::default()
            }),
            pending: Mutex::new(None),
            notified_version: Mutex::new(None),
        }
    }
}

pub fn status(app: &AppHandle) -> UpdateStatus {
    lock(&app.state::<Updates>().status).clone()
}

fn update_status(app: &AppHandle, change: impl FnOnce(&mut UpdateStatus)) -> UpdateStatus {
    let updates = app.state::<Updates>();
    let snapshot = {
        let mut status = lock(&updates.status);
        change(&mut status);
        status.clone()
    };
    let _ = app.emit("update-status", &snapshot);
    crate::sync_tray_update(app, &snapshot);
    snapshot
}

/// Checks the release feed. Background checks stay quiet on failure and keep an
/// already-found update visible; manual checks report errors.
pub async fn check(app: &AppHandle, manual: bool) -> UpdateStatus {
    let current = status(app);
    if matches!(current.phase, Phase::Checking | Phase::Downloading | Phase::Installing) {
        return current;
    }
    update_status(app, |s| {
        s.phase = Phase::Checking;
        s.error = None;
    });

    let result = match app.updater() {
        Ok(updater) => updater.check().await.map_err(|e| e.to_string()),
        Err(error) => Err(error.to_string()),
    };

    match result {
        Ok(Some(update)) => {
            let version = update.version.clone();
            let snapshot = update_status(app, |s| {
                s.phase = Phase::Available;
                s.version = Some(update.version.clone());
                s.notes = update.body.clone().filter(|notes| !notes.trim().is_empty());
                s.date = update.date.map(|date| date.unix_timestamp() * 1000);
                s.downloaded = 0;
                s.total = None;
                s.last_checked = Some(now_ms());
            });
            *lock(&app.state::<Updates>().pending) = Some(update);
            if !manual {
                notify_once(app, &version);
            }
            snapshot
        }
        Ok(None) => {
            *lock(&app.state::<Updates>().pending) = None;
            update_status(app, |s| {
                s.phase = Phase::UpToDate;
                s.version = None;
                s.notes = None;
                s.date = None;
                s.last_checked = Some(now_ms());
            })
        }
        Err(error) => {
            eprintln!("Update check failed: {error}");
            let has_pending = lock(&app.state::<Updates>().pending).is_some();
            update_status(app, |s| {
                s.last_checked = Some(now_ms());
                if has_pending && !manual {
                    s.phase = Phase::Available;
                } else {
                    s.phase = Phase::Error;
                    s.error = Some(friendly_error(&error));
                }
            })
        }
    }
}

fn friendly_error(error: &str) -> String {
    let lower = error.to_lowercase();
    if lower.contains("dns") || lower.contains("connect") || lower.contains("network") || lower.contains("timed out") {
        "Couldn't reach the update server. Check your internet connection.".into()
    } else if lower.contains("signature") {
        "The update could not be verified, so it was not installed.".into()
    } else {
        format!("Update failed: {error}")
    }
}

/// Shows one system notification per new version, unless the user skipped it.
fn notify_once(app: &AppHandle, version: &str) {
    let skipped = app.state::<AppState>().settings().skipped_update_version;
    if skipped == version {
        return;
    }
    let updates = app.state::<Updates>();
    {
        let mut notified = lock(&updates.notified_version);
        if notified.as_deref() == Some(version) {
            return;
        }
        *notified = Some(version.to_string());
    }
    let result = app
        .notification()
        .builder()
        .title("ClipDude update available")
        .body(format!("Version {version} is ready. Open ClipDude from the menu bar to install it."))
        .show();
    if let Err(error) = result {
        eprintln!("Could not show update notification: {error}");
    }
}

/// Downloads and installs the pending update, reporting progress, then restarts.
pub async fn install(app: &AppHandle) -> Result<(), String> {
    let update = lock(&app.state::<Updates>().pending)
        .clone()
        .ok_or_else(|| "No update is ready to install. Check for updates first.".to_string())?;

    update_status(app, |s| {
        s.phase = Phase::Downloading;
        s.downloaded = 0;
        s.total = None;
        s.error = None;
    });

    let mut downloaded = 0u64;
    let mut last_emit = Instant::now();
    let result = update
        .download_and_install(
            |chunk, total| {
                downloaded += chunk as u64;
                if last_emit.elapsed() >= PROGRESS_EMIT_INTERVAL {
                    last_emit = Instant::now();
                    update_status(app, |s| {
                        s.downloaded = downloaded;
                        s.total = total;
                    });
                }
            },
            || {
                update_status(app, |s| s.phase = Phase::Installing);
            },
        )
        .await;

    match result {
        Ok(()) => app.restart(),
        Err(error) => {
            let message = friendly_error(&error.to_string());
            update_status(app, |s| {
                s.phase = Phase::Error;
                s.error = Some(message.clone());
            });
            Err(message)
        }
    }
}

pub fn open_release_page(app: &AppHandle, version: Option<&str>) -> Result<(), String> {
    let url = match version {
        Some(version) => format!("{RELEASES_URL}/tag/v{}", version.trim_start_matches('v')),
        None => format!("{RELEASES_URL}/latest"),
    };
    app.opener()
        .open_url(url, None::<&str>)
        .map_err(|e| format!("Could not open the browser: {e}"))
}

/// Checks shortly after launch and then every few hours while automatic checks are on.
pub fn spawn_background_checks(app: AppHandle) {
    std::thread::Builder::new()
        .name("update-checker".into())
        .spawn(move || {
            std::thread::sleep(FIRST_CHECK_DELAY);
            loop {
                let enabled = app.state::<AppState>().settings().auto_check_updates;
                let due = status(&app)
                    .last_checked
                    .is_none_or(|at| now_ms() - at >= CHECK_INTERVAL_MS);
                if enabled && due && !cfg!(debug_assertions) {
                    tauri::async_runtime::block_on(check(&app, false));
                }
                std::thread::sleep(Duration::from_secs(60));
            }
        })
        .expect("failed to start the update checker");
}
