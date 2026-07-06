# Agent handoff — Opening screen + iMac exhibition (2026-07-06)

**Use this file** as the primary prompt when starting a new agent chat. Attach `@AGENTS.md` and this file. For physics on the main site, also attach `@docs/CHECKPOINT.md`.

**Prior chats synthesized:**
- Opening background art (blur, molecules, grain, pills, performance tuning)
- [iMac site script update](ed846e1e-42a4-48ab-b66c-8734a3e05214) — exhibition launcher, i5/8GB performance, user decisions

---

## Project context (short)

**עקבות** — Bezalel graduation project. Hebrew RTL exhibition site for a **21.5″ iMac @ 1920×1080**. Ceremonial threshold → spatial laboratory (`experience.html`).

| Page | Role |
|------|------|
| `opening.html` | Lightweight entry — title, subtitle, כניסה, **canvas background art only** |
| `experience.html` | Full Matter.js spatial lab (L1 + L3) |
| `index.html` | Redirect → `opening.html` |

**Exhibition launch:** double-click `Start Local Server.command` (or `Start Site.app`) → Chrome app window → `http://127.0.0.1:8080/opening.html`. See `EXHIBITION-START-HERE.txt`.

**Hardware constraint:** Exhibition iMac is **Intel Core i5, 8 GB RAM, integrated GPU**. Opening canvas blur + mouse repaints are the main GPU/CPU cost on this machine.

---

## What was built (opening background)

Module: `js/opening-background.js` (bundled into `js/opening-app.js` via `./build-opening.sh`).

### Visual intent
- **L1-style molecules** (tag-colored dots, sibling links, hull outlines) + **block pills** (dark capsules + glyph dot)
- **Fold-mirror symmetry** — one quadrant of unique placements × 4 mirror copies
- **Soft atmospheric look** — crisp geometry drawn offscreen, then **blurred** onto main canvas; light color wash + canvas grain on top
- **No visible sharp pixels** on screen — user wants blurred stains, not crisp shapes showing through

### Render pipeline (`blurSource: 'content'`)
1. Draw crisp L1 molecules + pills to **offscreen `_contentBuffer`**
2. Composite to main canvas with `ctx.filter = blur(contentBlurPx)` + `multiply`
3. Optional light atmosphere pass (`glowOverlay`, low `glowAlpha`)
4. Canvas grain (`grainAlpha`, multiply)
5. CSS film grain on `body.opening-page::before` is **disabled** (canvas grain only)

### Motion (user decisions from iMac chat)
| Feature | Status |
|---------|--------|
| **Dot jiggle** (`dotMotion`) | **OFF** — too heavy on i5 |
| **Mouse push** (`mouseFollow`) | **ON** — whole molecule clusters repel from cursor; sticky offset (no snap-back) |
| **Per-dot pointer repel** (`dotPointerRepel`) | **OFF** |
| Animation loop | Runs **only while pointer is over opening screen**; repaints throttled (`repaintThrottleMs: ~48`) |

### Colors
- Opening uses **static** `data/opening-palette.json` (76 tag hex colors + 24 sample tag combos) — **not** live Google Sheets / full CSV
- `js/opening-data.js` fetches palette only (~fast load)
- **Unique colors on opening:** each dot + pill gets a distinct tag color from a shuffled pool (`_takeOpeningColors`). Fold mirror still shows the same colors in 4 positions (by design)

### Removed from opening bundle
- Meso note grid behind title — **deleted** from opening code/CSS
- `build-opening.sh` no longer includes `meso-mock.js`, `meso-silhouette-cache.js`
- Bundle ~187 KB → **~63 KB**

### Experience page (`experience.html`)
- Shared `OpeningBackground` via `#site-background` but **`siteBackground.mode: 'grain'`** — grain/displacement only, **no decorative blobs** on L1/L3
- Context-aware config: `opening.background` overrides apply only on `.opening-screen__art`, not globally

---

## Current config snapshot (`CONFIG.opening.background`)

```javascript
background: {
    mode: 'full',
    moleculeStyle: 'l1',
    blurSource: 'content',      // offscreen crisp → blur composite
    glowOverlay: true,
    blurScale: 0.028,
    contentBlurPx: 3,           // main sharpness knob (lower = sharper)
    glowAlpha: 0.07,
    blobCount: 10,              // unique quadrant molecules (×4 mirror)
    pillCount: 6,               // unique quadrant pills (×4 mirror)
    maxDpr: 1,
    repaintThrottleMs: 48,
    dotMotion: false,
    mouseFollow: true,
    grainAlpha: 16,
    grainSpread: 36,
    grainTilePx: 48
}
```

`applyPresentationProfile()` further caps `blobCount` ≤ 8, `pillCount` ≤ 4 on exhibition/presentation mode.

**Recent blur tuning (dev Mac):** user iteratively reduced blur from ~24px → 17 → 12 → 7 → 4 → current **3px**. If iMac copy is stale, re-copy whole folder.

---

## iMac exhibition launcher (`Start Local Server.command`)

Updated for split-page flow:

- **File checks** before start: `opening.html`, `experience.html`, `js/opening-app.js`, `js/app.js`, `data/main.csv`, `data/tags.csv`, **`data/opening-palette.json`**, Matter.js, etc.
- Health check hits `/opening.html` (not `/`)
- Opens **Chrome app window** (`--app=`) when available
- Kills stale python/ruby servers on ports 8080–8120
- `EXHIBITION-START-HERE.txt` updated for operators

**USB copy checklist:** entire `my-website` folder including `data/opening-palette.json` and rebuilt `js/opening-app.js`.

---

## Key files

| File | Role |
|------|------|
| `js/opening-background.js` | Canvas blobs, blur pipeline, mouse, grain |
| `js/opening-screen.js` | Opening UI, mount background, navigate to `experience.html` |
| `js/opening-data.js` | Loads `data/opening-palette.json` |
| `js/opening-bootstrap.js` | DOMContentLoaded boot |
| `js/config.js` | `CONFIG.opening`, `CONFIG.siteBackground` |
| `data/opening-palette.json` | Static tag colors for opening art |
| `styles.css` | `#opening-screen`, `.opening-screen__art`, opening-page grain |
| `build-opening.sh` | Rebuild `opening-app.js` + cache-bust `opening.html` |
| `build-js.sh` | Rebuild `app.js` (includes `opening-background.js` for experience grain) |

---

## User preferences (do not undo without asking)

1. **Keep** fold-mirror layout
2. **Keep** soft blur/glow aesthetic (but tune `contentBlurPx` / `glowAlpha` for performance + look)
3. **Keep** mouse push on molecules; **no** ambient dot jiggle
4. **Keep** decorative molecules + pills (not plain background)
5. **Unique tag colors** on opening — no color reused across dots/pills
6. **No** meso grid on opening
7. Exhibition iMac must stay usable — prefer perf wins that preserve look (throttle, lower DPR, fewer blobs) over removing art entirely

---

## Open / likely next tasks

- [ ] **Verify on real iMac** after USB copy — mouse push + blur at `contentBlurPx: 3` may still be heavy; user may want sharper (lower blur) or lighter repaints
- [ ] **Main site L1 slowness** on iMac was investigated but not fully addressed — animated SVG grain, hull outlines every frame, Matter.js at ~28fps (see iMac chat summary). User may ask to cut features there separately
- [ ] **Regenerate `opening-palette.json`** if tag dictionary changes (script in iMac chat used `tags.csv` + `main.csv` samples)
- [ ] Docs: `docs/external-agent-brief.md` still says opening is "planned" — may need sync
- [ ] Commit/push when user requests

---

## Build & verify

```bash
./build-opening.sh    # after editing opening-*.js or opening-background.js
./build-js.sh         # if opening-background.js changed (shared with experience)
```

**Dev URLs:**
- Opening: `http://127.0.0.1:8080/opening.html`
- Skip opening: `opening.html?skipOpening=1`
- Experience direct: `experience.html`

**Playwright check (optional):**
```javascript
// blur pipeline active?
OpeningBackground._blurSource(OpeningBackground._blobCfg())
CONFIG.opening.background.contentBlurPx
OpeningBackground._contentBuffer != null
```

---

## Regression guards

- Do **not** merge `opening.background` into global `siteBackground` — caused blobs on L1/L3 before
- Do **not** break `centerViewport` / scroll clamp / physics baseline — see `docs/CHECKPOINT.md`
- Hebrew UI strings stay Hebrew; agent replies in English
- Only commit when user explicitly asks

---

## Suggested first message to new agent

> I'm continuing work on the עקבות opening screen and iMac exhibition build. Read `@docs/work/2026-07-06-opening-imac-handoff.md` and `@AGENTS.md`. Current focus: [describe your task]. The opening canvas uses `blurSource: 'content'` with `contentBlurPx: 3`, mouse push on, dot jiggle off, static `opening-palette.json`. Exhibition hardware is Intel i5 / 8GB — keep performance in mind.
