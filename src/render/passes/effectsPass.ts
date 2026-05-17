import { Container, Graphics } from 'pixi.js';
import type { RenderSnapshot } from '../../sim/types';

export class EffectsPass {
  readonly container = new Container();
  private readonly graphics = new Graphics();

  constructor() {
    this.container.addChild(this.graphics);
  }

  render(snapshot: RenderSnapshot): void {
    this.graphics.clear();

    const pulse = 0.5 + Math.sin(snapshot.time * 3) * 0.5;
    const exitX = snapshot.exit.x * snapshot.tileSize + snapshot.tileSize / 2;
    const exitY = snapshot.exit.y * snapshot.tileSize + snapshot.tileSize / 2;

    this.graphics
      .circle(exitX, exitY, snapshot.tileSize * (0.32 + pulse * 0.08))
      .fill({ color: 0xf6ff8f, alpha: 0.65 })
      .stroke({ color: 0xfff4b8, width: 3, alpha: 0.9 });
  }
}
