// ── 手势 ────────────────────────────────────────────────────────────────────
export interface CircleGesturePayload {
  center_x: number;
  center_y: number;
  radius: number;
}

// ── 宠物插件规范 ─────────────────────────────────────────────────────────────
// 每个宠物组件都必须实现这个接口，这是扩展性的核心
export interface PetPlugin {
  id: string;
  displayName: string;

  /** 加载资源，返回初始化好的 PetInstance */
  load(stage: import("pixi.js").Container): Promise<PetInstance>;
}

export interface PetInstance {
  /** 当前状态 */
  state: PetState;

  /** 播放待机动画 */
  playIdle(): void;

  /** 触发手势对应的动画序列，返回 Promise（动画结束时 resolve） */
  onTrigger(ctx: TriggerContext): Promise<void>;

  /** 另一个宠物出现在同一屏幕上时的互动 */
  onFriendArrived?(friend: PetInstance): void;

  /** 销毁，清理资源 */
  destroy(): void;

  // 位置管理（供窗口扩展时使用）
  getPosition(): { x: number; y: number };
  setPosition(x: number, y: number): void;
  setHomePosition(x: number, y: number): void;
}

export type PetState = "idle" | "triggered" | "eating" | "dispatching" | "arrived";

export interface TriggerContext {
  /** 触发点在窗口内的相对坐标 */
  x: number;
  y: number;
  radius: number;
}

// ── Session（连接层级，为 Phase 3+ 预留）──────────────────────────────────────
export type SessionLevel =
  | "idle"           // 无连接
  | "pet_pending"    // 等待对方上线
  | "pet_active"     // 宠物已派出
  | "stream_pending" // 等待接受同屏
  | "stream_active"  // 单向串流
  | "collab_active"; // 双向协作

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
