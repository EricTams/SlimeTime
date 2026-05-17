# Slime Simulation — Technical Design

## Concept

A maze-based unit simulation where many slimes flow through the environment driven by vector fields and density-aware crowd behavior. Slimes of varying shapes and sizes can merge visually, push against each other locally, and leave persistent goo behind when killed. Weapons trace against individual units for hit detection and AoE effects.

## Architecture Overview

The simulation is split cleanly between CPU and GPU:

- **CPU** owns the simulation: unit positions, movement, density, spatial hashing, hit detection, and game logic.
- **GPU** owns rendering: all visuals are produced by a multi-pass shader pipeline.

This split keeps the simulation easy to debug and iterate, while putting visual ambition entirely in shader code.

## Simulation

### Movement Model

Each unit's velocity per frame is a weighted combination of three forces:

1. **Flow field** — a precomputed vector field over the maze grid that points toward goal tiles. Drives the "where I want to go" intent. Generated once via BFS/Dijkstra flood from goal tiles; regenerated only when the maze changes.
2. **Density gradient** — units bias their movement away from high-density cells toward lower-density neighbors. Creates emergent "squeeze out of crowds" behavior.
3. **Local separation** — soft repulsion from nearby units to prevent excessive overlap. Units have soft radii rather than hard collision, so they can squish slightly under pressure.

Final velocity is a tunable weighted sum of these three components.

### Density Field

A grid the same resolution as the flow field, recomputed each frame:

- Each unit contributes to its current cell's density count.
- A single smoothing pass averages each cell with its neighbors to remove gradient noise.
- The field is **double-buffered** — all units read from the previous frame's snapshot, then this frame's values are written for next frame. Eliminates order-dependent behavior.

The density field influences movement in two ways:

- **Slow-down into crowded cells:** velocity into a target cell is scaled by `1 / (1 + k * density)`. Empty cells = full speed. Packed cells = crawl. Naturally produces queueing at choke points.
- **Boost out of crowded cells:** velocity bias toward lower-density neighbors, computed from the density gradient.

A minimum speed floor (~10% of normal) prevents full deadlocks. A tiny random jitter on push forces breaks symmetry when opposing crowds meet head-on.

### Spatial Hash

A dictionary mapping `(cellX, cellY)` to lists of units in that cell. Rebuilt each frame by clearing and re-inserting all units. Cell size is approximately 2× unit radius.

Used for:

- **Local separation:** each unit only checks units in its own cell and the 8 neighbors (~5-20 units instead of all N).
- **AoE queries:** walk cells overlapping the query circle, distance-check units inside.
- **Raycasts:** walk cells along the ray using DDA traversal, check units in each cell until hit or out of range.

All gameplay queries (hit detection, AoE damage, weapon traces) run against the spatial hash on the CPU. Exact answers, mutable per-unit state, straightforward debugging.

### Walls

Walls live as a grid that the simulation reads when integrating positions — units are clamped against wall tiles so they cannot enter them. The wall grid is data that the sim cares about; the visual rendering of walls is handled separately in the render pipeline.

## Rendering Pipeline

Four passes, drawn in order:

### Pass 1 — Background and Goo

A persistent render texture acting as the floor layer.

- When a slime dies, its position and color are splatted additively into this texture.
- The texture ping-pongs each frame, optionally with slight fade or directional smearing for an oozing feel.
- This layer is both aesthetic (the battlefield gets progressively gross) and informational (players can read where combat has been heaviest).

### Pass 2 — Slime Field

The visual showpiece. Live slimes are rendered as a unified metaball field:

- Each slime contributes a soft radial falloff to an offscreen "field" texture via additive blending. One instanced draw call covers all slimes.
- Per-instance data per slime: position, radius, shape parameters (wobble frequency, asymmetry, elongation), color tint, animation phase offset.
- A full-screen pass thresholds the field texture: pixels above the threshold become slime body, pixels near the threshold edge become outline, pixels below become transparent.
- Smooth-min (`smin`) blending causes overlapping slimes to merge organically regardless of their individual shapes and sizes.
- Color blending at seams uses a weighted blend based on contributing slimes.

A second per-unit pass on top of the body layer adds detail that should stay distinct per slime: eyes that track movement direction, highlights, hit-flash from a "last damaged" timestamp.

Visual variation across slimes:

- Each slime has a random animation phase offset so wobbles don't sync.
- Subtle per-unit hue/saturation/brightness variation (~±10%) makes a crowd read as creatures rather than clones.
- Squish amount is driven by the density field — slimes in packed areas visibly flatten.
- Stretch along the intent vector when moving fast.

The field texture can run at half resolution to quarter the cost of the threshold pass; the detail layer stays at full resolution for crispness.

### Pass 3 — Walls

Walls are drawn on top of the slime field. This means:

- No wall masking is needed in the slime shader.
- Slimes whose wobble extends slightly past a wall edge are cleanly truncated, producing a "squished against the wall" look for free.
- The slime field shader stays simpler.

The simulation still respects walls independently (units don't move into wall tiles), so gameplay correctness is unaffected by purely visual overlap.

### Pass 4 — Weapons, Projectiles, Effects

Drawn last, on top of everything. Sharp, snappy, high-contrast — the readability of effects benefits from sitting cleanly above the squishy slime layer below.

This pass may later split into "ground effects" (drawn before walls, e.g. death splatters that sit on the floor) and "air effects" (drawn after walls, e.g. projectiles, explosion flashes). Not needed for the initial build.

## Data Flow Per Frame

1. Clear and rebuild spatial hash from current unit positions.
2. Read previous frame's density field; compute new density field from current positions; smooth it.
3. For each unit: compute desired velocity from flow field + density gradient + local separation (using spatial hash for neighbor lookup).
4. Integrate positions, clamping against wall tiles.
5. Resolve gameplay queries (weapon traces, AoE damage) against the spatial hash; apply damage; mark dead units.
6. For each dead unit: splat goo into the background texture; remove from sim.
7. Upload unit data (positions, sizes, shapes, colors, intent vectors, hit-flash timers) to GPU.
8. Render four passes in order: background+goo → slime field → walls → effects.

## Tech Stack

- **Rendering:** WebGL via a thin library (PixiJS or regl) for instanced sprites, render textures, and full-screen shader passes. Custom GLSL for the slime field and floor shaders.
- **Simulation:** plain JavaScript on the CPU.
- **Data transfer:** per-unit attributes packed into instanced buffers or data textures, uploaded once per frame.

## Open Decisions (for later)

- Exact color-blending rule when slimes of different colors merge at a seam.
- Whether goo evaporates, persists, or feeds back into gameplay (e.g., movement modifiers).
- Whether to ever migrate simulation to the GPU; not needed for the prototype.
