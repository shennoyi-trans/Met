import {
  Container,
  Graphics,
  Text,
  TextStyle,
  Ticker,
} from "pixi.js";
import type { PetInstance, TriggerContext, PetState } from "@/types";

/**
 * SeagullPet
 *
 * Phase 1 使用程序绘制的占位图形（因为正式美术资源还没有）
 * 所有动画都用 Ticker + 插值实现，后续替换成骨骼/帧动画资源
 * 只需改 load() 里的资源加载部分，动画状态机逻辑不变
 */
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

  // 待机动画状态
  private idleTicker: Ticker;
  private idleTime = 0;
  private idleTickerFn: ((ticker: Ticker) => void) | null = null;

  // Home 位置（基准位置，待机动画围绕此位置漂浮）
  private homeX = 100;
  private homeY = 100;

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

  // ── 位置管理 ──────────────────────────────────────────────────────────────

  getPosition() {
    return { x: this.container.x, y: this.container.y };
  }

  setPosition(x: number, y: number) {
    this.container.x = x;
    this.container.y = y;
  }

  setHomePosition(x: number, y: number) {
    this.homeX = x;
    this.homeY = y;
  }

  /** 程序绘制的海鸥占位图（等美术资源好了替换这里） */
  private createSeagullGraphic(): Graphics {
    const g = new Graphics();

    // 身体
    g.ellipse(0, 0, 28, 18).fill({ color: 0xffffff });
    // 翅膀（左）
    g.moveTo(-28, -5).quadraticCurveTo(-50, -25, -20, -15).fill({ color: 0xe8e8e8 });
    // 翅膀（右）
    g.moveTo(28, -5).quadraticCurveTo(50, -25, 20, -15).fill({ color: 0xe8e8e8 });
    // 头
    g.circle(30, -12, 14).fill({ color: 0xffffff });
    // 嘴
    g.moveTo(40, -12).lineTo(52, -10).lineTo(40, -8).fill({ color: 0xf5a623 });
    // 眼睛
    g.circle(34, -15, 3).fill({ color: 0x222222 });
    g.circle(35, -16, 1).fill({ color: 0xffffff });

    return g;
  }

  // ── 待机动画 ──────────────────────────────────────────────────────────────

  playIdle() {
    this.state = "idle";
    this.idleTicker.stop();

    // 移除上一次注册的监听，防止多次调用后监听叠加导致动画加速
    if (this.idleTickerFn) {
      this.idleTicker.remove(this.idleTickerFn);
      this.idleTickerFn = null;
    }

    this.idleTime = 0;

    // 重置旋转和缩放
    this.container.rotation = 0;
    this.container.scale.set(1, 1);

    // 将容器精确放回 home 位置
    this.container.x = this.homeX;
    this.container.y = this.homeY;

    // 直接引用 this.homeX/Y，使 setHomePosition() 更新后立即生效，
    // 避免扩屏时海鸥被旧闭包值拉回左上角
    this.idleTickerFn = (ticker) => {
      this.idleTime += ticker.deltaTime;

      // 上下漂浮（基于当前 homeY，不累积）
      const floatY = Math.sin(this.idleTime * 0.04) * 4;
      this.container.y = this.homeY + floatY;
      this.container.x = this.homeX;

      // 呼吸般的缩放
      const breathScale = 1 + Math.sin(this.idleTime * 0.08) * 0.03;
      this.container.scale.set(breathScale, 1 / breathScale);

      // 偶尔微微转头
      if (this.idleTime % 200 < 2) {
        this.body.rotation = (Math.random() - 0.5) * 0.1;
      }
    };

    this.idleTicker.add(this.idleTickerFn);
    this.idleTicker.start();
  }

  // ── 触发序列：薯条 → 扑食 → 停留 ──────────────────────────────────────────

  async onTrigger(ctx: TriggerContext): Promise<void> {
    this.state = "triggered";
    this.idleTicker.stop();

    // 重置变换
    this.container.rotation = 0;
    this.container.scale.set(1, 1);

    // 1. 生成薯条
    this.friesContainer = this.createFriesGraphic(ctx.x, ctx.y);
    this.stage.addChild(this.friesContainer);

    // 2. 计算朝向和飞行目标，使嘴巴尖（偏移约 (52, -10)）对准薯条中心
    const facingRight = ctx.x >= this.container.x;
    const beakOffsetX = facingRight ? 52 : -52;
    const flyTargetX = ctx.x - beakOffsetX;  // 让嘴巴尖落在 ctx.x
    const flyTargetY = ctx.y + 10;            // 让嘴巴尖落在 ctx.y

    // 3. 海鸥飞过去（嘴巴尖对准薯条）
    await this.flyTo(flyTargetX, flyTargetY, 800, facingRight);

    // 4. 扑食动画
    this.state = "eating";
    await this.eatAnimation(facingRight);

    // 5. 移除薯条
    if (this.friesContainer) {
      this.stage.removeChild(this.friesContainer);
      this.friesContainer.destroy();
      this.friesContainer = null;
    }

    // 6. 海鸥停留在圈圈中心，更新 home 位置
    this.homeX = ctx.x;
    this.homeY = ctx.y;
    this.container.x = ctx.x;
    this.container.y = ctx.y;
    this.container.rotation = 0;
    this.container.scale.set(facingRight ? 1 : -1, 1);

    // 注意：不在这里调用 playIdle()，由 App.vue 在缩回窗口后调用
    this.state = "idle";
  }

  /** 薯条占位图形 */
  private createFriesGraphic(x: number, y: number): Container {
    const c = new Container();
    c.x = x;
    c.y = y;

    const g = new Graphics();
    // 薯条盒子
    g.rect(-15, -5, 30, 20).fill({ color: 0xff3b30 });
    // 薯条条
    for (let i = -10; i <= 10; i += 5) {
      g.rect(i - 1.5, -25, 3, 22).fill({ color: 0xffd60a });
    }
    c.addChild(g);

    // emoji 标签
    const label = new Text({
      text: "🍟",
      style: new TextStyle({ fontSize: 20 }),
    });
    label.anchor.set(0.5);
    label.y = -8;
    c.addChild(label);

    return c;
  }

  /** easeInOut 飞行动画 + 翅膀扑动 */
  private flyTo(targetX: number, targetY: number, durationMs: number, facingRight: boolean = true): Promise<void> {
    return new Promise((resolve) => {
      const startX = this.container.x;
      const startY = this.container.y;
      let elapsed = 0;

      // 根据传入的朝向翻转海鸥
      this.container.scale.x = facingRight ? 1 : -1;

      const ticker = new Ticker();
      ticker.add((t) => {
        elapsed += t.deltaMS;
        const progress = Math.min(elapsed / durationMs, 1);

        // easeInOutQuad
        const eased = progress < 0.5
          ? 2 * progress * progress
          : 1 - Math.pow(-2 * progress + 2, 2) / 2;

        this.container.x = startX + (targetX - startX) * eased;
        this.container.y = startY + (targetY - startY) * eased;

        // 飞行时翅膀快速扑动（旋转效果）
        const flap = Math.sin(elapsed * 0.025) * 0.15;
        this.container.rotation = flap;

        if (progress >= 1) {
          // 到达目标位置，精确定位
          this.container.x = targetX;
          this.container.y = targetY;
          this.container.rotation = 0;
          this.container.scale.set(1, 1);
          ticker.destroy();
          resolve();
        }
      });
      ticker.start();
    });
  }

  /** 啄食动画：嘴巴尖停在薯条处，身体前后振荡（约 1 秒） */
  private eatAnimation(facingRight: boolean): Promise<void> {
    return new Promise((resolve) => {
      const baseX = this.container.x;
      const baseY = this.container.y;
      let elapsed = 0;
      const duration = 1000;

      const ticker = new Ticker();
      ticker.add((t) => {
        elapsed += t.deltaMS;

        // 向后拉再向前冲：嘴巴尖回到薯条时振幅为 0，拉开时为 peckAmplitude
        const peckPhase = (elapsed / 180) * Math.PI;
        const peckAmplitude = 10 * (1 - (elapsed / duration) * 0.5);
        // 向后拉（远离薯条方向），使嘴巴尖在 0 振幅时刚好碰到薯条
        const pullBack = Math.abs(Math.sin(peckPhase)) * peckAmplitude;
        this.container.x = baseX + (facingRight ? -pullBack : pullBack);
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

  onFriendArrived(_friend: PetInstance) {
    // Phase 2+ 实现双宠互动
    console.log("[SeagullPet] friend arrived, interaction TBD");
  }

  destroy() {
    this.idleTicker.stop();
    this.idleTicker.destroy();
    this.friesContainer?.destroy();
    this.container.destroy({ children: true });
  }
}
