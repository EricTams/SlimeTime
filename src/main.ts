import './style.css';
import { createDemoMaze, createDemoSlime } from './content/demoMaze';
import { DEFAULT_SLIME_SHADER_TUNING, type SlimeShaderTuningOptions } from './render/filters/slimeThresholdFilter';
import { createRenderer, type SlimeRendererDebugOptions } from './render/createRenderer';
import { DEFAULT_SLIME_EYE_TUNING, type SlimeEyeTuningOptions } from './render/passes/slimeFieldPass';
import { SeededRandom } from './sim/rng';
import { DEFAULT_SIM_CONFIG, type SimConfig } from './sim/types';
import { World } from './sim/world';

interface DebugState extends SlimeRendererDebugOptions {
  paused: boolean;
}

type ShaderSliderKey = keyof SlimeShaderTuningOptions;
type EyeSliderKey = keyof SlimeEyeTuningOptions;
type SimSliderKey = keyof SimConfig;
type SpawnSliderKey = keyof SpawnTuning;
type BooleanDebugKey = Exclude<keyof DebugState, ShaderSliderKey | EyeSliderKey | 'previewMode'>;

interface SpawnTuning {
  totalSlimes: number;
  slimesPerSecond: number;
}

const shaderSliderConfigs: Array<{
  key: ShaderSliderKey;
  label: string;
  min: number;
  max: number;
  step: number;
}> = [
  { key: 'sourceBlurStrength', label: 'Source blur size', min: 0, max: 14, step: 0.25 },
  { key: 'thicknessStart', label: 'Dark gel starts', min: 0.05, max: 0.42, step: 0.005 },
  { key: 'thicknessEnd', label: 'Dark gel full', min: 0.18, max: 0.95, step: 0.005 },
  { key: 'darkBoundaryWidth', label: 'Dark boundary width', min: 0, max: 0.5, step: 0.005 },
  { key: 'darkBoundaryStrength', label: 'Dark boundary strength', min: 0, max: 1, step: 0.01 },
  { key: 'bodyStart', label: 'Translucent rim starts', min: 0.08, max: 0.42, step: 0.005 },
  { key: 'bodyEnd', label: 'Translucent rim ends', min: 0.12, max: 0.55, step: 0.005 },
  { key: 'edgeThreshold', label: 'Edge cutoff', min: 0.04, max: 0.34, step: 0.005 },
  { key: 'edgeFadeWidth', label: 'Edge feather width', min: 0.001, max: 0.08, step: 0.001 },
  { key: 'featherAlpha', label: 'Edge feather alpha', min: 0, max: 0.35, step: 0.005 },
  { key: 'skirtScale', label: 'Skirt strength', min: 0, max: 0.3, step: 0.005 },
];

const eyeSliderConfigs: Array<{
  key: EyeSliderKey;
  label: string;
  min: number;
  max: number;
  step: number;
}> = [
  { key: 'eyeTrackingSpeed', label: 'Eye tracking speed', min: 0.5, max: 24, step: 0.25 },
  { key: 'eyeTrackingAmount', label: 'Eye tracking amount', min: 0, max: 25, step: 0.05 },
  { key: 'horizontalEyeGap', label: 'Horizontal eye gap', min: 0.35, max: 1, step: 0.01 },
];

const simSliderConfigs: Array<{
  key: SimSliderKey;
  label: string;
  min: number;
  max: number;
  step: number;
}> = [
  { key: 'flowWeight', label: 'Maze solving force', min: 0, max: 3, step: 0.05 },
  { key: 'densityWeight', label: 'Too crowded force', min: 0, max: 3, step: 0.05 },
  { key: 'crowdingThreshold', label: 'Crowded threshold', min: 0, max: 3, step: 0.05 },
  { key: 'densitySlowdown', label: 'Crowd speed response', min: 0, max: 2, step: 0.05 },
  { key: 'minSpeedRatio', label: 'Minimum speed ratio', min: 0.05, max: 1, step: 0.05 },
  { key: 'maxSpeedRatio', label: 'Maximum speed ratio', min: 1, max: 3, step: 0.05 },
  { key: 'maxSpeedMultiplier', label: 'Top speed multiplier', min: 0.5, max: 5, step: 0.05 },
  { key: 'accelerationMultiplier', label: 'Acceleration rate', min: 0.5, max: 16, step: 0.25 },
  { key: 'separationWeight', label: 'Slime separation force', min: 0, max: 2, step: 0.05 },
  { key: 'separationRadiusMultiplier', label: 'Separation radius', min: 0.5, max: 3, step: 0.05 },
  { key: 'slimeSizeMultiplier', label: 'Slime size', min: 0.5, max: 1.5, step: 0.025 },
  { key: 'jitterStrength', label: 'Jitter force', min: 0, max: 0.1, step: 0.005 },
];
const slimeSliderConfigs = simSliderConfigs.filter((slider) => slider.key === 'slimeSizeMultiplier');
const motionSliderConfigs = simSliderConfigs.filter((slider) =>
  ['flowWeight', 'maxSpeedMultiplier', 'accelerationMultiplier', 'jitterStrength'].includes(slider.key),
);
const crowdingSliderConfigs = simSliderConfigs.filter((slider) =>
  [
    'densityWeight',
    'crowdingThreshold',
    'densitySlowdown',
    'minSpeedRatio',
    'maxSpeedRatio',
    'separationWeight',
    'separationRadiusMultiplier',
  ].includes(slider.key),
);

const spawnSliderConfigs: Array<{
  key: SpawnSliderKey;
  label: string;
  min: number;
  max: number;
  step: number;
}> = [
  { key: 'totalSlimes', label: 'Slimes to spawn', min: 0, max: 10_000, step: 1 },
  { key: 'slimesPerSecond', label: 'Slimes per second', min: 0, max: 2_400, step: 1 },
];

const debugState: DebugState = {
  paused: false,
  thresholdShader: true,
  invalidColorOverlay: true,
  sampledColor: true,
  lighting: true,
  specular: true,
  rim: true,
  skirt: true,
  highlights: true,
  eyes: true,
  mazeSolvingField: false,
  tooCrowdedField: false,
  previewMode: 0,
  ...DEFAULT_SLIME_SHADER_TUNING,
  ...DEFAULT_SLIME_EYE_TUNING,
};

const simTuning: SimConfig = { ...DEFAULT_SIM_CONFIG };
const spawnTuning: SpawnTuning = {
  totalSlimes: 130,
  slimesPerSecond: 35,
};

function renderShaderSliders(configs: typeof shaderSliderConfigs): string {
  return configs
    .map((slider) => {
      const value = DEFAULT_SLIME_SHADER_TUNING[slider.key];
      return `
        <label class="debug-slider">
          <span>${slider.label}: <output data-shader-output="${slider.key}">${value.toFixed(3)}</output></span>
          <input
            type="range"
            data-shader-slider="${slider.key}"
            min="${slider.min}"
            max="${slider.max}"
            step="${slider.step}"
            value="${value}"
          />
        </label>
      `;
    })
    .join('');
}

function renderEyeSliders(): string {
  return eyeSliderConfigs
    .map((slider) => {
      const value = DEFAULT_SLIME_EYE_TUNING[slider.key];
      return `
        <label class="debug-slider">
          <span>${slider.label}: <output data-eye-output="${slider.key}">${value.toFixed(2)}</output></span>
          <input
            type="range"
            data-eye-slider="${slider.key}"
            min="${slider.min}"
            max="${slider.max}"
            step="${slider.step}"
            value="${value}"
          />
        </label>
      `;
    })
    .join('');
}

function renderSimSliders(configs: typeof simSliderConfigs): string {
  return configs
    .map((slider) => {
      const value = DEFAULT_SIM_CONFIG[slider.key];
      return `
        <label class="debug-slider">
          <span>${slider.label}: <output data-sim-output="${slider.key}">${value.toFixed(3)}</output></span>
          <input
            type="range"
            data-sim-slider="${slider.key}"
            min="${slider.min}"
            max="${slider.max}"
            step="${slider.step}"
            value="${value}"
          />
        </label>
      `;
    })
    .join('');
}

function renderDebugSection(title: string, content: string, open = true): string {
  return `
    <details class="debug-section" ${open ? 'open' : ''}>
      <summary>${title}</summary>
      <div class="debug-section-body">
        ${content}
      </div>
    </details>
  `;
}

function renderSpawnSliders(): string {
  return spawnSliderConfigs
    .map((slider) => {
      const value = spawnTuning[slider.key];
      return `
        <label class="debug-slider">
          <span>${slider.label}: <output data-spawn-output="${slider.key}">${value.toFixed(0)}</output></span>
          <input
            type="range"
            data-spawn-slider="${slider.key}"
            min="${slider.min}"
            max="${slider.max}"
            step="${slider.step}"
            value="${value}"
          />
        </label>
      `;
    })
    .join('');
}

async function bootstrap(): Promise<void> {
  const host = document.querySelector<HTMLDivElement>('#app');
  if (!host) {
    throw new Error('Missing #app host element.');
  }

  host.innerHTML = `
    <aside class="hud debug-sidebar" aria-label="Debug panel">
      <div class="hud-header">
        <h1>Slime Game</h1>
        <button
          type="button"
          class="hud-toggle"
          data-testid="debug-panel-toggle"
          aria-controls="debug-panel"
          aria-expanded="true"
        >
          Collapse
        </button>
      </div>
      <p data-testid="sim-status">Booting simulation...</p>
      <div id="debug-panel" class="debug-panel" data-debug-panel>
        ${renderDebugSection(
          'Simulation',
          `
            <div class="debug-controls">
              <button type="button" class="hud-button" data-testid="restart-simulation">Restart simulation</button>
              <label><input type="checkbox" data-debug-key="paused" /> Pause simulation</label>
            </div>
          `,
        )}
        ${renderDebugSection(
          'Field Overlays',
          `
            <div class="debug-controls">
              <label><input type="checkbox" data-debug-key="mazeSolvingField" /> Maze solving field</label>
              <label><input type="checkbox" data-debug-key="tooCrowdedField" /> Too crowded field</label>
            </div>
          `,
          false,
        )}
        ${renderDebugSection(
          'Shader Toggles',
          `
            <div class="debug-controls">
              <label><input type="checkbox" data-debug-key="thresholdShader" checked /> Threshold shader</label>
              <label><input type="checkbox" data-debug-key="invalidColorOverlay" checked /> Invalid color overlay</label>
              <label><input type="checkbox" data-debug-key="sampledColor" checked /> Sampled slime color</label>
              <label><input type="checkbox" data-debug-key="lighting" checked /> Shader lighting</label>
              <label><input type="checkbox" data-debug-key="specular" checked /> Specular highlights</label>
              <label><input type="checkbox" data-debug-key="rim" checked /> Rim light</label>
              <label><input type="checkbox" data-debug-key="skirt" checked /> Skirt / edge shading</label>
              <label><input type="checkbox" data-debug-key="highlights" checked /> Overlay highlights</label>
              <label><input type="checkbox" data-debug-key="eyes" /> Embedded eyes</label>
            </div>
          `,
        )}
        ${renderDebugSection(
          'Shader Preview',
          `
            <div class="debug-controls">
              <label class="debug-select">
                <span>Shader preview</span>
                <select data-shader-preview>
                  <option value="0">Final render</option>
                  <option value="1">Source field color</option>
                  <option value="2">Source field alpha</option>
                  <option value="3">Classified source color</option>
                  <option value="4">Dark gel mask</option>
                </select>
              </label>
            </div>
          `,
          false,
        )}
        ${renderDebugSection(
          'Slime Shader',
          `<div class="debug-slider-group" aria-label="Slime shader tuning controls">${renderShaderSliders(shaderSliderConfigs)}</div>`,
        )}
        ${renderDebugSection(
          'Eyes',
          `<div class="debug-slider-group" aria-label="Eye tuning controls">${renderEyeSliders()}</div>`,
        )}
        ${renderDebugSection(
          'Spawning',
          `
            <div class="debug-slider-group" aria-label="Spawning controls">
              ${renderSpawnSliders()}
              ${renderSimSliders(slimeSliderConfigs)}
            </div>
          `,
        )}
        ${renderDebugSection(
          'Movement',
          `<div class="debug-slider-group" aria-label="Movement force tuning controls">${renderSimSliders(motionSliderConfigs)}</div>`,
          false,
        )}
        ${renderDebugSection(
          'Crowding',
          `<div class="debug-slider-group" aria-label="Crowding tuning controls">${renderSimSliders(crowdingSliderConfigs)}</div>`,
          false,
        )}
      </div>
    </aside>
  `;

  const maze = createDemoMaze();
  let spawnRng = new SeededRandom(42);
  let spawnAccumulator = 0;
  let spawnedSlimes = 0;
  let nextSlimeId = 1;
  const createWorld = (): World => {
    spawnRng = new SeededRandom(42);
    spawnAccumulator = 0;
    spawnedSlimes = 0;
    nextSlimeId = 1;
    return new World({
      maze,
      units: [],
      config: simTuning,
      seed: 7,
    });
  };
  let world = createWorld();
  const renderer = await createRenderer(host);
  const status = host.querySelector<HTMLParagraphElement>('[data-testid="sim-status"]');
  const debugSidebar = host.querySelector<HTMLElement>('.debug-sidebar');
  const debugPanel = host.querySelector<HTMLDivElement>('[data-debug-panel]');
  const debugPanelToggle = host.querySelector<HTMLButtonElement>('[data-testid="debug-panel-toggle"]');
  const restartButton = host.querySelector<HTMLButtonElement>('[data-testid="restart-simulation"]');
  const debugInputs = [...host.querySelectorAll<HTMLInputElement>('[data-debug-key]')];
  const shaderPreview = host.querySelector<HTMLSelectElement>('[data-shader-preview]');
  const shaderSliders = [...host.querySelectorAll<HTMLInputElement>('[data-shader-slider]')];
  const eyeSliders = [...host.querySelectorAll<HTMLInputElement>('[data-eye-slider]')];
  const simSliders = [...host.querySelectorAll<HTMLInputElement>('[data-sim-slider]')];
  const spawnSliders = [...host.querySelectorAll<HTMLInputElement>('[data-spawn-slider]')];
  const shaderOutputs = new Map(
    [...host.querySelectorAll<HTMLOutputElement>('[data-shader-output]')].map((output) => [
      output.dataset.shaderOutput,
      output,
    ]),
  );
  const simOutputs = new Map(
    [...host.querySelectorAll<HTMLOutputElement>('[data-sim-output]')].map((output) => [output.dataset.simOutput, output]),
  );
  const eyeOutputs = new Map(
    [...host.querySelectorAll<HTMLOutputElement>('[data-eye-output]')].map((output) => [output.dataset.eyeOutput, output]),
  );
  const spawnOutputs = new Map(
    [...host.querySelectorAll<HTMLOutputElement>('[data-spawn-output]')].map((output) => [
      output.dataset.spawnOutput,
      output,
    ]),
  );

  const applyDebugOptions = (): void => {
    renderer.setDebugOptions(debugState);
    renderer.render(snapshot);
  };

  const spawnSlimes = (dt: number): void => {
    const total = Math.floor(spawnTuning.totalSlimes);
    const remaining = total - spawnedSlimes;
    if (remaining <= 0 || spawnTuning.slimesPerSecond <= 0) {
      return;
    }

    spawnAccumulator += spawnTuning.slimesPerSecond * dt;
    const spawnCount = Math.min(remaining, Math.floor(spawnAccumulator));
    if (spawnCount <= 0) {
      return;
    }

    spawnAccumulator -= spawnCount;
    for (let index = 0; index < spawnCount; index += 1) {
      world.units.push(createDemoSlime(maze, nextSlimeId, spawnRng, simTuning.slimeSizeMultiplier));
      nextSlimeId += 1;
      spawnedSlimes += 1;
    }
  };

  let snapshot = world.createSnapshot();
  applyDebugOptions();

  const setDebugPanelExpanded = (expanded: boolean): void => {
    if (!debugPanel || !debugPanelToggle) {
      return;
    }

    debugPanel.hidden = !expanded;
    debugSidebar?.classList.toggle('debug-sidebar-collapsed', !expanded);
    debugPanelToggle.textContent = expanded ? 'Collapse' : 'Expand';
    debugPanelToggle.setAttribute('aria-expanded', String(expanded));
  };

  debugPanelToggle?.addEventListener('click', () => {
    const isExpanded = debugPanel ? debugPanel.hidden !== true && debugPanel.hidden !== 'until-found' : true;
    setDebugPanelExpanded(!isExpanded);
  });

  restartButton?.addEventListener('click', () => {
    world = createWorld();
    snapshot = world.createSnapshot();
    applyDebugOptions();
  });

  for (const input of debugInputs) {
    const key = input.dataset.debugKey as BooleanDebugKey;
    input.checked = debugState[key];
    input.addEventListener('change', () => {
      debugState[key] = input.checked;
      applyDebugOptions();
    });
  }

  if (shaderPreview) {
    shaderPreview.value = String(debugState.previewMode);
    shaderPreview.addEventListener('change', () => {
      debugState.previewMode = Number(shaderPreview.value);
      applyDebugOptions();
    });
  }

  for (const input of shaderSliders) {
    const key = input.dataset.shaderSlider as ShaderSliderKey;
    const output = shaderOutputs.get(key);
    input.value = String(debugState[key]);
    if (output) {
      output.value = Number(input.value).toFixed(3);
    }
    input.addEventListener('input', () => {
      debugState[key] = Number(input.value);
      if (output) {
        output.value = Number(input.value).toFixed(3);
      }
      applyDebugOptions();
    });
  }

  for (const input of eyeSliders) {
    const key = input.dataset.eyeSlider as EyeSliderKey;
    const output = eyeOutputs.get(key);
    input.value = String(debugState[key]);
    if (output) {
      output.value = Number(input.value).toFixed(2);
    }
    input.addEventListener('input', () => {
      debugState[key] = Number(input.value);
      if (output) {
        output.value = Number(input.value).toFixed(2);
      }
      applyDebugOptions();
    });
  }

  for (const input of simSliders) {
    const key = input.dataset.simSlider as SimSliderKey;
    const output = simOutputs.get(key);
    input.value = String(simTuning[key]);
    if (output) {
      output.value = Number(input.value).toFixed(3);
    }
    input.addEventListener('input', () => {
      simTuning[key] = Number(input.value);
      if (key === 'slimeSizeMultiplier') {
        world.setSlimeSizeMultiplier(simTuning[key]);
      } else {
        world.config[key] = simTuning[key];
      }
      if (output) {
        output.value = Number(input.value).toFixed(3);
      }
      snapshot = world.createSnapshot();
      applyDebugOptions();
    });
  }

  for (const input of spawnSliders) {
    const key = input.dataset.spawnSlider as SpawnSliderKey;
    const output = spawnOutputs.get(key);
    input.value = String(spawnTuning[key]);
    if (output) {
      output.value = Number(input.value).toFixed(0);
    }
    input.addEventListener('input', () => {
      spawnTuning[key] = Number(input.value);
      if (output) {
        output.value = Number(input.value).toFixed(0);
      }
    });
  }

  renderer.app.ticker.add((ticker) => {
    if (!debugState.paused) {
      const dt = Math.min(ticker.deltaMS / 1000, 1 / 20);
      spawnSlimes(dt);
      snapshot = world.step(dt);
    }
    renderer.render(snapshot);
    if (status) {
      const state = debugState.paused ? 'paused' : 'flowing';
      status.textContent = `${snapshot.units.length} slimes ${state}, ${spawnedSlimes}/${Math.floor(spawnTuning.totalSlimes)} spawned, ${snapshot.exitedCount} escaped through the exit`;
    }
  });

  window.addEventListener('keydown', (event) => {
    if (event.code !== 'Space') {
      return;
    }
    const origin = { x: maze.tileSize * 11, y: maze.tileSize * 8 };
    snapshot = world.step(0, [{ type: 'aoe', origin, radius: 90, damage: 20 }]);
    renderer.render(snapshot);
  });
}

bootstrap().catch((error: unknown) => {
  const message = error instanceof Error ? error.message : String(error);
  document.body.innerHTML = `<pre>Failed to start Slime Game: ${message}</pre>`;
  throw error;
});
