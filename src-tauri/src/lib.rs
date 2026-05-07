#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

use tauri::{
    menu::{Menu, MenuItem},
    tray::{MouseButton, MouseButtonState, TrayIconBuilder, TrayIconEvent},
    AppHandle, Manager, WebviewWindow, WebviewWindowBuilder,
};
use tauri_plugin_global_shortcut::{Code, GlobalShortcutExt, Modifiers, Shortcut, ShortcutState};
use tauri_plugin_positioner::{Position, WindowExt};

const MAIN_WINDOW_LABEL: &str = "main";

/// ========================================
/// App Shortcut Logic
/// ========================================
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

/// ========================================
/// Window Management
/// ========================================
fn get_or_create_window(app: &AppHandle) -> tauri::Result<WebviewWindow> {
    if let Some(window) = app.get_webview_window(MAIN_WINDOW_LABEL) {
        return Ok(window);
    }

    let mut builder = WebviewWindowBuilder::new(
        app,
        MAIN_WINDOW_LABEL,
        tauri::WebviewUrl::App("index.html".into()),
    )
    .title("ClipDude")
    .visible(false)
    .resizable(true)
    .fullscreen(false)
    .decorations(false) // This is why you need `data-tauri-drag-region` in HTML
    .transparent(true)
    .always_on_top(true)
    .skip_taskbar(true);

    #[cfg(desktop)]
    {
        builder = builder
            .inner_size(400.0, 600.0)
            .min_inner_size(300.0, 400.0);
    }

    let window = builder.build()?;

    let _ = window.set_shadow(true);

    Ok(window)
}

fn show_window(window: &WebviewWindow) {
    // Spotlight / Raycast standard UX: Center of the active screen
    let _ = window.move_window(Position::Center);

    // Ensure the window is brought to the front and grabs keyboard focus
    window.show().unwrap();
    window.unminimize().unwrap();
    window.set_focus().unwrap();
}

fn toggle_window(app: &AppHandle) {
    if let Ok(window) = get_or_create_window(app) {
        if window.is_visible().unwrap_or(false) {
            let _ = window.hide();
        } else {
            show_window(&window);
        }
    }
}

/// ========================================
/// Main Entry Point
/// ========================================
#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_fs::init())
        .plugin(tauri_plugin_os::init())
        .plugin(tauri_plugin_shell::init())
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_process::init())
        .plugin(tauri_plugin_notification::init())
        .plugin(tauri_plugin_positioner::init())
        .plugin(tauri_plugin_clipboard_manager::init())
        .plugin(tauri_plugin_store::Builder::new().build())
        .plugin(tauri_plugin_sql::Builder::default().build())
        .plugin(tauri_plugin_updater::Builder::new().build())
        .plugin(tauri_plugin_autostart::Builder::new().build())
        .plugin(tauri_plugin_single_instance::init(|app, _args, _cwd| {
            let _ = app
                .get_webview_window(MAIN_WINDOW_LABEL)
                .map(|w| show_window(&w));
        }))
        .plugin(
            tauri_plugin_global_shortcut::Builder::new()
                .with_handler(|app, shortcut, event| {
                    if event.state() == ShortcutState::Pressed && shortcut == &app_shortcut() {
                        toggle_window(app);
                    }
                })
                .build(),
        )
        .setup(|app| {
            // ========================================
            // macOS Specifics: Menu & Dock Behavior
            // ========================================
            #[cfg(target_os = "macos")]
            {
                // Hides app from Dock, acts as a pure background utility
                app.set_activation_policy(tauri::ActivationPolicy::Accessory);

                // Inject default macOS menu so Cmd+C/Cmd+V still work in Accessory mode
                let default_menu = tauri::menu::Menu::default(app.handle())?;
                app.set_menu(default_menu)?;
            }

            // ========================================
            // Global Shortcuts
            // ========================================
            let _ = app.global_shortcut().register(app_shortcut());

            // ========================================
            // System Tray (Menubar) Setup
            // ========================================
            use tauri::menu::{Menu, MenuItem, PredefinedMenuItem};

            // 1. Define Context Menu Items (Shows on Right-Click)
            let toggle_i =
                MenuItem::with_id(app, "toggle", "Show/Hide ClipDude", true, None::<&str>)?;
            let settings_i =
                MenuItem::with_id(app, "settings", "Preferences...", true, None::<&str>)?;
            let separator = PredefinedMenuItem::separator(app)?;
            let quit_i = MenuItem::with_id(app, "quit", "Quit ClipDude", true, None::<&str>)?;

            let tray_menu = Menu::with_items(app, &[&toggle_i, &settings_i, &separator, &quit_i])?;

            // 2. Build the Tray Icon
            let _tray = tauri::tray::TrayIconBuilder::new()
                .icon(app.default_window_icon().unwrap().clone())
                .menu(&tray_menu)
                .show_menu_on_left_click(false) // CRITICAL: Reserves menu for right-click only
                .on_menu_event(|app, event| match event.id.as_ref() {
                    "quit" => app.exit(0),
                    "toggle" => toggle_window(app),
                    "settings" => {
                        println!("Settings clicked - build a settings window later!");
                    }
                    _ => {}
                })
                .on_tray_icon_event(|tray, event| match event {
                    tauri::tray::TrayIconEvent::Click {
                        button: tauri::tray::MouseButton::Left,
                        button_state: tauri::tray::MouseButtonState::Up,
                        ..
                    } => {
                        // Left-click snaps the window open/closed
                        toggle_window(tray.app_handle());
                    }
                    _ => {}
                })
                .build(app)?;

            Ok(())
        })
        .on_window_event(|window, event| match event {
            tauri::WindowEvent::CloseRequested { api, .. } => {
                // Production standard: hitting the 'X' minimizes to tray instead of killing the app
                api.prevent_close();
                let _ = window.hide();
            }
            tauri::WindowEvent::Focused(is_focused) => {
                // Auto-hide when clicking outside the window
                if !is_focused {
                    let _ = window.hide();
                }
            }
            _ => {}
        })
        .run(tauri::generate_context!())
        .expect("failed to run ClipDude");
}
