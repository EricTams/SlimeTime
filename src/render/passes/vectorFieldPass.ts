import { Container, Graphics } from 'pixi.js';
import type { RenderSnapshot, VectorFieldSample } from '../../sim/types';

export class VectorFieldPass {
  readonly container = new Container();
  private readonly graphics = new Graphics();
  private mazeSolvingVisible = false;
  private tooCrowdedVisible = false;

  constructor() {
    this.container.addChild(this.graphics);
  }

  setVisible(options: { mazeSolvingField: boolean; tooCrowdedField: boolean }): void {
    this.mazeSolvingVisible = options.mazeSolvingField;
    this.tooCrowdedVisible = options.tooCrowdedField;
  }

  render(snapshot: RenderSnapshot): void {
    this.graphics.clear();

    if (this.mazeSolvingVisible) {
      for (const sample of snapshot.mazeSolvingField) {
        this.renderArrow(sample, snapshot.tileSize, 0x8fe7ff, 0xd8fbff);
      }
    }

    if (this.tooCrowdedVisible) {
      for (const sample of snapshot.tooCrowdedField) {
        this.renderArrow(sample, snapshot.tileSize, 0xff9fd0, 0xffd6eb);
      }
    }
  }

  private renderArrow(sample: VectorFieldSample, tileSize: number, lineColor: number, headColor: number): void {
    if (sample.dx === 0 && sample.dy === 0) {
      this.graphics.circle(sample.x, sample.y, Math.max(2, tileSize * 0.055)).fill({ color: headColor, alpha: 0.65 });
      return;
    }

    const length = tileSize * (0.18 + sample.strength * 0.24);
    const halfLength = length / 2;
    const startX = sample.x - sample.dx * halfLength;
    const startY = sample.y - sample.dy * halfLength;
    const endX = sample.x + sample.dx * halfLength;
    const endY = sample.y + sample.dy * halfLength;
    const normalX = -sample.dy;
    const normalY = sample.dx;
    const headLength = Math.max(4, tileSize * 0.11);
    const headWidth = Math.max(3, tileSize * 0.07);
    const alpha = 0.2 + sample.strength * 0.55;

    this.graphics
      .moveTo(startX, startY)
      .lineTo(endX, endY)
      .stroke({ color: lineColor, width: 1.5, alpha })
      .moveTo(endX, endY)
      .lineTo(endX - sample.dx * headLength + normalX * headWidth, endY - sample.dy * headLength + normalY * headWidth)
      .moveTo(endX, endY)
      .lineTo(endX - sample.dx * headLength - normalX * headWidth, endY - sample.dy * headLength - normalY * headWidth)
      .stroke({ color: headColor, width: 1.25, alpha });
  }
}
