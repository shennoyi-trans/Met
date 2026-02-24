//! 圆圈手势识别器
//!
//! 从原 gesture.rs 的 analyze_circle() 提取而来。
//! 海鸥宠物的召唤手势：用户在屏幕上画一个圈。

use std::f64::consts::PI;
use super::{GestureRecognizer, GestureResult};

pub struct CircleRecognizer;

impl GestureRecognizer for CircleRecognizer {
    fn name(&self) -> &'static str {
        "circle"
    }

    fn analyze(&self, points: &[(f64, f64)], scale: f64) -> Option<GestureResult> {
        if points.len() < 12 {
            eprintln!("[circle] ❌ 点数不足 12");
            return None;
        }

        let n = points.len() as f64;
        let cx = points.iter().map(|p| p.0).sum::<f64>() / n;
        let cy = points.iter().map(|p| p.1).sum::<f64>() / n;

        // 平均半径
        let avg_r = points
            .iter()
            .map(|&(x, y)| ((x - cx).powi(2) + (y - cy).powi(2)).sqrt())
            .sum::<f64>()
            / n;

        if avg_r < 30.0 {
            eprintln!("[circle] ❌ 半径 {:.0} < 30", avg_r);
            return None;
        }

        // 半径标准差 / 平均半径 → 形状规则度
        let std_r = (points
            .iter()
            .map(|&(x, y)| {
                let r = ((x - cx).powi(2) + (y - cy).powi(2)).sqrt();
                (r - avg_r).powi(2)
            })
            .sum::<f64>()
            / n)
            .sqrt();

        if std_r / avg_r > 0.55 {
            eprintln!("[circle] ❌ 形状太不规则 ({:.2})", std_r / avg_r);
            return None;
        }

        // 扇区覆盖检查：轨迹是否覆盖了足够的角度范围
        let mut sectors = [false; 12];
        for &(x, y) in points {
            let angle = (y - cy).atan2(x - cx);
            let s = ((angle + PI) / (2.0 * PI) * 12.0) as usize % 12;
            sectors[s] = true;
        }
        let covered = sectors.iter().filter(|&&v| v).count();
        if covered < 10 {
            eprintln!("[circle] ❌ 扇区覆盖不足 ({}/12)", covered);
            return None;
        }

        Some(GestureResult::Circle {
            center_x: cx / scale,
            center_y: cy / scale,
            radius: avg_r / scale,
        })
    }
}
