mod commands;
mod db;
mod monitor;
mod platform;
mod privacy;
mod settings;
mod state;
mod updates;

use std::sync::atomic::Ordering;
use std::time::{Duration, Instant};

use tauri::image::Image;
use tauri::menu::{CheckMenuItem, Menu, MenuEvent, MenuItem, PredefinedMenuItem};
use tauri::tray::{MouseButton, MouseButtonState, TrayIconBuilder, TrayIconEvent};
use tauri::{AppHandle, Emitter, Manager, Theme, WindowEvent, Wry};
use tauri_plugin_autostart::ManagerExt as _;
use tauri_plugin_dialog::{DialogExt, MessageDialogButtons, MessageDialogKind};
use tauri_plugin_global_shortcut::ShortcutState;

use crate::state::{lock, AppState};

pub const MAIN_WINDOW: &str = "main";
pub const TRAY_ID: &str = "main-tray";
/// Passed by the login item so a login launch can stay in the tray.
const AUTOSTART_ARG: &str = "--autostart";
/// Clicking the tray icon on Windows blurs the window before the click arrives;
/// a blur this recent still counts as "focused" so the click hides the window.
const BLUR_GRACE: Duration = Duration::from_millis(400);

struct TrayItems {
    menu: Menu<Wry>,
    pause: CheckMenuItem<Wry>,
    update: MenuItem<Wry>,
}

pub fn show_main_window(app: &AppHandle) {
    let Some(window) = app.get_webview_window(MAIN_WINDOW) else {
        return;
    };
    platform::remember_foreground();
    #[cfg(target_os = "macos")]
    let _ = app.show();
    if window.is_minimized().unwrap_or(false) {
        let _ = window.unminimize();
    }
    if let Err(error) = window.show() {
        eprintln!("Failed to show window: {error}");
    }
    if let Err(error) = window.set_focus() {
        eprintln!("Failed to focus window: {error}");
    }
    let _ = window.emit("window-shown", ());
}

pub fn hide_main_window(app: &AppHandle) {
    if let Some(window) = app.get_webview_window(MAIN_WINDOW) {
        let _ = window.hide();
    }
    // Hiding the app hands focus back to the app the user came from.
    #[cfg(target_os = "macos")]
    let _ = app.hide();
}

/// Hides the window only when the user is looking at it; otherwise brings it forward.
/// A window that is open but behind other apps is "visible", so visibility alone
/// is not enough — that was why the tray needed two clicks.
pub fn toggle_main_window(app: &AppHandle) {
    let Some(window) = app.get_webview_window(MAIN_WINDOW) else {
        return;
    };
    let visible = window.is_visible().unwrap_or(false) && !window.is_minimized().unwrap_or(false);
    let recently_blurred = app
        .try_state::<AppState>()
        .and_then(|state| *lock(&state.last_blur))
        .is_some_and(|at| at.elapsed() < BLUR_GRACE);
    let focused = window.is_focused().unwrap_or(false) || recently_blurred;
    if visible && focused {
        hide_main_window(app);
    } else {
        show_main_window(app);
    }
}

pub fn apply_theme(app: &AppHandle, dark: bool) {
    if let Some(window) = app.get_webview_window(MAIN_WINDOW) {
        let _ = window.set_theme(Some(if dark { Theme::Dark } else { Theme::Light }));
    }
}

pub fn sync_tray_pause(app: &AppHandle, monitor_enabled: bool) {
    if let Some(items) = app.try_state::<TrayItems>() {
        let _ = items.pause.set_checked(!monitor_enabled);
    }
}

pub fn sync_tray_update(app: &AppHandle, status: &updates::UpdateStatus) {
    let Some(items) = app.try_state::<TrayItems>() else {
        return;
    };
    let version = status.version.as_deref().unwrap_or_default();
    let (text, enabled) = match status.phase {
        updates::Phase::Available => (format!("Install Update {version}…"), true),
        updates::Phase::Downloading => {
            let percent = status
                .total
                .filter(|total| *total > 0)
                .map(|total| status.downloaded * 100 / total);
            match percent {
                Some(percent) => (format!("Downloading Update… {percent}%"), false),
                None => ("Downloading Update…".to_string(), false),
            }
        }
        updates::Phase::Installing => ("Installing Update…".to_string(), false),
        updates::Phase::Checking => ("Checking for Updates…".to_string(), false),
        _ => ("Check for Updates…".to_string(), true),
    };
    let _ = items.update.set_text(text);
    let _ = items.update.set_enabled(enabled);
}

/// macOS shows a status item's menu on every click once one is attached, so the
/// menu is attached only for the moment a right click opens it. `performClick`
/// blocks while the menu is open, so detaching afterwards is safe. Runs off the
/// main thread because each tray call waits for the main thread.
#[cfg(target_os = "macos")]
fn show_tray_menu(tray: &tauri::tray::TrayIcon) {
    let tray = tray.clone();
    let Some(menu) = tray.app_handle().try_state::<TrayItems>().map(|items| items.menu.clone()) else {
        return;
    };
    std::thread::spawn(move || {
        if tray.set_menu(Some(menu)).is_ok() {
            let _ = tray.with_inner_tray_icon(|inner| inner.show_menu());
        }
        let _ = tray.set_menu(None::<Menu<Wry>>);
    });
}

fn build_tray(app: &tauri::App) -> tauri::Result<()> {
    let handle = app.handle();
    let paused = !app.state::<AppState>().settings().monitor_enabled;

    let open = MenuItem::with_id(handle, "open", "Open ClipDude", true, None::<&str>)?;
    let pause = CheckMenuItem::with_id(handle, "pause", "Pause Recording", true, paused, None::<&str>)?;
    let clear = MenuItem::with_id(handle, "clear", "Clear Unpinned History…", true, None::<&str>)?;
    let settings = MenuItem::with_id(handle, "settings", "Settings…", true, None::<&str>)?;
    let update = MenuItem::with_id(handle, "update", "Check for Updates…", true, None::<&str>)?;
    let quit = MenuItem::with_id(handle, "quit", "Quit ClipDude", true, None::<&str>)?;
    let separator = PredefinedMenuItem::separator(handle)?;
    let separator2 = PredefinedMenuItem::separator(handle)?;
    let menu = Menu::with_items(
        handle,
        &[&open, &pause, &separator, &clear, &settings, &update, &separator2, &quit],
    )?;

    #[cfg(target_os = "macos")]
    let icon = Image::from_bytes(include_bytes!("../icons/tray-template.png"))?;
    #[cfg(not(target_os = "macos"))]
    let icon = Image::from_bytes(include_bytes!("../icons/32x32.png"))?;

    let builder = TrayIconBuilder::with_id(TRAY_ID)
        .icon(icon)
        .icon_as_template(cfg!(target_os = "macos"))
        .tooltip("ClipDude")
        .show_menu_on_left_click(false)
        .on_menu_event(handle_menu_event)
        .on_tray_icon_event(|tray, event| match event {
            // One click opens ClipDude; a second click while it is in front hides it.
            TrayIconEvent::Click {
                button: MouseButton::Left,
                button_state: MouseButtonState::Up,
                ..
            } => toggle_main_window(tray.app_handle()),
            #[cfg(target_os = "macos")]
            TrayIconEvent::Click {
                button: MouseButton::Right,
                button_state: MouseButtonState::Down,
                ..
            } => show_tray_menu(tray),
            _ => {}
        });
    // Windows opens an attached menu on right click only. Linux trays cannot report
    // clicks at all, so the menu is the only way in there.
    #[cfg(not(target_os = "macos"))]
    let builder = builder.menu(&menu);
    builder.build(app)?;

    app.manage(TrayItems { menu, pause, update });
    Ok(())
}

fn handle_menu_event(app: &AppHandle, event: MenuEvent) {
    match event.id.as_ref() {
        "open" => show_main_window(app),
        "pause" => {
            let state = app.state::<AppState>();
            let paused = app
                .try_state::<TrayItems>()
                .and_then(|items| items.pause.is_checked().ok())
                .unwrap_or(false);
            let mut next = state.settings();
            next.monitor_enabled = !paused;
            if let Err(error) = commands::apply_settings(app, &state, next) {
                eprintln!("Failed to toggle recording: {error}");
            }
        }
        "clear" => confirm_clear_from_tray(app),
        "settings" => {
            show_main_window(app);
            let _ = app.emit("open-settings", ());
        }
        "update" => {
            show_main_window(app);
            let _ = app.emit("open-update", ());
        }
        "quit" => app.exit(0),
        _ => {}
    }
}

fn confirm_clear_from_tray(app: &AppHandle) {
    let handle = app.clone();
    app.dialog()
        .message("Delete all unpinned clips? Pinned clips are kept.")
        .title("Clear Clipboard History")
        .kind(MessageDialogKind::Warning)
        .buttons(MessageDialogButtons::OkCancelCustom("Clear".into(), "Cancel".into()))
        .show(move |confirmed| {
            if !confirmed {
                return;
            }
            let state = handle.state::<AppState>();
            match state.with_db(|db| db.clear(false)) {
                Ok(_) => state::notify_clips_changed(&handle),
                Err(error) => eprintln!("Failed to clear history: {error}"),
            }
        });
}

/// Shows the window once the UI has rendered, so it never flashes empty or unstyled.
fn show_when_ready(app: AppHandle) {
    std::thread::spawn(move || {
        let deadline = Instant::now() + Duration::from_secs(3);
        while Instant::now() < deadline
            && !app
                .try_state::<AppState>()
                .is_some_and(|state| state.frontend_ready.load(Ordering::Acquire))
        {
            std::thread::sleep(Duration::from_millis(20));
        }
        show_main_window(&app);
    });
}

fn setup(app: &mut tauri::App) -> Result<(), Box<dyn std::error::Error>> {
    #[cfg(target_os = "macos")]
    app.set_activation_policy(tauri::ActivationPolicy::Accessory);

    let handle = app.handle().clone();
    let data_dir = app.path().app_data_dir()?;
    std::fs::create_dir_all(&data_dir)?;

    let loaded = settings::load(&data_dir);
    let mut current = loaded.settings;
    let autolaunch = app.autolaunch();
    let os_autostart = autolaunch.is_enabled().unwrap_or(false);
    if !loaded.has_auto_start {
        current.auto_start = os_autostart;
    }
    // Re-register in release builds so the login item points at this binary with the
    // launch flag. Skipped in development so `tauri dev` never replaces the login item.
    if !cfg!(debug_assertions) {
        let synced = if current.auto_start {
            autolaunch.enable()
        } else if os_autostart {
            autolaunch.disable()
        } else {
            Ok(())
        };
        if let Err(error) = synced {
            eprintln!("Failed to sync launch at login: {error}");
        }
    }
    if let Err(error) = settings::save(&data_dir, &current) {
        eprintln!("Failed to save settings: {error}");
    }

    let (db, db_warning) = state::open_database(&data_dir, &current.db_folder);
    app.manage(AppState::new(data_dir, current.clone(), db, db_warning));
    app.manage(updates::Updates::new(app.package_info().version.to_string()));

    apply_theme(&handle, current.dark_mode);
    build_tray(app)?;
    state::run_retention(&handle);
    state::notify_clips_changed(&handle);

    if let Err(error) = commands::register_shortcut(&handle, None, &current.shortcut) {
        eprintln!("{error}");
        *lock(&app.state::<AppState>().shortcut_error) = Some(error);
    }

    monitor::spawn(handle.clone());
    updates::spawn_background_checks(handle.clone());

    let launched_at_login = std::env::args().any(|arg| arg == AUTOSTART_ARG);
    if !launched_at_login || current.show_on_login {
        show_when_ready(handle);
    }
    Ok(())
}

pub fn run() {
    let app = tauri::Builder::default()
        .plugin(tauri_plugin_single_instance::init(|app, _args, _cwd| {
            show_main_window(app);
        }))
        .plugin(tauri_plugin_clipboard_manager::init())
        .plugin(tauri_plugin_dialog::init())
        .plugin(
            tauri_plugin_autostart::Builder::new()
                .args([AUTOSTART_ARG])
                .build(),
        )
        .plugin(
            tauri_plugin_global_shortcut::Builder::new()
                .with_handler(|app, _shortcut, event| {
                    if event.state() == ShortcutState::Pressed {
                        toggle_main_window(app);
                    }
                })
                .build(),
        )
        .plugin(tauri_plugin_updater::Builder::new().build())
        .plugin(tauri_plugin_notification::init())
        .plugin(tauri_plugin_opener::init())
        .invoke_handler(tauri::generate_handler![
            commands::frontend_ready,
            commands::get_bootstrap,
            commands::list_clips,
            commands::get_stats,
            commands::get_clip_content,
            commands::copy_clip,
            commands::copy_text,
            commands::toggle_pin,
            commands::delete_clip,
            commands::clear_history,
            commands::retention_impact,
            commands::optimize_database,
            commands::get_database_info,
            commands::retry_database,
            commands::set_database_folder,
            commands::update_settings,
            commands::reset_settings,
            commands::hide_window,
            commands::quit_app,
            commands::get_update_status,
            commands::check_for_update,
            commands::install_update,
            commands::open_release_page,
        ])
        .on_window_event(|window, event| match event {
            WindowEvent::CloseRequested { api, .. } => {
                api.prevent_close();
                hide_main_window(window.app_handle());
            }
            WindowEvent::Focused(false) => {
                if let Some(state) = window.try_state::<AppState>() {
                    *lock(&state.last_blur) = Some(Instant::now());
                }
            }
            _ => {}
        })
        .setup(setup)
        .build(tauri::generate_context!())
        .expect("failed to build ClipDude");

    app.run(|app, event| {
        // Opening ClipDude from Finder or Launchpad while it runs should show the window.
        #[cfg(target_os = "macos")]
        if let tauri::RunEvent::Reopen { .. } = event {
            show_main_window(app);
        }
        let _ = (app, event);
    });
}
