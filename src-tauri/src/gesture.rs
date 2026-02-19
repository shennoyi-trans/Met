//! gesture.rs
//! 全局鼠标钩子 —— 直接调用 Windows API（WH_MOUSE_LL）
//!
//! 为什么不用 rdev：
//!   rdev 在某些 Windows 环境下 SetWindowsHookEx 静默失败，
//!   直接用 windows crate 可以拿到明确的错误码，更可控。
//!
//! 原理：
//!   SetWindowsHookEx(WH_MOUSE_LL) 安装低级鼠标钩子，
//!   钩子回调在安装线程的消息循环里被调用，
//!   所以该线程必须持续调用 GetMessage 泵送消息。

use std::f64::consts::PI;
use std::sync::Mutex;
use std::thread;
use tauri::{AppHandle, Emitter};

use windows::{
    Win32::Foundation::*,
    Win32::UI::WindowsAndMessaging::*,
    Win32::System::LibraryLoader::GetModuleHandleW,
};

#[derive(serde::Serialize, Clone, Debug)]
pub struct CircleGesturePayload {
    pub center_x: f64,
    pub center_y: f64,
    pub radius: f64,
}

#[derive(Default)]
struct GestureState {
    is_drawing: bool,
    points: Vec<(f64, f64)>,
}

// 全局状态：钩子回调是 extern "system" 函数，无法传闭包，只能用全局
static GLOBAL_STATE: Mutex<Option<GestureState>> = Mutex::new(None);
static GLOBAL_APP: Mutex<Option<AppHandle>> = Mutex::new(None);

pub fn start_global_listener(app: AppHandle) {
    // 把 AppHandle 存入全局，供钩子回调使用
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
            // 获取当前模块句柄
            let hmod = GetModuleHandleW(None)
                .expect("[gesture] GetModuleHandleW 失败");

            // 安装低级鼠标钩子
            let hook = SetWindowsHookExW(
                WH_MOUSE_LL,
                Some(mouse_hook_proc),
                hmod,
                0, // 0 = 全局钩子
            );

            match hook {
                Ok(h) => {
                    eprintln!("[gesture] ✅ SetWindowsHookExW 成功，句柄={:?}", h);

                    // 消息泵：钩子回调必须在有消息循环的线程里才会被调用
                    let mut msg = MSG::default();
                    eprintln!("[gesture] 开始消息泵，等待鼠标事件...");
                    loop {
                        let ret = GetMessageW(&mut msg, None, 0, 0);
                        match ret.0 {
                            -1 => {
                                eprintln!("[gesture] GetMessageW 返回 -1，退出");
                                break;
                            }
                            0 => {
                                eprintln!("[gesture] 收到 WM_QUIT，退出");
                                break;
                            }
                            _ => {
                                let _ = TranslateMessage(&msg);
                                DispatchMessageW(&msg);
                            }
                        }
                    }

                    let _ = UnhookWindowsHookEx(h);
                }
                Err(e) => {
                    eprintln!("[gesture] ❌ SetWindowsHookExW 失败！错误码: {:?}", e);
                    eprintln!("[gesture] 常见原因：");
                    eprintln!("  - 尝试以管理员身份运行终端后重试");
                    eprintln!("  - 检查杀毒软件是否拦截了 SetWindowsHookEx");
                }
            }
        }
    });
}

/// Windows 低级鼠标钩子回调
/// 注意：这个函数在钩子线程的消息泵里被同步调用，要尽快返回
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
                        state.is_drawing = true;
                        state.points.clear();
                        eprintln!("[gesture] 🖱️  左键按下 ({}, {}), 开始记录", x as i32, y as i32);
                    }
                }
            }

            WM_MOUSEMOVE => {
                if let Ok(mut guard) = GLOBAL_STATE.try_lock() {
                    if let Some(state) = guard.as_mut() {
                        if state.is_drawing {
                            // 降采样：距离 > 5px 才记录
                            let should_add = match state.points.last() {
                                Some(&(lx, ly)) => {
                                    ((x - lx).powi(2) + (y - ly).powi(2)).sqrt() >= 5.0
                                }
                                None => true,
                            };
                            if should_add {
                                state.points.push((x, y));
                                let len = state.points.len();
                                if len % 10 == 0 {
                                    eprintln!("[gesture] 记录中，已有 {} 个点", len);
                                }
                            }
                        }
                    }
                }
            }

            WM_LBUTTONUP => {
                let points = {
                    if let Ok(mut guard) = GLOBAL_STATE.try_lock() {
                        if let Some(state) = guard.as_mut() {
                            if state.is_drawing {
                                state.is_drawing = false;
                                let pts = state.points.clone();
                                state.points.clear();
                                eprintln!("[gesture] 左键松开，共 {} 个点，开始识别", pts.len());
                                Some(pts)
                            } else {
                                None
                            }
                        } else { None }
                    } else { None }
                };

                if let Some(pts) = points {
                    // 取出 AppHandle（clone 后放回）
                    let app_opt = {
                        let guard = GLOBAL_APP.lock().unwrap();
                        guard.clone()
                    };
                    if let Some(app) = app_opt {
                        // 在独立线程里做识别，避免阻塞消息泵
                        thread::spawn(move || {
                            if let Some(payload) = analyze_circle(&pts) {
                                eprintln!(
                                    "[gesture] ✅ 圆圈识别成功！center=({:.0},{:.0}) r={:.0}",
                                    payload.center_x, payload.center_y, payload.radius
                                );
                                match app.emit("gesture-circle", payload) {
                                    Ok(_)  => eprintln!("[gesture] emit 成功"),
                                    Err(e) => eprintln!("[gesture] emit 失败: {}", e),
                                }
                            }
                        });
                    }
                }
            }

            _ => {}
        }
    }

    // 必须调用，把事件传递给链上的下一个钩子
    CallNextHookEx(None, n_code, w_param, l_param)
}

/// 圆圈识别算法（含详细日志）
fn analyze_circle(points: &[(f64, f64)]) -> Option<CircleGesturePayload> {
    eprintln!("[analyze] 轨迹点: {}", points.len());

    if points.len() < 12 {
        eprintln!("[analyze] ❌ 点数不足 12，画慢一点");
        return None;
    }

    let n = points.len() as f64;
    let cx = points.iter().map(|p| p.0).sum::<f64>() / n;
    let cy = points.iter().map(|p| p.1).sum::<f64>() / n;

    let avg_r = points.iter()
        .map(|&(x, y)| ((x-cx).powi(2) + (y-cy).powi(2)).sqrt())
        .sum::<f64>() / n;
    eprintln!("[analyze] 质心=({:.0},{:.0})  平均半径={:.0}px", cx, cy, avg_r);

    if avg_r < 30.0 {
        eprintln!("[analyze] ❌ 半径 {:.0} < 30，圈太小", avg_r);
        return None;
    }

    let std_r = (points.iter()
        .map(|&(x,y)| {
            let r = ((x-cx).powi(2)+(y-cy).powi(2)).sqrt();
            (r - avg_r).powi(2)
        })
        .sum::<f64>() / n).sqrt();
    let consistency = std_r / avg_r;
    eprintln!("[analyze] 半径一致性={:.2}（<0.55 通过）", consistency);
    if consistency > 0.55 {
        eprintln!("[analyze] ❌ 形状太不规则");
        return None;
    }

    let mut sectors = [false; 12];
    for &(x, y) in points {
        let angle = (y - cy).atan2(x - cx);
        let s = ((angle + PI) / (2.0 * PI) * 12.0) as usize % 12;
        sectors[s] = true;
    }
    let covered = sectors.iter().filter(|&&v| v).count();
    eprintln!("[analyze] 扇区覆盖={}/12（>=9 通过）", covered);
    if covered < 9 {
        eprintln!("[analyze] ❌ 圆弧不完整");
        return None;
    }

    let (s, e) = (points.first().unwrap(), points.last().unwrap());
    let close = ((s.0-e.0).powi(2)+(s.1-e.1).powi(2)).sqrt();
    let close_ratio = close / avg_r;
    eprintln!("[analyze] 闭合比={:.2}（<0.8 通过）", close_ratio);
    if close_ratio > 0.8 {
        eprintln!("[analyze] ❌ 没有闭合，起止点距离 {:.0}px", close);
        return None;
    }

    eprintln!("[analyze] ✅ 通过所有检查");
    Some(CircleGesturePayload { center_x: cx, center_y: cy, radius: avg_r })
}
