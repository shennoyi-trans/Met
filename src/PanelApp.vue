<template>
  <div
    id="panel-root"
    @mouseenter="onMouseEnter"
    @mouseleave="onMouseLeave"
  >
    <ActionPanel @action="handleAction" />
  </div>
</template>

<script setup lang="ts">
/**
 * PanelApp.vue — 面板窗口的根组件
 *
 * 独立 Tauri 窗口，由主窗口通过 show_panel 命令显示。
 *
 * 职责：
 *   - 渲染功能面板 UI
 *   - 向主窗口发送跨窗口事件：
 *     · panel-hover-enter / panel-hover-leave — 鼠标进出面板
 *     · panel-blur — 窗口失焦（点击屏幕其他位置）
 *   - 不自行决定何时关闭，全部交由主窗口的 PanelController 管理
 */
import { onMounted, onUnmounted } from "vue";
import { emit } from "@tauri-apps/api/event";
import { getCurrentWindow } from "@tauri-apps/api/window";
import ActionPanel from "@/components/ActionPanel.vue";

const appWindow = getCurrentWindow();
let unlistenFocus: (() => void) | null = null;

onMounted(async () => {
  // 窗口失焦 → 通知主窗口（PanelController 决定是否关闭）
  unlistenFocus = await appWindow.onFocusChanged(({ payload: focused }) => {
    if (!focused) {
      emit("panel-blur");
    }
  });
});

onUnmounted(() => {
  if (unlistenFocus) unlistenFocus();
});

// ── 鼠标悬停跟踪 ────────────────────────────────────────────────────────────

function onMouseEnter() {
  emit("panel-hover-enter");
}

function onMouseLeave() {
  emit("panel-hover-leave");
}

// ── 按钮事件 ────────────────────────────────────────────────────────────────

function handleAction(actionId: string) {
  console.log("[PanelApp] action:", actionId);
  if (actionId === "settings") {
    console.log("[PanelApp] 设置按钮被点击");
  }
}
</script>

<style>
* { margin: 0; padding: 0; box-sizing: border-box; }
html, body { background: transparent; overflow: hidden; }
#panel-root {
  width: 100vw;
  height: 100vh;
  display: flex;
  align-items: flex-start;
  justify-content: center;
  padding: 8px;
  background: transparent;
}
</style>
