import { ABILITY_DEFINITIONS, type AbilityKind } from '../campaign/abilities';
import { ARCHETYPES } from '../campaign/archetypes';
import { canPlaceStructure, STRUCTURE_DEFINITIONS, type StructureKind } from '../campaign/structures';
import { RunController } from '../campaign/runController';
import type { LevelDefinition } from '../campaign/levels';
import type { MetaProgress } from '../campaign/metaProgress';
import { createRenderer, type SlimeRenderer, type SlimeRendererDebugOptions } from '../render/createRenderer';
import { DEFAULT_SLIME_SHADER_TUNING } from '../render/filters/slimeThresholdFilter';
import { DEFAULT_SLIME_EYE_TUNING } from '../render/passes/slimeFieldPass';
import type { RenderHover, RenderSnapshot } from '../sim/types';

export interface RunScreenCallbacks {
  onExitToHub: () => void;
}

const RENDER_DEBUG: SlimeRendererDebugOptions = {
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

export class RunScreen {
  private root!: HTMLElement;
  private stage!: HTMLDivElement;
  private statusEl?: HTMLDivElement;
  private toolbarEl?: HTMLDivElement;
  private bannerEl?: HTMLDivElement;
  private overlayEl?: HTMLDivElement;
  private renderer?: SlimeRenderer;
  private controller?: RunController;
  private rafTickerCleanup?: () => void;
  private selectedToolId?: string;
  private mounted = false;

  constructor(
    private readonly level: LevelDefinition,
    private readonly meta: MetaProgress,
    private readonly callbacks: RunScreenCallbacks,
  ) {}

  async mount(host: HTMLElement): Promise<void> {
    console.log(`[runScreen] mount() level=${this.level.id} (${this.level.label})`);
    host.innerHTML = '';
    this.root = document.createElement('div');
    this.root.className = 'run-stage';
    host.appendChild(this.root);

    this.stage = document.createElement('div');
    this.stage.className = 'run-canvas';
    this.root.appendChild(this.stage);

    this.controller = new RunController({ level: this.level, meta: this.meta });
    console.log(
      `[runScreen] controller initialized: phase=${this.controller.getPhase()} unlockedTools=${this.controller
        .buildToolBar()
        .map((t) => t.toolId)
        .join(',')}`,
    );
    this.renderer = await createRenderer(this.stage);
    this.renderer.setDebugOptions(RENDER_DEBUG);

    this.statusEl = document.createElement('div');
    this.statusEl.className = 'run-status';
    this.root.appendChild(this.statusEl);

    this.toolbarEl = document.createElement('div');
    this.toolbarEl.className = 'run-toolbar';
    this.root.appendChild(this.toolbarEl);
    this.bindToolbarInputs();

    this.bannerEl = document.createElement('div');
    this.bannerEl.className = 'run-banner';
    this.bannerEl.style.display = 'none';
    this.root.appendChild(this.bannerEl);

    this.bindCanvasInputs();
    this.mounted = true;
    this.startTicker();
    this.update(0);
    console.log('[runScreen] mount() complete');
  }

  unmount(): void {
    this.mounted = false;
    this.rafTickerCleanup?.();
    if (this.renderer) {
      this.renderer.destroy();
      this.renderer = undefined;
    }
    if (this.root.parentElement) {
      this.root.parentElement.removeChild(this.root);
    }
  }

  private startTicker(): void {
    if (!this.renderer) {
      return;
    }
    const ticker = this.renderer.app.ticker;
    const handler = (delta: { deltaMS: number }) => {
      const dt = Math.min(delta.deltaMS / 1000, 1 / 20);
      this.update(dt);
    };
    ticker.add(handler);
    this.rafTickerCleanup = () => ticker.remove(handler);
  }

  private update(dt: number): void {
    if (!this.controller || !this.renderer || !this.mounted) {
      return;
    }
    this.controller.step(dt);
    const snapshot = this.controller.getSnapshot();
    const hoverSnapshot: RenderSnapshot = {
      ...snapshot,
      structures: this.controller.getStructures().map((s) => ({
        instanceId: s.instanceId,
        kind: s.kind,
        cell: s.cell,
        position: s.position,
        alive: s.alive,
        pressureRemaining: s.pressureRemaining,
        pressureCapacity:
          s.kind === 'barricade'
            ? STRUCTURE_DEFINITIONS.barricade.baseStats.pressureCapacity
            : undefined,
        attached: s.attachedGremlinId !== undefined,
        cooldown: s.cooldown,
        color: STRUCTURE_DEFINITIONS[s.kind as StructureKind]?.color ?? 0xffffff,
        icon: STRUCTURE_DEFINITIONS[s.kind as StructureKind]?.icon ?? '?',
      })),
      abilityEffects: this.controller.getActiveAbilityVisuals().map((effect) => ({
        kind: effect.kind === 'swarm' ? 'swarm' : 'meteor',
        position: effect.position,
        radius: effect.radius,
        expiresAt: 'expiresAt' in effect ? effect.expiresAt : undefined,
        triggerAt: 'triggerAt' in effect ? effect.triggerAt : undefined,
      })),
      shotEffects: [...this.controller.getShotEffects()],
      hover: this.computeHover(snapshot),
    };
    this.renderer.render(hoverSnapshot);
    this.renderStatus();
    this.renderToolbar();
    this.renderBanner();
    this.checkOutcome();
  }

  private computeHover(snapshot: RenderSnapshot): RenderHover | undefined {
    if (!this.lastMousePos || !this.controller || !this.selectedToolId) {
      return undefined;
    }
    if (!this.controller.isToolReady(this.selectedToolId)) {
      return undefined;
    }
    const def = STRUCTURE_DEFINITIONS[this.selectedToolId as StructureKind];
    if (!def) {
      return undefined;
    }
    const cell = this.controller.worldToCell(this.lastMousePos);
    const placement = canPlaceStructure(def, this.controller.maze, cell, this.controller.getStructures());
    void snapshot;
    return { cell, valid: placement.ok, toolId: this.selectedToolId };
  }

  private renderStatus(): void {
    if (!this.controller || !this.statusEl) {
      return;
    }
    const state = this.controller.getRunStateSnapshot();
    const phaseLabel = phaseToLabel(state.phase, state.countdown);
    const wavePreview = this.controller.previewWave();
    const waveText = wavePreview
      ? wavePreview.archetypes
        ? Object.entries(wavePreview.archetypes)
            .map(([kind, count]) => `${count}x ${ARCHETYPES[kind as keyof typeof ARCHETYPES]?.label ?? kind}`)
            .join(', ')
        : ''
      : '';
    this.statusEl.innerHTML = `
      <span><strong>${state.level.label}</strong></span>
      <span>Wave ${state.wave}/${state.totalWaves}</span>
      <span>${phaseLabel}</span>
      <span class="leak-counter ${state.stats.leaks >= state.level.leakBudget ? 'danger' : ''}">Leaks ${state.stats.leaks}/${state.level.leakBudget}</span>
      <span>Alive ${state.alive}</span>
      ${wavePreview ? `<span>Next: ${wavePreview.totalSlimes} - ${waveText}</span>` : ''}
    `;
  }

  private renderToolbar(): void {
    if (!this.controller || !this.toolbarEl) {
      return;
    }
    const tools = this.controller.buildToolBar();

    const existingButtons = new Map(
      Array.from(this.toolbarEl.querySelectorAll<HTMLButtonElement>('.tool-button')).map((button) => [
        button.dataset.tool,
        button,
      ]),
    );
    let nextButtonInOrder = this.toolbarEl.firstElementChild;

    for (const tool of tools) {
      const ratio = tool.charges >= tool.maxCharges ? 1 : tool.chargeProgress / Math.max(0.001, tool.chargeTime);
      const ready = this.controller.isToolReady(tool.toolId);
      const isActive = this.selectedToolId === tool.toolId;
      let button = existingButtons.get(tool.toolId);

      if (!button) {
        button = document.createElement('button');
        button.type = 'button';
        button.className = 'tool-button';
        button.dataset.tool = tool.toolId;
        button.innerHTML = `
          <span class="tool-icon"></span>
          <span class="tool-label"></span>
          <span class="tool-charges"></span>
          <span class="charge-bar"><span class="charge-bar-fill"></span></span>
        `;
      }

      button.classList.toggle('active', isActive);
      button.classList.toggle('charging', !ready);
      button.querySelector<HTMLElement>('.tool-icon')!.style.color = `#${tool.color.toString(16).padStart(6, '0')}`;
      button.querySelector<HTMLElement>('.tool-icon')!.textContent = tool.icon;
      button.querySelector<HTMLElement>('.tool-label')!.textContent = tool.label;
      button.querySelector<HTMLElement>('.tool-charges')!.textContent = `${Math.floor(tool.charges)}/${tool.maxCharges}`;
      button.querySelector<HTMLElement>('.charge-bar-fill')!.style.width = `${(ratio * 100).toFixed(1)}%`;
      if (button === nextButtonInOrder) {
        nextButtonInOrder = nextButtonInOrder.nextElementSibling;
      } else {
        this.toolbarEl.insertBefore(button, nextButtonInOrder);
      }
      existingButtons.delete(tool.toolId);
    }

    for (const staleButton of existingButtons.values()) {
      staleButton.remove();
    }
  }

  private bindToolbarInputs(): void {
    if (!this.toolbarEl) {
      return;
    }

    this.toolbarEl.addEventListener('click', (event) => {
      const target = event.target as HTMLElement | null;
      const button = target?.closest<HTMLButtonElement>('.tool-button');
      if (!button) {
        return;
      }
      const id = button.dataset.tool;
      if (!id) {
        return;
      }
      this.selectedToolId = this.selectedToolId === id ? undefined : id;
    });
  }

  private renderBanner(): void {
    if (!this.controller || !this.bannerEl) {
      return;
    }
    const phase = this.controller.getPhase();
    if (phase === 'prePlacement' && this.level.prePlacementInstruction) {
      this.bannerEl.style.display = 'block';
      this.bannerEl.textContent = this.level.prePlacementInstruction;
      if (!this.selectedToolId) {
        this.selectedToolId = this.level.prePlacementToolId;
      }
    } else if (phase === 'awaitingFirstWave') {
      this.bannerEl.style.display = 'block';
      const state = this.controller.getRunStateSnapshot();
      this.bannerEl.textContent = `Wave 1 begins in ${Math.ceil(state.countdown)}s. Use this time to place structures.`;
    } else if (phase === 'inWave') {
      const state = this.controller.getRunStateSnapshot();
      if (state.countdown > 0) {
        this.bannerEl.style.display = 'block';
        this.bannerEl.textContent = `Wave ${state.wave} in ${Math.ceil(state.countdown)}s.`;
      } else {
        this.bannerEl.style.display = 'none';
      }
    } else {
      this.bannerEl.style.display = 'none';
    }
  }

  private checkOutcome(): void {
    if (!this.controller || this.overlayEl) {
      return;
    }
    const phase = this.controller.getPhase();
    if (phase !== 'won' && phase !== 'lost') {
      return;
    }
    const outcome = this.controller.getOutcome();
    if (!outcome) {
      return;
    }
    this.showOutcomeOverlay(phase === 'won', outcome.payout.goo, outcome.payout.cores, outcome.payout.breakdown);
  }

  private showOutcomeOverlay(
    win: boolean,
    goo: number,
    cores: number,
    breakdown: Array<{ source: string; goo: number; cores: number }>,
  ): void {
    const overlay = document.createElement('div');
    overlay.className = 'run-overlay';
    overlay.innerHTML = `
      <div class="overlay-card">
        <h2>${win ? 'Victory' : 'Routed!'}</h2>
        <p class="payout">+${goo} Goo${cores > 0 ? ` and +${cores} Core${cores > 1 ? 's' : ''}` : ''}</p>
        <ul class="breakdown">${breakdown.map((entry) => `<li>${entry.source}: ${entry.goo} Goo${entry.cores ? ` / ${entry.cores} Core(s)` : ''}</li>`).join('')}</ul>
        <button type="button" data-return-hub>Return to Hub</button>
      </div>
    `;
    overlay.querySelector<HTMLButtonElement>('[data-return-hub]')?.addEventListener('click', () => {
      this.callbacks.onExitToHub();
    });
    this.root.appendChild(overlay);
    this.overlayEl = overlay;
  }

  // ---- Input handling ----

  private lastMousePos?: { x: number; y: number };

  private bindCanvasInputs(): void {
    const canvas = this.stage.querySelector<HTMLCanvasElement>('canvas');
    if (!canvas) {
      return;
    }
    canvas.addEventListener('mousemove', (event) => {
      const rect = canvas.getBoundingClientRect();
      const screenX = event.clientX - rect.left;
      const screenY = event.clientY - rect.top;
      const point = this.renderer?.worldFromScreen(screenX, screenY);
      this.lastMousePos = point;
    });
    canvas.addEventListener('click', (event) => {
      this.handleCanvasClick(event);
    });
    canvas.addEventListener('contextmenu', (event) => {
      event.preventDefault();
      this.handleCanvasRightClick(event);
    });
  }

  private handleCanvasClick(event: MouseEvent): void {
    if (!this.controller || !this.renderer) {
      return;
    }
    const canvas = this.stage.querySelector<HTMLCanvasElement>('canvas');
    if (!canvas) return;
    const rect = canvas.getBoundingClientRect();
    const point = this.renderer.worldFromScreen(event.clientX - rect.left, event.clientY - rect.top);
    const cell = this.controller.worldToCell(point);

    if (this.selectedToolId) {
      const isStructure = !!STRUCTURE_DEFINITIONS[this.selectedToolId as StructureKind];
      const isAbility = !!ABILITY_DEFINITIONS[this.selectedToolId as AbilityKind];
      if (isStructure) {
        this.controller.placeStructure(this.selectedToolId, cell);
      } else if (isAbility) {
        this.controller.triggerAbility(this.selectedToolId, point);
      }
      return;
    }
    this.controller.shooGremlinAtCell(cell);
  }

  private handleCanvasRightClick(event: MouseEvent): void {
    if (!this.controller || !this.renderer) {
      return;
    }
    const canvas = this.stage.querySelector<HTMLCanvasElement>('canvas');
    if (!canvas) return;
    const rect = canvas.getBoundingClientRect();
    const point = this.renderer.worldFromScreen(event.clientX - rect.left, event.clientY - rect.top);
    const cell = this.controller.worldToCell(point);
    this.controller.sellStructureAtCell(cell);
  }
}

function phaseToLabel(phase: string, countdown: number): string {
  switch (phase) {
    case 'prePlacement':
      return 'Place required tool';
    case 'awaitingFirstWave':
      return `First wave in ${Math.ceil(countdown)}s`;
    case 'inWave':
      return countdown > 0 ? `Next wave in ${Math.ceil(countdown)}s` : 'Wave active';
    case 'paused':
      return 'Paused';
    case 'won':
      return 'Victory';
    case 'lost':
      return 'Routed';
    default:
      return phase;
  }
}
