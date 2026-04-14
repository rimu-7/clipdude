use tauri::{
    tray::{MouseButton, MouseButtonState, TrayIconBuilder, TrayIconEvent},
    Manager,
};

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        // Initialize your plugins
        .plugin(tauri_plugin_process::init())
        .plugin(tauri_plugin_store::Builder::new().build())
        .plugin(tauri_plugin_sql::Builder::default().build())
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_clipboard_manager::init())

        // 1. Setup the System Tray
        .setup(|app| {
            let _tray = TrayIconBuilder::new()
                // Use the default icon from your tauri.conf.json
                .icon(app.default_window_icon().unwrap().clone())
                .on_tray_icon_event(|tray, event| match event {
                    // Listen for a Left Click on the Tray Icon
                    TrayIconEvent::Click {
                        button: MouseButton::Left,
                        button_state: MouseButtonState::Up,
                        ..
                    } => {
                        let app = tray.app_handle();
                        if let Some(window) = app.get_webview_window("main") {
                            let is_visible = window.is_visible().unwrap_or(false);
                            if is_visible {
                                let _ = window.hide(); // Hide if open
                            } else {
                                let _ = window.show(); // Show if hidden
                                let _ = window.set_focus(); // Bring to front
                            }
                        }
                    }
                    _ => {}
                })
                .build(app)?;
            Ok(())
        })

        // 2. Intercept the Window Close Event
        .on_window_event(|window, event| match event {
            tauri::WindowEvent::CloseRequested { api, .. } => {
                // Prevent the OS from destroying the app
                api.prevent_close();
                // Just hide the window instead
                let _ = window.hide();
            }
            _ => {}
        })
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
