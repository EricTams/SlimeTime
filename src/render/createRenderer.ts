import { Application, Container } from 'pixi.js';
import type { RenderSnapshot } from '../sim/types';
import { BackgroundGooPass } from './passes/backgroundGooPass';
import { EffectsPass } from './passes/effectsPass';
import { SlimeFieldPass, type SlimeRenderDebugOptions } from './passes/slimeFieldPass';
import { VectorFieldPass } from './passes/vectorFieldPass';
import { WallPass } from './passes/wallPass';

export interface SlimeRendererDebugOptions extends SlimeRenderDebugOptions {
  mazeSolvingField: boolean;
  tooCrowdedField: boolean;
}

export interface SlimeRenderer {
  app: Application;
  render(snapshot: RenderSnapshot): void;
  setDebugOptions(options: SlimeRendererDebugOptions): void;
  destroy(): void;
}

export async function createRenderer(host: HTMLElement): Promise<SlimeRenderer> {
  const app = new Application();
  await app.init({
    resizeTo: host,
    backgroundColor: 0x101612,
    antialias: true,
  });

  app.canvas.setAttribute('data-testid', 'game-canvas');
  host.appendChild(app.canvas);

  const stage = new Container();
  const backgroundGooPass = new BackgroundGooPass();
  const vectorFieldPass = new VectorFieldPass();
  const slimeFieldPass = new SlimeFieldPass();
  const wallPass = new WallPass();
  const effectsPass = new EffectsPass();

  stage.addChild(
    backgroundGooPass.container,
    slimeFieldPass.container,
    vectorFieldPass.container,
    wallPass.container,
    effectsPass.container,
  );
  app.stage.addChild(stage);

  return {
    app,
    render(snapshot: RenderSnapshot) {
      backgroundGooPass.render(snapshot);
      slimeFieldPass.render(snapshot);
      vectorFieldPass.render(snapshot);
      wallPass.render(snapshot);
      effectsPass.render(snapshot);
      fitStage(stage, snapshot, app.screen.width, app.screen.height);
    },
    setDebugOptions(options: SlimeRendererDebugOptions) {
      vectorFieldPass.setVisible({
        mazeSolvingField: options.mazeSolvingField,
        tooCrowdedField: options.tooCrowdedField,
      });
      slimeFieldPass.setDebugOptions(options);
    },
    destroy() {
      app.destroy(true);
    },
  };
}

function fitStage(stage: Container, snapshot: RenderSnapshot, screenWidth: number, screenHeight: number): void {
  const worldWidth = snapshot.mazeWidth * snapshot.tileSize;
  const worldHeight = snapshot.mazeHeight * snapshot.tileSize;
  const scale = Math.min(screenWidth / worldWidth, screenHeight / worldHeight);
  stage.scale.set(scale);
  stage.position.set((screenWidth - worldWidth * scale) / 2, (screenHeight - worldHeight * scale) / 2);
}
