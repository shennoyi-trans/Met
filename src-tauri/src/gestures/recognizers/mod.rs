//! 手势识别器 trait 与识别结果定义
//!
//! 每种宠物可注册自己需要的 recognizer 组合。
//! global.rs 在鼠标抬起时遍历当前已注册的 recognizer 列表。

pub mod circle;

/// 手势识别结果（逻辑像素坐标）
#[derive(serde::Serialize, Clone, Debug)]
#[serde(tag = "type")]
pub enum GestureResult {
    /// 画圈手势
    Circle {
        center_x: f64,
        center_y: f64,
        radius: f64,
    },
    // 未来扩展：
    // Heart { center_x: f64, center_y: f64, size: f64 },
    // Zigzag { start_x: f64, start_y: f64, end_x: f64, end_y: f64 },
}

impl GestureResult {
    /// 返回该手势对应的 Tauri 事件名
    pub fn event_name(&self) -> &'static str {
        match self {
            GestureResult::Circle { .. } => "gesture-circle",
            // GestureResult::Heart { .. } => "gesture-heart",
        }
    }
}

/// 手势识别器 trait
///
/// 接收一段鼠标轨迹（物理像素），判断是否匹配特定手势。
/// `scale` 为 DPI 缩放因子，用于将结果转换为逻辑像素。
pub trait GestureRecognizer: Send + Sync {
    /// 分析轨迹点，返回 Some(result) 表示识别成功
    fn analyze(&self, points: &[(f64, f64)], scale: f64) -> Option<GestureResult>;

    /// 识别器名称，用于日志
    fn name(&self) -> &'static str;
}
