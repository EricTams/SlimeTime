import { Container, Graphics } from 'pixi.js';
import type { RenderSnapshot } from '../../sim/types';

export class WallPass {
  readonly container = new Container();
  private readonly graphics = new Graphics();

  constructor() {
    this.container.addChild(this.graphics);
  }

  render(snapshot: RenderSnapshot): void {
    this.graphics.clear();

    for (let y = 0; y < snapshot.mazeHeight; y += 1) {
      for (let x = 0; x < snapshot.mazeWidth; x += 1) {
        if (snapshot.walls[y * snapshot.mazeWidth + x] !== 1) {
          continue;
        }
        this.graphics
          .rect(x * snapshot.tileSize, y * snapshot.tileSize, snapshot.tileSize, snapshot.tileSize)
          .fill(0x263126)
          .stroke({ color: 0x5c785f, width: 1, alpha: 0.8 });
      }
    }

    this.renderEntranceOverlay(snapshot);
  }

  private renderEntranceOverlay(snapshot: RenderSnapshot): void {
    const x = snapshot.entrance.x * snapshot.tileSize;
    const y = snapshot.entrance.y * snapshot.tileSize;
    const size = snapshot.tileSize;
    const inset = Math.max(3, size * 0.1);
    const lip = Math.max(4, size * 0.16);
    const shadow =
      snapshot.entrance.x === 0
        ? { x: x + size - lip, y: y + inset, width: lip, height: size - inset * 2 }
        : snapshot.entrance.x === snapshot.mazeWidth - 1
          ? { x, y: y + inset, width: lip, height: size - inset * 2 }
          : snapshot.entrance.y === 0
            ? { x: x + inset, y: y + size - lip, width: size - inset * 2, height: lip }
            : { x: x + inset, y, width: size - inset * 2, height: lip };

    this.graphics
      .rect(x, y, size, size)
      .fill(0x1b241d)
      .stroke({ color: 0x7a9877, width: 2, alpha: 0.95 })
      .rect(x + inset, y + inset, size - inset * 2, size - inset * 2)
      .fill(0x263126)
      .rect(shadow.x, shadow.y, shadow.width, shadow.height)
      .fill({ color: 0x0d140f, alpha: 0.78 })
      .stroke({ color: 0xb7d98f, width: 1, alpha: 0.45 });
  }
}
