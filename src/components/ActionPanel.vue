<template>
  <div
    class="action-panel"
    :style="{ left: clampedX + 'px', top: clampedY + 'px' }"
    @mouseenter="onPanelHover(true)"
    @mouseleave="onPanelHover(false)"
  >
    <!-- 关闭按钮 -->
    <button class="close-btn" @click="$emit('close')">×</button>

    <!-- 功能按键 -->
    <div class="actions-grid">
      <button
        v-for="action in petStore.actions"
        :key="action.id"
        class="action-btn"
        :class="{ disabled: !action.enabled }"
        :title="action.enabled ? action.label : action.label + '（即将开放）'"
        @click="action.enabled && $emit('action', action.id)"
      >
        <span class="action-icon">{{ action.icon }}</span>
        <span class="action-label">{{ action.label }}</span>
      </button>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed } from "vue";
import { invoke } from "@tauri-apps/api/core";
import { usePetStore } from "@/stores/petStore";
import type { PanelPosition } from "@/types";

const props = defineProps<{
  position: PanelPosition;
}>();

const emit = defineEmits<{
  action: [id: string];
  close: [];
}>();

const petStore = usePetStore();

// 防止面板超出窗口边界（简单实现）
const clampedX = computed(() => Math.min(props.position.x, window.innerWidth - 160));
const clampedY = computed(() => Math.min(props.position.y, window.innerHeight - 200));

// 面板出现时禁止鼠标穿透，面板消失时恢复穿透
async function onPanelHover(hovering: boolean) {
  await invoke("set_ignore_cursor_events", { ignore: !hovering });
}
</script>

<style scoped>
.action-panel {
  position: fixed;
  background: rgba(255, 255, 255, 0.92);
  backdrop-filter: blur(12px);
  border-radius: 16px;
  padding: 12px;
  box-shadow: 0 8px 32px rgba(0, 0, 0, 0.18);
  border: 1px solid rgba(255, 255, 255, 0.6);
  width: 150px;
  animation: pop-in 0.2s cubic-bezier(0.34, 1.56, 0.64, 1);
  z-index: 100;
}

@keyframes pop-in {
  from { transform: scale(0.7); opacity: 0; }
  to   { transform: scale(1);   opacity: 1; }
}

.close-btn {
  position: absolute;
  top: 6px; right: 8px;
  background: none; border: none;
  font-size: 16px; color: #999;
  cursor: pointer; line-height: 1;
}
.close-btn:hover { color: #333; }

.actions-grid {
  display: flex;
  flex-direction: column;
  gap: 6px;
  margin-top: 8px;
}

.action-btn {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 7px 10px;
  border-radius: 10px;
  border: none;
  background: rgba(0,0,0,0.04);
  cursor: pointer;
  transition: background 0.15s;
  text-align: left;
  width: 100%;
}
.action-btn:hover:not(.disabled) {
  background: rgba(0, 122, 255, 0.1);
}
.action-btn.disabled {
  opacity: 0.4;
  cursor: not-allowed;
}
.action-icon { font-size: 16px; }
.action-label { font-size: 12px; color: #333; }
</style>
