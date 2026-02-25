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
 * - 监听 Rust 钩子的悬停事件，切换鼠标穿透 + 通知面板控制器
 * - 监听 Rust 钩子的右键事件，toggle 面板
 * - 通过 PanelController 管理面板生命周期
 * - 动画结束后统一处理：落点同步 → playIdle → 面板弹出
 *   （宠物插件只负责动画表演，不碰 homePosition / 面板 / 位置同步）
 *
 * 不再负责：
 * - 窗口 resize / reposition（窗口始终全屏）
 * - 面板 DOM 渲染（面板是独立窗口）
 * - 面板位置计算、自动关闭计时（PanelController 负责）
 */
import { ref, onMounted, onUnmounted } from "vue";
import { listen } from "@tauri-apps/api/event";
import { invoke } from "@tauri-apps/api/core";
import { createPetApp } from "@/pets/PetApp";
import { usePanelController } from "@/composables/usePanelController";
import type { CircleGesturePayload, DragPayload } from "@/types";

const pixiContainer = ref<HTMLDivElement>();
let petApp: Awaited<ReturnType<typeof createPetApp>> | null = null;

// ── 常量 ─────────────────────────────────────────────────────────────────────

const INITIAL_PET_X = 150;
const INITIAL_PET_Y = 150;

// ── 状态 ─────────────────────────────────────────────────────────────────────

let isAnimating = false;
let zOrderTimer: ReturnType<typeof setInterval> | null = null;

// ── 面板控制器 ───────────────────────────────────────────────────────────────

const panel = usePanelController();

onMounted(async () => {
  if (!pixiContainer.value) return;

  petApp = await createPetApp(pixiContainer.value);

  // 设置初始位置并开始 idle
  petApp.petInstance.setPosition(INITIAL_PET_X, INITIAL_PET_Y);
  petApp.petInstance.setHomePosition(INITIAL_PET_X, INITIAL_PET_Y);
  petApp.petInstance.playIdle();

  // 同步初始位置给 Rust 钩子（用于拖拽命中判定）
  await syncPetPosition(INITIAL_PET_X, INITIAL_PET_Y);
  panel.updatePetPosition(INITIAL_PET_X, INITIAL_PET_Y);

  // ── 初始化面板控制器（监听跨窗口事件）──────────────────────────────────
  await panel.init();

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

  // ── 悬停事件：鼠标进入/离开宠物时切换窗口穿透 + 通知面板控制器 ────────────
  const unlistenHoverEnter = await listen("pet-hover-enter", async () => {
    try {
      await invoke("set_ignore_cursor_events", { ignore: false });
    } catch (_) {}
    panel.onPetHoverEnter();
  });

  const unlistenHoverLeave = await listen("pet-hover-leave", async () => {
    try {
      await invoke("set_ignore_cursor_events", { ignore: true });
    } catch (_) {}
    panel.onPetHoverLeave();
  });

  // ── 右键事件：toggle 面板 ──────────────────────────────────────────────
  const unlistenRightClick = await listen<DragPayload>(
    "pet-right-click",
    (event) => handleRightClick(event.payload)
  );

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
    unlistenRightClick();
    if (zOrderTimer) clearInterval(zOrderTimer);
    panel.destroy();
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

/**
 * 通用：动画结束后同步宠物落点。
 *
 * 所有手势/触发动画结束后都应调用此函数，而非在各宠物插件内部处理。
 * 这确保 homePosition、Rust 侧命中判定坐标、面板控制器坐标三者一致。
 */
async function settlePetAfterAnimation() {
  if (!petApp) return;

  const pos = petApp.petInstance.getPosition();
  petApp.petInstance.setHomePosition(pos.x, pos.y);
  petApp.petInstance.playIdle();

  await syncPetPosition(pos.x, pos.y);
  panel.updatePetPosition(pos.x, pos.y);
}

// ── 拖拽处理 ────────────────────────────────────────────────────────────────

function handleDragStart() {
  if (!petApp || isAnimating) return;
  petApp.petInstance.stopAnimation();
  invoke("set_ignore_cursor_events", { ignore: true }).catch(() => {});
  // 拖拽开始时关闭面板
  panel.hidePanel();
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

  // 同步最终位置
  await syncPetPosition(payload.x, payload.y);
  panel.updatePetPosition(payload.x, payload.y);
}

// ── 右键处理 ────────────────────────────────────────────────────────────────

async function handleRightClick(_payload: DragPayload) {
  if (!petApp || isAnimating) return;

  // 使用当前宠物位置来定位面板
  const pos = petApp.petInstance.getPosition();
  await panel.togglePanel(pos.x, pos.y);
}

// ── 手势处理 ────────────────────────────────────────────────────────────────

async function handleCircleGesture(payload: CircleGesturePayload) {
  if (!petApp || isAnimating) return;
  isAnimating = true;

  // 先隐藏面板（如果还在显示）
  await panel.hidePanel();

  try {
    // 播放动画！宠物插件只负责表演，不修改 homePosition
    await petApp.triggerFriesSequence(
      payload.center_x,
      payload.center_y,
      payload.radius
    );

    // ★ 通用落点同步：从宠物实际停留位置读取，设置 home、同步 Rust、更新面板控制器
    await settlePetAfterAnimation();

    // 显示面板（用同步后的实际位置）
    const pos = petApp.petInstance.getPosition();
    await panel.showPanel(pos.x, pos.y);

  } catch (e) {
    console.error("[App] handleCircleGesture 出错：", e);
    if (petApp) {
      petApp.petInstance.setVisible(true);
      petApp.petInstance.playIdle();
    }
  } finally {
    isAnimating = false;
  }
}
</script>

<style>
* { margin: 0; padding: 0; box-sizing: border-box; }
html, body { background: transparent; overflow: hidden; }
#met-root { width: 100vw; height: 100vh; position: relative; background: transparent; }
#pixi-container { position: absolute; inset: 0; }
</style>
