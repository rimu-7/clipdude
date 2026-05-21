#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

use std::sync::{Arc, Mutex};

#[cfg(not(any(target_os = "android", target_os = "ios")))]
use std::time::Duration;

use tauri::AppHandle;

#[cfg(not(any(target_os = "android", target_os = "ios")))]
use tauri::{Emitter, Manager};

#[cfg(not(any(target_os = "android", target_os = "ios")))]
use tauri_plugin_store::StoreExt;

#[cfg(not(any(target_os = "android", target_os = "ios")))]
use tauri_plugin_global_shortcut::{Code, GlobalShortcutExt, Modifiers, Shortcut, ShortcutState};

#[cfg(not(any(target_os = "android", target_os = "ios")))]
use tauri_plugin_positioner::{Position, WindowExt};

#[cfg(not(any(target_os = "android", target_os = "ios")))]
const MAIN_WINDOW_LABEL: &str = "main";

struct AppState {
    #[cfg(not(any(target_os = "android", target_os = "ios")))]
    last_clipboard_content: Mutex<String>,
    excluded_apps: Mutex<Vec<String>>,
    monitor_enabled: Mutex<bool>,
}

#[cfg(not(any(target_os = "android", target_os = "ios")))]
fn app_shortcut() -> Shortcut {
    #[cfg(target_os = "macos")]
    {
        Shortcut::new(Some(Modifiers::SUPER | Modifiers::SHIFT), Code::KeyV)
    }
    #[cfg(not(target_os = "macos"))]
    {
        Shortcut::new(Some(Modifiers::CONTROL | Modifiers::SHIFT), Code::KeyV)
    }
}

#[cfg(not(any(target_os = "android", target_os = "ios")))]
fn toggle_window(app: &AppHandle) {
    if let Some(window) = app.get_webview_window(MAIN_WINDOW_LABEL) {
        if window.is_visible().unwrap_or(false) {
            let _ = window.hide();
        } else {
            let _ = window.move_window(Position::Center);
            window.show().unwrap_or_default();
            window.unminimize().unwrap_or_default();
            window.set_focus().unwrap_or_default();
        }
    }
}

#[cfg(not(any(target_os = "android", target_os = "ios")))]
fn start_clipboard_monitor(app: AppHandle, state: Arc<AppState>) {
    std::thread::spawn(move || {
        let mut last_content = String::new();

        loop {
            std::thread::sleep(Duration::from_millis(300));

            let enabled = *state.monitor_enabled.lock().unwrap_or_else(|e| e.into_inner());
            if !enabled {
                continue;
            }

            let result = arboard::Clipboard::new().and_then(|mut cb| cb.get_text());

            match result {
                Ok(text) => {
                    if !text.is_empty() && text != last_content {
                        let mut last = state.last_clipboard_content.lock().unwrap_or_else(|e| e.into_inner());
                        last_content = text.clone();
                        *last = text.clone();
                        drop(last);

                        let excluded = state.excluded_apps.lock().unwrap_or_else(|e| e.into_inner()).clone();

                        #[cfg(target_os = "macos")]
                        {
                            if let Ok(output) = std::process::Command::new("osascript")
                                .args(["-e", "tell application \"System Events\" to get bundle identifier of first process whose frontmost is true"])
                                .output()
                            {
                                let bundle_id = String::from_utf8_lossy(&output.stdout).trim().to_string();
                                if excluded.iter().any(|ex| bundle_id.to_lowercase().contains(&ex.to_lowercase())) {
                                    continue;
                                }
                            }
                        }

                        let _ = app.emit("clipboard-change", &text);
                    }
                }
                Err(_) => {}
            }
        }
    });
}

#[tauri::command]
#[allow(unused_variables)]
fn smart_paste(app: AppHandle) -> Result<(), String> {
    #[cfg(not(any(target_os = "android", target_os = "ios")))]
    {
        if let Some(window) = app.get_webview_window(MAIN_WINDOW_LABEL) {
            let _ = window.hide();
        }

        std::thread::sleep(Duration::from_millis(80));

        #[cfg(target_os = "macos")]
        {
            std::process::Command::new("osascript")
                .args(["-e", "tell application \"System Events\" to keystroke \"v\" using command down"])
                .spawn()
                .map_err(|e| format!("Smart paste failed: {}", e))?;
        }

        #[cfg(target_os = "linux")]
        {
            std::process::Command::new("xdotool")
                .args(["key", "--clearmodifiers", "ctrl+v"])
                .spawn()
                .map_err(|e| format!("Smart paste failed: {}", e))?;
        }

        #[cfg(target_os = "windows")]
        {
            std::process::Command::new("powershell")
                .args(["-Command", "Add-Type -AssemblyName System.Windows.Forms; [System.Windows.Forms.SendKeys]::SendWait('^v')"])
                .spawn()
                .map_err(|e| format!("Smart paste failed: {}", e))?;
        }
    }

    Ok(())
}

#[tauri::command]
fn get_frontmost_app() -> Result<String, String> {
    #[cfg(target_os = "macos")]
    {
        let output = std::process::Command::new("osascript")
            .args(["-e", "tell application \"System Events\" to get bundle identifier of first process whose frontmost is true"])
            .output()
            .map_err(|e| format!("Failed to get frontmost app: {}", e))?;
        Ok(String::from_utf8_lossy(&output.stdout).trim().to_string())
    }

    #[cfg(not(target_os = "macos"))]
    {
        Ok(String::new())
    }
}

#[tauri::command]
fn set_monitor_enabled(state: tauri::State<'_, AppState>, enabled: bool) {
    *state.monitor_enabled.lock().unwrap_or_else(|e| e.into_inner()) = enabled;
}

#[tauri::command]
fn set_excluded_apps(state: tauri::State<'_, AppState>, apps: Vec<String>) {
    *state.excluded_apps.lock().unwrap_or_else(|e| e.into_inner()) = apps;
}

#[tauri::command]
#[allow(unused_variables)]
fn update_tray_tooltip(app: AppHandle, count: u64) {
    #[cfg(not(any(target_os = "android", target_os = "ios")))]
    {
        if let Some(tray) = app.tray_by_id("main-tray") {
            let _ = tray.set_tooltip(Some(&format!("ClipDude — {} clips", count)));
        }
    }
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    let state = Arc::new(AppState {
        last_clipboard_content: Mutex::new(String::new()),
        excluded_apps: Mutex::new(Vec::new()),
        monitor_enabled: Mutex::new(true),
    });

    #[cfg(not(any(target_os = "android", target_os = "ios")))]
    let monitor_state = state.clone();

    let builder = tauri::Builder::default()
        .plugin(tauri_plugin_fs::init())
        .plugin(tauri_plugin_os::init())
        .plugin(tauri_plugin_shell::init())
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_process::init())
        .plugin(tauri_plugin_notification::init())
        .plugin(tauri_plugin_clipboard_manager::init())
        .plugin(tauri_plugin_store::Builder::new().build())
        .plugin(tauri_plugin_sql::Builder::default().build());

    #[cfg(not(any(target_os = "android", target_os = "ios")))]
    let builder = builder
        .plugin(tauri_plugin_positioner::init())
        .plugin(tauri_plugin_updater::Builder::new().build())
        .plugin(tauri_plugin_autostart::Builder::new().build())
        .plugin(tauri_plugin_single_instance::init(|app, _args, _cwd| {
            let _ = app
                .get_webview_window(MAIN_WINDOW_LABEL)
                .map(|w| {
                    let _ = w.move_window(Position::Center);
                    w.show().unwrap_or_default();
                    w.unminimize().unwrap_or_default();
                    w.set_focus().unwrap_or_default();
                });
        }))
        .plugin(
            tauri_plugin_global_shortcut::Builder::new()
                .with_handler(|app, shortcut, event| {
                    if event.state() == ShortcutState::Pressed && shortcut == &app_shortcut() {
                        toggle_window(app);
                    }
                })
                .build(),
        );

    let builder = builder
        .manage(state)
        .invoke_handler(tauri::generate_handler![
            smart_paste,
            get_frontmost_app,
            set_monitor_enabled,
            set_excluded_apps,
            update_tray_tooltip,
        ])
        .setup(move |_app| {
            #[cfg(not(any(target_os = "android", target_os = "ios")))]
            let app = _app;

            #[cfg(not(any(target_os = "android", target_os = "ios")))]
            {
                #[cfg(target_os = "macos")]
                {
                    app.set_activation_policy(tauri::ActivationPolicy::Accessory);
                    let default_menu = tauri::menu::Menu::default(app.handle())?;
                    app.set_menu(default_menu)?;
                }

                let _ = app.global_shortcut().register(app_shortcut());

                let store = app.store("settings.json")?;
                let excluded: Vec<String> = store
                    .get("excluded_apps")
                    .and_then(|v: serde_json::Value| serde_json::from_value(v.clone()).ok())
                    .unwrap_or_else(|| vec![
                        "com.1password.1password".into(),
                        "com.agilebits.onepassword-osx".into(),
                        "com.bitwarden.desktop".into(),
                        "com.apple.keychainaccess".into(),
                    ]);

                *monitor_state.excluded_apps.lock().unwrap_or_else(|e| e.into_inner()) = excluded;

                use tauri::menu::{Menu, MenuItem, PredefinedMenuItem};

                let toggle_i =
                    MenuItem::with_id(app, "toggle", "Show ClipDude", true, None::<&str>)?;
                let clear_i =
                    MenuItem::with_id(app, "clear-unpinned", "Clear Unpinned", true, None::<&str>)?;
                let settings_i =
                    MenuItem::with_id(app, "settings", "Settings...", true, None::<&str>)?;
                let separator = PredefinedMenuItem::separator(app)?;
                let separator2 = PredefinedMenuItem::separator(app)?;
                let quit_i = MenuItem::with_id(app, "quit", "Quit ClipDude", true, None::<&str>)?;

                let tray_menu = Menu::with_items(app, &[
                    &toggle_i,
                    &clear_i,
                    &separator,
                    &settings_i,
                    &separator2,
                    &quit_i,
                ])?;

                let _tray = tauri::tray::TrayIconBuilder::with_id("main-tray")
                    .icon(app.default_window_icon().unwrap().clone())
                    .tooltip("ClipDude — Clipboard Manager")
                    .menu(&tray_menu)
                    .show_menu_on_left_click(false)
                    .on_menu_event(|app, event| match event.id.as_ref() {
                        "quit" => app.exit(0),
                        "toggle" => toggle_window(app),
                        "clear-unpinned" => {
                            let _ = app.emit("tray-clear-unpinned", ());
                        }
                        "settings" => {
                            let _ = app.emit("open-settings", ());
                            if let Some(window) = app.get_webview_window(MAIN_WINDOW_LABEL) {
                                let _ = window.move_window(Position::Center);
                                window.show().unwrap_or_default();
                                window.unminimize().unwrap_or_default();
                                window.set_focus().unwrap_or_default();
                            }
                        }
                        _ => {}
                    })
                    .on_tray_icon_event(|tray, event| match event {
                        tauri::tray::TrayIconEvent::Click {
                            button: tauri::tray::MouseButton::Left,
                            button_state: tauri::tray::MouseButtonState::Up,
                            ..
                        } => {
                            toggle_window(tray.app_handle());
                        }
                        _ => {}
                    })
                    .build(app)?;

                start_clipboard_monitor(app.handle().clone(), monitor_state.clone());
            }

            Ok(())
        });

    #[cfg(not(any(target_os = "android", target_os = "ios")))]
    let builder = builder.on_window_event(|window, event| match event {
        tauri::WindowEvent::CloseRequested { api, .. } => {
            api.prevent_close();
            let _ = window.hide();
        }
        _ => {}
    });

    builder
        .run(tauri::generate_context!())
        .expect("failed to run ClipDude");
}
