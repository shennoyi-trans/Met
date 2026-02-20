<template>
  <div id="met-root"
    @mouseenter="onRootMouseEnter"
    @mouseleave="onRootMouseLeave"
    @mousedown="onRootMouseDown"
  >
    <div id="pixi-container" ref="pixiContainer" />
    <transition name="panel-fade">
      <ActionPanel
        v-if="petStore.showPanel"
        :position="petStore.panelPosition"
        :seagull-screen-pos="seagullScreenPos"
        @action="handleAction"
        @mouseenter="onPanelMouseEnter"
        @mouseleave="onPanelMouseLeave"
      />
    </transition>
  </div>
</template>

<script setup lang="ts">
import { ref, reactive, onMounted, onUnmounted } from "vue";
import { listen } from "@tauri-apps/api/event";
import { invoke } from "@tauri-apps/api/core";
import ActionPanel from "@/components/ActionPanel.vue";
import { usePetStore } from "@/stores/petStore";
import { createPetApp } from "@/pets/PetApp";
import type { CircleGesturePayload } from "@/types";

const pixiContainer = ref<HTMLDivElement>();
const petStore = usePetStore();
let petApp: Awaited<ReturnType<typeof createPetApp>> | null = null;

// ── 常量 ─────────────────────────────────────────────────────────────────────

// 窗口原始逻辑尺寸（与 tauri.conf.json 一致）
const ORIG_W = 200;
const ORIG_H = 200;

// 海鸥在 200x200 窗口内的逻辑坐标
const SEAGULL_LOCAL_X = 100;
const SEAGULL_LOCAL_Y = 100;

// 动画结束后的扩展窗口尺寸（容纳海鸥 + 面板）
const POST_ANIM_W = 420;
const POST_ANIM_H = 320;

// 面板尺寸估计（逻辑像素）
const PANEL_W = 170;
const PANEL_H = 260;
const PANEL_GAP = 15;

// ── 海鸥屏幕位置追踪（用于面板定位）────────────────────────────────────────
const seagullScreenPos = reactive({ x: 0, y: 0 });

// ── 面板自动关闭计时器 ──────────────────────────────────────────────────────
let panelHideTimer: ReturnType<typeof setTimeout> | null = null;
let isMouseOverPetArea = false;
let isMouseOverPanel = false;

// ── z-order 刷新定时器 ──────────────────────────────────────────────────────
let zOrderTimer: ReturnType<typeof setInterval> | null = null;

// ── 动画进行中标志 ─────────────────────────────────────────────────────────
let isAnimating = false;

onMounted(async () => {
  if (!pixiContainer.value) return;

  petApp = await createPetApp(pixiContainer.value);

  // 注册手势监听
  const unlisten = await listen<CircleGesturePayload>("gesture-circle", (event) => {
    console.log("[App] 收到 gesture-circle 事件", event.payload);
    handleCircleGesture(event.payload);
  });
  console.log("[App] listen 已注册");

  // 定期刷新置顶状态（每 5 秒），解决被任务栏预览覆盖的问题
  zOrderTimer = setInterval(async () => {
    try {
      await invoke("reassert_always_on_top");
    } catch (e) {
      // 静默失败
    }
  }, 5000);

  onUnmounted(() => {
    unlisten();
    if (zOrderTimer) clearInterval(zOrderTimer);
    if (panelHideTimer) clearTimeout(panelHideTimer);
  });
});

// ─── 手势处理主流程 ──────────────────────────────────────────────────────────

async function handleCircleGesture(payload: CircleGesturePayload) {
  if (!petApp || isAnimating) return;
  isAnimating = true;

  // 如果面板正在显示，先关掉
  if (petStore.showPanel) {
    petStore.hidePanel();
    cancelPanelHideTimer();
  }

  // payload.center_x / center_y 已经是逻辑像素（Rust 端已转换）

  try {
    // ── 1. 获取当前窗口逻辑位置 ────────────────────────────
    const [winLogX, winLogY] = await invoke<[number, number]>("get_window_position");

    // 海鸥在屏幕上的逻辑坐标
    const seagullLogX = winLogX + SEAGULL_LOCAL_X;
    const seagullLogY = winLogY + SEAGULL_LOCAL_Y;

    // ── 2. 获取屏幕逻辑尺寸 ──────────────────────────────
    const screenLogW = window.screen.width;
    const screenLogH = window.screen.height;

    // ── 3. 扩展窗口到全屏（逻辑像素）────────────────────
    await invoke("set_ignore_cursor_events", { ignore: true });
    await invoke("set_window_position", { x: 0.0, y: 0.0 });
    await invoke("set_window_size", { width: screenLogW * 1.0, height: screenLogH * 1.0 });

    // ── 4. 立即调整 PixiJS 和海鸥位置（防止窗口移动后海鸥在旧本地坐标处闪现）─
    petApp.app.renderer.resize(screenLogW, screenLogH);
    petApp.petInstance.setPosition(seagullLogX, seagullLogY);
    petApp.petInstance.setHomePosition(seagullLogX, seagullLogY);

    // 等待窗口 resize 完全生效
    await sleep(120);

    // ── 5. 触发动画（坐标已是逻辑像素）──────────────────
    await petApp.triggerFriesSequence(
      payload.center_x,
      payload.center_y,
      payload.radius
    );

    // 动画结束后，海鸥停留在 (payload.center_x, payload.center_y)
    const finalSeagullLogX = payload.center_x;
    const finalSeagullLogY = payload.center_y;

    // ── 7. 计算面板位置和缩回窗口位置 ───────────────────
    const layout = computePostAnimLayout(
      finalSeagullLogX, finalSeagullLogY,
      screenLogW, screenLogH
    );

    // ── 8. 缩回窗口 ─────────────────────────────────────
    await invoke("set_window_position", {
      x: layout.winX * 1.0,
      y: layout.winY * 1.0
    });
    await invoke("set_window_size", {
      width: layout.winW * 1.0,
      height: layout.winH * 1.0
    });

    await sleep(120);

    // ── 9. 调整 PixiJS 并重新定位海鸥 ───────────────────
    petApp.app.renderer.resize(layout.winW, layout.winH);

    // 海鸥在新窗口内的本地坐标
    petApp.petInstance.setPosition(layout.seagullLocalX, layout.seagullLocalY);
    petApp.petInstance.setHomePosition(layout.seagullLocalX, layout.seagullLocalY);
    petApp.petInstance.playIdle();

    // 记录海鸥的屏幕位置（供 ActionPanel 智能定位参考）
    seagullScreenPos.x = finalSeagullLogX;
    seagullScreenPos.y = finalSeagullLogY;

    // ── 10. 显示功能面板 ─────────────────────────────────
    petStore.showPanelAt({
      x: layout.panelLocalX,
      y: layout.panelLocalY,
    });

    // 关闭穿透，让面板和海鸥可以交互
    await invoke("set_ignore_cursor_events", { ignore: false });

    // 启动面板自动关闭计时器
    startPanelHideTimer();

  } catch (e) {
    console.error("[App] handleCircleGesture 出错：", e);
    // 出错时尝试恢复到安全状态
    try {
      await invoke("set_window_size", { width: ORIG_W * 1.0, height: ORIG_H * 1.0 });
      if (petApp) {
        petApp.app.renderer.resize(ORIG_W, ORIG_H);
        petApp.petInstance.setPosition(SEAGULL_LOCAL_X, SEAGULL_LOCAL_Y);
        petApp.petInstance.setHomePosition(SEAGULL_LOCAL_X, SEAGULL_LOCAL_Y);
        petApp.petInstance.playIdle();
      }
      await invoke("set_ignore_cursor_events", { ignore: false });
    } catch (_) {}
  } finally {
    isAnimating = false;
  }
}

// ─── 动画后布局计算 ─────────────────────────────────────────────────────────

interface PostAnimLayout {
  winX: number;
  winY: number;
  winW: number;
  winH: number;
  seagullLocalX: number;
  seagullLocalY: number;
  panelLocalX: number;
  panelLocalY: number;
}

function computePostAnimLayout(
  seagullX: number, seagullY: number,
  screenW: number, screenH: number
): PostAnimLayout {
  // 决定面板弹出方向
  const spaceRight = screenW - seagullX - 60;
  const spaceLeft = seagullX - 60;
  const spaceBottom = screenH - seagullY - 40;

  const panelOnRight = spaceRight >= PANEL_W + PANEL_GAP;
  const panelOnBottom = spaceBottom >= PANEL_H;

  // 海鸥在窗口内的位置
  let seagullLocalX: number;
  let seagullLocalY: number;
  let panelLocalX: number;
  let panelLocalY: number;
  let winX: number;
  let winY: number;

  const winW = POST_ANIM_W;
  const winH = POST_ANIM_H;

  if (panelOnRight) {
    // 面板在右侧
    seagullLocalX = 80;
    panelLocalX = seagullLocalX + 60 + PANEL_GAP;
  } else if (spaceLeft >= PANEL_W + PANEL_GAP) {
    // 面板在左侧
    panelLocalX = 20;
    seagullLocalX = panelLocalX + PANEL_W + PANEL_GAP;
  } else {
    // 空间都不够，面板叠在下方
    seagullLocalX = winW / 2;
    panelLocalX = (winW - PANEL_W) / 2;
  }

  if (panelOnBottom) {
    seagullLocalY = 70;
    panelLocalY = seagullLocalY + 50 + 10;
    if (!panelOnRight && spaceLeft < PANEL_W + PANEL_GAP) {
      // 面板在下方的特殊布局
      panelLocalY = seagullLocalY + 60;
    }
  } else {
    // 面板在上方或同一水平线
    seagullLocalY = winH - 80;
    panelLocalY = 20;
  }

  // 正常情况面板和海鸥在同一行
  if (panelOnRight || spaceLeft >= PANEL_W + PANEL_GAP) {
    panelLocalY = Math.max(10, seagullLocalY - 40);
  }

  // 窗口位置：确保海鸥在屏幕上的位置不变
  winX = seagullX - seagullLocalX;
  winY = seagullY - seagullLocalY;

  // 边界钳制：确保窗口不超出屏幕
  winX = Math.max(0, Math.min(winX, screenW - winW));
  winY = Math.max(0, Math.min(winY, screenH - winH));

  // 由于钳制可能改变了 winX/winY，重新计算海鸥本地坐标
  seagullLocalX = seagullX - winX;
  seagullLocalY = seagullY - winY;

  // 重新计算面板位置
  if (panelOnRight) {
    panelLocalX = seagullLocalX + 60 + PANEL_GAP;
  } else if (spaceLeft >= PANEL_W + PANEL_GAP) {
    panelLocalX = seagullLocalX - PANEL_W - PANEL_GAP;
  } else {
    panelLocalX = Math.max(10, (winW - PANEL_W) / 2);
  }

  if (panelOnRight || spaceLeft >= PANEL_W + PANEL_GAP) {
    panelLocalY = Math.max(10, seagullLocalY - 40);
  } else {
    panelLocalY = seagullLocalY + 70;
  }

  // 确保面板不超出窗口
  panelLocalX = Math.max(5, Math.min(panelLocalX, winW - PANEL_W - 5));
  panelLocalY = Math.max(5, Math.min(panelLocalY, winH - PANEL_H - 5));

  return {
    winX, winY, winW, winH,
    seagullLocalX, seagullLocalY,
    panelLocalX, panelLocalY,
  };
}

// ─── 面板自动关闭逻辑（3秒离开鼠标后渐出）────────────────────────────────

function startPanelHideTimer() {
  cancelPanelHideTimer();
  panelHideTimer = setTimeout(() => {
    if (!isMouseOverPetArea && !isMouseOverPanel) {
      closePanelGracefully();
    }
  }, 3000);
}

function cancelPanelHideTimer() {
  if (panelHideTimer) {
    clearTimeout(panelHideTimer);
    panelHideTimer = null;
  }
}

function onRootMouseEnter() {
  isMouseOverPetArea = true;
  cancelPanelHideTimer();
}

function onRootMouseLeave() {
  isMouseOverPetArea = false;
  if (petStore.showPanel && !isMouseOverPanel) {
    startPanelHideTimer();
  }
}

function onRootMouseDown(e: MouseEvent) {
  if (e.button !== 0) return;
  if (petStore.showPanel) {
    closePanelGracefully();
  }
}

function onPanelMouseEnter() {
  isMouseOverPanel = true;
  cancelPanelHideTimer();
}

function onPanelMouseLeave() {
  isMouseOverPanel = false;
  if (petStore.showPanel && !isMouseOverPetArea) {
    startPanelHideTimer();
  }
}

// ─── 面板关闭 → 窗口缩回待机尺寸 ───────────────────────────────────────────

async function closePanelGracefully() {
  petStore.hidePanel();
  cancelPanelHideTimer();

  if (!petApp) return;

  try {
    // 获取当前窗口位置
    const [winLogX, winLogY] = await invoke<[number, number]>("get_window_position");

    // 海鸥在屏幕上的当前逻辑坐标
    const petPos = petApp.petInstance.getPosition();
    const seagullScreenLogX = winLogX + petPos.x;
    const seagullScreenLogY = winLogY + petPos.y;

    // 计算新窗口位置（海鸥居中）
    const newWinX = seagullScreenLogX - SEAGULL_LOCAL_X;
    const newWinY = seagullScreenLogY - SEAGULL_LOCAL_Y;

    // 缩回原始大小
    await invoke("set_window_position", { x: newWinX * 1.0, y: newWinY * 1.0 });
    await invoke("set_window_size", { width: ORIG_W * 1.0, height: ORIG_H * 1.0 });

    await sleep(80);

    petApp.app.renderer.resize(ORIG_W, ORIG_H);
    petApp.petInstance.setPosition(SEAGULL_LOCAL_X, SEAGULL_LOCAL_Y);
    petApp.petInstance.setHomePosition(SEAGULL_LOCAL_X, SEAGULL_LOCAL_Y);
    petApp.petInstance.playIdle();

    // 保持 ignore = false，让海鸥可以被拖动
    // （200x200 小窗口遮挡面积很小，可接受）

  } catch (e) {
    console.error("[App] closePanelGracefully 出错：", e);
  }
}

// ─── 面板事件处理 ──────────────────────────────────────────────────────────

async function handleAction(actionId: string) {
  console.log("[App] action triggered:", actionId);
  // Phase 1 只有 settings 可点击，目前只打印 log
  if (actionId === "settings") {
    console.log("[App] 设置按钮被点击");
  }
  // 不关闭面板，让用户继续查看
}

// ─── 工具函数 ──────────────────────────────────────────────────────────────

function sleep(ms: number): Promise<void> {
  return new Promise(r => setTimeout(r, ms));
}
</script>

<style>
* {
  margin: 0;
  padding: 0;
  box-sizing: border-box;
}

html, body {
  background: transparent;
  overflow: hidden;
}

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

/* 面板淡入淡出动画 */
.panel-fade-enter-active {
  animation: panel-in 0.3s cubic-bezier(0.34, 1.56, 0.64, 1);
}
.panel-fade-leave-active {
  animation: panel-out 0.25s ease-in forwards;
}

@keyframes panel-in {
  from { opacity: 0; transform: scale(0.85) translateY(8px); }
  to   { opacity: 1; transform: scale(1) translateY(0); }
}
@keyframes panel-out {
  from { opacity: 1; transform: scale(1); }
  to   { opacity: 0; transform: scale(0.9); }
}
</style>
