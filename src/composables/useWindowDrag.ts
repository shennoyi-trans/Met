import { invoke } from "@tauri-apps/api/core";
import { getCurrentWindow } from "@tauri-apps/api/window";

/**
 * useWindowDrag
 * 管理宠物窗口的拖动
 * 
 * 当用户在宠物身上按住鼠标并移动时，整个 Tauri 窗口跟随移动
 * 宠物本身在窗口内位置不变
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
