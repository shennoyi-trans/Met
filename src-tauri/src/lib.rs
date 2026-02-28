use tauri::{
    AppHandle, Manager,
    menu::{Menu, MenuItem},
    tray::{TrayIconBuilder, TrayIconEvent},
};

mod gestures;
mod window_manager;
mod input_inject; // Phase3+ 占位

use gestures::recognizers::circle::CircleRecognizer;
use gestures::recognizers::GestureRecognizer;

// ── 宠物位置同步 ────────────────────────────────────────────────────────────

/// 前端在宠物位置变化时调用，同步给全局钩子用于拖拽命中判定
#[tauri::command]
fn update_pet_position(app: AppHandle, x: f64, y: f64) -> Result<(), String> {
    let window = app.get_webview_window("main").ok_or("window not found")?;
    let scale = window.scale_factor().map_err(|e| e.to_string())?;
    gestures::set_pet_position(x, y, scale);
    Ok(())
}

// ── 手势识别器注册 ──────────────────────────────────────────────────────────

/// 前端切换宠物时调用，注册该宠物需要的手势识别器
#[tauri::command]
fn register_recognizers(names: Vec<String>) -> Result<(), String> {
    let mut list: Vec<Box<dyn GestureRecognizer>> = Vec::new();
    for name in &names {
        match name.as_str() {
            "circle" => list.push(Box::new(CircleRecognizer)),
            other => eprintln!("[lib] ⚠️ 未知识别器: {}", other),
        }
    }
    gestures::set_recognizers(list);
    Ok(())
}

// ── 面板窗口控制 ────────────────────────────────────────────────────────────

/// 在指定屏幕位置显示面板窗口（逻辑像素）
#[tauri::command]
fn show_panel(app: AppHandle, x: f64, y: f64) -> Result<(), String> {
    let panel = app.get_webview_window("panel").ok_or("panel window not found")?;
    panel.set_position(tauri::LogicalPosition::new(x, y))
        .map_err(|e| e.to_string())?;
    panel.show().map_err(|e| e.to_string())?;
    panel.set_focus().map_err(|e| e.to_string())?;
    Ok(())
}

/// 隐藏面板窗口
#[tauri::command]
fn hide_panel(app: AppHandle) -> Result<(), String> {
    let panel = app.get_webview_window("panel").ok_or("panel window not found")?;
    panel.hide().map_err(|e| e.to_string())?;
    Ok(())
}

// ── 通用窗口控制 ────────────────────────────────────────────────────────────

/// 获取主显示器的缩放因子
#[tauri::command]
fn get_scale_factor(app: AppHandle) -> Result<f64, String> {
    let window = app.get_webview_window("main").ok_or("window not found")?;
    window.scale_factor().map_err(|e| e.to_string())
}

// ★ 修复：获取虚拟桌面尺寸（覆盖所有显示器）+ 左上角偏移
#[cfg(windows)]
fn get_virtual_screen() -> (f64, f64, f64, f64) {
    use windows::Win32::UI::WindowsAndMessaging::{
        GetSystemMetrics, SM_XVIRTUALSCREEN, SM_YVIRTUALSCREEN,
        SM_CXVIRTUALSCREEN, SM_CYVIRTUALSCREEN,
    };
    unsafe {
        let x = GetSystemMetrics(SM_XVIRTUALSCREEN) as f64;
        let y = GetSystemMetrics(SM_YVIRTUALSCREEN) as f64;
        let w = GetSystemMetrics(SM_CXVIRTUALSCREEN) as f64;
        let h = GetSystemMetrics(SM_CYVIRTUALSCREEN) as f64;
        (x, y, w, h)
    }
}

/// ★ 修复：获取虚拟桌面物理尺寸（覆盖所有显示器）
#[cfg(windows)]
#[tauri::command]
fn get_screen_size() -> (u32, u32) {
    let (_, _, w, h) = get_virtual_screen();
    (w as u32, h as u32)
}

#[cfg(not(windows))]
#[tauri::command]
fn get_screen_size() -> (u32, u32) {
    (1920, 1080)
}

/// 重新置顶窗口（解决被任务栏预览等覆盖的问题）
#[tauri::command]
fn reassert_always_on_top(app: AppHandle) -> Result<(), String> {
    let window = app.get_webview_window("main").ok_or("window not found")?;
    let _ = window.set_always_on_top(false);
    window.set_always_on_top(true).map_err(|e| e.to_string())
}

/// 设置鼠标事件穿透（用于 main 窗口）
#[tauri::command]
fn set_ignore_cursor_events(app: AppHandle, ignore: bool) -> Result<(), String> {
    let window = app.get_webview_window("main").ok_or("window not found")?;
    window.set_ignore_cursor_events(ignore).map_err(|e| e.to_string())
}

/// 设置窗口位置（通用，前端指定 label）
#[tauri::command]
fn set_window_position(app: AppHandle, x: f64, y: f64) -> Result<(), String> {
    let window = app.get_webview_window("main").ok_or("window not found")?;
    window.set_position(tauri::LogicalPosition::new(x, y)).map_err(|e| e.to_string())
}

/// 设置窗口大小（通用）
#[tauri::command]
fn set_window_size(app: AppHandle, width: f64, height: f64) -> Result<(), String> {
    let window = app.get_webview_window("main").ok_or("window not found")?;
    let _ = window.set_min_size(Some(tauri::LogicalSize::new(1.0_f64, 1.0_f64)));
    window.set_size(tauri::LogicalSize::new(width, height)).map_err(|e| e.to_string())
}

/// 获取窗口位置（逻辑像素）
#[tauri::command]
fn get_window_position(app: AppHandle) -> Result<(f64, f64), String> {
    let window = app.get_webview_window("main").ok_or("window not found")?;
    let scale = window.scale_factor().map_err(|e| e.to_string())?;
    let pos = window.outer_position().map_err(|e| e.to_string())?;
    Ok((pos.x as f64 / scale, pos.y as f64 / scale))
}

// ── 远程同屏接口占位（Phase 3+）────────────────────────────────────────────

#[tauri::command]
fn start_screen_capture(_app: AppHandle) -> Result<(), String> {
    Err("screen_capture: not implemented in Phase 1".into())
}

#[tauri::command]
fn inject_input(_app: AppHandle, _event_json: String) -> Result<(), String> {
    Err("inject_input: not implemented in Phase 1".into())
}

// ── 入口 ────────────────────────────────────────────────────────────────────

pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_updater::Builder::new().build())
        .plugin(tauri_plugin_notification::init())
        .setup(|app| {
            // ── 系统托盘 ──────────────────────────────────────────────────
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

            // ── 主窗口：全屏 + 穿透 ──────────────────────────────────────
            let main_win = app.get_webview_window("main")
                .expect("main window not found");

            // ★ 修复：获取虚拟桌面尺寸（覆盖所有显示器）
            let scale = main_win.scale_factor().unwrap_or(1.0);
            let (virt_x, virt_y, phys_w, phys_h) = {
                #[cfg(windows)]
                {
                    get_virtual_screen()
                }
                #[cfg(not(windows))]
                { (0.0, 0.0, 1920.0, 1080.0) }
            };
            let log_x = virt_x / scale;
            let log_y = virt_y / scale;
            let log_w = phys_w / scale;
            let log_h = phys_h / scale;

            // ★ 修复：窗口定位到虚拟桌面左上角（可能是负坐标）
            let _ = main_win.set_position(tauri::LogicalPosition::new(log_x, log_y));
            let _ = main_win.set_min_size(Some(tauri::LogicalSize::new(1.0_f64, 1.0_f64)));
            let _ = main_win.set_size(tauri::LogicalSize::new(log_w, log_h - 1.0));
            let _ = main_win.set_ignore_cursor_events(true);

            eprintln!(
                "[setup] virtual screen: origin=({:.0},{:.0}) size={:.0}x{:.0} phys, {:.0}x{:.0} logical (scale={:.2})",
                virt_x, virt_y, phys_w, phys_h, log_w, log_h, scale
            );

            // ── 启动全局手势监听 ──────────────────────────────────────────
            let app_handle = app.handle().clone();
            gestures::start_global_listener(app_handle);

            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            update_pet_position,
            register_recognizers,
            show_panel,
            hide_panel,
            get_scale_factor,
            get_screen_size,
            reassert_always_on_top,
            set_ignore_cursor_events,
            set_window_position,
            set_window_size,
            get_window_position,
            start_screen_capture,
            inject_input,
        ])
        .run(tauri::generate_context!())
        .expect("error while running Met");
}
