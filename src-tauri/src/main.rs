// Prevents additional console window on Windows in release
#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

fn main() {
    // ★ 修复：在创建任何窗口之前声明 Per-Monitor DPI Awareness V2
    // 这确保 GetSystemMetrics 等 Win32 API 返回真实物理像素，
    // 而非 Windows 虚拟化后的缩放值。
    //
    // 注意：如果 Tauri/WebView2 运行时已提前设置了 DPI 感知模式，
    // 此调用可能返回 E_ACCESSDENIED，这是正常现象——
    // 我们在 lib.rs 中改用 PhysicalSize/PhysicalPosition 来规避此问题。
    #[cfg(windows)]
    {
        use windows::Win32::UI::HiDpi::{
            SetProcessDpiAwarenessContext, DPI_AWARENESS_CONTEXT_PER_MONITOR_AWARE_V2,
        };
        unsafe {
            match SetProcessDpiAwarenessContext(DPI_AWARENESS_CONTEXT_PER_MONITOR_AWARE_V2) {
                Ok(()) => eprintln!("[main] ✅ DPI Awareness V2 设置成功"),
                Err(e) => eprintln!(
                    "[main] ⚠️ DPI Awareness V2 设置失败（可能已被运行时设置）: {:?}",
                    e
                ),
            }
        }
    }

    met_lib::run()
}
