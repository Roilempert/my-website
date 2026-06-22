# Depth architecture — legacy engine

> **Status:** frozen when `depthEngine: 'v2'`.  
> Reference before returning to legacy or for comparison.

**Stability:** before physics/navigation changes — [`../CHECKPOINT.md`](../CHECKPOINT.md).

---

## Glossary

| Term | Definition |
|---|---|
| **L1 — macro** | Dots, physics, blocks on the surface |
| **L2 — meso** | Typographic silhouettes |
| **L3 — micro** | Full notes |
| **Catalog layout** | Position of **all** notes at L2/L3 — aesthetic arrangement |
| **Work lens** | Highlight by blocks/tags from L1 |
| **Legacy grid** | Original CSS grid layout (`400vw` / 10 columns) |

---

## Principle: catalog state + three views

```
ActionWarehouse + PhysicsEngine
         ↓
    CatalogState
    ├─ catalogLayout
    ├─ workspaceLens
    └─ blockAnchors
         ↓
  L1 (physics) | L2 (silhouette) | L3 (note)
```

**Rule:** L1 updates the work lens; catalog layout shows all notes.

---

## Two layout modes (L2/L3)

| Mode | `layoutMode` | Description |
|---|---|---|
| **Catalog** | `catalog` | Absolute layout — `catalog-layout-engine` |
| **Legacy** | `legacy-grid` | Original CSS grid |

---

## Smooth transition — three stages

`DepthTransitionOrchestrator`:

1. **Scroll** — camera to target
2. **Transition** — animation (fade, reveal, crossfade)
3. **Reveal** — layer + data

---

## Files

| File | Role |
|---|---|
| `js/catalog-state.js` | catalog state snapshot |
| `js/catalog-layout-engine.js` | catalog + legacy layout |
| `js/depth-transition-orchestrator.js` | 3-stage transition |
| `js/macro-meso-bridge.js` | L1↔L2 |
| `js/depth-controller.js` | zoom state machine |
| `js/spatial-navigation.js` | L2/L3 edge scroll |

---

## Success criteria (legacy)

1. Stable macro with 4–7 blocks (CHECKPOINT)
2. L1→L2: smooth transition; all silhouettes in catalog layout
3. L2/L3 edge scroll reveals notes outside the work area
4. Click block → L2 in its region
5. `layoutMode: 'legacy-grid'` restores original grid
