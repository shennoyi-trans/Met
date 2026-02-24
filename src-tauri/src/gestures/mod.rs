//! gestures 模块
//!
//! 全局鼠标钩子 + 可插拔手势识别器架构。
//!
//! - `global`：钩子生命周期、拖拽、悬停、轨迹收集（所有宠物通用）
//! - `recognizers`：手势识别 trait 与具体实现（按宠物需求注册）

pub mod global;
pub mod recognizers;

// 对外 re-export，让 lib.rs 用起来和之前一样方便
pub use global::{start_global_listener, set_pet_position, set_recognizers, DragPayload};
pub use recognizers::GestureResult;
