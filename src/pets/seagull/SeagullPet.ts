import {
  Container,
  Graphics,
  Text,
  TextStyle,
  Ticker,
} from "pixi.js";
import type { PetInstance, TriggerContext, PetState } from "@/types";

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

  getPosition() { return { x: this.container.x, y: this.container.y }; }
  setPosition(x: number, y: number) { this.container.x = x; this.container.y = y; }
  setHomePosition(x: number, y: number) { this.homeX = x; this.homeY = y; }

  setVisible(visible: boolean) { this.container.visible = visible; }

  stopAnimation() {
    this.idleTicker.stop();
    this.container.rotation = 0;
    this.container.scale.set(1, 1);
  }

  private createSeagullGraphic(): Graphics {
    const g = new Graphics();
    g.ellipse(0, 0, 28, 18).fill({ color: 0xffffff });
    g.moveTo(-28, -5).quadraticCurveTo(-50, -25, -20, -15).fill({ color: 0xe8e8e8 });
    g.moveTo(28, -5).quadraticCurveTo(50, -25, 20, -15).fill({ color: 0xe8e8e8 });
    g.circle(30, -12, 14).fill({ color: 0xffffff });
    g.moveTo(40, -12).lineTo(52, -10).lineTo(40, -8).fill({ color: 0xf5a623 });
    g.circle(34, -15, 3).fill({ color: 0x222222 });
    g.circle(35, -16, 1).fill({ color: 0xffffff });
    return g;
  }

  playIdle() {
    this.state = "idle";
    this.idleTicker.stop();
    if (this.idleTickerFn) {
      this.idleTicker.remove(this.idleTickerFn);
      this.idleTickerFn = null;
    }
    this.idleTime = 0;
    this.container.rotation = 0;
    this.container.scale.set(1, 1);
    this.container.x = this.homeX;
    this.container.y = this.homeY;

    this.idleTickerFn = (ticker) => {
      this.idleTime += ticker.deltaTime;
      const floatY = Math.sin(this.idleTime * 0.04) * 4;
      this.container.y = this.homeY + floatY;
      this.container.x = this.homeX;
      const breathScale = 1 + Math.sin(this.idleTime * 0.08) * 0.03;
      this.container.scale.set(breathScale, 1 / breathScale);
      if (this.idleTime % 200 < 2) {
        this.body.rotation = (Math.random() - 0.5) * 0.1;
      }
    };
    this.idleTicker.add(this.idleTickerFn);
    this.idleTicker.start();
  }

  async onTrigger(ctx: TriggerContext): Promise<void> {
    this.state = "triggered";
    this.idleTicker.stop();
    this.container.rotation = 0;
    this.container.scale.set(1, 1);

    this.friesContainer = this.createFriesGraphic(ctx.x, ctx.y);
    this.stage.addChild(this.friesContainer);

    const facingRight = ctx.x >= this.container.x;
    const beakOffsetX = facingRight ? 52 : -52;
    await this.flyTo(ctx.x - beakOffsetX, ctx.y + 10, 800, facingRight);

    this.state = "eating";
    await this.eatAnimation(facingRight);

    if (this.friesContainer) {
      this.stage.removeChild(this.friesContainer);
      this.friesContainer.destroy();
      this.friesContainer = null;
    }

    this.homeX = ctx.x;
    this.homeY = ctx.y;
    this.container.x = ctx.x;
    this.container.y = ctx.y;
    this.container.rotation = 0;
    this.container.scale.set(facingRight ? 1 : -1, 1);
    this.state = "idle";
  }

  private createFriesGraphic(x: number, y: number): Container {
    const c = new Container();
    c.x = x; c.y = y;
    const g = new Graphics();
    g.rect(-15, -5, 30, 20).fill({ color: 0xff3b30 });
    for (let i = -10; i <= 10; i += 5) g.rect(i - 1.5, -25, 3, 22).fill({ color: 0xffd60a });
    c.addChild(g);
    const label = new Text({ text: "🍟", style: new TextStyle({ fontSize: 20 }) });
    label.anchor.set(0.5); label.y = -8;
    c.addChild(label);
    return c;
  }

  private flyTo(targetX: number, targetY: number, durationMs: number, facingRight = true): Promise<void> {
    return new Promise((resolve) => {
      const startX = this.container.x;
      const startY = this.container.y;
      let elapsed = 0;
      this.container.scale.x = facingRight ? 1 : -1;
      const ticker = new Ticker();
      ticker.add((t) => {
        elapsed += t.deltaMS;
        const progress = Math.min(elapsed / durationMs, 1);
        const eased = progress < 0.5 ? 2 * progress * progress : 1 - Math.pow(-2 * progress + 2, 2) / 2;
        this.container.x = startX + (targetX - startX) * eased;
        this.container.y = startY + (targetY - startY) * eased;
        this.container.rotation = Math.sin(elapsed * 0.025) * 0.15;
        if (progress >= 1) {
          this.container.x = targetX; this.container.y = targetY;
          this.container.rotation = 0; this.container.scale.set(1, 1);
          ticker.destroy(); resolve();
        }
      });
      ticker.start();
    });
  }

  private eatAnimation(facingRight: boolean): Promise<void> {
    return new Promise((resolve) => {
      const baseX = this.container.x;
      const baseY = this.container.y;
      let elapsed = 0;
      const duration = 1000;
      const ticker = new Ticker();
      ticker.add((t) => {
        elapsed += t.deltaMS;
        const peckPhase = (elapsed / 180) * Math.PI;
        const peckAmplitude = 10 * (1 - (elapsed / duration) * 0.5);
        const pullBack = Math.abs(Math.sin(peckPhase)) * peckAmplitude;
        this.container.x = baseX + (facingRight ? -pullBack : pullBack);
        this.container.rotation = Math.sin(peckPhase) * 0.1;
        if (elapsed >= duration) {
          this.container.x = baseX; this.container.y = baseY;
          this.container.rotation = 0; ticker.destroy(); resolve();
        }
      });
      ticker.start();
    });
  }

  onFriendArrived(_friend: PetInstance) {}

  destroy() {
    this.idleTicker.stop();
    this.idleTicker.destroy();
    this.friesContainer?.destroy();
    this.container.destroy({ children: true });
  }
}
