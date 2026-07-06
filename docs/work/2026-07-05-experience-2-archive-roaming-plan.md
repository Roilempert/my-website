# Experience 2 — archive roaming planning session

**Date:** 2026-07-05

**Status:** open

---

## What I want

Plan **Experience 2 — Archive roaming**: a second, complementary way to snoop through the same note archive. Brainstorm navigation metaphors, interaction model, and relation to Experience 1. Produce a design + architecture plan (not code yet unless I ask).

---

## Context

Attach to the agent:

```
@AGENTS.md
@docs/architecture/experience-model.md
@docs/visual-language.md
@docs/CHECKPOINT.md
@js/config.js
@js/depth-v2.js
```

---

## Relevant code files

```
js/config.js
js/app-state.js
js/render-engine.js
js/warehouse-core.js
js/spatial-navigation.js
js/depth-v2.js
js/micro-mock.js
styles.css
```

---

## Constraints

- **Plan mode first** — structured plan and concept options; no implementation until I approve.
- Experience 2 must feel **different from Experience 1**, not a reskin.
- Same live data pipeline (Google Sheets / CSV) — same notes, tags, authors, typology.
- Ceremonial + nosy tone; slick exhibition craft on 21.5″ iMac.
- Do not break Experience 1 — Exp 2 is a parallel path after the opening screen.
- Agent communication **English**; site UI **Hebrew**.

---

## Verification

1. Plan proposes at least **two distinct navigation metaphors** with trade-offs.
2. Plan explains how Exp 2 filtering/roaming differs from blocks, orbits, and L1/L3 zoom in Exp 1.
3. Plan covers entry from opening screen, exit/back, and shared vs separate chrome.
4. Plan identifies what can reuse existing modules vs what needs new systems.

---

## Agent prompt

**Language:** English.

**Copy from here**

────────────

# Experience 2 — archive roaming (plan the second path)

@AGENTS.md
@docs/architecture/experience-model.md
@docs/visual-language.md

## Site purpose (read this first)

**עקבות** is a **laboratory** for exploring human use of **mobile notes**. Visitors investigate, explore, and learn by expressing **nosiness** — snooping through a personal note archive via unconventional filtering and digital roaming.

The frame is **ceremonial**: seeing into the human mind through its words. The product must feel **slick, fun, and well designed**, not like a cold institutional database.

## Three-part product architecture

| Part | Status | What it is |
|------|--------|------------|
| **Opening screen** | planned | Ceremonial threshold; silhouette art; choose a path |
| **Experience 1 — Spatial laboratory** | **active (built)** | Physics dots (L1), full notes grid (L3), blocks, warehouse, capture, inspector |
| **Experience 2 — Archive roaming** | planned *(your focus)* | A **different** way to roam the same archive |

After the opening screen, the visitor picks **one of two complementary experiences**. They share the same note dataset but should feel like **different instruments for snooping**.

## What Experience 1 already does (do not duplicate)

Experience 1 is the **spatial laboratory**:

- **L1 macro** — Matter.js physics, tag dots, molecules, hulls, edge scroll, minimap
- **L3 micro** — scrollable grid of full readable notes (`MicroMock`, `.micro-grid-column`)
- **Blocks & warehouse** — drag tags/typology blocks to the surface; notes capture, orbit, stretch
- **Two modes inside Exp 1:** roaming (curiosity-driven wandering) vs focus (blocks + capture + zoom)
- **Depth:** only **L1 ↔ L3** (`activeLevels: [1, 3]`). L2 meso silhouettes removed from navigation; kept for opening-screen art only.

Experience 1 answers: *“What if notes were particles in a field you could filter with physical tools?”*

## What Experience 2 should answer

Experience 2 should answer a **different question** about the same archive — for example:

- *“What if you browsed traces like a flaneur through someone’s phone?”*
- *“What if notes appeared as a stream, index, or timeline of curiosity?”*
- *“What if filtering felt like eavesdropping rather than laboratory experiment?”*

You should propose the question Exp 2 owns, then design toward it.

## Your task

**Plan** Experience 2 — brainstorm and recommend; do not implement until I approve.

### Explore and compare (at least 2 directions)

For each direction, describe:

- **Navigation metaphor** — e.g. vertical stream, typology lanes, author rooms, chronological tape, search-less wandering, card deck, etc.
- **Filtering / snooping mechanic** — how the visitor narrows without Exp 1 blocks (or with a new toolset)
- **Presentation layer** — single layer vs shallow zoom; readable notes vs abstract previews
- **Ceremonial fit** — how nosiness and privacy respect show up in UI
- **Exhibition viability** — performance, discoverability on a kiosk iMac, no keyboard assumption

### Address these open questions (from experience-model.md)

1. Primary navigation metaphor?
2. How filtering differs from blocks/tags in Experience 1?
3. Single presentation layer or shared L3 grid?
4. Entry/exit — return to opening only, or cross-link from Exp 1?
5. Same ceremonial “rules of looking” or a different room in the laboratory?

### Deliver in your plan

- **Recommended concept** (one primary direction + one fallback)
- **User journey** — opening → Exp 2 → read note → back
- **UI sketch** — grid placement, Hebrew labels (proposed), relation to 24×12 shell
- **Data reuse** — `AppState.items`, tags, typology, authors; what new indices or views are needed
- **Technical architecture** — new module names, routing flag, coexistence with `#app` / Experience 1 boot
- **Differentiation table** — Exp 1 vs Exp 2 side by side (metaphor, tools, motion, tone)
- **Phased build** — prototype → exhibition-ready
- **What not to build** — explicit non-goals

### Constraints

- Same data pipeline; no new backend required for v1.
- Do not break Experience 1 or physics stability (`docs/CHECKPOINT.md` if touching shared nav).
- Hebrew UI; English docs/code comments.
- Static site stack only (`index.html`, `styles.css`, `js/*.js`, `./build-js.sh`).

### Success criteria

- I can choose a direction and start a build session with a clear spec.
- Exp 2 feels **meaningfully different** from dragging blocks on a physics canvas.
- Plan respects the laboratory / nosiness / ceremonial product goal.

### Out of scope for this session

- Implementing the opening screen (separate agent/session).
- Removing legacy L2 meso code.
- Changing Experience 1 behavior unless required for a shared entry router.

────────────

**End**

---

## Notes / follow-up

(filled in after work)
