// ── 手势 ────────────────────────────────────────────────────────────────────
export interface CircleGesturePayload {
  center_x: number;
  center_y: number;
  radius: number;
}

// ── 拖拽（来自 Rust 全局钩子）────────────────────────────────────────────────
export interface DragPayload {
  x: number;
  y: number;
}

// ── 宠物插件规范 ─────────────────────────────────────────────────────────────
export interface PetPlugin {
  id: string;
  displayName: string;
  load(stage: import("pixi.js").Container): Promise<PetInstance>;
}

export interface PetInstance {
  state: PetState;
  playIdle(): void;
  onTrigger(ctx: TriggerContext): Promise<void>;
  onFriendArrived?(friend: PetInstance): void;
  destroy(): void;
  getPosition(): { x: number; y: number };
  setPosition(x: number, y: number): void;
  setHomePosition(x: number, y: number): void;
  setVisible(visible: boolean): void;
  stopAnimation(): void;
}

export type PetState = "idle" | "triggered" | "eating" | "dispatching" | "arrived";

export interface TriggerContext {
  x: number;
  y: number;
  radius: number;
}

// ── Session（Phase 3+）──────────────────────────────────────────────────────
export type SessionLevel =
  | "idle" | "pet_pending" | "pet_active"
  | "stream_pending" | "stream_active" | "collab_active";

export interface Session {
  friendId: string;
  level: SessionLevel;
  startedAt?: number;
}

// ── 功能面板 ──────────────────────────────────────────────────────────────────
export interface PanelAction {
  id: string;
  icon: string;
  label: string;
  enabled: boolean;
}

export interface PanelPosition {
  x: number;
  y: number;
}
