import {
  Container,
  Graphics,
  Text,
  TextStyle,
  Ticker,
} from "pixi.js";
import type { PetInstance, TriggerContext, PetState, FacingAngle } from "@/types";
import { facingSignFromAngle, facingAngleFromTarget } from "@/types";

export class SeagullPet {
  async load(stage: Container): Promise<PetInstance> {
    return new SeagullInstance(stage);
  }
}

class SeagullInstance implements PetInstance {
  state: PetState = "idle";

  private stage: Container;
  private container: Container;
  private body: Graphics;
  private friesContainer: Container | null = null;

  private idleTicker: Ticker;
  private idleTime = 0;
  private idleTickerFn: ((ticker: Ticker) => void) | null = null;

  private homeX = 100;
  private homeY = 100;

  // ── 朝向 ────────────────────────────────────────────────────────────────
  /**
   * 内部朝向角度（弧度）。
   * 2D 阶段只使用 facingSign 做左右翻转；
   * 3D 阶段可直接用此值旋转模型。
   */
  private _facingAngle: FacingAngle = 0; // 默认朝右

  get facingAngle(): FacingAngle {
    return this._facingAngle;
  }

  /** 当前 2D 翻转符号：+1 = 朝右, -1 = 朝左 */
  private get facingSign(): 1 | -1 {
    return facingSignFromAngle(this._facingAngle);
  }

  setFacing(angle: FacingAngle): void {
    this._facingAngle = angle;
    this.applyFacing();
  }

  /** 将当前朝向应用到 container（2D：scale.x 翻转） */
  private applyFacing(scaleMultiplier = 1): void {
    this.container.scale.x = this.facingSign * scaleMultiplier;
  }

  // ── 构造 ────────────────────────────────────────────────────────────────

  constructor(stage: Container) {
    this.stage = stage;
    this.container = new Container();
    this.body = this.createSeagullGraphic();
    this.container.addChild(this.body);
    this.container.x = this.homeX;
    this.container.y = this.homeY;
    stage.addChild(this.container);
    this.idleTicker = new Ticker();
    this.idleTicker.stop();
  }

  // ── 位置 ────────────────────────────────────────────────────────────────

  getPosition() { return { x: this.container.x, y: this.container.y }; }
  setPosition(x: number, y: number) { this.container.x = x; this.container.y = y; }
  setHomePosition(x: number, y: number) { this.homeX = x; this.homeY = y; }
  setVisible(visible: boolean) { this.container.visible = visible; }

  stopAnimation() {
    this.idleTicker.stop();
    this.container.rotation = 0;
    // 保留朝向，只重置 scale 幅值
    this.container.scale.set(this.facingSign, 1);
  }

  // ── 图形绘制 ────────────────────────────────────────────────────────────
  // 海鸥默认朝右绘制（头/喙在 +x 方向）

  private createSeagullGraphic(): Graphics {
    const g = new Graphics();
    // 身体
    g.ellipse(0, 0, 28, 18).fill({ color: 0xffffff });
    // 左翅
    g.moveTo(-28, -5).quadraticCurveTo(-50, -25, -20, -15).fill({ color: 0xe8e8e8 });
    // 右翅
    g.moveTo(28, -5).quadraticCurveTo(50, -25, 20, -15).fill({ color: 0xe8e8e8 });
    // 头
    g.circle(30, -12, 14).fill({ color: 0xffffff });
    // 喙
    g.moveTo(40, -12).lineTo(52, -10).lineTo(40, -8).fill({ color: 0xf5a623 });
    // 眼睛
    g.circle(34, -15, 3).fill({ color: 0x222222 });
    // 眼睛高光
    g.circle(35, -16, 1).fill({ color: 0xffffff });
    return g;
  }

  // ── Idle 动画 ──────────────────────────────────────────────────────────

  playIdle() {
    this.state = "idle";
    this.idleTicker.stop();
    if (this.idleTickerFn) {
      this.idleTicker.remove(this.idleTickerFn);
      this.idleTickerFn = null;
    }
    this.idleTime = 0;
    this.container.rotation = 0;

    // ★ 关键修复：保留当前朝向
    this.container.scale.set(this.facingSign, 1);
    this.container.x = this.homeX;
    this.container.y = this.homeY;

    this.idleTickerFn = (ticker) => {
      this.idleTime += ticker.deltaTime;

      // 浮动
      const floatY = Math.sin(this.idleTime * 0.04) * 4;
      this.container.y = this.homeY + floatY;
      this.container.x = this.homeX;

      // ★ 呼吸动画尊重朝向
      const breathScale = 1 + Math.sin(this.idleTime * 0.08) * 0.03;
      this.container.scale.set(
        this.facingSign * breathScale,
        1 / breathScale
      );

      // 偶尔歪头
      if (this.idleTime % 200 < 2) {
        this.body.rotation = (Math.random() - 0.5) * 0.1;
      }
    };
    this.idleTicker.add(this.idleTickerFn);
    this.idleTicker.start();
  }

  // ── 触发序列（画圈→薯条→飞过去→啄食） ──────────────────────────────────
  //
  // 职责边界：只负责动画表演。
  //   - 薯条出现 → 飞行 → 啄食 → 薯条消失
  //   - 动画结束时 container 停留在表演终点（飞行落点）
  //
  // 不负责：
  //   - 设置 homeX/homeY（调用方通过 getPosition() + setHomePosition() 统一处理）
  //   - playIdle()（调用方决定何时恢复待机）
  //   - 面板弹出、位置同步等通用流程
  //
  // 这样未来新宠物只需实现自己的动画表演，通用的落点同步逻辑不会重复。

  async onTrigger(ctx: TriggerContext): Promise<void> {
    this.state = "triggered";
    this.idleTicker.stop();
    this.container.rotation = 0;
    this.container.scale.set(this.facingSign, 1);

    // 生成薯条
    this.friesContainer = this.createFriesGraphic(ctx.x, ctx.y);
    this.stage.addChild(this.friesContainer);

    // 根据目标方向设置朝向
    const targetAngle = facingAngleFromTarget(
      this.container.x, this.container.y,
      ctx.x, ctx.y
    );
    this.setFacing(targetAngle);

    // 飞向薯条（喙对准薯条中心）
    const beakOffsetX = this.facingSign * 52;
    await this.flyTo(ctx.x - beakOffsetX, ctx.y + 10, 800);

    // 啄食
    this.state = "eating";
    await this.eatAnimation();

    // 移除薯条
    if (this.friesContainer) {
      this.stage.removeChild(this.friesContainer);
      this.friesContainer.destroy();
      this.friesContainer = null;
    }

    // 清理动画残留状态，container 保持在啄食结束位置（= 飞行终点）
    this.container.rotation = 0;
    this.applyFacing();
    this.state = "idle";
  }

  // ── 薯条图形 ──────────────────────────────────────────────────────────

  private createFriesGraphic(x: number, y: number): Container {
    const c = new Container();
    c.x = x; c.y = y;
    const g = new Graphics();
    g.rect(-15, -5, 30, 20).fill({ color: 0xff3b30 });
    for (let i = -10; i <= 10; i += 5) {
      g.rect(i - 1.5, -25, 3, 22).fill({ color: 0xffd60a });
    }
    c.addChild(g);
    const label = new Text({ text: "🍟", style: new TextStyle({ fontSize: 20 }) });
    label.anchor.set(0.5);
    label.y = -8;
    c.addChild(label);
    return c;
  }

  // ── 飞行动画 ──────────────────────────────────────────────────────────

  private flyTo(targetX: number, targetY: number, durationMs: number): Promise<void> {
    return new Promise((resolve) => {
      const startX = this.container.x;
      const startY = this.container.y;
      let elapsed = 0;
      const sign = this.facingSign;

      const ticker = new Ticker();
      ticker.add((t) => {
        elapsed += t.deltaMS;
        const progress = Math.min(elapsed / durationMs, 1);
        // easeInOut
        const eased = progress < 0.5
          ? 2 * progress * progress
          : 1 - Math.pow(-2 * progress + 2, 2) / 2;

        this.container.x = startX + (targetX - startX) * eased;
        this.container.y = startY + (targetY - startY) * eased;

        // 飞行翅膀扑动（旋转），保持朝向
        this.container.rotation = Math.sin(elapsed * 0.025) * 0.15;

        if (progress >= 1) {
          this.container.x = targetX;
          this.container.y = targetY;
          this.container.rotation = 0;
          this.container.scale.set(sign, 1); // 落地时清理 scale
          ticker.destroy();
          resolve();
        }
      });
      ticker.start();
    });
  }

  // ── 啄食动画 ──────────────────────────────────────────────────────────

  private eatAnimation(): Promise<void> {
    return new Promise((resolve) => {
      const baseX = this.container.x;
      const baseY = this.container.y;
      const sign = this.facingSign;
      let elapsed = 0;
      const duration = 1000;

      const ticker = new Ticker();
      ticker.add((t) => {
        elapsed += t.deltaMS;
        const peckPhase = (elapsed / 180) * Math.PI;
        const peckAmplitude = 10 * (1 - (elapsed / duration) * 0.5);
        const pullBack = Math.abs(Math.sin(peckPhase)) * peckAmplitude;

        // ★ 啄食方向跟随朝向：朝右时向左拉回，朝左时向右拉回
        this.container.x = baseX - sign * pullBack;
        this.container.rotation = Math.sin(peckPhase) * 0.1;

        if (elapsed >= duration) {
          this.container.x = baseX;
          this.container.y = baseY;
          this.container.rotation = 0;
          ticker.destroy();
          resolve();
        }
      });
      ticker.start();
    });
  }

  // ── 其他 ──────────────────────────────────────────────────────────────

  onFriendArrived(_friend: PetInstance) {}

  destroy() {
    this.idleTicker.stop();
    this.idleTicker.destroy();
    this.friesContainer?.destroy();
    this.container.destroy({ children: true });
  }
}
