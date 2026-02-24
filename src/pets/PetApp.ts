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
 */
export async function createPetApp(container: HTMLDivElement) {
  const app = new Application();

  await app.init({
    width: container.clientWidth,
    height: container.clientHeight,
    backgroundAlpha: 0,
    antialias: true,
    resolution: window.devicePixelRatio || 1,
    autoDensity: true,
  });

  container.appendChild(app.canvas);

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
      petInstance.destroy();
      app.destroy(true);
    },
  };
}
