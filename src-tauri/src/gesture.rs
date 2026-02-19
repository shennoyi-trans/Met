/// gesture.rs
/// 全局鼠标钩子 + 画圈手势识别
///
/// 算法说明：
/// 1. 按住左键时开始记录鼠标轨迹点
/// 2. 松开左键时分析轨迹：
///    - 计算轨迹质心
///    - 检测轨迹是否"绕质心转了一圈"（角度扫过 360°）
///    - 检测起止点是否靠近（闭合性）
///    - 轨迹总长度过滤噪音
/// 3. 判定为圆圈后，通过 Tauri Event 发送给前端

use rdev::{listen, Event, EventType};
use std::f64::consts::PI;
use std::sync::{Arc, Mutex};
use std::thread;
use tauri::{AppHandle, Emitter};

/// 发给前端的事件 payload
#[derive(serde::Serialize, Clone)]
pub struct CircleGesturePayload {
    /// 圆圈中心点（屏幕绝对坐标）
    pub center_x: f64,
    pub center_y: f64,
    /// 圆圈半径（像素）
    pub radius: f64,
}

#[derive(Default)]
struct GestureState {
    is_drawing: bool,
    points: Vec<(f64, f64)>,
}

pub struct GestureDetector;

pub fn start_global_listener(app: AppHandle) {
    thread::spawn(move || {
        let state = Arc::new(Mutex::new(GestureState::default()));

        let state_clone = state.clone();
        let app_clone = app.clone();

        // rdev::listen 会阻塞当前线程，所以在独立线程里跑
        listen(move |event: Event| {
            handle_event(&event, &state_clone, &app_clone);
        })
        .expect("rdev listen failed");
    });
}

fn handle_event(event: &Event, state: &Arc<Mutex<GestureState>>, app: &AppHandle) {
    let mut s = state.lock().unwrap();

    match event.event_type {
        EventType::ButtonPress(rdev::Button::Left) => {
            s.is_drawing = true;
            s.points.clear();
        }

        EventType::MouseMove { x, y } => {
            if s.is_drawing {
                // 降采样：与上一个点距离 > 5px 才记录，减少计算量
                if let Some(&(lx, ly)) = s.points.last() {
                    let dist = ((x - lx).powi(2) + (y - ly).powi(2)).sqrt();
                    if dist < 5.0 {
                        return;
                    }
                }
                s.points.push((x, y));
            }
        }

        EventType::ButtonRelease(rdev::Button::Left) => {
            if s.is_drawing {
                s.is_drawing = false;
                let points = s.points.clone();
                s.points.clear();

                // 在独立任务里做识别，避免阻塞钩子回调
                let app_clone = app.clone();
                thread::spawn(move || {
                    if let Some(payload) = analyze_circle(&points) {
                        let _ = app_clone.emit("gesture://circle", payload);
                    }
                });
            }
        }

        _ => {}
    }
}

/// 圆圈识别核心算法
fn analyze_circle(points: &[(f64, f64)]) -> Option<CircleGesturePayload> {
    // 点数过少，不是有效手势
    if points.len() < 20 {
        return None;
    }

    // 1. 计算质心
    let (sum_x, sum_y) = points.iter().fold((0.0, 0.0), |(ax, ay), &(x, y)| (ax + x, ay + y));
    let n = points.len() as f64;
    let cx = sum_x / n;
    let cy = sum_y / n;

    // 2. 计算平均半径
    let avg_radius = points
        .iter()
        .map(|&(x, y)| ((x - cx).powi(2) + (y - cy).powi(2)).sqrt())
        .sum::<f64>()
        / n;

    // 半径太小（< 40px），忽略
    if avg_radius < 40.0 {
        return None;
    }

    // 3. 半径一致性检验：各点到质心的距离偏差不能太大
    let radius_variance = points
        .iter()
        .map(|&(x, y)| {
            let r = ((x - cx).powi(2) + (y - cy).powi(2)).sqrt();
            (r - avg_radius).powi(2)
        })
        .sum::<f64>()
        / n;
    let radius_std = radius_variance.sqrt();

    // 标准差超过半径的 45%，形状太不规则
    if radius_std / avg_radius > 0.45 {
        return None;
    }

    // 4. 角度覆盖检验：把 360° 分成 12 个扇区，至少覆盖 10 个
    let mut sectors = [false; 12];
    for &(x, y) in points {
        let angle = (y - cy).atan2(x - cx); // -π ~ π
        let sector = ((angle + PI) / (2.0 * PI) * 12.0) as usize % 12;
        sectors[sector] = true;
    }
    let covered = sectors.iter().filter(|&&v| v).count();
    if covered < 8 {
        return None;
    }

    // 5. 闭合性检验：起点和终点距离 < 半径的 60%
    let start = points.first().unwrap();
    let end = points.last().unwrap();
    let closure_dist = ((start.0 - end.0).powi(2) + (start.1 - end.1).powi(2)).sqrt();
    if closure_dist > avg_radius * 0.6 {
        return None;
    }

    Some(CircleGesturePayload {
        center_x: cx,
        center_y: cy,
        radius: avg_radius,
    })
}
