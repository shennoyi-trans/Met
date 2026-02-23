<template>
  <div id="panel-root" @mousedown.self="onBackgroundClick">
    <ActionPanel @action="handleAction" />
  </div>
</template>

<script setup lang="ts">
/**
 * PanelApp.vue — 面板窗口的根组件
 *
 * 独立 Tauri 窗口，由主窗口通过 show_panel 命令显示。
 * 窗口失焦时自动隐藏（点击屏幕其他位置）。
 */
import { onMounted, onUnmounted } from "vue";
import { invoke } from "@tauri-apps/api/core";
import { getCurrentWindow } from "@tauri-apps/api/window";
import ActionPanel from "@/components/ActionPanel.vue";

const appWindow = getCurrentWindow();
let unlistenFocus: (() => void) | null = null;

onMounted(async () => {
  // 窗口失焦 → 自动隐藏面板（点击屏幕任意其他位置触发）
  unlistenFocus = await appWindow.onFocusChanged(({ payload: focused }) => {
    if (!focused) {
      hidePanel();
    }
  });
});

onUnmounted(() => {
  if (unlistenFocus) unlistenFocus();
});

async function hidePanel() {
  try {
    await invoke("hide_panel");
  } catch (e) {
    console.warn("[PanelApp] hide_panel 失败:", e);
  }
}

function onBackgroundClick() {
  // 点击面板背景空白区域也关闭
  hidePanel();
}

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
