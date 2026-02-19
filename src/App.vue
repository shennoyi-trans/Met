<template>
  <div id="met-root">
    <div id="pixi-container" ref="pixiContainer" />
    <ActionPanel
      v-if="petStore.showPanel"
      :position="petStore.panelPosition"
      @action="handleAction"
      @close="handlePanelClose"
    />
  </div>
</template>

<script setup lang="ts">
import { ref, onMounted, onUnmounted } from "vue";
import { listen } from "@tauri-apps/api/event";
import { invoke } from "@tauri-apps/api/core";
import { getCurrentWindow } from "@tauri-apps/api/window";
import ActionPanel from "@/components/ActionPanel.vue";
import { usePetStore } from "@/stores/petStore";
import { createPetApp } from "@/pets/PetApp";
import type { CircleGesturePayload } from "@/types";

const pixiContainer = ref<HTMLDivElement>();
const petStore = usePetStore();
let petApp: Awaited<ReturnType<typeof createPetApp>> | null = null;

// 窗口原始尺寸/位置（与 tauri.conf.json 一致）
const ORIG_W = 200;
const ORIG_H = 200;
const SEAGULL_LOCAL_X = 100; // 海鸥在 200x200 窗口内的位置
const SEAGULL_LOCAL_Y = 130;

onMounted(async () => {
  if (!pixiContainer.value) return;

  petApp = await createPetApp(pixiContainer.value);

  const unlisten = await listen<CircleGesturePayload>("gesture-circle", (event) => {
    handleCircleGesture(event.payload);
    console.log("收到！", event);
  });
  console.log("listen 已注册");

  onUnmounted(unlisten);
});

async function handleCircleGesture(payload: CircleGesturePayload) {
  if (!petApp) return;

  // 如果面板正在显示，先关掉
  if (petStore.showPanel) {
    petStore.hidePanel();
  }

  const appWindow = getCurrentWindow();

  // ── 1. 获取当前窗口位置 ────────────────────────────────
  const pos = await appWindow.outerPosition();   // PhysicalPosition
  const origWinX = pos.x;
  const origWinY = pos.y;

  // 海鸥当前在屏幕上的绝对坐标
  const seagullScreenX = origWinX + SEAGULL_LOCAL_X;
  const seagullScreenY = origWinY + SEAGULL_LOCAL_Y;

  // ── 2. 获取屏幕尺寸 ──────────────────────────────────
  const screenW = window.screen.width;
  const screenH = window.screen.height;

  // ── 3. 扩展窗口到全屏 ─────────────────────────────────
  await invoke("set_window_position", { x: 0.0, y: 0.0 });
  await invoke("set_window_size", { width: screenW, height: screenH });

  // 等待窗口 resize 生效
  await new Promise((r) => setTimeout(r, 80));

  // ── 4. 调整 PixiJS 渲染器大小 ──────────────────────────
  petApp.app.renderer.resize(screenW, screenH);

  // ── 5. 把海鸥移到它在屏幕上的正确位置 ──────────────────
  petApp.petInstance.setPosition(seagullScreenX, seagullScreenY);
  petApp.petInstance.setHomePosition(seagullScreenX, seagullScreenY);

  // ── 6. 触发动画（直接用屏幕绝对坐标）─────────────────
  await petApp.triggerFriesSequence(
    payload.center_x,
    payload.center_y,
    payload.radius
  );

  // ── 7. 动画结束，缩回窗口 ──────────────────────────────
  await invoke("set_window_position", { x: seagullScreenX * 1.0, y: seagullScreenY * 1.0 });
  await invoke("set_window_size", { width: ORIG_W, height: ORIG_H });

  await new Promise((r) => setTimeout(r, 80));

  // 恢复 PixiJS 渲染器大小
  petApp.app.renderer.resize(ORIG_W, ORIG_H);

  // 重新播放待机（会使用新的 homeX/homeY）
  petApp.petInstance.playIdle();

  // ── 8. 显示面板（位置相对于缩回后的小窗口）────────────
  petStore.showPanelAt({
    x: 10,    // 在 200x200 窗口内左侧偏移
    y: 10,
  });

  // 面板出现时立即关闭穿透
  await invoke("set_ignore_cursor_events", { ignore: false });
}

// 面板关闭时恢复穿透
async function handlePanelClose() {
  petStore.hidePanel();
  await invoke("set_ignore_cursor_events", { ignore: true });
}

async function handleAction(actionId: string) {
  petStore.hidePanel();
  await invoke("set_ignore_cursor_events", { ignore: true });
  console.log("action triggered:", actionId);
}
</script>

<style>
#met-root {
  width: 100vw;
  height: 100vh;
  position: relative;
  background: transparent;
}

#pixi-container {
  position: absolute;
  inset: 0;
}
</style>