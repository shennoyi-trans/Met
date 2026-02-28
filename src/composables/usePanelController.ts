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
 *
 * ★ 多显示器修复：
 *   面板位置计算改为从 Rust 获取虚拟桌面尺寸（覆盖所有显示器），
 *   不再依赖 window.screen.availWidth/Height（始终返回主显示器尺寸）。
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

// ── 虚拟桌面信息缓存 ────────────────────────────────────────────────────────
// 避免每次计算面板位置都调用 Rust，缓存虚拟桌面信息。
// 缓存在首次使用时填充，之后复用（显示器布局在运行期间很少变化）。

let cachedScreen: {
  originX: number;
  originY: number;
  width: number;
  height: number;
} | null = null;

async function getVirtualScreen(): Promise<{
  originX: number;
  originY: number;
  width: number;
  height: number;
}> {
  if (cachedScreen) return cachedScreen;

  try {
    const [ox, oy, w, h] = await invoke<[number, number, number, number]>("get_screen_size");
    const scale = await invoke<number>("get_scale_factor");
    cachedScreen = {
      originX: ox / scale,
      originY: oy / scale,
      width: w / scale,
      height: h / scale,
    };
  } catch {
    // 回退：使用主显示器尺寸
    cachedScreen = {
      originX: 0,
      originY: 0,
      width: window.screen.availWidth,
      height: window.screen.availHeight,
    };
  }

  return cachedScreen;
}

// ── 面板位置计算（异步，支持多显示器）────────────────────────────────────────

async function computePanelPosition(
  petX: number,
  petY: number
): Promise<{ x: number; y: number }> {
  const screen = await getVirtualScreen();

  // 虚拟桌面的有效范围
  const minX = screen.originX;
  const minY = screen.originY;
  const maxX = screen.originX + screen.width;
  const maxY = screen.originY + screen.height;

  let x: number;
  let y: number;

  // 优先放右侧
  if (petX + PET_HALF_SIZE + PANEL_GAP + PANEL_W < maxX) {
    x = petX + PET_HALF_SIZE + PANEL_GAP;
  }
  // 其次放左侧
  else if (petX - PET_HALF_SIZE - PANEL_GAP - PANEL_W > minX) {
    x = petX - PET_HALF_SIZE - PANEL_GAP - PANEL_W;
  }
  // 兜底居中于宠物附近
  else {
    x = Math.max(minX + 10, petX - PANEL_W / 2);
  }

  // 纵向：与宠物大致齐平
  y = petY - 40;

  // 边界钳制（使用虚拟桌面范围，支持副屏负坐标）
  x = Math.max(minX + 5, Math.min(x, maxX - PANEL_W - 5));
  y = Math.max(minY + 5, Math.min(y, maxY - PANEL_H - 5));

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

    const pos = await computePanelPosition(petX, petY);
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

  // ── 悬停事件处理（供 App.vue 事件监听调用）────────────────────────────────

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
    // ★ 预热虚拟桌面缓存（避免首次弹面板时延迟）
    getVirtualScreen().catch(() => {});

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
