import { ABILITY_DEFINITIONS, type AbilityKind } from '../campaign/abilities';
import type { LevelDefinition } from '../campaign/levels';
import { CAMPAIGN_LEVELS } from '../campaign/levels';
import { MetaProgress } from '../campaign/metaProgress';
import { STRUCTURE_DEFINITIONS, type StructureKind } from '../campaign/structures';
import {
  STARTER_NODE_ID,
  UPGRADE_NODE_INDEX,
  UPGRADE_NODES,
  type UpgradeNode,
  isAvailable,
  visibleUpgradeEdges,
  visibleUpgradeNodes,
} from '../campaign/upgradeTree';

export interface HubCallbacks {
  onPlayLevel: (level: LevelDefinition) => void;
  onMetaChanged?: () => void;
}

interface TabDef {
  id: 'levels' | 'upgrades';
  label: string;
}

const TABS: TabDef[] = [
  { id: 'levels', label: 'Levels' },
  { id: 'upgrades', label: 'Upgrades' },
];

const TREE_ORIGIN = { x: 1200, y: 900 };
const TREE_SIZE = { width: 3400, height: 2200 };

export class HubScreen {
  private root!: HTMLElement;
  private message?: string;
  private activeTab: TabDef['id'];
  private treePan = { x: 420, y: 260 };
  private readonly starterNode = UPGRADE_NODE_INDEX.get(STARTER_NODE_ID)!;

  constructor(
    private readonly meta: MetaProgress,
    private readonly callbacks: HubCallbacks,
    initialTab?: TabDef['id'],
  ) {
    this.activeTab = initialTab ?? (this.meta.hasPurchased(STARTER_NODE_ID) ? 'levels' : 'upgrades');
  }

  mount(host: HTMLElement): void {
    if (!this.meta.hasPurchased(STARTER_NODE_ID)) {
      this.activeTab = 'upgrades';
      this.message = 'Spend your starting Core on Pinpricker before entering the first level.';
    } else if (this.activeTab === 'upgrades') {
      this.message = 'Buy upgrades, then head back to levels when you are ready.';
    }
    host.innerHTML = '';
    this.root = document.createElement('div');
    this.root.className = 'hub';
    host.appendChild(this.root);
    this.render();
  }

  unmount(): void {
    if (this.root && this.root.parentElement) {
      this.root.parentElement.removeChild(this.root);
    }
  }

  private render(): void {
    const goo = this.meta.goo;
    const cores = this.meta.cores;
    const purchased = this.meta.purchasedSet();
    const tools = this.meta.unlockedTools();

    const sidebar = `
      <aside class="hub-sidebar">
        <h1 class="hub-title">Slime Campaign</h1>
        <p class="hub-subtitle">Lose your way to victory.</p>
        <div class="balances">
          <div class="balance-card"><span class="balance-label">Goo</span><span class="balance-value" data-goo>${goo}</span></div>
          <div class="balance-card"><span class="balance-label">Cores</span><span class="balance-value" data-cores>${cores}</span></div>
        </div>
        <div>
          <h3 class="hub-section-title">Unlocked Tools</h3>
          <ul class="hub-toolbar-summary">${[...tools].map((tool) => `<li>${escapeHtml(labelForTool(tool))}</li>`).join('') || '<li>None yet</li>'}</ul>
        </div>
        <div>
          <h3 class="hub-section-title">Capstones</h3>
          <ul class="hub-flags">${[...this.meta.flags()].map((flag) => `<li>${escapeHtml(flag)}</li>`).join('') || '<li>None yet</li>'}</ul>
        </div>
        <button type="button" class="hub-reset-button" data-reset-progress>Reset Campaign</button>
      </aside>
    `;

    const tabsHtml = `
      <nav class="hub-tabs">
        ${TABS.map((tab) => `<button type="button" class="hub-tab ${this.activeTab === tab.id ? 'active' : ''}" data-tab="${tab.id}">${tab.label}</button>`).join('')}
      </nav>
    `;

    const panelHtml =
      this.activeTab === 'levels' ? this.renderLevels(purchased) : this.renderUpgradeTree(purchased);

    const messageHtml = this.message ? `<p class="hub-message">${escapeHtml(this.message)}</p>` : '';

    const main = `
      <section class="hub-main">
        ${tabsHtml}
        <div class="hub-panel">${messageHtml}${panelHtml}</div>
      </section>
    `;

    this.root.innerHTML = sidebar + main;
    this.applyTreePan();
    this.bindEvents();
  }

  private renderLevels(purchased: Set<string>): string {
    const started = purchased.has(STARTER_NODE_ID);
    const levels = CAMPAIGN_LEVELS.map((level) => {
      const cleared = this.meta.clearsForLevel(level.id);
      const locked = !isLevelAvailable(level, this.meta);
      const tagSrc = level.isTutorial ? 'Tutorial' : `Level ${level.index}`;
      const lockReason = !started ? 'Buy Pinpricker on the Upgrades page first.' : 'Clear the prerequisite level first.';
      return `
        <article class="level-card ${cleared ? 'cleared' : ''} ${locked ? 'locked' : ''}">
          <div class="level-meta"><span>${tagSrc}</span><span>${escapeHtml(level.bonus.description)}</span></div>
          <h3>${escapeHtml(level.label)}</h3>
          <p class="level-summary">${escapeHtml(level.description)}</p>
          <p class="level-summary"><strong>Twist:</strong> ${escapeHtml(level.twist)}</p>
          <p class="level-summary"><strong>Teaches:</strong> ${escapeHtml(level.teaches)}</p>
          <div class="level-meta"><span>Leaks: ${level.leakBudget}</span><span>Waves: ${level.waves.length}</span><span>${cleared > 0 ? `Cleared x${cleared}` : 'Not cleared'}</span></div>
          ${locked ? `<p class="level-summary">${lockReason}</p>` : ''}
          <button type="button" data-play-level="${level.id}" ${locked ? 'disabled' : ''}>${cleared > 0 ? 'Replay' : 'Play'}</button>
        </article>
      `;
    });
    return `<div class="level-list">${levels.join('')}</div>`;
  }

  private renderUpgradeTree(purchased: Set<string>): string {
    const nodes = visibleUpgradeNodes(purchased);
    const nodeIds = new Set(nodes.map((node) => node.id));
    const edgeHtml = visibleUpgradeEdges(purchased)
      .map((edge) => {
        const from = UPGRADE_NODE_INDEX.get(edge.from);
        const to = UPGRADE_NODE_INDEX.get(edge.to);
        if (!from || !to || !nodeIds.has(from.id) || !nodeIds.has(to.id)) {
          return '';
        }
        const purchasedEdge = purchased.has(from.id) && purchased.has(to.id);
        return `<line class="${purchasedEdge ? 'purchased' : ''}" x1="${TREE_ORIGIN.x + from.position.x}" y1="${TREE_ORIGIN.y + from.position.y}" x2="${TREE_ORIGIN.x + to.position.x}" y2="${TREE_ORIGIN.y + to.position.y}" />`;
      })
      .join('');
    const nodeHtml = nodes.map((node) => this.renderUpgradeNode(node, purchased)).join('');
    const totalCount = UPGRADE_NODES.length;

    return `
      <div class="upgrade-tree-shell">
        <div class="upgrade-tree-toolbar">
          <span>${nodes.length}/${totalCount} nodes visible</span>
          <span>Drag empty space to pan.</span>
          <button type="button" data-reset-tree>Center Starter</button>
        </div>
        <div class="upgrade-tree-viewport" data-tree-viewport>
          <div class="upgrade-tree-canvas" data-tree-canvas style="width: ${TREE_SIZE.width}px; height: ${TREE_SIZE.height}px;">
            <svg class="upgrade-tree-edges" viewBox="0 0 ${TREE_SIZE.width} ${TREE_SIZE.height}" aria-hidden="true">${edgeHtml}</svg>
            ${nodeHtml}
          </div>
        </div>
      </div>
    `;
  }

  private renderUpgradeNode(node: UpgradeNode, purchased: Set<string>): string {
    const owned = purchased.has(node.id);
    const available = isAvailable(node, purchased);
    const canAfford = node.currency === 'goo' ? this.meta.goo >= node.cost : this.meta.cores >= node.cost;
    const disabled = owned || !available || !canAfford;
    const isCore = node.currency === 'cores';
    const reason = owned
      ? 'Owned'
      : !available
        ? 'Locked'
        : !canAfford
          ? `Need ${node.cost} ${node.currency}`
          : `Buy for ${node.cost} ${node.currency}`;
    const tooltip = this.tooltipForNode(node, reason);
    const left = TREE_ORIGIN.x + node.position.x;
    const top = TREE_ORIGIN.y + node.position.y;
    return `
      <article class="upgrade-node ${owned ? 'purchased' : ''} ${available ? 'available' : 'locked'} ${isCore ? 'core-node' : 'goo-node'}" style="left: ${left}px; top: ${top}px;">
        <button
          type="button"
          class="upgrade-node-button"
          data-buy-node="${node.id}"
          aria-label="${escapeAttribute(`${node.label}. ${tooltip}`)}"
          title="${escapeAttribute(tooltip)}"
          ${disabled ? 'disabled' : ''}
        >
          <span class="upgrade-icon" aria-hidden="true">${escapeHtml(node.icon)}</span>
          <span class="upgrade-node-cost">${node.cost} ${node.currency === 'cores' ? 'Core' : 'Goo'}</span>
        </button>
        <span class="upgrade-tooltip" role="tooltip">
          <strong>${escapeHtml(node.label)}</strong>
          <span>${escapeHtml(node.description)}</span>
          <span>${escapeHtml(reason)}</span>
          ${node.prerequisites.length > 0 ? `<span>Requires: ${node.prerequisites.map(labelForNode).join(', ')}</span>` : '<span>Starter node</span>'}
        </span>
      </article>
    `;
  }

  private tooltipForNode(node: UpgradeNode, reason: string): string {
    const requirements = node.prerequisites.length > 0 ? ` Requires ${node.prerequisites.map(labelForNode).join(', ')}.` : '';
    return `${node.description} ${reason}.${requirements}`;
  }

  private bindEvents(): void {
    for (const tabBtn of this.root.querySelectorAll<HTMLButtonElement>('.hub-tab')) {
      tabBtn.addEventListener('click', () => {
        this.activeTab = (tabBtn.dataset.tab as TabDef['id']) ?? 'levels';
        this.message = undefined;
        this.render();
      });
    }
    for (const playBtn of this.root.querySelectorAll<HTMLButtonElement>('[data-play-level]')) {
      playBtn.addEventListener('click', () => {
        const id = playBtn.dataset.playLevel ?? '';
        const level = CAMPAIGN_LEVELS.find((candidate) => candidate.id === id);
        if (level) {
          this.callbacks.onPlayLevel(level);
        }
      });
    }
    for (const buyBtn of this.root.querySelectorAll<HTMLButtonElement>('[data-buy-node]')) {
      buyBtn.addEventListener('click', () => {
        const id = buyBtn.dataset.buyNode ?? '';
        const upgrade = UPGRADE_NODE_INDEX.get(id);
        if (!upgrade) {
          return;
        }
        const result = this.meta.tryPurchase(upgrade);
        if (!result.ok) {
          this.message = result.reason ?? 'Purchase failed.';
        } else {
          this.message = `Bought ${upgrade.label}.`;
          this.callbacks.onMetaChanged?.();
        }
        this.render();
      });
    }
    this.root.querySelector<HTMLButtonElement>('[data-reset-progress]')?.addEventListener('click', () => {
      this.meta.reset();
      this.activeTab = 'upgrades';
      this.message = 'Campaign reset. Spend your starting Core on Pinpricker to begin again.';
      this.centerStarter();
      this.callbacks.onMetaChanged?.();
      this.render();
    });
    this.root.querySelector<HTMLButtonElement>('[data-reset-tree]')?.addEventListener('click', () => {
      this.centerStarter();
      this.applyTreePan();
    });
    this.bindTreePan();
  }

  private bindTreePan(): void {
    const viewport = this.root.querySelector<HTMLElement>('[data-tree-viewport]');
    if (!viewport) {
      return;
    }
    let dragging = false;
    let start = { x: 0, y: 0 };
    let startPan = { ...this.treePan };
    viewport.addEventListener('pointerdown', (event) => {
      const target = event.target as HTMLElement | null;
      if (target?.closest('.upgrade-node-button')) {
        return;
      }
      dragging = true;
      start = { x: event.clientX, y: event.clientY };
      startPan = { ...this.treePan };
      viewport.setPointerCapture(event.pointerId);
      viewport.classList.add('panning');
    });
    viewport.addEventListener('pointermove', (event) => {
      if (!dragging) {
        return;
      }
      this.treePan = {
        x: startPan.x + event.clientX - start.x,
        y: startPan.y + event.clientY - start.y,
      };
      this.applyTreePan();
    });
    viewport.addEventListener('pointerup', (event) => {
      dragging = false;
      viewport.releasePointerCapture(event.pointerId);
      viewport.classList.remove('panning');
    });
    viewport.addEventListener('pointercancel', () => {
      dragging = false;
      viewport.classList.remove('panning');
    });
  }

  private centerStarter(): void {
    const viewport = this.root.querySelector<HTMLElement>('[data-tree-viewport]');
    const starter = this.starterNode;
    const width = viewport?.clientWidth ?? 800;
    const height = viewport?.clientHeight ?? 600;
    this.treePan = {
      x: width / 2 - (TREE_ORIGIN.x + starter.position.x),
      y: height / 2 - (TREE_ORIGIN.y + starter.position.y),
    };
  }

  private applyTreePan(): void {
    const canvas = this.root.querySelector<HTMLElement>('[data-tree-canvas]');
    if (!canvas) {
      return;
    }
    canvas.style.transform = `translate(${this.treePan.x}px, ${this.treePan.y}px)`;
  }
}

export function isLevelAvailable(level: LevelDefinition, meta: MetaProgress): boolean {
  if (!meta.hasPurchased(STARTER_NODE_ID)) {
    return false;
  }
  if (level.isTutorial) {
    return true;
  }
  if (!level.prerequisiteId) {
    return true;
  }
  return meta.clearsForLevel(level.prerequisiteId) > 0;
}

export function availableLevelsFor(meta: MetaProgress): LevelDefinition[] {
  return CAMPAIGN_LEVELS.filter((level) => {
    if (level.isTutorial) {
      return meta.hasPurchased(STARTER_NODE_ID) && !meta.hasSeenIntro();
    }
    return isLevelAvailable(level, meta);
  });
}

function labelForTool(toolId: string): string {
  const structure = STRUCTURE_DEFINITIONS[toolId as StructureKind];
  if (structure) {
    return structure.label;
  }
  const ability = ABILITY_DEFINITIONS[toolId as AbilityKind];
  return ability?.label ?? toolId;
}

function labelForNode(nodeId: string): string {
  return escapeHtml(UPGRADE_NODE_INDEX.get(nodeId)?.label ?? nodeId);
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function escapeAttribute(value: string): string {
  return escapeHtml(value).replace(/\n/g, ' ');
}
