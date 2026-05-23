# Profiling Plan

## Purpose

We want to understand where frame time is going before making performance changes. This document is only a plan for adding profiling and interpreting the results; it does not prescribe fixes as part of the first step.

The first profiling pass should answer:

- How much time is spent in the top-level frame update?
- How much of that time is simulation, snapshot preparation, rendering, and UI work?
- Which sections spike during late-wave gameplay?
- Which optimization idea should be investigated first based on measured cost?

## Guiding Principles

- Measure before optimizing.
- Keep profiling lightweight and easy to disable.
- Use stable timing labels so before/after comparisons are meaningful.
- Avoid changing simulation behavior while adding instrumentation.
- Capture a baseline under a repeatable gameplay scenario before making performance fixes.

## Profiling Scope

### Frame Loop

Instrument `src/hub/runScreen.ts` around `RunScreen.update()` to measure:

- Full frame update time.
- `RunController.step()`.
- Snapshot decoration for structures, abilities, shot effects, and hover state.
- Renderer work.
- Status, toolbar, banner, and outcome UI work.

### Campaign Controller

Instrument `src/campaign/runController.ts` around `RunController.step()` to measure:

- Charge ticking and wave scheduling.
- Gremlin attachment and attack processing.
- Structure ticking.
- Ability ticking.
- Flow-bias setup.
- `World.step()`.
- Capstone, cleanup, and win/loss checks.

### Simulation World

Instrument `src/sim/world.ts` around `World.step()` and `createSnapshot()` to measure:

- Spatial hash rebuilds and density field updates.
- Archetype updates.
- Unit movement and integration.
- Exit removal and post-move spatial hash work.
- Damage events.
- Projectile updates.
- Dead-unit cleanup.
- Snapshot creation.

### Renderer

Instrument `src/render/createRenderer.ts` around each render pass to measure:

- Background/goo pass.
- Slime field pass.
- Vector field pass.
- Wall pass.
- Effects pass.
- Campaign overlay pass.
- Stage fitting.

## Proposed Profiling Utility

Add a small utility under `src/debug/` or `src/perf/` that supports:

- Named timing sections.
- Rolling averages.
- Max timing per label.
- Slow-frame logging.
- A single flag to enable or disable output.

Initial output can go to structured console logs or `console.table`. A simple first version is enough; the goal is to identify hotspots, not build a full profiler UI.

## Baseline Scenario

Use a repeatable gameplay scenario that represents the expensive path:

- Late-wave run.
- Roughly 25-40 active slimes.
- Multiple Pinprickers and Splash Cannons.
- Active projectiles and shot effects.
- Debug vector overlays off.
- Same level and similar structure placement between runs.

Record baseline numbers before making optimization changes.

## Expected Output

The first profiling pass should produce a short baseline summary with timings such as:

- `frame`
- `controller.step`
- `runScreen.snapshotDecorate`
- `renderer.render`
- `world.step`
- `world.snapshot`
- `render.slimeField`
- `render.wall`
- `dom.status`
- `dom.toolbar`

For slow frames, include the labels that contributed most to the spike.

## Later Investigation Backlog

These are not part of the profiling setup. They should be explored only after profiling is in place and we have baseline data.

- Gate hidden debug vector-field snapshots in `src/sim/world.ts`.
- Reduce repeated `SpatialHash.rebuild()` calls and allocation-heavy spatial queries in `src/sim/world.ts` and `src/sim/spatialHash.ts`.
- Fix or intentionally redesign goo rendering in `src/render/passes/backgroundGooPass.ts`.
- Profile and simplify `src/render/passes/slimeFieldPass.ts` and `src/render/filters/slimeThresholdFilter.ts`.
- Replace `pickDensestPoint()` quadratic targeting in `src/campaign/structures.ts`.
- Cache static wall/background render layers in `src/render/passes/wallPass.ts` and related passes.
- Throttle or diff per-frame DOM updates in `src/hub/runScreen.ts`.
- Avoid the extra `world.step(0, ...)` path on ability activation in `src/campaign/runController.ts`.

## Decision Point

After the baseline is captured, choose one optimization target based on measured frame cost and spike frequency. Each optimization should be followed by another profiling run using the same scenario.
