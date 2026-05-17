import { BlurFilter, Container, Graphics, Rectangle } from 'pixi.js';
import type { RenderSnapshot, Vector2 } from '../../sim/types';
import {
  DEFAULT_SLIME_SHADER_TUNING,
  SlimeThresholdFilter,
  type SlimeShaderDebugOptions,
} from '../filters/slimeThresholdFilter';

const SOURCE_FIELD_RADIUS_SCALE = 1.28;
const SOURCE_CORE_RADIUS_SCALE = 1.12;
const SOURCE_FIELD_ALPHA = 0.62;
const SOURCE_CORE_ALPHA = 1;
const DEFAULT_EYE_DELTA_SECONDS = 1 / 60;
const MAX_EYE_DELTA_SECONDS = 1 / 15;

export interface SlimeEyeTuningOptions {
  eyeTrackingSpeed: number;
  eyeTrackingAmount: number;
  horizontalEyeGap: number;
}

export const DEFAULT_SLIME_EYE_TUNING: SlimeEyeTuningOptions = {
  eyeTrackingSpeed: 2,
  eyeTrackingAmount: 9.65,
  horizontalEyeGap: 0.42,
};

export interface SlimeRenderDebugOptions extends SlimeShaderDebugOptions, SlimeEyeTuningOptions {
  thresholdShader: boolean;
  highlights: boolean;
  eyes: boolean;
}

export class SlimeFieldPass {
  readonly container = new Container();
  private readonly fieldLayer = new Container();
  private readonly highlightLayer = new Container();
  private readonly embeddedEyeLayer = new Container();
  private readonly influence = new Graphics();
  private readonly highlights = new Graphics();
  private readonly eyeInk = new Graphics();
  private readonly details = new Graphics();
  private readonly eyeLookDirections = new Map<number, Vector2>();
  private eyeTuning = { ...DEFAULT_SLIME_EYE_TUNING };
  private lastEyeRenderTime: number | undefined;
  private readonly blurFilter = new BlurFilter({
    strength: DEFAULT_SLIME_SHADER_TUNING.sourceBlurStrength,
    quality: 3,
    kernelSize: 7,
  });
  private readonly thresholdFilter = new SlimeThresholdFilter();

  constructor() {
    this.fieldLayer.addChild(this.influence);
    this.fieldLayer.filters = [this.blurFilter, this.thresholdFilter];
    this.highlightLayer.addChild(this.highlights);
    this.highlightLayer.filters = [new BlurFilter({ strength: 1.2, quality: 2, kernelSize: 5 })];
    this.embeddedEyeLayer.addChild(this.eyeInk);
    this.embeddedEyeLayer.filters = [new BlurFilter({ strength: 0.35, quality: 1, kernelSize: 5 })];
    this.embeddedEyeLayer.visible = false;
    this.container.addChild(this.fieldLayer, this.highlightLayer, this.embeddedEyeLayer, this.details);
  }

  setDebugOptions(options: SlimeRenderDebugOptions): void {
    this.blurFilter.strength = options.sourceBlurStrength;
    this.thresholdFilter.setDebugOptions(options);
    this.fieldLayer.filters = options.thresholdShader
      ? [this.blurFilter, this.thresholdFilter]
      : [this.blurFilter];
    this.highlightLayer.visible = options.highlights;
    this.embeddedEyeLayer.visible = options.eyes;
    this.eyeTuning = {
      eyeTrackingSpeed: options.eyeTrackingSpeed,
      eyeTrackingAmount: options.eyeTrackingAmount,
      horizontalEyeGap: options.horizontalEyeGap,
    };
  }

  render(snapshot: RenderSnapshot): void {
    this.influence.clear();
    this.highlights.clear();
    this.eyeInk.clear();
    this.details.clear();
    const filterArea = new Rectangle(
      0,
      0,
      snapshot.mazeWidth * snapshot.tileSize,
      snapshot.mazeHeight * snapshot.tileSize,
    );
    this.fieldLayer.filterArea = filterArea;
    this.highlightLayer.filterArea = filterArea;
    this.embeddedEyeLayer.filterArea = filterArea;
    const eyeDeltaSeconds = this.updateEyeDelta(snapshot.time);
    const liveUnitIds = new Set<number>();

    for (const unit of snapshot.units) {
      liveUnitIds.add(unit.id);
      const radius = unit.radius * SOURCE_FIELD_RADIUS_SCALE;

      const coreRadius = unit.radius * SOURCE_CORE_RADIUS_SCALE;
      const highlightX = unit.x - unit.radius * 0.34;
      const highlightY = unit.y - unit.radius * 0.42;

      this.influence.circle(unit.x, unit.y, radius).fill({ color: unit.color, alpha: SOURCE_FIELD_ALPHA });

      this.influence.circle(unit.x, unit.y, coreRadius).fill({ color: unit.color, alpha: SOURCE_CORE_ALPHA });

      this.highlights
        .ellipse(highlightX, highlightY, unit.radius * 0.28, unit.radius * 0.16)
        .fill({ color: 0xf7ffd1, alpha: 0.48 })
        .circle(highlightX - unit.radius * 0.18, highlightY - unit.radius * 0.1, unit.radius * 0.09)
        .fill({ color: 0xffffff, alpha: 0.42 });

      if (this.embeddedEyeLayer.visible) {
        const eyeY = unit.y - unit.radius * 0.18;
        const eyeRadius = Math.max(1.8, unit.radius * 0.14);
        const highlightRadius = Math.max(0.65, unit.radius * 0.045);
        const lookDirection = this.easeEyeDirection(unit.id, unit.pathDirection, eyeDeltaSeconds);
        const horizontalLook = Math.abs(lookDirection.x);
        const baseEyeOffset = Math.max(3, unit.radius * 0.28);
        const horizontalGap = clamp(this.eyeTuning.horizontalEyeGap, 0, 1);
        const eyeOffset = Math.max(
          eyeRadius * 1.15,
          baseEyeOffset * (1 - horizontalLook * (1 - horizontalGap)),
        );
        const eyeShiftReach = eyeRadius * 0.38 * this.eyeTuning.eyeTrackingAmount;
        const eyeShiftX = lookDirection.x * eyeShiftReach;
        const eyeShiftY = lookDirection.y * eyeShiftReach;
        const highlightReach = eyeRadius * 0.38;
        const highlightX = lookDirection.x * highlightReach;
        const highlightY = lookDirection.y * highlightReach - eyeRadius * 0.18;
        const leftEyeX = unit.x - eyeOffset + eyeShiftX;
        const rightEyeX = unit.x + eyeOffset + eyeShiftX;
        const eyeCenterY = eyeY + eyeShiftY;

        this.eyeInk
          .circle(leftEyeX, eyeCenterY, eyeRadius)
          .fill({ color: 0x030403, alpha: 0.86 })
          .circle(rightEyeX, eyeCenterY, eyeRadius)
          .fill({ color: 0x030403, alpha: 0.86 })
          .circle(leftEyeX + highlightX, eyeCenterY + highlightY, highlightRadius)
          .fill({ color: 0xffffff, alpha: 0.82 })
          .circle(rightEyeX + highlightX, eyeCenterY + highlightY, highlightRadius)
          .fill({ color: 0xffffff, alpha: 0.82 });
      }

      if (unit.hitFlash > 0) {
        this.details.circle(unit.x, unit.y, unit.radius * 1.15).fill({
          color: 0xffffff,
          alpha: unit.hitFlash * 0.35,
        });
      }
    }

    for (const id of this.eyeLookDirections.keys()) {
      if (!liveUnitIds.has(id)) {
        this.eyeLookDirections.delete(id);
      }
    }
  }

  private updateEyeDelta(snapshotTime: number): number {
    if (this.lastEyeRenderTime === undefined || snapshotTime < this.lastEyeRenderTime) {
      this.lastEyeRenderTime = snapshotTime;
      return DEFAULT_EYE_DELTA_SECONDS;
    }

    const delta = Math.min(snapshotTime - this.lastEyeRenderTime, MAX_EYE_DELTA_SECONDS);
    this.lastEyeRenderTime = snapshotTime;
    return delta;
  }

  private easeEyeDirection(unitId: number, targetDirection: Vector2, deltaSeconds: number): Vector2 {
    const currentDirection = this.eyeLookDirections.get(unitId) ?? { x: 0, y: 0 };
    const ease = 1 - Math.exp(-this.eyeTuning.eyeTrackingSpeed * deltaSeconds);
    const nextDirection = clampVector({
      x: currentDirection.x + (targetDirection.x - currentDirection.x) * ease,
      y: currentDirection.y + (targetDirection.y - currentDirection.y) * ease,
    });

    this.eyeLookDirections.set(unitId, nextDirection);
    return nextDirection;
  }
}

function clampVector(vector: Vector2): Vector2 {
  const length = Math.hypot(vector.x, vector.y);
  if (length <= 1) {
    return vector;
  }

  return {
    x: vector.x / length,
    y: vector.y / length,
  };
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(Math.max(value, min), max);
}
