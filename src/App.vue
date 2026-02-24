<template>
  <div id="met-root">
    <div id="pixi-container" ref="pixiContainer" />
  </div>
</template>

<script setup lang="ts">
/**
 * App.vue — 主窗口（全屏透明宠物覆盖层）
 *
 * 职责：
 * - 渲染 PixiJS 宠物（坐标 = 屏幕逻辑坐标）
 * - 监听 Rust 钩子的手势事件，播放动画
 * - 监听 Rust 钩子的拖拽事件，移动宠物
 * - 监听 Rust 钩子的悬停事件，切换鼠标穿透
 * - 动画结束后通知 Rust 显示面板窗口
 *
 * 不再负责：
 * - 窗口 resize / reposition（窗口始终全屏）
 * - 面板 DOM 渲染（面板是独立窗口）
 */
import { ref, onMounted, onUnmounted } from "vue";
import { listen } from "@tauri-apps/api/event";
import { invoke } from "@tauri-apps/api/core";
import { createPetApp } from "@/pets/PetApp";
import type { CircleGesturePayload, DragPayload } from "@/types";

const pixiContainer = ref<HTMLDivElement>();
let petApp: Awaited<ReturnType<typeof createPetApp>> | null = null;

// ── 常量 ─────────────────────────────────────────────────────────────────────

// 宠物初始位置（屏幕逻辑坐标）
const INITIAL_PET_X = 150;
const INITIAL_PET_Y = 150;

// 面板尺寸（逻辑像素，与面板窗口 tauri.conf.json 一致）
const PANEL_W = 180;
const PANEL_H = 280;
const PANEL_GAP = 20;

// ── 状态 ─────────────────────────────────────────────────────────────────────

let isAnimating = false;
let zOrderTimer: ReturnType<typeof setInterval> | null = null;

onMounted(async () => {
  if (!pixiContainer.value) return;

  petApp = await createPetApp(pixiContainer.value);

  // 设置初始位置并开始 idle
  petApp.petInstance.setPosition(INITIAL_PET_X, INITIAL_PET_Y);
  petApp.petInstance.setHomePosition(INITIAL_PET_X, INITIAL_PET_Y);
  petApp.petInstance.playIdle();

  // 同步初始位置给 Rust 钩子（用于拖拽命中判定）
  await syncPetPosition(INITIAL_PET_X, INITIAL_PET_Y);

  // ── 事件监听 ──────────────────────────────────────────────────────────

  const unlistenGesture = await listen<CircleGesturePayload>(
    "gesture-circle",
    (event) => handleCircleGesture(event.payload)
  );

  const unlistenDragStart = await listen<DragPayload>(
    "pet-drag-start",
    () => handleDragStart()
  );

  const unlistenDragMove = await listen<DragPayload>(
    "pet-drag-move",
    (event) => handleDragMove(event.payload)
  );

  const unlistenDragEnd = await listen<DragPayload>(
    "pet-drag-end",
    (event) => handleDragEnd(event.payload)
  );

  // ── 悬停事件：鼠标进入/离开宠物时切换窗口穿透 ──────────────────────────
  const unlistenHoverEnter = await listen("pet-hover-enter", async () => {
    try {
      await invoke("set_ignore_cursor_events", { ignore: false });
    } catch (_) {}
  });

  const unlistenHoverLeave = await listen("pet-hover-leave", async () => {
    try {
      await invoke("set_ignore_cursor_events", { ignore: true });
    } catch (_) {}
  });

  // z-order 刷新
  zOrderTimer = setInterval(async () => {
    try { await invoke("reassert_always_on_top"); } catch (_) {}
  }, 5000);

  onUnmounted(() => {
    unlistenGesture();
    unlistenDragStart();
    unlistenDragMove();
    unlistenDragEnd();
    unlistenHoverEnter();
    unlistenHoverLeave();
    if (zOrderTimer) clearInterval(zOrderTimer);
  });
});

// ── 位置同步 ────────────────────────────────────────────────────────────────

async function syncPetPosition(x: number, y: number) {
  try {
    await invoke("update_pet_position", { x, y });
  } catch (e) {
    console.warn("[App] syncPetPosition 失败:", e);
  }
}

// ── 拖拽处理 ────────────────────────────────────────────────────────────────

function handleDragStart() {
  if (!petApp || isAnimating) return;
  // 停止 idle 动画，冻结宠物（保留朝向）
  petApp.petInstance.stopAnimation();
  // 拖拽期间恢复穿透，避免阻挡桌面其他元素
  invoke("set_ignore_cursor_events", { ignore: true }).catch(() => {});
}

function handleDragMove(payload: DragPayload) {
  if (!petApp || isAnimating) return;
  petApp.petInstance.setPosition(payload.x, payload.y);
  petApp.petInstance.setHomePosition(payload.x, payload.y);
}

async function handleDragEnd(payload: DragPayload) {
  if (!petApp || isAnimating) return;
  petApp.petInstance.setPosition(payload.x, payload.y);
  petApp.petInstance.setHomePosition(payload.x, payload.y);
  petApp.petInstance.playIdle();

  // 同步最终位置给 Rust
  await syncPetPosition(payload.x, payload.y);
}

// ── 手势处理 ────────────────────────────────────────────────────────────────

async function handleCircleGesture(payload: CircleGesturePayload) {
  if (!petApp || isAnimating) return;
  isAnimating = true;

  // 先隐藏面板（如果还在显示）
  try { await invoke("hide_panel"); } catch (_) {}

  try {
    // 直接播放动画！坐标已经是屏幕逻辑坐标，无需任何窗口操作
    await petApp.triggerFriesSequence(
      payload.center_x,
      payload.center_y,
      payload.radius
    );

    // 动画结束，宠物停在圈圈中心
    const petX = payload.center_x;
    const petY = payload.center_y;

    petApp.petInstance.playIdle();

    // 同步位置给 Rust 钩子
    await syncPetPosition(petX, petY);

    // 计算面板位置并显示面板窗口
    const panelPos = computePanelPosition(petX, petY);
    await invoke("show_panel", { x: panelPos.x, y: panelPos.y });

  } catch (e) {
    console.error("[App] handleCircleGesture 出错：", e);
    // 确保宠物可见并恢复 idle
    if (petApp) {
      petApp.petInstance.setVisible(true);
      petApp.petInstance.playIdle();
    }
  } finally {
    isAnimating = false;
  }
}

// ── 面板位置计算 ────────────────────────────────────────────────────────────

function computePanelPosition(petX: number, petY: number) {
  // ★ Bug #2 修复：使用 availWidth/availHeight 排除任务栏区域
  const screenW = window.screen.availWidth;
  const screenH = window.screen.availHeight;

  let x: number;
  let y: number;

  // 优先放右侧
  if (petX + 60 + PANEL_GAP + PANEL_W < screenW) {
    x = petX + 60 + PANEL_GAP;
  }
  // 其次放左侧
  else if (petX - 60 - PANEL_GAP - PANEL_W > 0) {
    x = petX - 60 - PANEL_GAP - PANEL_W;
  }
  // 兜底居中
  else {
    x = Math.max(10, (screenW - PANEL_W) / 2);
  }

  // 纵向：与宠物大致齐平
  y = petY - 40;

  // 边界钳制
  x = Math.max(5, Math.min(x, screenW - PANEL_W - 5));
  y = Math.max(5, Math.min(y, screenH - PANEL_H - 5));

  return { x, y };
}
</script>

<style>
* { margin: 0; padding: 0; box-sizing: border-box; }
html, body { background: transparent; overflow: hidden; }
#met-root { width: 100vw; height: 100vh; position: relative; background: transparent; }
#pixi-container { position: absolute; inset: 0; }
</style>
