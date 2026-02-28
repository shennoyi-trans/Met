// Prevents additional console window on Windows in release
#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

fn main() {
    // ★ 修复：在创建任何窗口之前声明 Per-Monitor DPI Awareness V2
    // 这确保 GetSystemMetrics 等 Win32 API 返回真实物理像素，
    // 而非 Windows 虚拟化后的缩放值。
    #[cfg(windows)]
    {
        use windows::Win32::UI::HiDpi::{
            SetProcessDpiAwarenessContext, DPI_AWARENESS_CONTEXT_PER_MONITOR_AWARE_V2,
        };
        unsafe {
            let _ = SetProcessDpiAwarenessContext(DPI_AWARENESS_CONTEXT_PER_MONITOR_AWARE_V2);
        }
    }

    met_lib::run()
}
