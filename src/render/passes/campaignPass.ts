import { Container, Graphics, Text } from 'pixi.js';
import type { RenderProjectile, RenderShotEffect, RenderSnapshot } from '../../sim/types';

export class CampaignPass {
  readonly container = new Container();
  private readonly structureGraphics = new Graphics();
  private readonly hoverGraphics = new Graphics();
  private readonly effectsGraphics = new Graphics();
  private readonly shotGraphics = new Graphics();
  private readonly labels = new Map<string, Text>();
  private readonly labelLayer = new Container();

  constructor() {
    this.container.addChild(
      this.structureGraphics,
      this.hoverGraphics,
      this.shotGraphics,
      this.effectsGraphics,
      this.labelLayer,
    );
  }

  render(snapshot: RenderSnapshot): void {
    this.structureGraphics.clear();
    this.hoverGraphics.clear();
    this.effectsGraphics.clear();
    this.shotGraphics.clear();
    const livingLabelKeys = new Set<string>();

    for (const structure of snapshot.structures ?? []) {
      const tile = snapshot.tileSize;
      const x = structure.cell.x * tile;
      const y = structure.cell.y * tile;
      const inset = tile * 0.12;
      const alpha = structure.alive ? 0.95 : 0.4;

      this.structureGraphics
        .rect(x + inset, y + inset, tile - inset * 2, tile - inset * 2)
        .fill({ color: structure.color, alpha: alpha * 0.85 })
        .stroke({ color: 0x101612, width: 2, alpha });

      if (structure.kind === 'barricade' && structure.pressureCapacity && structure.pressureCapacity > 0) {
        const ratio = Math.max(0, Math.min(1, (structure.pressureRemaining ?? 0) / structure.pressureCapacity));
        const barInset = tile * 0.18;
        this.structureGraphics
          .rect(x + barInset, y + tile - inset - 4, (tile - barInset * 2) * ratio, 3)
          .fill({ color: 0xeaff70, alpha });
      }
      if (structure.attached) {
        this.structureGraphics
          .circle(x + tile / 2, y + tile / 2, tile * 0.18)
          .fill({ color: 0xff5e5e, alpha: 0.85 });
      }

      const label = this.acquireLabel(structure.instanceId, structure.icon, structure.color);
      label.x = x + tile / 2 - label.width / 2;
      label.y = y + tile / 2 - label.height / 2;
      label.alpha = alpha;
      livingLabelKeys.add(structure.instanceId);
    }

    for (const [key, text] of [...this.labels]) {
      if (!livingLabelKeys.has(key)) {
        text.destroy();
        this.labels.delete(key);
      }
    }

    if (snapshot.hover) {
      const tile = snapshot.tileSize;
      const x = snapshot.hover.cell.x * tile;
      const y = snapshot.hover.cell.y * tile;
      this.hoverGraphics
        .rect(x + 2, y + 2, tile - 4, tile - 4)
        .fill({ color: snapshot.hover.valid ? 0x6ff58a : 0xff7c7c, alpha: 0.18 })
        .stroke({ color: snapshot.hover.valid ? 0x9aff8e : 0xff7c7c, width: 2, alpha: 0.85 });
    }

    for (const shot of snapshot.shotEffects ?? []) {
      this.drawShot(shot, snapshot.time);
    }

    for (const projectile of snapshot.projectiles ?? []) {
      this.drawProjectile(projectile);
    }

    for (const effect of snapshot.abilityEffects ?? []) {
      if (effect.kind === 'swarm') {
        this.effectsGraphics
          .circle(effect.position.x, effect.position.y, effect.radius)
          .fill({ color: 0xffd166, alpha: 0.18 })
          .stroke({ color: 0xffd166, width: 2, alpha: 0.7 });
      } else {
        const remaining = Math.max(0, (effect.triggerAt ?? 0) - snapshot.time);
        const ratio = Math.max(0, Math.min(1, remaining / 0.6));
        this.effectsGraphics
          .circle(effect.position.x, effect.position.y, effect.radius * (1.05 + 0.2 * ratio))
          .stroke({ color: 0xff5e5e, width: 2, alpha: 0.85 - ratio * 0.5 })
          .circle(effect.position.x, effect.position.y, effect.radius * ratio * 0.4 + 4)
          .fill({ color: 0xff8a3d, alpha: 0.6 - ratio * 0.4 });
      }
    }
  }

  private drawShot(shot: RenderShotEffect, time: number): void {
    const elapsed = Math.max(0, time - shot.startedAt);
    const progress = shot.duration > 0 ? Math.min(1, elapsed / shot.duration) : 1;
    const fade = 1 - progress;
    if (fade <= 0) {
      return;
    }
    const dx = shot.target.x - shot.origin.x;
    const dy = shot.target.y - shot.origin.y;
    const length = Math.hypot(dx, dy);

    switch (shot.kind) {
      case 'beam': {
        const halfWidth = Math.max(1.2, shot.radius);
        this.shotGraphics
          .moveTo(shot.origin.x, shot.origin.y)
          .lineTo(shot.target.x, shot.target.y)
          .stroke({ color: 0xffffff, width: halfWidth + 2, alpha: 0.6 * fade })
          .moveTo(shot.origin.x, shot.origin.y)
          .lineTo(shot.target.x, shot.target.y)
          .stroke({ color: shot.color, width: halfWidth, alpha: 0.95 * fade })
          .circle(shot.target.x, shot.target.y, halfWidth + 2)
          .fill({ color: shot.color, alpha: 0.5 * fade });
        break;
      }
      case 'snipe': {
        const halfWidth = Math.max(1.6, shot.radius);
        this.shotGraphics
          .moveTo(shot.origin.x, shot.origin.y)
          .lineTo(shot.target.x, shot.target.y)
          .stroke({ color: 0xffffff, width: halfWidth + 3, alpha: 0.55 * fade })
          .moveTo(shot.origin.x, shot.origin.y)
          .lineTo(shot.target.x, shot.target.y)
          .stroke({ color: shot.color, width: halfWidth, alpha: 0.95 * fade })
          .circle(shot.origin.x, shot.origin.y, halfWidth * 1.6)
          .fill({ color: shot.color, alpha: 0.55 * fade });
        break;
      }
      case 'shell': {
        const travel = progress < 0.7 ? Math.min(1, progress / 0.7) : 1;
        const px = shot.origin.x + dx * travel;
        const py = shot.origin.y + dy * travel;
        this.shotGraphics
          .moveTo(shot.origin.x, shot.origin.y)
          .lineTo(px, py)
          .stroke({ color: shot.color, width: 1.4, alpha: 0.5 * fade });
        if (progress < 0.7) {
          this.shotGraphics
            .circle(px, py, Math.max(2.5, shot.radius * 0.08))
            .fill({ color: shot.color, alpha: 0.95 * fade });
        } else {
          const burstProgress = (progress - 0.7) / 0.3;
          const burstRadius = shot.radius * (0.4 + 0.6 * burstProgress);
          this.shotGraphics
            .circle(shot.target.x, shot.target.y, burstRadius)
            .fill({ color: shot.color, alpha: 0.35 * fade })
            .circle(shot.target.x, shot.target.y, burstRadius)
            .stroke({ color: 0xffffff, width: 2, alpha: 0.9 * fade });
        }
        break;
      }
      case 'aoePop': {
        const ringRadius = shot.radius * (0.4 + 0.6 * progress);
        this.shotGraphics
          .circle(shot.target.x, shot.target.y, ringRadius)
          .stroke({ color: shot.color, width: 2, alpha: fade })
          .circle(shot.target.x, shot.target.y, ringRadius)
          .fill({ color: shot.color, alpha: 0.18 * fade });
        break;
      }
      case 'pulse': {
        const ringRadius = shot.radius * (0.2 + 0.9 * progress);
        this.shotGraphics
          .circle(shot.origin.x, shot.origin.y, ringRadius)
          .stroke({ color: shot.color, width: 3, alpha: fade })
          .circle(shot.origin.x, shot.origin.y, ringRadius * 0.6)
          .stroke({ color: 0xffffff, width: 1.5, alpha: 0.55 * fade });
        break;
      }
      case 'slash': {
        const burstRadius = shot.radius * (0.6 + 0.4 * progress);
        this.shotGraphics
          .circle(shot.origin.x, shot.origin.y, burstRadius)
          .stroke({ color: shot.color, width: 2, alpha: 0.9 * fade })
          .circle(shot.origin.x, shot.origin.y, burstRadius * 0.4)
          .fill({ color: 0xffffff, alpha: 0.55 * fade });
        break;
      }
    }
    void length;
  }

  private drawProjectile(projectile: RenderProjectile): void {
    if (projectile.kind !== 'arrow') {
      return;
    }
    const dirX = projectile.direction.x;
    const dirY = projectile.direction.y;
    const dirLen = Math.hypot(dirX, dirY) || 1;
    const ux = dirX / dirLen;
    const uy = dirY / dirLen;
    const perpX = -uy;
    const perpY = ux;
    const headX = projectile.position.x;
    const headY = projectile.position.y;
    const shaftLength = 12;
    const tailX = headX - ux * shaftLength;
    const tailY = headY - uy * shaftLength;
    const headSize = 3;
    const headBackX = headX - ux * headSize;
    const headBackY = headY - uy * headSize;
    const headLeft = {
      x: headBackX + perpX * headSize * 0.55,
      y: headBackY + perpY * headSize * 0.55,
    };
    const headRight = {
      x: headBackX - perpX * headSize * 0.55,
      y: headBackY - perpY * headSize * 0.55,
    };
    this.shotGraphics
      .moveTo(tailX, tailY)
      .lineTo(headBackX, headBackY)
      .stroke({ color: 0x2c1d10, width: 1.4, alpha: 0.9 })
      .moveTo(tailX, tailY)
      .lineTo(headBackX, headBackY)
      .stroke({ color: projectile.color, width: 0.8, alpha: 0.95 });
    const fletchSize = 2.2;
    const fletchTip = {
      x: tailX - ux * fletchSize,
      y: tailY - uy * fletchSize,
    };
    this.shotGraphics
      .moveTo(tailX, tailY)
      .lineTo(tailX + perpX * fletchSize * 0.6, tailY + perpY * fletchSize * 0.6)
      .lineTo(fletchTip.x, fletchTip.y)
      .lineTo(tailX, tailY)
      .fill({ color: 0xf2eccf, alpha: 0.95 })
      .moveTo(tailX, tailY)
      .lineTo(tailX - perpX * fletchSize * 0.6, tailY - perpY * fletchSize * 0.6)
      .lineTo(fletchTip.x, fletchTip.y)
      .lineTo(tailX, tailY)
      .fill({ color: 0xf2eccf, alpha: 0.95 });
    this.shotGraphics
      .moveTo(headX, headY)
      .lineTo(headLeft.x, headLeft.y)
      .lineTo(headRight.x, headRight.y)
      .lineTo(headX, headY)
      .fill({ color: 0xf5fbe2, alpha: 0.95 })
      .stroke({ color: 0x2c1d10, width: 0.6, alpha: 0.9 });
  }

  private acquireLabel(key: string, icon: string, color: number): Text {
    const existing = this.labels.get(key);
    if (existing) {
      existing.text = icon;
      existing.style.fill = color;
      return existing;
    }
    const text = new Text({
      text: icon,
      style: { fontFamily: 'Arial', fontSize: 22, fontWeight: 'bold', fill: color, stroke: { color: 0x101612, width: 3 } },
    });
    this.labels.set(key, text);
    this.labelLayer.addChild(text);
    return text;
  }
}
