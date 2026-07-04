# עקבות | Alternative Index

## Project goal

A spatial research platform that treats personal notes from mobile phones as material for study — how people interact, what they feel, and what they think, as captured in short written traces. The site turns a live note archive into an explorable field: visitors can wander without a fixed path or deliberately study specific topics through the interface.

The experience should feel **slick, fun, and well designed** — polished interaction and visual craft, not a dry database or institutional archive.

## What I want to achieve

- **Live data pipeline:** A stable system that loads note data (Google Sheets with local CSV fallback) and maps each row to an object on the canvas.
- **Two modes of use:**
  - **Discovery** — aimless roaming across a deep scroll/zoom space; notes surface through motion, proximity, and curiosity.
  - **Study** — intentional focus on topics via blocks, tags, capture, and depth levels (macro → meso → micro).
- **Deep display space:** Multi-directional navigation across three zoom levels for exploring note particles.
- **Data-driven physics:** Stable object behavior, clustering, and capture driven by each note's data (tags, layout), with precise colliders and no clipping.
- **Typographic meso:** Medium zoom shows **typographic silhouettes** — abstract structure from title/body layout, not full readable notes. *(Interim: gradient mock at L2 until `SilhouetteEngine` is wired in V2 — see Meso layer below.)*
- **Optimization:** High, stable client-side performance for exhibition hardware and large note counts.

## Context

Bezalel visual communication graduation project, year 4. Built for **frontal exhibition display** on a **21.5″ iMac** (primary presentation machine). Print and other offline media are **out of scope**.

**Exhibition hardware:** 21.5-inch screen — design and performance targets assume this viewport; launcher steps in [`EXHIBITION-START-HERE.txt`](EXHIBITION-START-HERE.txt).

## Design direction

| Layer | Direction |
|-------|-----------|
| **Product UI** | Slick, fun, well crafted — spatial, responsive, rewarding to move through |
| **Content** | Hebrew personal notes from phones; tags as study categories |
| **Agent/docs tone** | Clear, professional, analytical (English) — see `.cursor/rules/english-communication.mdc` |

Do not default to a cold clinical or faux-archival aesthetic unless a specific task calls for it.

## Layout reference

**Site shell grid:** **24 columns × 12 rows** — viewport-level proportions, padding, and UI anchors (`CONFIG.siteGrid`). See [`docs/architecture/site-grid.md`](docs/architecture/site-grid.md).

Canvas grids inside `#app` (macro physics, L2 meso, L3 micro) are separate and wider than the viewport; do not confuse them with the 24×12 shell.

## Technical stack

- Static site: `index.html`, `styles.css`, `js/app.js` (bundled from `js/*.js` via `build-js.sh`)
- **Site language:** Hebrew, RTL at the UI layer (content stays Hebrew).
- **Work language:** English for docs, agents, and code comments.
- Libraries: Matter.js (`vendor/matter.min.js` — bundled locally for offline/exhibition).
- **Docs:** [`docs/DOC-INDEX.md`](docs/DOC-INDEX.md) · **Visual language:** [`docs/visual-language.md`](docs/visual-language.md) · **Stability:** [`docs/CHECKPOINT.md`](docs/CHECKPOINT.md)
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
- Keep agent replies direct and analytical; no filler.
- When describing study themes in docs, use precise observational language — not generic self-help jargon.
- Practical modular JavaScript solutions; no unnecessary external dependencies.
- **Physics/navigation changes:** read [`docs/CHECKPOINT.md`](docs/CHECKPOINT.md) first.

## Work session (new topic)

No fixed task board. Per topic:

1. Copy `docs/work/session-template.md` to a dated file (e.g. `docs/work/2026-06-18-meso-transition.md`), or ask the agent to create one.
2. Fill in "What I want" and "Verification".
3. New agent chat — attach the session file + `@AGENTS.md`; for physics also `@docs/CHECKPOINT.md`.

Details: [`docs/DOC-INDEX.md`](docs/DOC-INDEX.md#work-sessions)

## Meso layer

**Target (exhibition):** Typographic **silhouettes** at L2 — measured from each note's title/body layout (`SilhouetteEngine`), abstract structure rather than readable text. Tag markers on the silhouette where relevant.

**Current build (interim):** V2 L2 still uses **MesoMock** (p5 gradient placeholders) while silhouette integration is pending. Do not treat the mock as the final meso aesthetic.

| Topic | Reference |
|-------|-----------|
| V2 grids, phases, mock vs silhouette | [`docs/architecture/depth-v2.md`](docs/architecture/depth-v2.md) |
| Silhouette measurement | `js/silhouette-engine.js` |
| Interim mock | `js/meso-mock.js`, `js/meso-gradient-p5.js` |
| Layout | `js/depth-v2.js` — separate L2/L3 canvas grids |
| Structure | `.note-stage` — silhouette + note, shared zoom (`--note-zoom`) |
| Zoom transitions | `DepthTransitionOrchestrator`, `MacroMesoBridge`, `CatalogState` |
