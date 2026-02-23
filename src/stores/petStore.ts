import { defineStore } from "pinia";
import { ref } from "vue";
import type { PanelAction, SessionLevel } from "@/types";

export const usePetStore = defineStore("pet", () => {
  const actions = ref<PanelAction[]>([
    { id: "astronomy", icon: "🔭", label: "天文奇观", enabled: false },
    { id: "birthday",  icon: "🎂", label: "生日提醒", enabled: false },
    { id: "cleanup",   icon: "🧹", label: "清理缓存", enabled: false },
    { id: "dispatch",  icon: "✈️",  label: "派出宠物", enabled: false },
    { id: "settings",  icon: "⚙️",  label: "设置",     enabled: true  },
  ]);

  const sessionLevel = ref<SessionLevel>("idle");
  const connectedFriendId = ref<string | null>(null);

  return { actions, sessionLevel, connectedFriendId };
});
