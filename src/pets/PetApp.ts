import { Application } from "pixi.js";
import { SeagullPet } from "./seagull/SeagullPet";
import type { PetInstance } from "@/types";

/**
 * PetApp
 * PixiJS Application 的封装，管理：
 * - PixiJS 画布生命周期
 * - 当前激活的宠物实例
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
  // 宠物可被鼠标左键拖动，拖动期间告诉 Tauri 不要穿透
  let isDragging = false;
  let dragStartX = 0, dragStartY = 0;

  app.canvas.addEventListener("mousedown", (e) => {
    if (e.button !== 0) return;
    isDragging = true;
    dragStartX = e.screenX;
    dragStartY = e.screenY;
    // 通知 Rust 层：现在有鼠标事件，不穿透
    // invoke("set_ignore_cursor_events", { ignore: false });
  });

  window.addEventListener("mousemove", (e) => {
    if (!isDragging) return;
    const dx = e.screenX - dragStartX;
    const dy = e.screenY - dragStartY;
    // TODO: 调用 invoke("set_window_position") 移动窗口
    // 需要先知道窗口当前位置，在 windowStore 里维护
  });

  window.addEventListener("mouseup", () => {
    isDragging = false;
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
