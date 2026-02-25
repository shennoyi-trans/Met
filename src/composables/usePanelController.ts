/**
 * usePanelController — 面板生命周期管理（所有宠物共享）
 *
 * 职责：
 *   - 面板的 show / hide / toggle
 *   - 面板位置计算（基于宠物坐标 + 屏幕边界）
 *   - 3 秒自动关闭计时器（鼠标离开宠物 + 面板区域后开始倒计时）
 *   - 跨窗口事件协调（主窗口 ↔ 面板窗口）
 *
 * 关闭触发方式：
 *   1. 鼠标离开宠物 + 面板区域 3 秒 → 自动关闭
 *   2. 点击屏幕其他位置 → 面板窗口失焦 → 立即关闭
 *   3. 右键宠物（toggle）→ 如果面板已打开则关闭
 *   4. 新手势触发 → 先关闭再播放动画
 *
 * 计时器规则：
 *   - 鼠标在宠物或面板上 → 计时器清零
 *   - 鼠标离开两者 → 开始 3 秒倒计时
 *   - 3 秒内回到任一区域 → 计时器清零
 *   - 3 秒到期 → 关闭面板
 */

import { ref } from "vue";
import { listen } from "@tauri-apps/api/event";
import { invoke } from "@tauri-apps/api/core";

// ── 面板尺寸常量（与 tauri.conf.json 保持一致）─────────────────────────────

const PANEL_W = 180;
const PANEL_H = 280;
const PANEL_GAP = 20;
const PET_HALF_SIZE = 60; // 宠物碰撞半径（逻辑像素）
const AUTO_CLOSE_MS = 3000;

// ── 面板位置计算 ────────────────────────────────────────────────────────────

function computePanelPosition(petX: number, petY: number): { x: number; y: number } {
  const screenW = window.screen.availWidth;
  const screenH = window.screen.availHeight;

  let x: number;
  let y: number;

  // 优先放右侧
  if (petX + PET_HALF_SIZE + PANEL_GAP + PANEL_W < screenW) {
    x = petX + PET_HALF_SIZE + PANEL_GAP;
  }
  // 其次放左侧
  else if (petX - PET_HALF_SIZE - PANEL_GAP - PANEL_W > 0) {
    x = petX - PET_HALF_SIZE - PANEL_GAP - PANEL_W;
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

// ── Composable ──────────────────────────────────────────────────────────────

export function usePanelController() {
  const isPanelVisible = ref(false);

  // 悬停状态
  let isMouseOverPet = false;
  let isMouseOverPanel = false;

  // 自动关闭计时器
  let closeTimer: ReturnType<typeof setTimeout> | null = null;

  // 记住上次宠物位置（用于 toggle 时重新定位面板）
  let lastPetX = 0;
  let lastPetY = 0;

  // 事件解注册函数
  const unlisteners: (() => void)[] = [];

  // ── 计时器管理 ──────────────────────────────────────────────────────────

  function clearCloseTimer() {
    if (closeTimer !== null) {
      clearTimeout(closeTimer);
      closeTimer = null;
    }
  }

  /**
   * 评估是否需要启动关闭倒计时。
   * 仅在面板可见且鼠标不在宠物和面板区域时启动。
   */
  function evaluateAutoClose() {
    clearCloseTimer();

    if (!isPanelVisible.value) return;
    if (isMouseOverPet || isMouseOverPanel) return;

    closeTimer = setTimeout(() => {
      closeTimer = null;
      hidePanel();
    }, AUTO_CLOSE_MS);
  }

  // ── 面板控制 ──────────────────────────────────────────────────────────────

  async function showPanel(petX: number, petY: number) {
    lastPetX = petX;
    lastPetY = petY;

    const pos = computePanelPosition(petX, petY);
    try {
      await invoke("show_panel", { x: pos.x, y: pos.y });
      isPanelVisible.value = true;
      // 显示后立即评估：如果鼠标不在宠物/面板上，开始倒计时
      evaluateAutoClose();
    } catch (e) {
      console.warn("[PanelController] show_panel 失败:", e);
    }
  }

  async function hidePanel() {
    clearCloseTimer();
    isMouseOverPanel = false; // 面板关闭后重置

    if (!isPanelVisible.value) return;
    isPanelVisible.value = false;

    try {
      await invoke("hide_panel");
    } catch (e) {
      console.warn("[PanelController] hide_panel 失败:", e);
    }
  }

  async function togglePanel(petX: number, petY: number) {
    if (isPanelVisible.value) {
      await hidePanel();
    } else {
      await showPanel(petX, petY);
    }
  }

  // ── 悬停事件处理（供 App.vue 事件监听调用）─────────────────────────────────

  function onPetHoverEnter() {
    isMouseOverPet = true;
    clearCloseTimer();
  }

  function onPetHoverLeave() {
    isMouseOverPet = false;
    evaluateAutoClose();
  }

  // 面板窗口内部的悬停（通过 Tauri 跨窗口事件接收）
  function onPanelHoverEnter() {
    isMouseOverPanel = true;
    clearCloseTimer();
  }

  function onPanelHoverLeave() {
    isMouseOverPanel = false;
    evaluateAutoClose();
  }

  // 面板窗口失焦（点击屏幕其他位置）→ 立即关闭
  function onPanelBlur() {
    hidePanel();
  }

  // ── 生命周期 ──────────────────────────────────────────────────────────────

  /**
   * 初始化事件监听。在 onMounted 中调用。
   *
   * 监听来自面板窗口的跨窗口事件：
   *   - panel-hover-enter / panel-hover-leave：鼠标进出面板区域
   *   - panel-blur：面板窗口失焦（点击屏幕其他位置）
   *
   * 注意：pet-hover-enter / pet-hover-leave 不在此处监听，
   * 因为它们还需要做鼠标穿透切换，由 App.vue 统一处理后调用
   * onPetHoverEnter / onPetHoverLeave。
   */
  async function init() {
    unlisteners.push(
      await listen("panel-hover-enter", () => onPanelHoverEnter()),
      await listen("panel-hover-leave", () => onPanelHoverLeave()),
      await listen("panel-blur", () => onPanelBlur()),
    );
  }

  function destroy() {
    clearCloseTimer();
    for (const fn of unlisteners) fn();
    unlisteners.length = 0;
  }

  return {
    isPanelVisible,

    showPanel,
    hidePanel,
    togglePanel,

    onPetHoverEnter,
    onPetHoverLeave,

    init,
    destroy,

    /** 获取上次宠物位置（右键 toggle 时使用） */
    getLastPetPosition: () => ({ x: lastPetX, y: lastPetY }),

    /** 更新宠物位置（拖拽结束、手势完成后调用） */
    updatePetPosition(x: number, y: number) {
      lastPetX = x;
      lastPetY = y;
    },
  };
}
