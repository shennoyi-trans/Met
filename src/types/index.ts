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

// ── 朝向系统 ────────────────────────────────────────────────────────────────
/**
 * 宠物朝向角度（弧度），以正右方为 0，逆时针为正。
 *
 * 2D 阶段：仅区分左/右，通过 facingSignFromAngle() 映射为 ±1 的 scale.x
 * 3D 阶段：直接作为模型 Y 轴旋转角
 */
export type FacingAngle = number;

/** 从弧度角获取 2D 翻转符号：右 = +1，左 = -1 */
export function facingSignFromAngle(angle: FacingAngle): 1 | -1 {
  // 归一化到 [-π, π)
  const a = ((angle % (2 * Math.PI)) + 3 * Math.PI) % (2 * Math.PI) - Math.PI;
  // |angle| > 90° 视为朝左
  return Math.abs(a) > Math.PI / 2 ? -1 : 1;
}

/** 从目标点计算朝向角（弧度） */
export function facingAngleFromTarget(
  fromX: number, fromY: number,
  toX: number, toY: number
): FacingAngle {
  return Math.atan2(fromY - toY, toX - fromX); // 注意屏幕 Y 轴向下
}

// ── 宠物插件规范 ─────────────────────────────────────────────────────────────
export interface PetPlugin {
  id: string;
  displayName: string;
  load(stage: import("pixi.js").Container): Promise<PetInstance>;
}

export interface PetInstance {
  state: PetState;

  /** 当前朝向角度（弧度）。2D 宠物实现中只用符号，3D 可直接用角度。 */
  readonly facingAngle: FacingAngle;

  playIdle(): void;
  onTrigger(ctx: TriggerContext): Promise<void>;
  onFriendArrived?(friend: PetInstance): void;
  destroy(): void;
  getPosition(): { x: number; y: number };
  setPosition(x: number, y: number): void;
  setHomePosition(x: number, y: number): void;
  setVisible(visible: boolean): void;
  stopAnimation(): void;

  /** 设置朝向（弧度）。2D 实现可仅区分左/右。 */
  setFacing(angle: FacingAngle): void;
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
