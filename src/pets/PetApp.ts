import { Application } from "pixi.js";
import { SeagullPet } from "./seagull/SeagullPet";
import type { PetInstance } from "@/types";
import { invoke } from "@tauri-apps/api/core";

/**
 * PetApp
 * PixiJS Application 的封装，管理：
 * - PixiJS 画布生命周期
 * - 当前激活的宠物实例
 * - 拖拽逻辑
 * - 宠物切换逻辑（Phase 2+）
 */
export async function createPetApp(container: HTMLDivElement) {
  const app = new Application();

  await app.init({
    width: container.clientWidth,
    height: container.clientHeight,
    backgroundAlpha: 0,       // 透明背景，关键！
    antialias: true,
    resolution: window.devicePixelRatio || 1,
    autoDensity: true,
  });

  container.appendChild(app.canvas);

  // 默认加载海鸥
  const seagull = new SeagullPet();
  const petInstance: PetInstance = await seagull.load(app.stage);
  petInstance.playIdle();

  // ── 拖拽逻辑 ────────────────────────────────────────────────────────────────
  // 使用自定义 Pointer Events 拖动，避免系统原生拖动限制窗口不能超过屏幕顶部

  // 判断一个点是否在海鸥的可交互区域内
  function isPointOnSeagull(clientX: number, clientY: number): boolean {
    const pos = petInstance.getPosition();
    const dx = clientX - pos.x;
    const dy = clientY - pos.y;
    // 海鸥大约占 100x70 像素的区域，使用椭圆判定
    return (dx * dx) / (60 * 60) + (dy * dy) / (45 * 45) <= 1;
  }

  let isDragging = false;
  let dragWinX = 0;
  let dragWinY = 0;
  let lastScreenX = 0;
  let lastScreenY = 0;
  let dragPending = false;

  app.canvas.addEventListener("pointerdown", async (e: PointerEvent) => {
    if (e.button !== 0) return;

    const rect = app.canvas.getBoundingClientRect();
    const clientX = e.clientX - rect.left;
    const clientY = e.clientY - rect.top;

    if (isPointOnSeagull(clientX, clientY)) {
      e.preventDefault();
      e.stopPropagation();
      try {
        const [wx, wy] = await invoke<[number, number]>("get_window_position");
        dragWinX = wx;
        dragWinY = wy;
        lastScreenX = e.screenX;
        lastScreenY = e.screenY;
        isDragging = true;
        dragPending = false;
        app.canvas.setPointerCapture(e.pointerId);
      } catch (err) {
        console.warn("[PetApp] 获取窗口位置失败:", err);
      }
    }
  });

  app.canvas.addEventListener("pointermove", async (e: PointerEvent) => {
    if (!isDragging) return;
    const dx = e.screenX - lastScreenX;
    const dy = e.screenY - lastScreenY;
    lastScreenX = e.screenX;
    lastScreenY = e.screenY;
    dragWinX += dx;
    dragWinY += dy;
    if (dragPending) return;
    dragPending = true;
    try {
      await invoke("set_window_position", { x: dragWinX, y: dragWinY });
    } catch (_) {
      // 静默失败
    } finally {
      dragPending = false;
    }
  });

  app.canvas.addEventListener("pointerup", (e: PointerEvent) => {
    if (!isDragging) return;
    isDragging = false;
    app.canvas.releasePointerCapture(e.pointerId);
  });

  app.canvas.addEventListener("pointercancel", () => {
    isDragging = false;
  });

  // 防止右键菜单
  app.canvas.addEventListener("contextmenu", (e) => {
    e.preventDefault();
  });

  return {
    app,
    petInstance,

    /**
     * 画圈 → 薯条 → 扑食的完整动画序列
     * 由 App.vue 在收到 gesture://circle 事件后调用
     */
    async triggerFriesSequence(x: number, y: number, radius: number) {
      await petInstance.onTrigger({ x, y, radius });
    },

    /** 切换宠物插件（Phase 2+） */
    async switchPet(_pluginId: string) {
      petInstance.destroy();
      // TODO: 动态 import 对应的 PetPlugin，load，playIdle
    },

    destroy() {
      petInstance.destroy();
      app.destroy(true);
    },
  };
}
