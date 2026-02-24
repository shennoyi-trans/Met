/**
 * 海鸥宠物的手势配置
 *
 * 声明本宠物需要哪些手势识别器，
 * 以及识别成功后对应的 Tauri 事件名。
 *
 * 宠物初始化时调用 registerGestures() 将识别器列表传给 Rust 侧。
 */

import { invoke } from "@tauri-apps/api/core";

/** 海鸥使用的手势 */
export const seagullGestures = {
  /** 需要注册到 Rust 侧的识别器名称列表 */
  recognizers: ["circle"] as const,

  /** 识别器 → Tauri 事件名的映射（用于 listen） */
  events: {
    circle: "gesture-circle",
  },
} as const;

/**
 * 向 Rust 侧注册当前宠物需要的手势识别器
 *
 * 应在宠物 load() 时调用
 */
export async function registerSeagullGestures(): Promise<void> {
  await invoke("register_recognizers", {
    names: [...seagullGestures.recognizers],
  });
}
