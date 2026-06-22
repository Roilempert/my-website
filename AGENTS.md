# עקבות | Alternative Index

## Project goal

A speculative micro-archaeological catalog (from a 24th-century viewpoint) that archives, catalogs, and visually renders digital information remnants and human data (behavioral and personal) from the 21st century. The aim is to turn dry databases into an interactive spatial experience under a fully clinical, structured, archival aesthetic.

## What I want to achieve

- **Live data pipeline:** A stable system that pulls data in real time from CSV files (Google Sheets) and maps each row to a physical object on the canvas.
- **Deep display space:** A navigation interface with multi-directional scrolling across three zoom levels for exploring information particles.
- **Data-driven physics:** A stable physics engine where object behavior, gravity, and clustering are computed dynamically from each object's data variables, with precise collider bounds and no clipping.
- **Optimization:** High, stable client-side rendering performance despite a large object count.

## Context

Bezalel visual communication graduation project, year 4. Intended for frontal exhibition display and future print translation.

## Technical stack

- Static site: `index.html`, `styles.css`, `js/app.js` (bundled from `js/*.js` via `build-js.sh`)
- **Site language:** Hebrew, RTL at the UI layer (content stays Hebrew).
- **Work language:** English for docs, agents, and code comments.
- Libraries: Matter.js via CDN.
- **Docs:** [`docs/README.md`](docs/README.md) · **Work sessions:** [`docs/work/README.md`](docs/work/README.md) · **Stability:** [`docs/CHECKPOINT.md`](docs/CHECKPOINT.md)
- **Depth architecture (V2 active):** [`docs/architecture/depth-v2.md`](docs/architecture/depth-v2.md) · legacy: [`docs/architecture/depth-legacy.md`](docs/architecture/depth-legacy.md)

## Glossary

| Term | Definition | In code |
|---|---|---|
| **Note** | Base content unit from data (title, body, ID, tags). | `item` / `.note-wrapper` |
| **Tag** | Category with name and color from the sheet tag dictionary. | `tagColorsMap` |
| **Dot** | Visual for one tag inside a note; the small physics body in space. | `.layer-dot` / `bodiesData` |
| **Silhouette** | Meso view: SVG path from row rectangles — width × height from `.note-title` / `.note-body` layout. | `.meso-silhouette__shape` |
| **Meso frame** | Shared geometry anchor for silhouette and note inside `.note-stage`. | `syncMicroFrame` / `--meso-frame-w` |
| **Tag marker** | Coarse colored circle on the silhouette; static. | `.meso-tag-dot` |
| **Molecule** | Note in macro mode: its dot cluster plus sibling links. | — |
| **Link / line** | Thin line between sibling dots; also a physics spring. Drawn on proximity, or always while stretched. | `siblingLinks` |
| **Hull** | Rounded outline around a molecule (convex hull). | `strokeHullOutline` |
| **Block** | Warehouse element placed on the surface; affects notes and their motion. | `ActionWarehouse.blocks` |
| **Frame** | Special block (rounded square) dragged to the surface; other blocks snap into its inner elliptical window. The frame does not capture notes itself — only the nested block. | `type: 'frame'` / `.action-block--frame` |
| **Window** | Elliptical slot inside a frame where another block lands. | `.frame-slot-window` |
| **Snap** | Locking a regular block into a spread frame window; inner block remains a capture anchor. | `snapBlockIntoFrame` / `nestedBlock` |
| **Warehouse** | Bottom portal storing all blocks; includes RESET. | `.action-warehouse` |
| **Slot** | Single block storage cell in the warehouse. | `.block-slot` |
| **Surface** | Canvas area where blocks are placed so notes orbit them — the cleared center in the work grid. | — |
| **Canvas** | Full workspace (wider than the viewport) where notes and blocks live. | `#app` |
| **Original grid** | Initial note layout when no blocks are on the surface. | `physicsTarget` |
| **Work grid** | Secondary layout: notes move to both sides; center clears for the surface. Active when a block leaves the warehouse. | `workspaceCenters` |
| **Capture** | Note whose tag matches a spread block and is pulled toward it. | `noteAnchors` |
| **Anchor** | Matching dot of a captured note on the ring, facing the block. | `overrideTarget` |
| **Ring** | Radial layout of captured notes around a block; radius grows with count. | `updateOrbits` |
| **Stretch** | Note captured by two or more blocks, pulled between them on springs. | `stretchedNotes` |
| **Edge scroll** | Canvas navigation by holding the pointer at screen edges; clamped to content bounds. | `SpatialNavigation` |
| **Depth levels** | Three wheel zoom levels: macro (dots + physics), meso (typographic silhouettes), micro (full notes). | `DepthController` |
| **Inspector** | Single-note focus on click (meso/micro). | `ArtifactInspector` |

## Working guidelines

- **Reply in English** for agent communication, plans, and technical summaries.
- **Do not translate site content** — Hebrew UI and note data stay as-is.
- Code and identifiers in English only; prefer English code comments.
- Communication rules: `.cursor/rules/english-communication.mdc`
- Keep a clinical, professional, analytical tone. No emojis or filler. Go straight to the technical solution.
- For content terminology when needed, prefer clinical terms (e.g. "behavioral ordering" over generic self-help jargon).
- Practical modular JavaScript solutions; no unnecessary external dependencies.

## Work session (new topic)

No fixed task board. Per topic:

1. Copy `docs/work/TEMPLATE.md` to a dated file (e.g. `docs/work/2026-06-18-meso-transition.md`), or ask the agent to create one.
2. Fill in "What I want" and "Verification".
3. New agent chat — attach the session file + `@AGENTS.md`; for physics also `@docs/CHECKPOINT.md`.

Details: [`docs/work/README.md`](docs/work/README.md)

## Meso layer (in development)

- **Goal:** Medium resolution — "cities" in the world-map metaphor: abstract typographic structure, not a full note.
- **Layout:** V2 — separate grids (see `docs/architecture/depth-v2.md`). legacy — catalog layout (`docs/architecture/depth-legacy.md`).
- **Structure:** `.note-stage` — silhouette + note, shared zoom (`--note-zoom`).
- **Silhouette:** `SilhouetteEngine` — measure from `.note-card` at micro grid size (`is-silhouette-micro-measure`); `syncMicroFrame` syncs frame.
- **Zoom transitions:** orchestrator (scroll → FX → reveal); click block/note from L1. Files: `MacroMesoBridge`, `DepthTransitionOrchestrator`, `CatalogState`, `CatalogLayoutEngine`.
