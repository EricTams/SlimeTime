import { Container, Graphics } from 'pixi.js';
import type { RenderSnapshot } from '../../sim/types';

export class BackgroundGooPass {
  readonly container = new Container();
  private readonly background = new Graphics();
  private readonly goo = new Graphics();

  constructor() {
    this.container.addChild(this.background, this.goo);
  }

  render(snapshot: RenderSnapshot): void {
    this.background
      .clear()
      .rect(0, 0, snapshot.mazeWidth * snapshot.tileSize, snapshot.mazeHeight * snapshot.tileSize)
      .fill(0x172018);

    for (const splat of snapshot.gooSplats) {
      this.goo
        .circle(splat.position.x, splat.position.y, splat.radius)
        .fill({ color: splat.color, alpha: 0.18 });
    }
  }
}
