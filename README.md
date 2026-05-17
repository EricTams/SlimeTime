# Slime Game

A TypeScript/PixiJS prototype based on the [slime simulation design](slime-sim-design.md). The game runs a deterministic CPU simulation for slime movement, density, spatial queries, and damage, then renders the result through ordered PixiJS passes.

## Requirements

- Node.js 22 or newer
- npm

## Local Development

Install dependencies:

```bash
npm install
```

Start the local dev server:

```bash
npm run dev
```

On Windows, double-click or run:

```bat
run-local.bat
```

Press `Space` in the game to trigger a sample AoE damage event.

## Verification

Run the standard checks:

```bash
npm run typecheck
npm run test
npm run test:coverage
npm run build
npm run test:e2e
```

On Windows, run the full local workflow:

```bat
test-local.bat
```

The batch file installs dependencies when `node_modules` is missing, installs Playwright Chromium if needed, then runs typecheck, unit tests, coverage, build, and browser smoke tests.

## Project Structure

- `src/main.ts` boots the PixiJS app, creates the demo maze, and starts the game loop.
- `src/content/demoMaze.ts` defines the initial maze and deterministic slime spawns.
- `src/sim/` contains the CPU simulation: flow field, density field, spatial hash, wall clamping, damage, and snapshots.
- `src/render/` contains the PixiJS rendering shell and ordered render passes.
- `src/render/shaders/` is reserved for the custom shader implementation as the slime field evolves.
- `test/fixtures/` contains deterministic regression fixtures.
- `tests/e2e/` contains Playwright browser smoke tests.

## Testing Policy

Simulation behavior should be regression-protected before visual changes expand. Unit tests cover flow routing, density double buffering, spatial hash queries, raycasts, wall safety, damage/death, goo events, and render snapshot helpers.

Rendering is currently smoke-tested in the browser. Exact pixel tests are intentionally deferred until the shader pipeline stabilizes.

## GitHub Pages

The workflow at `.github/workflows/pages.yml` builds and deploys the static Vite output from `dist`.

For a repository named `SlimeTime`, the production Vite base path is `/SlimeTime/`. In GitHub, enable Pages with the source set to GitHub Actions.

### What runs where

| Check | Local (`test-local.bat`) | CI (`pages.yml`) |
|---|---|---|
| `npm run typecheck` | yes | yes |
| `npm run test` (unit) | yes | yes |
| `npm run test:coverage` | yes | yes |
| `npm run build` | yes | yes |
| `npm run test:e2e` (Playwright) | yes | no |

Playwright browser smoke tests run locally only. Headless Chromium on Linux CI uses a software rasterizer (SwiftShader) and is sensitive to timing on a constantly reflowing HUD, which produces flakes that aren't real regressions. Always run `test-local.bat` before pushing to catch e2e issues.
