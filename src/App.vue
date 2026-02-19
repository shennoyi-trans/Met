<template>
  <!-- 
    布局策略：
    - #pixi-container：全屏透明，PixiJS 渲染宠物，鼠标事件由 Tauri 层控制穿透
    - #ui-overlay：绝对定位，只在需要时显示功能面板，始终拦截鼠标事件
  -->
  <div id="met-root">
    <div id="pixi-container" ref="pixiContainer" />
    <ActionPanel
      v-if="petStore.showPanel"
      :position="petStore.panelPosition"
      @action="handleAction"
      @close="petStore.hidePanel()"
    />
  </div>
</template>

<script setup lang="ts">
import { ref, onMounted, onUnmounted } from "vue";
import { listen } from "@tauri-apps/api/event";
import { invoke } from "@tauri-apps/api/core";
import ActionPanel from "@/components/ActionPanel.vue";
import { usePetStore } from "@/stores/petStore";
import { createPetApp } from "@/pets/PetApp";
import type { CircleGesturePayload } from "@/types";

const pixiContainer = ref<HTMLDivElement>();
const petStore = usePetStore();
let petApp: Awaited<ReturnType<typeof createPetApp>> | null = null;

onMounted(async () => {
  if (!pixiContainer.value) return;

  // 初始化 PixiJS 宠物应用
  petApp = await createPetApp(pixiContainer.value);

  // 监听 Rust 层发来的画圈手势事件
  const unlisten = await listen<CircleGesturePayload>("gesture://circle", (event) => {
    handleCircleGesture(event.payload);
  });

  // 组件卸载时取消监听
  onUnmounted(unlisten);
});

async function handleCircleGesture(payload: CircleGesturePayload) {
  if (!petApp) return;

  // 将屏幕绝对坐标转换为窗口相对坐标（需要获取当前窗口位置）
  // TODO: Phase 2 从 windowStore 获取位置
  const windowX = 0; // 临时
  const windowY = 0;

  const relX = payload.center_x - windowX;
  const relY = payload.center_y - windowY;

  // 触发薯条生成 + 海鸥扑食动画序列
  await petApp.triggerFriesSequence(relX, relY, payload.radius);

  // 动画结束后显示功能面板
  petStore.showPanel({
    x: relX,
    y: relY,
  });
}

async function handleAction(actionId: string) {
  petStore.hidePanel();
  // TODO: Phase 2 接入具体功能
  console.log("action triggered:", actionId);
}
</script>

<style>
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
</style>
