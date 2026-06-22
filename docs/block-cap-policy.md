# Block cap policy

**Decision date:** 20 June 2026  
**Task:** 1.2

---

## Decision

**Hard cap — five capture blocks on the surface.**

A sixth block (tag or connector) does not leave the warehouse for the surface — the warehouse is marked full and drag is blocked.

---

## Deferred

**Opening a fifth block with kinematic mode** — code exists (`isKinematicCaptureMode`, `applyKinematicCaptureFollow`) and is verified in CHECKPOINT for 6+ blocks, but is not exposed in the UI for the exhibition build.

---

## Rationale

| Factor | Explanation |
|---|---|
| Stability | CHECKPOINT (17 June): smooth physics at 4–5 blocks — orbits, stretch, secondary grid |
| Exhibition | Five filters are enough for exploration; less visual load on the surface |
| Risk | Block 6 triggers kinematic transition + staged damping — UX change not needed now |
| Future | Raising the cap to 6 requires a single parameter change — see "Code implementation" |

---

## Behavior by block count

| Blocks | Behavior |
|---|---|
| 1–4 | Normal force physics |
| 5 | Gradual taper (`getHeavyWorkspaceTier` 0) — still forces |
| 6+ | Kinematic (`kinematicTierMin: 1`) — **not reachable** due to cap |

---

## Code implementation

```
CONFIG.warehouse.maxCaptureBlocks: 5
```

```
ActionWarehouse.isWarehouseCaptureFull()
ActionWarehouse.getMaxCaptureBlocks()
```

```
CONFIG.physics.crowdedBlock.kinematicTierMin: 1
```

```
ActionWarehouse.isKinematicCaptureMode()  // true from block 6 — relevant only if maxCaptureBlocks is raised
```

Placement block:

```
warehouse-core.js → startDrag / endDrag — isWarehouseCaptureFull()
warehouse-core.js → updateWarehouseCapacityUI() — is-capture-full class on warehouse
```

---

## Manual verification (cap at 5)

1. Place four tag/connector blocks — all move smoothly; warehouse open.
2. Place a fifth block — still OK; molecules pull.
3. Try dragging a sixth block from the warehouse — **does not leave**; warehouse gray (`is-capture-full`).
4. Return one block to the warehouse — sixth block drag **allowed again**.

---

## Future raise (not done)

To enable a fifth block with kinematic at 6:

```
maxCaptureBlocks: 6
```

No orbit engine rewrite needed — only cap change + visual verification at the boundary.
