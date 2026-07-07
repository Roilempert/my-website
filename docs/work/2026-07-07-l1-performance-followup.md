# L1 macro — performance, dock, visual tuning — follow-up

**Date:** 2026-07-07

**Status:** open

**Prior context:** Agent session covered L1 dock restore (censored theme), site grain/displacement, dot render vs physics split, and an **L1 performance audit** — optimizations were **proposed but not implemented** (user to pick items).

**Depth naming (2026-07-07):** Docs use **L1** (macro) and **L2** (micro). Code still uses level index **`3`** for micro. References to "L3" in this file mean code level 3 = doc **L2**.

**Agent transcript:** `116734b4-3e39-4a53-9497-cfe8d3f5132d`

---

## Agent prompt (copy below)

**Language:** English for agent replies; Hebrew for site UI only.

**Attach:** `@AGENTS.md` · `@docs/CHECKPOINT.md` · `@docs/work/2026-07-07-l1-performance-followup.md`

────────────

**L1 macro — smooth movement & optional perf trims**

@AGENTS.md
@docs/CHECKPOINT.md
@docs/work/2026-07-07-l1-performance-followup.md

Goal: User reports **L1 movement is slow and laggy** — needs to be smoother. Read **L1 performance menu** in this file; implement only what the user selects. Do not change physics feel unless the user explicitly picks physics-related items.

Constraints:
- Edit `js/*.js` → run `./build-js.sh`. `config.js` loads separately — hard refresh after config-only edits.
- **Do not break** scroll clamp, secondary grid, stretch, hull collision at 4–7 blocks — see `docs/CHECKPOINT.md`.
- **Censored theme:** block tray on **L1**, word panel on **L3 only** — do not revert `populate()` to skip blocks site-wide.
- **Dot sizing:** physics baseline **10px**; visual hull uses `renderPadding` (3px) — do not scale physics colliders when enlarging dots.
- Opening page molecules are **independent** of L1 dot render — do not apply L1 `renderScale` to opening background.
- No git commit unless user asks.

Success criteria: depends on chosen perf items — see **Verification** below.

Out of scope unless user asks:
- Experience 2 / L3 censored word panel (separate follow-ups in `docs/work/2026-07-06-*`)
- Full docs sync (`visual-language.md`, `AGENTS.md`)
- Translating Hebrew UI or note content

────────────

---

## What I want (user)

1. **Primary:** L1 roaming / physics motion should feel **smooth**, not laggy (exhibition iMac 21.5″).
2. **Secondary (done unless regressed):** L1 dock shows all blocks; L3 word panel only when censored + L3.
3. **Visual (current baseline):** 10px dots, **tighter hull outline** (3px render padding vs 7px physics padding).

---

## Current state (2026-07-07)

### L1 dock + censored theme — fixed

**Bug:** `CONFIG.theme.mode: 'censored'` caused `ActionWarehouse.populate()` to skip creating tag/author/typology blocks entirely, while word panel only activates on L3 → **empty L1 dock**.

**Fix in `js/warehouse-core.js`:**
- `populate()` always creates blocks; calls `syncWordPanelMode(level)` after.
- `isWordPanelLevelActive()` — censored word panel **L3 only**.
- `resetAll()` — word-panel clear only on L3; L1 RESET returns blocks to dock.
- `reorderDockTrayByRelevance()` — respects L1 dock-reserve pills (`_dockReserveEl`), not only L3 empty slots.

**L1 vs L3 dock slot behavior:**
- **L1:** deployed block → reserve pill in tray (`markSlotDockReserve`).
- **L3:** deployed to depth bar → empty-slot ghost (`markSlotEmpty` when `currentLevel === 3`).

### L1 dot render vs physics — split

| Layer | Value | Config / code |
|-------|-------|----------------|
| Physics collider | 11px radius | `CONFIG.physics.body.radius` |
| DOM dot size | 10px | `--dot-size` |
| Hull **physics** padding | 7px | `CONFIG.outlines.padding` |
| Hull **visual** padding | 3px | `CONFIG.outlines.renderPadding` |
| Visual dot scale | 1× (original) | `CONFIG.outlines.renderScale: 1` |

**Code:** `physics-engine.js` — `getMacroDotRenderRadius()`, `getOutlineRenderPadding()` used in `collectNoteOutlineGroups()`, `drawNoteBackings()`, `drawNoteOutlines()`. CSS L1 `.layer-dot` uses `--dot-render-size` from `applyVisualScaleTokens()`.

**Rejected experiments (do not reapply without user ask):**
- 15× / 3× / 5× dot render without physics split — too drastic or wrong target (opening vs L1 confusion).
- Shrinking opening dots via `dotSizeScale` — user wanted L1 bigger, not opening smaller.

### Site background (L1/L3)

- `#site-background` + `#site-background-wash` with SVG `#site-grain-displace` on `#app`, warehouse, link canvas, etc.
- `CONFIG.siteBackground`: `mode: 'grain'`, `grainMode: 'displace'`, `grainDisplacementAnimate: true`, `showBlobs: false` on experience.
- Opening keeps blobs: `CONFIG.opening.background` overrides (`mode: 'full'`, `showBlobs: true`).

**Note:** `presentation.disableGrain: true` exists in config but is **not wired** — grain animation runs even when other presentation opts apply.

---

## L1 performance menu — NOT implemented (user picks)

Present these as options; implement only selected numbers.

### High impact — visual / GPU (physics unchanged)

| # | Change | Config / file | Tradeoff |
|---|--------|---------------|----------|
| **1** | Stop animated SVG grain | `siteBackground.grainDisplacementAnimate: false` or static grain | Less “live” texture; big compositor win |
| **1b** | Wire `presentation.disableGrain` | `applyPresentationProfile()` + `opening-background.js` | Exhibition profile could disable grain (currently dead flag) |
| **2** | Disable molecule backing fills | `outlines.backing: false` | Grid may show through molecules |
| **3** | Disable hull strokes | `outlines.mode: 'off'` or hover-only outlines | Loses molecule chrome |
| **4** | Hide sibling link lines | `warehouse.linkage.line.visible: false` | Less connected look |

### Medium — minimap (during pan)

| # | Change | Config | Tradeoff |
|---|--------|--------|----------|
| **5** | Less DOM sampling | `macroMapUseDomPositions: false`, `macroMapMaxDots: 300`, `macroDotStride: 2` | Minimap less precise |
| **6** | Simpler minimap with blocks | `macroFocusDetails: false`, `macroBlockMarkers: false` | Less detail when filtering |
| **7** | Throttle minimap on physics tick | `presentation.navMapPhysicsThrottleMs: 280` always-on, or force presentation mode | Minimap slightly less live |

### Physics / feel — change carefully (`CHECKPOINT.md`)

| # | Change | Config | Tradeoff |
|---|--------|--------|----------|
| **8** | Fewer hull collision passes | `hullCollision.shellPasses: 1` | Overlap risk at 4+ blocks |
| **9** | Lower orbit relax iterations | `orbit.moleculeRelaxIterations` down or `presentation.orbitRelaxScale` | Messier capture rings |
| **10** | Reduce mouse repulsion | `physics.mouse.repulsionStrength: 0` | Less cursor “push” |
| **11** | Lower wander | `forces.wanderStrength` or `presentation.wanderScale` | Flatter idle field |

### Structural / exhibition profile

| # | Change | Config | Tradeoff |
|---|--------|--------|----------|
| **12** | Force exhibition performance profile on iMac | `presentation.enabled: true` or `?presentation=1` | Fixed 28fps physics + display interp; may feel smoother overall |
| **13** | Hover hit-test only on mousemove | Remove `updateMoleculeHoverState()` from `syncLoop` | Minor hover edge cases |
| **14** | Fewer notes / smaller canvas | `siteGrid.macroCanvasScrollFactor` | Archive scope change |

### Suggested starter bundles (offer user)

- **Visual only, no physics:** 1 + 2  
- **Smoother pan:** 5 + 7  
- **Exhibition iMac default:** 12 + wire 1b (`disableGrain`)

---

## Key files

| File | Role |
|------|------|
| `js/config.js` | `siteBackground`, `presentation`, `outlines`, `navigationMap`, `physics` |
| `js/physics-engine.js` | `syncLoop`, canvas draws, hull render helpers, Matter tick |
| `js/opening-background.js` | Grain displacement init + animation |
| `js/warehouse-core.js` | Dock populate, L1/L3 slot reserve, censored word panel gating |
| `js/navigation-map.js` | L1 minimap DOM dot collection |
| `styles.css` | `has-site-grain-displace`, L1 `.layer-dot`, `--dot-render-size` |
| `experience.html` | `#site-grain-displace` SVG filter |
| `docs/CHECKPOINT.md` | Physics/navigation invariants |

---

## Verification

### Baseline (must not regress)

- [ ] `opening.html` — decorative molecules + color blobs; entry to experience
- [ ] L1 dock — all tag/author/typology blocks visible with `theme.mode: 'censored'`
- [ ] L1 drag/deploy — reserve pill stays in tray; L3 depth bar → empty ghost slot
- [ ] Dots **10px**; hull outline visibly tighter than before 7px render gap
- [ ] L3 censored word panel still works (see `2026-07-06-censored-l3-word-hover-followup.md`)

### After perf changes (per selected items)

- [ ] Pan/edge-scroll L1 — subjectively smoother; no scroll lock
- [ ] 4–7 blocks on surface — no stretch collapse / bank stickiness (`CHECKPOINT.md`)
- [ ] Minimap still usable if minimap options changed
- [ ] Grain/backing/outline changes match user’s visual tolerance

### Subjective smoothness check (exhibition)

- [ ] Idle roam — no stutter on dot motion
- [ ] Edge scroll while molecules drift — responsive
- [ ] One block deployed — capture motion acceptable
- [ ] DevTools Performance — note main-thread / GPU filter cost if grain toggled

---

## Build & serve

```bash
./build-js.sh          # after js/*.js edits
./build-opening.sh     # after opening-background.js etc. (opening bundle only)
python3 -m http.server 8765
# experience.html — hard refresh (Cmd+Shift+R)
# Optional: experience.html?presentation=1 to test exhibition profile
```

---

## Open questions

1. **Which perf menu items** does the user want? (They were listed; no selection yet.)
2. **Presentation mode on exhibition iMac** — currently `enabled: 'auto'` may be **off** on 21.5″ iMac (not localhost, often >8 GB RAM). Force `true` for show?
3. **Grain** — keep animated displacement, static displacement, or CSS-only grain on L1?
4. **Molecule backing** — required for grid cross hiding, or acceptable to remove for perf?
5. **Docs** — `visual-language.md` still documents 10px dots / 7px hull; should mention `renderPadding` visual split?

---

## Notes / follow-up

*(Next agent: record implemented perf items, config diffs, and verification results here.)*
