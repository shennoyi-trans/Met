import { defineStore } from "pinia";
import { ref, computed } from "vue";
import type { PanelPosition, PanelAction, SessionLevel } from "@/types";

export const usePetStore = defineStore("pet", () => {
  // ── 面板 ──────────────────────────────────────────────────────────────────
  const showPanel = ref(false);
  const panelPosition = ref<PanelPosition>({ x: 0, y: 0 });

  // Phase 1 可用的功能按键（后续逐步解锁）
  const actions = ref<PanelAction[]>([
    { id: "astronomy", icon: "🔭", label: "天文奇观", enabled: false },  // Phase 4
    { id: "birthday",  icon: "🎂", label: "生日提醒", enabled: false },  // Phase 4
    { id: "cleanup",   icon: "🧹", label: "清理缓存", enabled: false },  // Phase 4
    { id: "dispatch",  icon: "✈️",  label: "派出宠物", enabled: false },  // Phase 3
    { id: "settings",  icon: "⚙️",  label: "设置",     enabled: true  },  // Phase 1
  ]);

  function showPanelAt(position: PanelPosition) {
    panelPosition.value = position;
    showPanel.value = true;
  }

  function hidePanel() {
    showPanel.value = false;
  }

  // ── 连接状态（Phase 3+ 用，现在只定义 ）──────────────────────────────────
  const sessionLevel = ref<SessionLevel>("idle");
  const connectedFriendId = ref<string | null>(null);

  return {
    showPanel,
    panelPosition,
    actions,
    showPanelAt,
    hidePanel,
    sessionLevel,
    connectedFriendId,
  };
});
