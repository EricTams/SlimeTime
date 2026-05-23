import './style.css';
import { MetaProgress } from './campaign/metaProgress';
import { HubScreen } from './hub/hubScreen';
import { RunScreen } from './hub/runScreen';
import type { LevelDefinition } from './campaign/levels';

class App {
  private host: HTMLElement;
  private meta: MetaProgress;
  private hub?: HubScreen;
  private run?: RunScreen;

  constructor(host: HTMLElement) {
    this.host = host;
    this.meta = new MetaProgress();
  }

  bootstrap(): void {
    this.showHub();
  }

  private showHub(initialTab?: 'levels' | 'upgrades'): void {
    if (this.run) {
      this.run.unmount();
      this.run = undefined;
    }
    this.hub = new HubScreen(this.meta, {
      onPlayLevel: (level) => this.startRun(level),
      onMetaChanged: () => undefined,
    }, initialTab);
    this.hub.mount(this.host);
  }

  private async startRun(level: LevelDefinition): Promise<void> {
    if (this.hub) {
      this.hub.unmount();
      this.hub = undefined;
    }
    this.run = new RunScreen(level, this.meta, {
      onExitToHub: () => this.showHub('upgrades'),
    });
    await this.run.mount(this.host);
  }
}

function main(): void {
  const host = document.querySelector<HTMLDivElement>('#app');
  if (!host) {
    throw new Error('Missing #app host element.');
  }
  const app = new App(host);
  app.bootstrap();
}

try {
  main();
} catch (error: unknown) {
  const message = error instanceof Error ? error.message : String(error);
  document.body.innerHTML = `<pre>Failed to start Slime Game: ${message}</pre>`;
  throw error;
}
