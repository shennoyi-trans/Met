<template>
  <div
    class="action-panel"
    :style="{
      left: panelX + 'px',
      top: panelY + 'px',
    }"
    @mouseenter="$emit('mouseenter')"
    @mouseleave="$emit('mouseleave')"
    @mousedown.stop
  >
    <div class="panel-header">
      <span class="panel-title">Met</span>
    </div>

    <div class="actions-grid">
      <button
        v-for="action in petStore.actions"
        :key="action.id"
        class="action-btn"
        :class="{ disabled: !action.enabled }"
        :title="action.enabled ? action.label : action.label + '（即将开放）'"
        @click="onActionClick(action)"
      >
        <span class="action-icon">{{ action.icon }}</span>
        <span class="action-label">{{ action.label }}</span>
      </button>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed } from "vue";
import { usePetStore } from "@/stores/petStore";
import type { PanelPosition } from "@/types";

const props = defineProps<{
  position: PanelPosition;
  seagullScreenPos?: { x: number; y: number };
}>();

const emit = defineEmits<{
  action: [id: string];
  mouseenter: [];
  mouseleave: [];
}>();

const petStore = usePetStore();

// 面板位置（已由 App.vue 计算好，这里做最终钳制）
const panelX = computed(() => {
  return Math.max(2, Math.min(props.position.x, window.innerWidth - 170));
});

const panelY = computed(() => {
  return Math.max(2, Math.min(props.position.y, window.innerHeight - 260));
});

function onActionClick(action: { id: string; enabled: boolean }) {
  if (!action.enabled) return;
  emit("action", action.id);
  console.log(`[ActionPanel] 点击：${action.id}`);
}
</script>

<style scoped>
.action-panel {
  position: fixed;
  background: rgba(255, 255, 255, 0.82);
  backdrop-filter: blur(16px);
  -webkit-backdrop-filter: blur(16px);
  border-radius: 16px;
  padding: 12px;
  box-shadow:
    0 8px 32px rgba(0, 0, 0, 0.12),
    0 2px 8px rgba(0, 0, 0, 0.08);
  border: 1px solid rgba(255, 255, 255, 0.6);
  width: 155px;
  z-index: 100;
  pointer-events: auto;
}

.panel-header {
  text-align: center;
  padding-bottom: 8px;
  border-bottom: 1px solid rgba(0, 0, 0, 0.06);
  margin-bottom: 8px;
}

.panel-title {
  font-size: 13px;
  font-weight: 600;
  color: #555;
  letter-spacing: 0.5px;
}

.actions-grid {
  display: flex;
  flex-direction: column;
  gap: 4px;
}

.action-btn {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 8px 10px;
  border-radius: 10px;
  border: none;
  background: rgba(0, 0, 0, 0.03);
  cursor: pointer;
  transition: all 0.15s ease;
  text-align: left;
  width: 100%;
  font-family: inherit;
}

.action-btn:hover:not(.disabled) {
  background: rgba(0, 122, 255, 0.1);
  transform: translateX(2px);
}

.action-btn:active:not(.disabled) {
  transform: scale(0.98);
}

.action-btn.disabled {
  opacity: 0.35;
  cursor: not-allowed;
}

.action-icon {
  font-size: 16px;
  width: 22px;
  text-align: center;
}

.action-label {
  font-size: 12px;
  color: #333;
  white-space: nowrap;
}
</style>
