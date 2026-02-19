import {
  Container,
  Graphics,
  Text,
  TextStyle,
  Ticker,
  type Application,
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

  constructor(stage: Container) {
    this.stage = stage;
    this.container = new Container();
    this.body = this.createSeagullGraphic();
    this.container.addChild(this.body);

    // 初始位置：窗口中央偏下
    this.container.x = 100;
    this.container.y = 130;

    stage.addChild(this.container);

    this.idleTicker = new Ticker();
    this.idleTicker.stop();
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
    this.idleTime = 0;

    this.idleTicker.add((ticker) => {
      this.idleTime += ticker.deltaTime;

      // 上下漂浮
      const float = Math.sin(this.idleTime * 0.04) * 4;
      this.container.y = 130 + float;

      // 轻微翅膀扑动（缩放模拟）
      const flapScale = 1 + Math.sin(this.idleTime * 0.08) * 0.04;
      this.container.scale.set(flapScale, 1 / flapScale);

      // 随机偏头（每隔一段时间）
      if (this.idleTime % 200 < 2) {
        this.body.rotation = (Math.random() - 0.5) * 0.15;
      }
    });

    this.idleTicker.start();
  }

  // ── 触发序列：薯条 → 扑食 → 回归 ───────────────────────────────────────────

  async onTrigger(ctx: TriggerContext): Promise<void> {
    this.state = "triggered";
    this.idleTicker.stop();

    // 1. 生成薯条
    this.friesContainer = this.createFriesGraphic(ctx.x, ctx.y);
    this.stage.addChild(this.friesContainer);

    // 2. 海鸥飞过去抢薯条
    await this.flyTo(ctx.x, ctx.y, 800);

    // 3. 扑食动画
    this.state = "eating";
    await this.eatAnimation();

    // 4. 移除薯条
    if (this.friesContainer) {
      this.stage.removeChild(this.friesContainer);
      this.friesContainer.destroy();
      this.friesContainer = null;
    }

    // 5. 飞回原位
    await this.flyTo(100, 130, 600);

    // 6. 回到待机
    this.playIdle();

    // resolve 后 App.vue 会显示功能面板
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

    // 小标签
    const label = new Text({
      text: "🍟",
      style: new TextStyle({ fontSize: 20 }),
    });
    label.anchor.set(0.5);
    label.y = -8;
    c.addChild(label);

    return c;
  }

  /** 线性插值飞行动画 */
  private flyTo(targetX: number, targetY: number, durationMs: number): Promise<void> {
    return new Promise((resolve) => {
      const startX = this.container.x;
      const startY = this.container.y;
      let elapsed = 0;

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

        // 飞行时翅膀快速扑动
        const flap = Math.sin(elapsed * 0.03) * 0.15;
        this.container.rotation = flap;

        if (progress >= 1) {
          this.container.rotation = 0;
          ticker.destroy();
          resolve();
        }
      });
      ticker.start();
    });
  }

  /** 扑食动画 */
  private eatAnimation(): Promise<void> {
    return new Promise((resolve) => {
      let t = 0;
      const ticker = new Ticker();
      ticker.add((tick) => {
        t += tick.deltaTime;
        // 上下啄食
        this.container.y += Math.sin(t * 0.3) * 2;
        if (t > 60) {
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
    this.idleTicker.destroy();
    this.friesContainer?.destroy();
    this.container.destroy({ children: true });
  }
}
