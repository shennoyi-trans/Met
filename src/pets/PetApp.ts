import { Application } from "pixi.js";
import { SeagullPet } from "./seagull/SeagullPet";
import { registerSeagullGestures } from "./seagull/gestures";
import type { PetInstance } from "@/types";

/**
 * PetApp — PixiJS Application 封装
 *
 * 双窗口架构中，主窗口始终全屏透明穿透。
 * PixiJS 画布坐标 = 屏幕逻辑坐标，无需坐标转换。
 * 拖拽由 Rust 全局钩子处理，不需要 DOM 事件。
 *
 * ★ 修复：使用 ResizeObserver 监听容器尺寸变化，
 *   确保 Rust 侧 setup 中的窗口 resize（从 800×600 → 全屏）
 *   能同步更新 PixiJS 画布尺寸。
 *   dev 模式下热加载恰好掩盖了这个时序问题，release 模式下必须主动处理。
 */
export async function createPetApp(container: HTMLDivElement) {
  const app = new Application();

  // ★ 修复：初始化时使用 1×1 作为安全默认值，
  //   等 ResizeObserver 回调时再设为正确尺寸。
  //   这样即使 onMounted 在窗口 resize 之前执行，也不会锁定错误尺寸。
  const initW = container.clientWidth || 1;
  const initH = container.clientHeight || 1;

  await app.init({
    width: initW,
    height: initH,
    backgroundAlpha: 0,
    antialias: true,
    resolution: window.devicePixelRatio || 1,
    autoDensity: true,
  });

  container.appendChild(app.canvas);

  // ★ 修复：ResizeObserver 在容器尺寸变化时同步更新 PixiJS 画布
  const resizeObserver = new ResizeObserver((entries) => {
    for (const entry of entries) {
      const { width, height } = entry.contentRect;
      if (width > 0 && height > 0) {
        app.renderer.resize(width, height);
      }
    }
  });
  resizeObserver.observe(container);

  const seagull = new SeagullPet();
  const petInstance: PetInstance = await seagull.load(app.stage);

  // 注册海鸥需要的手势识别器到 Rust 侧
  await registerSeagullGestures();

  // 主窗口始终穿透，画布不接收鼠标事件
  app.canvas.style.pointerEvents = "none";

  return {
    app,
    petInstance,

    async triggerFriesSequence(x: number, y: number, radius: number) {
      await petInstance.onTrigger({ x, y, radius });
    },

    async switchPet(_pluginId: string) {
      petInstance.destroy();
      // TODO: 加载新宠物并注册其手势识别器
    },

    destroy() {
      resizeObserver.disconnect();
      petInstance.destroy();
      app.destroy(true);
    },
  };
}
