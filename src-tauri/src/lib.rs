use tauri::{
    AppHandle, Manager,
    menu::{Menu, MenuItem},
    tray::{TrayIconBuilder, TrayIconEvent},
};

mod gesture;
mod window_manager;
mod input_inject; // Phase3+ 占位

// ─── 窗口控制命令 ────────────────────────────────────────────────────────────

/// 设置鼠标事件穿透
/// ignore = true  → 窗口完全穿透（鼠标事件落到下层窗口）
/// ignore = false → 窗口正常接收鼠标事件
#[tauri::command]
fn set_ignore_cursor_events(app: AppHandle, ignore: bool) -> Result<(), String> {
    let window = app.get_webview_window("main").ok_or("window not found")?;
    window
        .set_ignore_cursor_events(ignore)
        .map_err(|e| e.to_string())
}

/// 设置窗口位置（接收逻辑像素坐标，自动处理 DPI 缩放）
#[tauri::command]
fn set_window_position(app: AppHandle, x: f64, y: f64) -> Result<(), String> {
    let window = app.get_webview_window("main").ok_or("window not found")?;
    window
        .set_position(tauri::LogicalPosition::new(x, y))
        .map_err(|e| e.to_string())
}

/// 设置窗口大小（接收逻辑像素尺寸，自动处理 DPI 缩放）
#[tauri::command]
fn set_window_size(app: AppHandle, width: f64, height: f64) -> Result<(), String> {
    let window = app.get_webview_window("main").ok_or("window not found")?;
    // 临时解除最小尺寸限制，以支持动态调整
    let _ = window.set_min_size(Some(tauri::LogicalSize::new(1.0_f64, 1.0_f64)));
    window
        .set_size(tauri::LogicalSize::new(width, height))
        .map_err(|e| e.to_string())
}

/// 获取主显示器的缩放因子
#[tauri::command]
fn get_scale_factor(app: AppHandle) -> Result<f64, String> {
    let window = app.get_webview_window("main").ok_or("window not found")?;
    window.scale_factor().map_err(|e| e.to_string())
}

/// 获取屏幕物理尺寸（像素）
/// 返回 (physical_width, physical_height)
#[cfg(windows)]
#[tauri::command]
fn get_screen_size() -> (u32, u32) {
    use windows::Win32::UI::WindowsAndMessaging::{GetSystemMetrics, SM_CXSCREEN, SM_CYSCREEN};
    unsafe {
        let w = GetSystemMetrics(SM_CXSCREEN) as u32;
        let h = GetSystemMetrics(SM_CYSCREEN) as u32;
        (w, h)
    }
}

#[cfg(not(windows))]
#[tauri::command]
fn get_screen_size() -> (u32, u32) {
    (1920, 1080) // 非 Windows 平台回退
}

/// 重新置顶窗口（解决被任务栏预览等覆盖的问题）
#[tauri::command]
fn reassert_always_on_top(app: AppHandle) -> Result<(), String> {
    let window = app.get_webview_window("main").ok_or("window not found")?;
    // 先取消置顶再重新置顶，确保 z-order 刷新
    let _ = window.set_always_on_top(false);
    window
        .set_always_on_top(true)
        .map_err(|e| e.to_string())
}

/// 获取窗口当前位置（返回逻辑像素）
#[tauri::command]
fn get_window_position(app: AppHandle) -> Result<(f64, f64), String> {
    let window = app.get_webview_window("main").ok_or("window not found")?;
    let scale = window.scale_factor().map_err(|e| e.to_string())?;
    let pos = window.outer_position().map_err(|e| e.to_string())?;
    Ok((pos.x as f64 / scale, pos.y as f64 / scale))
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

            // ── 初始状态：窗口不穿透（小窗口可以接收鼠标事件用于拖拽）──────
            // 默认 ignore = false，200x200 小窗口正常接收事件

            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            set_ignore_cursor_events,
            set_window_position,
            set_window_size,
            get_screen_size,
            get_scale_factor,
            get_window_position,
            reassert_always_on_top,
            start_screen_capture,
            inject_input,
        ])
        .run(tauri::generate_context!())
        .expect("error while running Met");
}
