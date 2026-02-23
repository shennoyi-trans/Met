import { createApp } from "vue";
import { createPinia } from "pinia";
import { getCurrentWindow } from "@tauri-apps/api/window";

/**
 * 统一入口：根据 Tauri 窗口 label 加载不同的根组件
 * - "main"  → App.vue（全屏透明宠物覆盖层）
 * - "panel" → PanelApp.vue（功能面板小窗口）
 */
async function bootstrap() {
  const label = getCurrentWindow().label;

  const rootComponent = label === "panel"
    ? (await import("./PanelApp.vue")).default
    : (await import("./App.vue")).default;

  const app = createApp(rootComponent);
  app.use(createPinia());
  app.mount("#app");
}

bootstrap();
