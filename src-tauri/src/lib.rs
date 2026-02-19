use tauri::{
    AppHandle, Manager,
    menu::{Menu, MenuItem},
    tray::{TrayIconBuilder, TrayIconEvent},
};

mod gesture;
mod window_manager;
mod input_inject; // Phase3+ 占位

#[tauri::command]
fn set_ignore_cursor_events(app: AppHandle, ignore: bool) -> Result<(), String> {
    let window = app.get_webview_window("main").ok_or("window not found")?;
    window
        .set_ignore_cursor_events(ignore)
        .map_err(|e| e.to_string())
}

#[tauri::command]
fn set_window_position(app: AppHandle, x: f64, y: f64) -> Result<(), String> {
    let window = app.get_webview_window("main").ok_or("window not found")?;
    window
        .set_position(tauri::PhysicalPosition::new(x as i32, y as i32))
        .map_err(|e| e.to_string())
}

#[tauri::command]
fn set_window_size(app: AppHandle, width: u32, height: u32) -> Result<(), String> {
    let window = app.get_webview_window("main").ok_or("window not found")?;
    window
        .set_size(tauri::PhysicalSize::new(width, height))
        .map_err(|e| e.to_string())
}

#[tauri::command]
fn get_screen_size() -> (u32, u32) {
    // 简单实现，后续可扩展多显示器
    (1920, 1080)
}

// ─── 远程同屏接口占位（Phase 3+）────────────────────────────────────────────
#[tauri::command]
fn start_screen_capture(_app: AppHandle) -> Result<(), String> {
    Err("screen_capture: not implemented in Phase 1".into())
}

#[tauri::command]
fn inject_input(_app: AppHandle, _event_json: String) -> Result<(), String> {
    Err("inject_input: not implemented in Phase 1".into())
}
// ─────────────────────────────────────────────────────────────────────────────

pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_updater::Builder::new().build())
        .plugin(tauri_plugin_notification::init())
        .setup(|app| {
            // ── 系统托盘 ──────────────────────────────────────────────────────
            let quit = MenuItem::with_id(app, "quit", "退出 Met", true, None::<&str>)?;
            let show = MenuItem::with_id(app, "show", "显示", true, None::<&str>)?;
            let menu = Menu::with_items(app, &[&show, &quit])?;

            let _tray = TrayIconBuilder::new()
                .icon(app.default_window_icon().unwrap().clone())
                .menu(&menu)
                .on_menu_event(|app, event| match event.id.as_ref() {
                    "quit" => app.exit(0),
                    "show" => {
                        if let Some(w) = app.get_webview_window("main") {
                            let _ = w.show();
                            let _ = w.set_focus();
                        }
                    }
                    _ => {}
                })
                .on_tray_icon_event(|_tray, event| {
                    if let TrayIconEvent::Click { .. } = event {}
                })
                .build(app)?;

            // ── 启动全局手势监听 ──────────────────────────────────────────────
            let app_handle = app.handle().clone();
            gesture::start_global_listener(app_handle);

            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            set_ignore_cursor_events,
            set_window_position,
            set_window_size,
            get_screen_size,
            start_screen_capture,
            inject_input,
        ])
        .run(tauri::generate_context!())
        .expect("error while running Met");
}
