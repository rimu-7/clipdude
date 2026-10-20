use std::thread;
use std::time::{Duration, Instant};

use tauri::{AppHandle, Manager};
use tauri_plugin_clipboard_manager::ClipboardExt;

use crate::platform;
use crate::privacy;
use crate::state::{self, lock, AppState};

/// macOS and Windows expose a cheap change counter; Linux has to read the contents.
const POLL_INTERVAL: Duration = if cfg!(target_os = "linux") {
    Duration::from_millis(700)
} else {
    Duration::from_millis(350)
};
/// How often time-based retention runs while the app stays open.
const MAINTENANCE_INTERVAL: Duration = Duration::from_secs(30 * 60);
/// Larger copies (whole log files, base64 blobs) are skipped to keep history fast.
const MAX_CLIP_BYTES: usize = 5 * 1024 * 1024;

pub fn spawn(app: AppHandle) {
    thread::Builder::new()
        .name("clipboard-monitor".into())
        .spawn(move || run(app))
        .expect("failed to start the clipboard monitor");
}

fn run(app: AppHandle) {
    let state = app.state::<AppState>();
    let mut last_token = None;
    // Do not record whatever was on the clipboard before start-up or while paused.
    let mut needs_baseline = true;
    let mut last_maintenance = Instant::now();

    loop {
        thread::sleep(POLL_INTERVAL);

        if last_maintenance.elapsed() >= MAINTENANCE_INTERVAL {
            last_maintenance = Instant::now();
            state::run_retention(&app);
        }

        if !lock(&state.settings).monitor_enabled {
            needs_baseline = true;
            continue;
        }

        let token = platform::change_token();
        if token.is_some() && token == last_token {
            continue;
        }
        last_token = token;

        if platform::clipboard_is_private() {
            needs_baseline = false;
            continue;
        }

        let text = app.clipboard().read_text().ok();
        if needs_baseline {
            needs_baseline = false;
            *lock(&state.last_text) = text.unwrap_or_default();
            continue;
        }
        let Some(text) = text else { continue };
        if text.trim().is_empty() || text.len() > MAX_CLIP_BYTES {
            continue;
        }
        {
            let mut last = lock(&state.last_text);
            if *last == text {
                continue;
            }
            *last = text.clone();
        }

        capture(&app, &state, &text);
    }
}

fn capture(app: &AppHandle, state: &AppState, text: &str) {
    let settings = state.settings();
    let source = if settings.show_source_app || !settings.excluded_apps.is_empty() {
        platform::frontmost_app()
    } else {
        String::new()
    };
    if is_excluded(&source, &settings.excluded_apps) {
        return;
    }
    match store_clip(state, text, &source) {
        Ok(true) => state::notify_clips_changed(app),
        Ok(false) => {}
        Err(error) => eprintln!("Could not save clip: {error}"),
    }
}

/// Saves `text` to history according to the privacy and size settings.
/// Returns false when the settings say the text must not be stored.
pub fn store_clip(state: &AppState, text: &str, source: &str) -> Result<bool, String> {
    let settings = state.settings();
    let sensitive =
        (settings.detect_sensitive || settings.skip_sensitive) && privacy::is_sensitive(text);
    if sensitive && settings.skip_sensitive {
        return Ok(false);
    }
    state.with_db(|db| {
        db.record(text, source, sensitive && settings.detect_sensitive)?;
        if settings.max_history_items > 0 {
            db.enforce_max(settings.max_history_items)?;
        }
        Ok(true)
    })
}

pub fn is_excluded(source: &str, excluded: &[String]) -> bool {
    if source.is_empty() {
        return false;
    }
    let source = source.to_lowercase();
    excluded
        .iter()
        .map(|app| app.trim().to_lowercase())
        .any(|app| !app.is_empty() && source.contains(&app))
}

#[cfg(test)]
mod tests {
    use super::is_excluded;

    #[test]
    fn exclusion_is_case_insensitive_and_ignores_unknown_sources() {
        let list = vec!["com.bitwarden.desktop".to_string(), "KeePassXC.exe".to_string()];
        assert!(is_excluded("com.Bitwarden.desktop", &list));
        assert!(is_excluded("keepassxc.exe", &list));
        assert!(!is_excluded("", &list));
        assert!(!is_excluded("com.apple.Safari", &list));
    }
}
