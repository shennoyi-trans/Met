//! 全局鼠标钩子 —— 直接调用 Windows API（WH_MOUSE_LL）
//!
//! 通用职责（所有宠物共享）：
//!   1. 宠物拖拽检测 → emit "pet-drag-start" / "pet-drag-move" / "pet-drag-end"
//!   2. 宠物悬停检测 → emit "pet-hover-enter" / "pet-hover-leave"
//!   3. 绘制轨迹收集 → 鼠标抬起时交给已注册的 GestureRecognizer 识别
//!
//! 手势识别是可插拔的：切换宠物时通过 set_recognizers() 注册不同的识别器组合。
//!
//! 坐标说明：
//!   钩子回调中 MSLLHOOKSTRUCT.pt 返回的是 **物理像素** 坐标。
//!   emit 前会除以 DPI 缩放因子，转换为 **逻辑像素** 坐标。

use std::sync::Mutex;
use std::thread;
use tauri::{AppHandle, Emitter, Manager};

use windows::{
    Win32::Foundation::*,
    Win32::UI::WindowsAndMessaging::*,
    Win32::System::LibraryLoader::GetModuleHandleW,
};

use super::recognizers::GestureRecognizer;

// ── 事件 Payload ────────────────────────────────────────────────────────────

#[derive(serde::Serialize, Clone, Debug)]
pub struct DragPayload {
    /// 宠物新位置 X（逻辑像素）
    pub x: f64,
    /// 宠物新位置 Y（逻辑像素）
    pub y: f64,
}

// ── 全局状态 ────────────────────────────────────────────────────────────────

#[derive(PartialEq)]
enum GestureMode {
    Idle,
    Drawing,
    Dragging,
}

struct GestureState {
    mode: GestureMode,
    /// 绘制模式：轨迹点（物理像素）
    points: Vec<(f64, f64)>,
    /// 拖拽模式：鼠标到宠物中心的初始偏移（物理像素）
    drag_offset_x: f64,
    drag_offset_y: f64,
    /// 宠物当前位置（物理像素，由前端通过 update_pet_position 同步）
    pet_phys_x: f64,
    pet_phys_y: f64,
    /// 宠物命中判定半径（物理像素）
    pet_hit_radius: f64,
    /// 当前鼠标是否悬停在宠物上（用于 hover 进入/离开 检测）
    is_hovering: bool,
}

impl Default for GestureState {
    fn default() -> Self {
        Self {
            mode: GestureMode::Idle,
            points: Vec::new(),
            drag_offset_x: 0.0,
            drag_offset_y: 0.0,
            pet_phys_x: -9999.0,
            pet_phys_y: -9999.0,
            pet_hit_radius: 75.0,
            is_hovering: false,
        }
    }
}

impl GestureState {
    /// 判断指定物理像素坐标是否在宠物命中范围内
    fn is_cursor_over_pet(&self, x: f64, y: f64) -> bool {
        let dx = x - self.pet_phys_x;
        let dy = y - self.pet_phys_y;
        (dx * dx + dy * dy).sqrt() <= self.pet_hit_radius
    }

    /// 根据当前鼠标位置更新悬停状态，状态变化时 emit 事件
    fn update_hover_state(&mut self, x: f64, y: f64) {
        let over = self.is_cursor_over_pet(x, y);
        if over && !self.is_hovering {
            self.is_hovering = true;
            emit_hover_event(true);
        } else if !over && self.is_hovering {
            self.is_hovering = false;
            emit_hover_event(false);
        }
    }
}

static GLOBAL_STATE: Mutex<Option<GestureState>> = Mutex::new(None);
static GLOBAL_APP: Mutex<Option<AppHandle>> = Mutex::new(None);
/// 当前活跃的手势识别器列表（切换宠物时替换）
static RECOGNIZERS: Mutex<Vec<Box<dyn GestureRecognizer>>> = Mutex::new(Vec::new());

// ── 供外部调用的公共接口 ────────────────────────────────────────────────────

/// 更新宠物的屏幕位置（由前端在宠物位置变化时调用）
/// 传入逻辑像素，内部转成物理像素存储
pub fn set_pet_position(x_logical: f64, y_logical: f64, scale_factor: f64) {
    if let Ok(mut guard) = GLOBAL_STATE.try_lock() {
        if let Some(state) = guard.as_mut() {
            state.pet_phys_x = x_logical * scale_factor;
            state.pet_phys_y = y_logical * scale_factor;
            state.pet_hit_radius = 65.0 * scale_factor;
        }
    }
}

/// 注册当前宠物需要的手势识别器（替换旧的）
///
/// 切换宠物时调用，例如：
/// ```ignore
/// set_recognizers(vec![Box::new(CircleRecognizer)]);
/// ```
pub fn set_recognizers(new_recognizers: Vec<Box<dyn GestureRecognizer>>) {
    let names: Vec<&str> = new_recognizers.iter().map(|r| r.name()).collect();
    eprintln!("[gesture] 注册识别器: {:?}", names);
    let mut guard = RECOGNIZERS.lock().unwrap();
    *guard = new_recognizers;
}

pub fn start_global_listener(app: AppHandle) {
    {
        let mut handle = GLOBAL_APP.lock().unwrap();
        *handle = Some(app);
    }
    {
        let mut state = GLOBAL_STATE.lock().unwrap();
        *state = Some(GestureState::default());
    }

    thread::spawn(|| {
        eprintln!("[gesture] 钩子线程启动");

        unsafe {
            let hmod = GetModuleHandleW(None)
                .expect("[gesture] GetModuleHandleW 失败");

            let hook = SetWindowsHookExW(
                WH_MOUSE_LL,
                Some(mouse_hook_proc),
                hmod,
                0,
            );

            match hook {
                Ok(h) => {
                    eprintln!("[gesture] ✅ SetWindowsHookExW 成功，句柄={:?}", h);
                    let mut msg = MSG::default();
                    eprintln!("[gesture] 开始消息泵，等待鼠标事件...");
                    loop {
                        let ret = GetMessageW(&mut msg, None, 0, 0);
                        match ret.0 {
                            -1 | 0 => break,
                            _ => {
                                let _ = TranslateMessage(&msg);
                                DispatchMessageW(&msg);
                            }
                        }
                    }
                    let _ = UnhookWindowsHookEx(h);
                }
                Err(e) => {
                    eprintln!("[gesture] ❌ SetWindowsHookExW 失败：{:?}", e);
                }
            }
        }
    });
}

// ── 钩子回调 ────────────────────────────────────────────────────────────────

unsafe extern "system" fn mouse_hook_proc(
    n_code: i32,
    w_param: WPARAM,
    l_param: LPARAM,
) -> LRESULT {
    if n_code >= 0 {
        let mouse_data = &*(l_param.0 as *const MSLLHOOKSTRUCT);
        let x = mouse_data.pt.x as f64;
        let y = mouse_data.pt.y as f64;

        match w_param.0 as u32 {
            WM_LBUTTONDOWN => {
                if let Ok(mut guard) = GLOBAL_STATE.try_lock() {
                    if let Some(state) = guard.as_mut() {
                        if state.is_cursor_over_pet(x, y) {
                            // ── 拖拽模式 ──
                            state.mode = GestureMode::Dragging;
                            state.drag_offset_x = state.pet_phys_x - x;
                            state.drag_offset_y = state.pet_phys_y - y;
                            eprintln!("[gesture] 🖱️ 拖拽开始 ({}, {})", x as i32, y as i32);
                            emit_drag_event("pet-drag-start", state.pet_phys_x, state.pet_phys_y);
                        } else {
                            // ── 绘制模式 ──
                            state.mode = GestureMode::Drawing;
                            state.points.clear();
                            eprintln!("[gesture] 🖱️ 绘制开始 ({}, {})", x as i32, y as i32);
                        }
                    }
                }
            }
            
             WM_RBUTTONDOWN => {
                // ── 右键点击宠物 → 通知前端 toggle 面板 ──
                if let Ok(guard) = GLOBAL_STATE.try_lock() {
                    if let Some(state) = guard.as_ref() {
                        if state.is_cursor_over_pet(x, y) {
                            emit_right_click_event(state.pet_phys_x, state.pet_phys_y);
                        }
                    }
                }
            }

            WM_MOUSEMOVE => {
                if let Ok(mut guard) = GLOBAL_STATE.try_lock() {
                    if let Some(state) = guard.as_mut() {
                        match state.mode {
                            GestureMode::Dragging => {
                                let new_x = x + state.drag_offset_x;
                                let new_y = y + state.drag_offset_y;
                                state.pet_phys_x = new_x;
                                state.pet_phys_y = new_y;
                                emit_drag_event("pet-drag-move", new_x, new_y);
                            }
                            GestureMode::Drawing => {
                                let should_add = match state.points.last() {
                                    Some(&(lx, ly)) => {
                                        ((x - lx).powi(2) + (y - ly).powi(2)).sqrt() >= 5.0
                                    }
                                    None => true,
                                };
                                if should_add {
                                    state.points.push((x, y));
                                }
                            }
                            GestureMode::Idle => {
                                // ── 悬停检测：鼠标是否在宠物命中范围内 ──
                                state.update_hover_state(x, y);
                            }
                        }
                    }
                }
            }

            WM_LBUTTONUP => {
                // 必须先释放锁再做耗时操作
                let action = {
                    if let Ok(mut guard) = GLOBAL_STATE.try_lock() {
                        if let Some(state) = guard.as_mut() {
                            match state.mode {
                                GestureMode::Dragging => {
                                    state.mode = GestureMode::Idle;
                                    state.is_hovering = false;
                                    state.update_hover_state(x, y);
                                    Some(("drag-end", state.pet_phys_x, state.pet_phys_y, Vec::new()))
                                }
                                GestureMode::Drawing => {
                                    state.mode = GestureMode::Idle;
                                    let pts = state.points.clone();
                                    state.points.clear();
                                    Some(("recognize", 0.0, 0.0, pts))
                                }
                                GestureMode::Idle => None,
                            }
                        } else { None }
                    } else { None }
                };

                if let Some((action_type, px, py, pts)) = action {
                    let app_opt = {
                        let guard = GLOBAL_APP.lock().unwrap();
                        guard.clone()
                    };
                    if let Some(app) = app_opt {
                        if action_type == "drag-end" {
                            thread::spawn(move || {
                                let scale = get_scale(&app);
                                let payload = DragPayload { x: px / scale, y: py / scale };
                                let _ = app.emit("pet-drag-end", payload);
                            });
                        } else {
                            // ── 遍历已注册的识别器 ──
                            thread::spawn(move || {
                                let scale = get_scale(&app);
                                let recognizers = RECOGNIZERS.lock().unwrap();
                                for recognizer in recognizers.iter() {
                                    if let Some(result) = recognizer.analyze(&pts, scale) {
                                        let event_name = result.event_name();
                                        eprintln!(
                                            "[gesture] ✅ {} 识别成功！{:?}",
                                            recognizer.name(),
                                            result
                                        );
                                        let _ = app.emit(event_name, result);
                                        break; // 第一个匹配的识别器生效
                                    }
                                }
                            });
                        }
                    }
                }
            }

            _ => {}
        }
    }

    CallNextHookEx(None, n_code, w_param, l_param)
}

// ── 辅助函数 ────────────────────────────────────────────────────────────────

fn emit_drag_event(event_name: &str, phys_x: f64, phys_y: f64) {
    let app_opt = {
        if let Ok(guard) = GLOBAL_APP.try_lock() {
            guard.clone()
        } else {
            return;
        }
    };
    if let Some(app) = app_opt {
        let scale = get_scale(&app);
        let payload = DragPayload { x: phys_x / scale, y: phys_y / scale };
        let _ = app.emit(event_name, payload);
    }
}

// 发送悬停进入/离开事件，前端据此切换窗口鼠标穿透
fn emit_hover_event(entering: bool) {
    let app_opt = {
        if let Ok(guard) = GLOBAL_APP.try_lock() {
            guard.clone()
        } else {
            return;
        }
    };
    if let Some(app) = app_opt {
        let event_name = if entering { "pet-hover-enter" } else { "pet-hover-leave" };
        let _ = app.emit(event_name, ());
    }
}

// 发送宠物右键点击事件，前端据此 toggle 功能面板
fn emit_right_click_event(phys_x: f64, phys_y: f64) {
    let app_opt = {
        if let Ok(guard) = GLOBAL_APP.try_lock() {
            guard.clone()
        } else {
            return;
        }
    };
    if let Some(app) = app_opt {
        let scale = get_scale(&app);
        let payload = DragPayload {
            x: phys_x / scale,
            y: phys_y / scale,
        };
        let _ = app.emit("pet-right-click", payload);
    }
}

fn get_scale(app: &AppHandle) -> f64 {
    app.get_webview_window("main")
        .and_then(|w| w.scale_factor().ok())
        .unwrap_or(1.0)
}
