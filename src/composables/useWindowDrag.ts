import { invoke } from "@tauri-apps/api/core";
import { getCurrentWindow } from "@tauri-apps/api/window";

/**
 * useWindowDrag
 * 管理宠物窗口的拖动
 *
 * 注意：主要的拖动逻辑现在在 PetApp.ts 中通过 startDragging() 实现。
 * 这个 composable 保留用于其他组件中可能需要的窗口操作。
 */
export function useWindowDrag() {
  const appWindow = getCurrentWindow();

  async function startDrag() {
    // Tauri 2 内置的窗口拖动方法，比手动计算坐标更稳定
    await appWindow.startDragging();
  }

  // 拖动时通知 Rust 不要穿透（否则事件会漏给下层窗口）
  async function setPassthrough(enabled: boolean) {
    await invoke("set_ignore_cursor_events", { ignore: enabled });
  }

  return { startDrag, setPassthrough };
}
