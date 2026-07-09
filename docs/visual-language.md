# Visual language — exhibition design legend

**Living document.** Update whenever colors, typography, spacing, grid marks, SVG chrome, or component styling changes. Agents: see `.cursor/rules/visual-language.mdc`.

**Status:** Spec locked (2026-07-03). **Code:** exhibition redesign implemented in `styles.css`, `js/config.js`, warehouse, navigation, inspector, L2 cards. **Deferred:** legacy meso `SilhouetteEngine` (MesoMock interim), physics tuning at `VISUAL_SCALE 1.0`.

**Depth naming:** Two navigable levels — **L1** (macro) and **L2** (micro). Code still uses level index `3` for micro (`view-level-3`, `activeLevels: [1, 3]`).

**Hardware target:** 21.5″ iMac, **1920×1080** fullscreen (`AGENTS.md`, `EXHIBITION-START-HERE.txt`).

**Design source:** [Figma PAGMAR Page 2](https://www.figma.com/design/8VKrVeaCkBqSlSlUABVH5E/PAGMAR) + user spec.

---

## Global rules

| Rule | Meaning |
|------|---------|
| `*` | **No Figma placeholder note text** in code — titles, bodies, blocks, tags from live sheet / CSV only |
| `**` | **No raw px in final CSS for spacing** — translate Figma px to `--space-*` tokens, or use site-grid units for layout |
| `***` | **`VISUAL_SCALE = 1.0`** in `js/config.js` — shell/chrome sizes at full spec on exhibition iMac, not 0.72 shrink |

---

## Color palette

CSS tokens in `:root` (`styles.css`):

| Token | Hex | Role |
|-------|-----|------|
| `--color-1` | `#FFFFFF` | Note card background, block text, tag fill |
| `--color-2` | `#898989` | L1 cross marks, L2 diagonal grid marks |
| `--color-3` | `#2D2D2D` | Action blocks, L2 grid dots, map objects, metadata panel, related-notes section title, SVG chrome |
| `--color-4` | `#000000` | Note text, tag border/text, metadata text, **1pt note borders** |
| `--color-5` | `#F2F0EE` | Canvas / note field background |
| `--color-6` | `#E6E0DA` | Warehouse + map panel bg, layer nav label boxes, clear control (`נקה לוח`) |

**Divider inset:** `--divider-inset: var(--space-20)` (20px) — gap between divider line ends and panel outer border (site-wide).

---

## Spacing

Design spacing may be specified in Figma `px`, usually in 5px jumps. Agents must translate those values to CSS spacing tokens before editing final CSS.

| Figma value | CSS token |
|-------------|-----------|
| 5px | `var(--space-5)` |
| 10px | `var(--space-10)` |
| 15px | `var(--space-15)` |
| 20px | `var(--space-20)` |
| 30px | `var(--space-30)` |
| 40px | `var(--space-40)` |
| 60px | `var(--space-60)` |

Use `--space-*` for component gaps, padding, insets, margins, and radii that come from Figma spacing. Use `--site-grid-*` or `calc(N * var(--site-grid-cell-w))` for shell layout tied to the 24×12 grid. Raw `px` remains acceptable for hairlines, borders, physics/canvas coordinates, SVG primitives, and tiny debug-only values.

---

## Typography

Four classes replace legacy `--type-*` / ratzif22 / NarkissTam body.

| Class | Font file | Size | Line | Other | Use |
|-------|-----------|------|------|-------|-----|
| `.main-t` | `NarkissYair-Bold-TRIAL.woff2` | fluid (about panel fits width) | `0.88` | no synthesis | About panel display title (`הדברים`); side padding `--space-40` |
| `.general-h` | `NarkissYair-Bold-TRIAL.woff2` | `calc(3.625rem + 10pt)` | `calc(3.5rem + 10pt)` | — | Layer labels; inspector ID title; related-notes section title |
| `.general-t` | `NarkissYair-BoldMono-TRIAL.woff2` | `1rem` | `1` | letter-spacing 5%, no synthesis | Warehouse, blocks, **active** layer label, note ID |
| `.general-d` | `NarkissYair-BoldMono-TRIAL.woff2` | `10pt` | `1` | letter-spacing 5%, no synthesis | Focus card footer metadata (author, date, typology) |
| `.note-h` | `TheBasics-Dots.woff2` | `20pt` (`1.6667rem` / 26.67px) | `0.9` | — | Note titles |
| `.note-t` | `FrankRuhl_Universal-Mono.woff2` | `1.125rem` | `1.2` | — | Note body |

**Retired for exhibition UI:** `ratzif22`, NarkissTam on note body, NarkissYair Regular for chrome.

---

## Layout — site shell grid

| Property | Value |
|----------|--------|
| Grid | **24 columns × 12 rows** (`CONFIG.siteGrid`) |
| Viewport padding | **20px** → `1.25rem` (all sides) |
| Grid marks | **Off** (`showGridMarks: false`). When enabled: every 4th row/column crossing (`crossStep: 4`) |

### Grid marks by depth level *(disabled — `CONFIG.siteGrid.showGridMarks: false`)*

| Level | Mark | Size | Color |
|-------|------|------|-------|
| L1 macro | Cross (+), behind macro molecule backing | 10×10 | color 2 |
| Legacy meso | Diagonal 45° | 10px length | color 2 |
| L2 micro | Dot | 5px | color 3 |

**Do not add:** L2 extra fringe glyph, focus connector from old Figma audit.

---

## Components

### Opening screen

Ceremonial onboarding threshold before Experience 1. Single **כניסה** continue button → spatial laboratory; Experience 2 via `.experience-switch` after entry.

| Property | Value |
|----------|--------|
| Layer | `#opening-screen`, fixed inset `--site-grid-padding`, `z-index: 11000` |
| Background | `--color-5` on shell; transparent art canvas; crisp L1 molecules fade in after title types |
| Load sequence | Blank bg → slow cursor blink → title types → molecules fade in (title/subtitle/button above art) |
| Text layer | Title/subtitle/button `z-index: 3`; mini-title **behind** art at `z-index: 1` |
| Silhouette art | L1-style molecules + pills (`OpeningBackground`), not meso grid; pills carry a **white row** mimicking a line of text next to the tag glyph |
| Title safe frame scope | **Initial placement only** — molecules never spawn over the title, but at runtime they may drift into the zone (cursor push is not undone) |
| Title | `.main-t` width-fit across **12 shell cols**, `--color-3`, `הדברים` — `titleCursorWaitMs` then slow typewriter; `CONFIG.opening.titleFit` |
| Subtitle | `.general-t`, `--color-3` — in content stack above button; hidden until `is-art-ready`, fades in **with the molecules** after title types |
| Mini title | `.opening-screen__mini-title` — random L1 hover phrases from `data/main.csv`; **behind** art; L1 word-fit (no ellipsis); jumps to a **random quarter** each rotation; revealed when mouse moves shapes |
| Content layout | **12 cols** centered; title + subtitle + button above art; mini-title is a separate background layer |
| Title caret | `.opening-screen__title-cursor` — zero-width span at the current typing boundary; baseline-anchored bar nudged ~0.5em left of the typed text; blinks during wait/typing; no reflow when typing ends |
| Title safe frame | Molecules avoid padded rect around `.opening-screen__title` (`CONFIG.opening.titleSafeFrame`; padX 18, padY 14) |
| Background | Molecules blurred + grained but saturated (`contentBlurPx: 3.5`, `grainAlpha: 14`, `blobBlendMode: source-over`, `blobLayerAlpha: 1`); GPU `saturate/contrast` on canvas |
| Continue | `.general-t` pill — fill `--color-3`, text `--color-1`, radius `--space-5`, pad `--space-10` / `--space-30` |
| Corners | `decoration-corner-tr.svg` × 4 (warehouse pattern) |
| Dev bypass | `?skipOpening=1` persists skip in `localStorage`; `?opening=1` resets. **Do not use skip on exhibition iMac.** |
| Warm boot | Palette fetch + first canvas paint; fonts/assets preload (`CONFIG.opening.preloadAssets`) |

Config: `CONFIG.opening` in `js/config.js`. Module: `js/opening-screen.js`.

### Show reel (exhibition attract)

Screensaver-style **scripted demo** when the exhibition iMac is idle (~90s). An automatic user roams L1, opens the warehouse, places one capture block, and peeks at L2. Any real visitor input stops the demo immediately.

| Property | Value |
|----------|--------|
| Body class | `body.is-show-reel` while demo runs |
| Ghost cursor | `#show-reel-cursor` — fixed circle, `z-index: 10500`, `--color-3` fill, `--color-1` ring, `pointer-events: none` |
| Hint | `.show-reel-hint` — optional `.general-t` label (`CONFIG.showReel.labels.hint`; empty = hidden) |
| Idle | `CONFIG.showReel.idleMs` — separate from `boot.idleRefreshMs` |
| Dev | `?showReel=1` enable, `?showReel=0` disable, `?showReel=autostart` skip idle |
| User exit | Any pointer move / click / key during demo → `opening.html` (`userExitTarget: 'opening'`) |

Config: `CONFIG.showReel` in `js/config.js`. Modules: `js/show-reel.js`, `js/show-reel-script.js`.

### About panel (bottom pull-up)

Tab at physical col 2; panel **12 shell cols** wide (cols 1–12). Pull-up sheet vertically centers on open.

| Region | Cols (physical) | Type | Content |
|--------|-----------------|------|---------|
| Logo | **1** (left, col 1) | Bezalel SVG, **−90°** | `assets/ui/Bezalel_academy_of_arts_and_design_new_logo.svg` |
| Details | **5** (cols 2–6) | `.general-t` (`1rem`) | Intro + credit rows |
| Body | **5.5** (right, cols 7–12 zone) | `.general-t` (`1rem`) | Project description — width 5.5 cols, end-aligned; details + logo unchanged |

**Details credit rows:** each row is a 5-subcol grid (RTL) — category **right 2 cols**, output **left 3 cols** (both **color 3**); category and output stay on one row.

**Title:** `.main-t` — width-fit minus `titleReducePt`, centered, letter-spacing boosted (`titleLetterSpacingBoost`) to span panel width.

### Warehouse (rows 11–12)

**Popup mode (default):** The full dock is **hidden during roaming**. A bottom-right square launcher (`.warehouse-launcher`, color **6**, **5px** radius, **2×** scale) opens the warehouse as a slide-up panel — **40px** from right/bottom; **`arrow.svg`** glyph (color **3**, tracks pointer) centered inside. Active/open: square fill **3**, arrow **1**. Accessible label **כלים** via `aria-label`. Minimap lives inside the popup only — full canvas height when closed. **No screen dimming** when open — transparent backdrop for click-outside dismiss only. **נקה לוח** and L2 deployed block pills stay visible above the launcher when active. Popup stays open while dragging blocks. Close: launcher toggle, Escape, or click outside the panel. Config: `CONFIG.warehouse.popup`.

**Expand-drag launcher (active):** `CONFIG.warehouse.popup.launcherStrip.expandDrag: true` — window-style resize from **bottom-center** of the warehouse row:
- **Default:** **86×46** outer shell (**color 6**), **5px** inset; inner pill (**color 6**); arrow (**color 3**)
- **Hover / grab / pressed:** outer (**color 6**); inner pill (**color 3**); arrow (**color 6**)
- **Hover:** arrow points **up** (collapsed / expanding)
- **Open (pinned):** arrow points **down**, **color 3** (including hover while open)
- **Open layout:** **12 cols × 3 rows** — row **1** handle band; rows **2–3** split **3 cols × 2 rows map** (left) + **9 cols blocks** (right, below handle band); blocks **20px** inset end + **10px** shift left; block tray top aligned to handle band (same as map)
- **Open:** drag straight **upward** on the vertical center axis until **12 cols × 3 rows**; handle + arrow travel **vertical only** (bottom-anchored `translateY`, no top/bottom anchor swap); handle rests **top-center** when pinned
- **Open:** drag the pill upward past the snap threshold, or **click** the arrow button while collapsed
- **While dragging:** map + blocks clip-reveal inside the growing panel; blocks muted until fully snapped
- **Close:** drag the pill back along the rail, **click** the arrow button, click outside, or Escape
- Full panel: minimap (**3 cols × 2 rows**, left) + tag blocks (**9 cols**, rows 2–3, below handle band) + launcher handle (**top-center** when open)

**Legacy launcher strip** (`expandDrag: false`): hover peek + click pin — see changelog.

**Blocks-only dock (dev layout):** Set all `CONFIG.warehouse.dock.panels` except the implicit block tray to `false` (`statistics`, `message`, `map`) — body gets `is-warehouse-dock-blocks-only`; only the block tray panel remains inside the shell. Map init is skipped when `panels.map: false`.

**Always-visible layout (legacy):** Set `CONFIG.warehouse.popup.enabled: false` to restore the fixed bottom dock.

- **Shell:** **2 rows** high, cols 1–24 inside padding; transparent outer wrapper with **4 corner decorations** (5×5, color 3, static).
- **Action dock** (20 cols): separate bg color 6 panel, radius 5px, **left side** of the shell.
  - Inner corner decorations: two marks on the dock right edge, paired with two marks on the map left edge around the dock/map gap
  - Message/statistics inset: top/right 10px → `var(--space-10)`; left/bottom 20px → `var(--space-20)`; system-message paragraph indent 20px → `var(--space-20)`
  - Statistics (4 cols): live rows for `בלוקים בשימוש`, `חיבורים פעילים`, and `פתקים מחוברים`; category labels stick to the right of the panel, numeric output sticks left on the same line; rows use normal text line-height spacing; values count up/down live until they reach the current output
  - **Message band** (0.5× row height, dock cols 5–20): split **1/4 + 3/4** (hover port / system message) by a vertical divider (`.warehouse-message-band__divider`, color 3 hairline, 5px top inset, extends to block-tray hairline)
    - **Hover port** (left, **¼** width, `.warehouse-hover-port`): reserved dock chrome; L1 note hover uses floating canvas label instead
    - **System message port** (right, **¾** width, `.warehouse-message-port`): static system copy `גררו להפעלה` (`CONFIG.warehouse.dock.messageText`) — `.general-t`, top-aligned, 20px paragraph indent; unaffected by note hover
  - Block panel: live blocks from sheet (`.general-t`), middle area next to map; content padding is 10px → `var(--space-10)`, including 10px below the separator hairline
- **Map** (4 cols): separate bg color 6 panel, radius 5px, **right side** of the shell; live minimap with compact details (objects color 3).
- **Dock/map gap:** one site-grid gap between the action dock panel and map panel.
- **Panel dividers:** color 3 hairlines with 5px → `var(--space-5)` endpoint breathing room.
  - between statistics and dock content: vertical divider ends 5px from dock top/bottom
  - between hover port and system message: vertical divider at message-band midpoint — 5px top inset, extends to the block-tray hairline (T join with horizontal divider)
  - above the block tray / under the message band: horizontal divider starts at the statistics divider and ends 5px from the dock right edge, creating a joined rotated T shape
- **Viewport marker:** compact, **fixed** at center of map frame — does **not** move; map **content** pans behind it, clipped to panel bounds. Marker proportions follow the raw browser viewport; L1 uses live macro dots; L2 uses micro grid glyph/card rects.
- **Remove:** English `ACTION REPOSITORY` label.

### Action blocks (dock panel)

All block/tag pills share dimensions site-wide; chrome varies by **context/state** (Figma Block Variations). Tag dot color always from sheet data. No shadows on pills.

| Variant | Context | Fill | Text | Border | Dot / right mark |
|---------|---------|------|------|--------|------------------|
| **Default** | Dock, deployed, depth bar | color 3 | color 1 | none | sheet tag color (tags only) |
| **Default hover** | Dock tag pills | color 3 | color 1 | **2px** sheet tag color | sheet tag color |
| **Remove hover** | Selected/deployed removable blocks | color 3 | color 1 | none | **×** — tag color (tags) or color 1 (author); **×** click returns to dock; L1 surface block **drag** repositions (molecules follow); L1 surface **tap** opens L3 filter view |
| **Attached to note** | L2 / inspector pills below cards | color 1 | color 4 | none | sheet tag color — not clickable |
| **Irrelevant / muted** | Capture-full + co-occurrence dock mute | color 2 | color 5 | none | color 5 filled circle (tags only) |
| **Empty slot** | Reserved dock ghost after deploy | color 6 | color 2 | **2px** color 2 | hollow ring color 2 |

| Property | Value |
|----------|--------|
| Horizontal gap | 10px → `var(--space-10)` |
| Vertical gap | 10px → `0.625rem` |
| Horizontal padding | 10px → `var(--space-10)` |
| Hover border width | `calc(var(--outline-weight) + 1pt)` → `var(--block-hover-border-width)`; empty slot stays `var(--outline-weight)` |
| Tag dot | 10px, color from sheet; CSS var `--block-tag-color` on tag blocks |
| Dot/text gap | 10px → `var(--space-10)` |

### Deployed block

- **10px** above dock top (`var(--space-10)`); clear **`נקה לוח`** left edge aligned with **message band** left (after statistics column) — same on L1/L2
- Clear: fill color 6 (= RESET)
- Block counter appears inside the live statistics panel

### L1 dock block click (macro)

- Tap a docked block (no drag): **muted ghost** clone (`is-macro-indication` — irrelevant/muted variant: fill color 2, text color 5, tag dot color 5) arcs from tray to the visible L1 canvas center; **tray slot keeps the real block in default dock chrome** during the animation; real block stays in tray until dragged
- Same arc easing as L2 click-deploy (`macroIndicationDuration` 720ms / shared arc lift)

### L1 molecule hover

- Hull outline **0.4pt** (`CONFIG.outlines.width`); on hover the hull **fills with color 6** (`--color-6`, `hoverFillMode: 'token'`; canvas layer behind DOM dots; `body.is-molecule-hover`)
- **Idle breathing:** whole-molecule visual drift (`CONFIG.physics.breathing`) — sine offset on draw positions only; physics bodies unchanged; quieter when captured or on bank grid
- **Title mode** (`moleculeHoverMode: 'title'` — current default): floating `.molecule-hover-title` pinned on hover start at fixed viewport coords; **10px** (`var(--space-10)`) outside the hull top corner on the horizontal axis (RTL `maxX` / LTR `minX`); vertical offset uses `--molecule-hover-shift-y` (**10px** down from the prior above-hull gap, so the label sits flush with the hull top); when **no blocks** are on the surface, vertically centered in the macro **inter-row corridor** between molecule rows (`.is-row-gap-y`, `translateY(-50% + shift)`); with blocks deployed, stays at the hull corner; does not track molecule motion after pin; **truncation rule** (no ellipsis): first title line only (body fallback) → phrase clip within **8 words** (prefer sentence `.!?…`, else clause `,;:—`) → pixel-fit to `.note-h` at `min(28rem, 42vw)` whole words only; `.note-h` scale, transparent background
- **Blocks / mixed modes** (optional): same floating label with attached-block pill row via `MicroMock.buildTagsRowHTML`; config: `moleculeHoverMode`, `moleculeHoverBlocksPercent`, `moleculeHoverBlocksPerRow`, `moleculeHoverBlocksSingleRowMax`
- Warehouse hover port (`.warehouse-hover-port`) remains in the message band but is unused for L1 hover
- Code path: `PhysicsEngine.updateMoleculeHoverState()`

### Layer navigation (right)

Single **destination toggle** — one button shows the *other* depth level (not the current one). On **L1** → blocks icon (go to L2); on **L2** → 2-dot molecule icon (go to L1). No spine marker in toggle mode.

| State | Box | Symbol shown |
|-------|-----|----------------|
| On L1 | color 3 fill, color 6 symbol, 10px pad, 5px radius | **L2** text blocks · **4.5rem** |
| On L2 | same | **L1** 6-dot molecule (`layer-nav-molecule-6.svg`) · **4.5rem** |

- **20px** from viewport right and top edges → `var(--space-20)` (`CONFIG.layerNavigation.rightInset`, `toggleTopInset`)
- Hover: label shifts left 20px (`var(--space-20)`)
- `CONFIG.layerNavigation.toggleMode: true` — legacy two-stack + spine marker when `false`

SVG assets: `layer-nav-molecule-2.svg`, `layer-nav-blocks.svg`, `layer-nav-molecule.svg` (3-dot, unused in toggle)

### Legacy meso silhouettes

- Interim MesoMock silhouettes have no outline; keep the gradient line silhouettes un-stroked. Not navigable — opening-screen art only.

### L2 note cards

| Property | Value |
|----------|--------|
| Column width | **6 site cols** (`contentColumns[3]`) — ~**4 cards** across viewport |
| Column gap | 40px → `2.5rem` |
| Min height | 6 site rows |
| Card bg / text | color 1 / color 4 |
| Border | none |
| Radius | 5px → `var(--space-5)` |
| Left padding | **100px** → `6.25rem` (protects vertical note ID lane) |
| Top padding | `0.75 × site-grid-gap + var(--space-5)` |
| Title / body gap | 10px → `var(--space-10)` |
| Note ID | **Color 5**; sticky only when card height **> min**; at min height: **centered**, fixed; taller: scrolls **with** card until ID top reaches **m**, then pins until **m** from bottom |
| Title / body | `.note-h` / `.note-t` |

**Text direction:** Default RTL (Hebrew). English-only notes auto-detect to LTR from title+body (Latin letters, no Hebrew/Arabic script). Optional sheet column `direction` (`ltr` / `rtl` / `en` / `he`) overrides auto-detect. LTR cards mirror the ID lane to the right (`6.25rem` right padding, ID at `var(--space-10)` from right). Tag/author pills stay RTL Hebrew.

### Legacy meso silhouettes (direction)

| Property | RTL (default) | LTR (English-only) |
|----------|---------------|---------------------|
| Frame alignment | `flex-end` / right | `flex-start` / left |
| Line rects | anchored right | anchored left |
| SVG clip rects | `x = viewW − width` | `x = 0` |

**Tags / authors (below card):** attached variant — fill color 1, text color 4, no border, not clickable. Same sizing as dock blocks.

### Focus popup (inspector, all levels)

- Backdrop: color 3 @ 20% opacity
- Note scales **6 cols → 8 cols** proportionally via `--focus-card-scale` (`8/6`); inspector width is measured from the clicked card (`sourceWidth × 8/6`), not the site token alone; card interior keeps L2 proportions; tag/author blocks stay grid pill size below the card
- **Panel scaler:** `transform: scale(var(--focus-card-scale))` with measured `margin-bottom` lift — same scale path as the flyer
- **Open motion:** the clicked L2 card DOM moves into a fixed `.artifact-inspector-flyer` shell (no HTML rebuild); top-left FLIP on the scaler from source rect → shell row 2; one element, one proportional scale path; shadow only after landing; source `.note-wrapper` hidden (`visibility: hidden` on wrapper + descendants). **L1 macro:** molecule click builds a synthetic L2 card (no visible grid card at macro); FLIP starts from molecule hull center at L2 width; tap on hull or dot via `openMacroNoteAt` (physics hit test + nav-surface tap)
- Popup scrollport spans the full viewport height; focused/related content can scroll to the top and bottom viewport edges
- Focused note starts at the beginning of shell row 2 when the popup opens
- **No separate metadata panel** — author, date (MM YYYY, `0000`/empty → `לא ידוע`), and typology (`מבנה`, Hebrew via `typologyLabels`) in a **single RTL row** at the bottom of the focus card (`.note-card__focus-footer.general-d`, **10pt**, no background band); category labels (`.note-card__focus-label`) **color 2**, values **color 3**
- **Focus note ID:** vertical lane text **color 2** (not background); sticky like L2 — JS sync inside scaled focus card (`NoteIdSticky`), CSS sticky elsewhere in inspector
- **Focus title + tags:** extra **20px** right padding (`padding-right: var(--space-20)`) on `.note-title` and `.micro-mock__tags` inside the focus card
- **Related notes (L1 macro origin only):** title **באותו נושא:** at regular text size (`general-t`); shown only when focus opened from L1 (`fromMacro`); one section per **2+ tag combination** of the focus note that exists on at least one other note; omit unused combinations and single-tag subsets; panel **color 6** fill, **5px** radius, **20px** padding, **40px** (`--space-40`) gap from focus note; suggestion cards rendered like the focus note (`focusScale`) — **one per row**, capped to focus-note width (8 cols) and centered; note ID **color 2** with **10px** left inset (`--note-id-inset`); **no** scroll-sticky ID animation (excluded from `NoteIdSticky`)
- **Censored theme:** grid cards stay redacted; **focus inspector is never censored** — full title, body, footer, and tag pills when opened (study-unlock gate still applies to open from grid)

---

## SVG assets

Export from Figma as **one grouped SVG per decoration** (not shape-by-shape). Save under `assets/ui/`.

**Naming:** `decoration-corner-{tl|tr|bl|br}.svg` for corner marks (orientation = how the path sits in the SVG viewBox). Reuse one file at multiple corners via CSS flip/rotate.

| File | Figma source | In code | Motion |
|------|--------------|---------|--------|
| `arrow.svg` | Warehouse launcher glyph | `.warehouse-launcher__glyph` | Static |
| `layer-nav-molecule.svg` | L1 macro layer nav symbol (3 dots) | `.site-navigation-layers__label-symbol[data-layer-symbol="1"]` | Static |
| `layer-nav-molecule-2.svg` | L1 molecule — 2-dot variant | asset only | Static |
| `layer-nav-molecule-6.svg` | L1 layer nav symbol (6-dot molecule) | toggle destination when on L2 | Static |
| `layer-nav-blocks.svg` | L2 micro layer nav symbol | `.site-navigation-layers__label-symbol[data-layer-symbol="3"]` | Static |
| `layer-nav-l1.svg` | L1 2-dot molecule (hull + dots) | Layer nav toggle destination symbol | Static |
| `site-icon.svg` | L1 2-dot molecule — extended hull (R 28.9 vs 23.9) | **Site favicon** (`rel="icon"` on all pages) | Static |
| `layer-nav-marker.svg` | `layer navigation final` (638:12) | `navigation-map.js` | Fixed curved skeleton; selection dot moves between marker cells |
| `decoration-corner-tr.svg` | One shell corner group (exported **top-right** orientation) | `.warehouse-shell` × 4 (mirror/rotate per corner) | Static |
| — | — | Map viewport marker | **Not SVG** — fixed DOM/canvas frame; map pans behind |

---

## Changelog

| Date | Change |
|------|--------|
| 2026-07-09 | Expand-drag block menu **4→3 rows** (`expandRows`); pinned block tray starts below handle band (matches map — launcher no longer covers top block row) |
| 2026-07-09 | Deployed surface blocks raised to `z-index: 896` while strip pinned / popup open — above `warehouse-popup-backdrop` (895) so they stay grabbable; strip guard in `startDrag` now applies only to blocks still docked in the tray |
| 2026-07-09 | L1 hover label: pixel-fit subtracts inline padding; never keeps an overflowing word (no mid-word CSS clip) |
| 2026-07-09 | L1 deployed blocks: drag to reposition on canvas (captured molecules follow); tap opens L3 filter — **×** only removes to dock |
| 2026-07-09 | L1 molecule hover label: **+10px** down (`--molecule-hover-shift-y` on `.molecule-hover-title`; hull-corner and inter-row corridor modes) |
| 2026-07-09 | About open on **L1/L3**: full-viewport blur via `backdrop-filter` on sheet backdrop (dock, layer nav, links, canvas — not `#app` only) |
| 2026-07-09 | About panel: details block **+10px** further right (`margin-left` 10→20px) |
| 2026-07-09 | About panel: details block **+20px** right (`margin-left` −10→+10); logo **+10px** right |
| 2026-07-09 | About panel: arrows→title gap **10→5px**; title→body gap **15→7.5px** (second −50% pass) |
| 2026-07-09 | About panel: arrows→title gap **20→10px**; title→body gap **30→15px** |
| 2026-07-09 | About panel: title uses **opening title fit** (char gaps, `opening-screen__title`); text + details **5 cols** each; backdrop blur/grain synced to `opening.background`; decorative **entry note** centered on panel bottom-right |
| 2026-07-08 | Related notes panel: title **באותו נושא:** at regular text size; suggestion cards enlarged to focus-note style (`focusScale`), **one per row** at focus width; ID **color 2**, **10px** left inset, sticky animation removed; **40px** gap from focus note |
| 2026-07-08 | Focus inspector: title + tags **20px** right padding; related notes **color 6** panel (5px radius, 20px pad); suggestions **L1 macro origin only**, **2+ tag combinations** only |
| 2026-07-08 | Expand-drag panel **12×4** — **3×2 map** + **9 col** blocks (row 2 under arrow); blocks **20px** end inset, **10px** left shift, scroll flush top |
| 2026-07-08 | L3 note card: bottom pad **20px**; title↔body and body↔details gaps **30px** (`--space-30`) |
| 2026-07-08 | Expand-drag panel **10×3** grid — **2 col** compact map (1 row) + **8 col** blocks from row 2; one handle row reserved at top |
| 2026-07-08 | L2 censored: bottom launcher disabled until word commit — outer **3pt** outline `--color-6` only (no fill), inner pill transparent, arrow `--color-6` |
| 2026-07-08 | L2 censored grid: metadata footer hidden on cards (focus inspector only); tag row **10px** gap from card |
| 2026-07-08 | L2 censored word cover: **scaleY** shrink from bottom (sink behind ledge); restore = reverse grow |
| 2026-07-08 | L2 solo words (no matches): probe line stretches out on hover/click and retracts — same hairline style as match links |
| 2026-07-08 | About open bg tuned to opening-scene feel: **more blur** (44px, plain `blur` — dropped displacement filter), **less grain** (overlay opacity 0.18, coarser 200px tile) |
| 2026-07-08 | About open: stronger background — blur **12→28px** (`--site-about-bg-blur`); added film-grain overlay on backdrop (`::after` feTurbulence, `overlay` blend, 0.55 opacity) |
| 2026-07-08 | About columns: logo **1** + details **6** + text **5** (was details 5 / text 5) |
| 2026-07-08 | About open: canvas **frozen** (`PhysicsEngine.aboutFrozen` pauses runner + `syncLoop`) + **blur/grain wash** on `#app` (`--site-about-bg-blur` 12px); logo **+5px** right; body **row break** after אותם.; title **−20pt** (auto letter-spacing widens); text width **−10px** (thinner left) |
| 2026-07-08 | About open: **tab top anchored to shell row 2 top** (`tabTopRowStart`; replaces `openRowStart`); project text **+10px** left (`margin-right`); panel metadata **all 4 corners 5px** radius |
| 2026-07-08 | About details block shifted **10px** toward logo (`margin-left: -var(--space-10)`) |
| 2026-07-08 | About logo **+20%** again (`0.75×` cell-w) |
| 2026-07-08 | About body **5 cols** wide (was 5.5); logo **+20%** (`0.624×` cell-w); metadata `overflow: visible` (no logo crop) |
| 2026-07-08 | About open: panel top at **shell row 3**; height **content-hugging** + **40px** bottom pad (no viewport fill); text alignment reverted (5.5 cols, end-aligned right) |
| 2026-07-08 | About open: panel top at **shell row 2**; **40px** bottom content pad; metadata **bottom-only 5px** radius; logo smaller (no crop); `.general-t` line-height **1.2rem** in panel; text left edge at shell **col 2** |
| 2026-07-08 | About body width **5.5 cols** (end-aligned); logo enlarged; title letter-spacing **+2%** (`titleLetterSpacingBoost` 1.581) |
| 2026-07-08 | About layout RTL: **text right** (cols 7–12), **details center** (2–6), **logo left** (1); categories **color 3**; intro line break after חזותית; body sentences merged (no gap) |
| 2026-07-08 | About layout: logo **physical left** (col 1); text cols 2–7; details cols 8–12; credit rows **5-subcol grid** (category right 2, output left 3, no wrap); credits **`.general-t`** (1rem) not `.general-d` |
| 2026-07-08 | About title: **20px** gap below scroll arrows; centered; **−20pt** from fit size + letter-spacing to span panel; logo scaled to 1-col; credits use focus footer classes (`.general-d`, `.note-card__focus-label` / `value`) |
| 2026-07-08 | About panel body: **1 col logo** (rotated −90°) + **6 col** `.general-t` body + **5 col** credits (intro + category/output rows); `CONFIG.about.intro` / `credits` |
| 2026-07-08 | L2 censored word hover: cover lifts like theatre curtain (`scaleY`, bottom origin); underline stretches inline-start→end on reveal |
| 2026-07-08 | L2 censored study: **click** word to commit (no hover dwell); layer-nav zoom-out + pinch zoom blocked until first word selected; word-match lines hairline like L1 block↔note links; tag/author pill row restored under grid cards |
| 2026-07-08 | L2 note ID → **color 5** (focus note ID stays color 2) |
| 2026-07-08 | L2 note ID + footer category labels → **color 2** (grid, inspector, censored grid) |
| 2026-07-08 | Focus note ID + footer category labels → **color 2** (was color 5) |
| 2026-07-08 | Focus footer category labels (`.note-card__focus-label`) → **color 5**; values stay color 3 |
| 2026-07-08 | Focus footer: restored `מבנה` typology metadata row (Hebrew label via `typologyLabels`); typology blocks remain removed |
| 2026-07-08 | **Removed typology blocks** — dock pills, L2 attached pills, pattern underline CSS, and all capture/filter/orbit logic for typology block type |
| 2026-07-08 | Focus footer: `.general-d` 10pt, no background; date empty/`0000` → `לא ידוע` |
| 2026-07-08 | Opening perf fix: blur moved off the **per-frame** path to a **GPU CSS filter** on the canvas (`contentBlurPx: 0`, canvas `filter: ... blur(3px)`) so ambient motion no longer triggers costly `ctx.filter` blur each frame; removed color-pool `console.warn` spam |
| 2026-07-08 | Opening polish v4: **larger molecules** (`radiusMin 0.06 / radiusMax 0.16`), wider scatter (`scatterSpread 0.64`); **ambient dot motion** on (`dotMotion: true`, `dotAmbientAmp 0.45`); caret nudged **left of typed text** (`translateX(calc(-50% - 0.5em))`); **subtitle fades in with molecules** at `is-art-ready` (hidden until title typed) |
| 2026-07-08 | Opening polish v3: more molecules (`blobCount: 36`); decorative pills gain a **white text row** (`pillTextRow*`); title safe frame is **placement-only** (no runtime repel — molecules may drift into it); stronger cursor push (`mouseHoverMaxShift: 0.045`, radius 1.45); title caret **baseline-anchored** (sits higher, aligned with letters) |
| 2026-07-08 | Opening polish v2: keep saturation but **blur + grain back** (`contentBlurPx: 3.5`, `grainAlpha: 14`, still `source-over`); mini-title jumps to a **random quarter** each rotation; title caret is **zero-width, aligned to typing position** (no end-of-type reflow) |
| 2026-07-08 | Opening polish: vivid crisp shapes (`source-over`, no blur); mini-title **behind** art (z-index 1); wider scatter; smaller title safe frame; L1-style word-fit (no ellipsis) |
| 2026-07-08 | Focus inspector: tag pills + footer metadata locked to single row (`flex-wrap: nowrap`) |
| 2026-07-08 | Focus inspector: removed metadata panel; author/date in color-5 card footer; focus ID lane color-5 fill |
| 2026-07-08 | Expand-drag launcher arrow points **down** when menu open (pinned); **up** when collapsed |
| 2026-07-08 | Expand-drag launcher colors locked — default outer **6** / pill **6** / arrow **3**; hover+grab outer **6** / pill **3** / arrow **6** |
| 2026-07-08 | Expand-drag launcher default/hover colors **flipped** — default outer **6** / inner **3** / arrow **6**; hover+grab outer **3** / inner **6** / arrow **3** |
| 2026-07-08 | Expand-drag launcher shell **86×46** with **5px** pad (`--space-5`); handle motion **vertical-only** via bottom anchor + `translateY` (no diagonal snap to `top: 0`) |
| 2026-07-08 | Expand-drag open: handle **top-center**; blocks tray below handle row; **row 2** reserves empty launcher-width slot at row start; default launcher colors outer **3** / inner **6** / arrow **3**, reversed on hover+grab |
| 2026-07-08 | Opening: blur restored; subtitle back in content stack; **mini title** rotates random L1 hover phrases; title safe frame kept |
| 2026-07-08 | Opening: title **safe frame** for molecule placement; subtitle **behind** art layer (revealed on blob move) |
| 2026-07-08 | Opening: crisp molecules (no blur/grain); subtitle **−10px**; title typewriter uses hidden char spans (stable row/letter-spacing) |
| 2026-07-08 | Opening: **12-col** title track; molecules restored (light blur + grain); entry button unblocks via art-ready + 12s fallback |
| 2026-07-08 | Opening: title **8 cols** width-fit (smaller max); subtitle tight + stable layout (reserved title height); heavier type cursor; **grain-only** bg (no blobs/blur) |
| 2026-07-08 | Opening screen: title **הדברים** `.main-t` width-fit (matches about panel); subtitle updated; no content panel box — full-bleed type on canvas |
| 2026-07-08 | Warehouse expand-drag: handle travels **vertical center axis only** (no horizontal drift); arrow fixed **up** in expand-drag mode |
| 2026-07-08 | Note ID sticky: rides with card until natural top crosses **m**, then pins; bottom clamp at **m** |
| 2026-07-08 | Note ID sticky bottom clamp: JS corridor (`rail` padding top/bottom **m**), scale-aware for focus transform |
| 2026-07-08 | Note ID sticky gated to tall cards only (`is-note-id-sticky-enabled`); min-height cards centered, no scroll follow |
| 2026-07-08 | Note ID lane: `white-space: nowrap` — single vertical column (no hyphen wrap into multiple columns) |
| 2026-07-08 | Note ID horizontal inset **10px → 20px** (`--note-id-inset` / `var(--space-20)`); RTL from left, LTR from right |
| 2026-07-08 | Note ID horizontal lane restored: card padding `--note-id-lane` + absolute rail at inset (sticky vertical unchanged) |
| 2026-07-08 | Note ID sticky lane (L2 + focus): `--note-id-sticky-inset`; `.note-id-rail`; CSS sticky on grid scroll; focus card JS sync (`NoteIdSticky`) inside scaled transform |
| 2026-07-08 | Warehouse expand-drag launcher: **bottom-center** on warehouse row; opens **symmetrically** (width from center, height upward); drag rail vertical; final panel still **9 cols × 3 rows** |
| 2026-07-07 | `site-icon.svg`: icon scaled to **0.9** within viewBox for favicon margin |
| 2026-07-07 | Site favicon: dedicated `site-icon.svg` (2-dot molecule, hull R +5 vs `layer-nav-l1.svg`) |
| 2026-07-07 | **Show reel** — exhibition attract mode: `#show-reel-cursor`, `body.is-show-reel`, optional `.show-reel-hint`; `CONFIG.showReel` |
| 2026-07-08 | About `.main-t` title: **grow-to-fill** panel width (RTL, right-aligned); bleeds full panel; max **400px** |
| 2026-07-08 | About `.main-t` title max size **136px → 180px** (`CONFIG.about.titleMaxPx`; still width-fit) |
| 2026-07-08 | About panel height: **content-measured** (headline + body + logo); capped by viewport when vertically centered; `openMaxPx` **960** |
| 2026-07-08 | About tab: **physical col 2 left** (`direction: ltr` sheet + 1-col inset); **upward elongation** via `--site-about-tab-extend` (+20px bottom padding); max-content width |
| 2026-07-08 | About open state: tab + panel **vertically centered** on pull-up (lift = half viewport minus half sheet height); horizontal position stays **col 1 left** |
| 2026-07-08 | About pull-up restored: tab **thin** (`--space-10` only); tab + panel **one sheet** — panel full height off-screen, whole sheet lifts via `--site-about-lift` (no separate height fade) |
| 2026-07-08 | About: tab **full panel width** (12 cols); tab + panel **flex-attached** on one sheet; scroll ^ row at **panel top** |
| 2026-07-08 | About panel: **12 cols** wide, **5px** radius; `.main-t` headline; `.site-about__text` **6 cols** physical left; scroll ^ row bottom inset `--space-40` |
| 2026-07-08 | About tab: **+20px** bottom extend (`--site-about-tab-extend`); top text inset unchanged (`--space-10`) |
| 2026-07-08 | About tab: bottom flush to viewport edge (`--site-about-tab-lift: 0`) |
| 2026-07-08 | About tab lift **20px** (`--site-about-tab-lift: var(--space-20)`) |
| 2026-07-08 | About tab lift reset to **0** (moved down 40px from prior offset) |
| 2026-07-08 | About tab: lifted **40px** (`--site-about-tab-lift`); bottom padding extended **40px** to meet panel |
| 2026-07-08 | About tab: **col 2 left** (panel stays col 1); tab keeps **5px top radius** in all states |
| 2026-07-08 | About: bottom pull-up — tab at **col 1 left**; tab + panel slide up from below viewport to **50vh** top |
| 2026-07-08 | About: tab only at **col 8 left**; tab + panel slide down together from above viewport to **50vh** bottom |
| 2026-07-07 | Warehouse launcher open state: arrow stays visible (**pill 6**, **arrow 3**); legacy strip `is-active` glyph rule scoped off expand-drag |
| 2026-07-07 | Warehouse launcher drag grab keeps hover color swap (**pill 6**, **arrow 3**) |
| 2026-07-07 | Warehouse launcher hover: inner pill + arrow swap colors (**3↔6**) |
| 2026-07-07 | Warehouse launcher outer/inner gap **10px → 7px** (inner pill enlarged within 90×50 shell) |
| 2026-07-07 | Warehouse launcher outer shell **80×40 → 90×50**; outer/inner gap **5px → 10px** (`--warehouse-launcher-pad`) |
| 2026-07-07 | Warehouse launcher: collapsed click now fully opens the strip (same as drag snap); first-press teaser no longer blocks open |
| 2026-07-07 | Layer nav toggle icon scale: L1 molecule **1**; L2 blocks **0.9** (−10% vs molecule) |
| 2026-07-07 | L1 layer nav icon (`layer-nav-l1.svg`) hull stroke **3.5 → 2.8** (`vector-effect: non-scaling-stroke`) |
| 2026-07-07 | L1 molecule hover fill restored to **color 6** (`hoverFillMode: 'token'`) |
| 2026-07-07 | About sheet: panel matches tab width — single column shape on pull-up; square seam at tab join when open |
| 2026-07-07 | About sheet: tab + panel move together on pull-up; backdrop darkens like focus popup (`color-3` @ 20%, scales with drag) |
| 2026-07-07 | About panel: bottom-center pull-up sheet — tab flush to viewport bottom (top corners 5px, bottom 0); drag up to reveal; snap at 35% |
| 2026-07-07 | Layer navigation toggle inset **40px → 20px** from viewport right and top (`--space-20`) |
| 2026-07-07 | L1 molecule dots + hover fill: resolve sheet tag colors to hex at render/draw (fixes black fallback); hover fill uses tag color |
| 2026-07-07 | L1 molecule hull outline **0.4pt**; hover fills hull with **color 6** (`--color-6`) behind DOM dots instead of thickening stroke |
| 2026-07-07 | About trigger: color-6 box, `--space-10` padding, 5px radius; hover/open invert to color-3 fill |
| 2026-07-07 | Layer nav L1 destination icon uses `layer-nav-molecule-6.svg` (loaded from assets) |
| 2026-07-07 | Added `layer-nav-molecule-6.svg` — 6-dot molecule paste template with reference guide layer |
| 2026-07-07 | Layer navigation: single destination toggle — on L1 show L2 blocks icon, on L2 show L1 molecule icon; spine marker hidden |
| 2026-07-07 | Launcher first-press teaser: play on pointerup tap (not deferred click); removed pointerdown preventDefault that blocked click |
| 2026-07-07 | Launcher expand-drag snap size **8×4 → 9×3** (`CONFIG.warehouse.popup.launcherStrip.expandCols` / `expandRows`) |
| 2026-07-07 | Added `layer-nav-molecule-2.svg` — 2-dot L1 molecule variant (same hull algorithm as 3-dot icon) |
| 2026-07-07 | L1 layer nav molecule icon hull: arcs + straight tangents (matches `traceHullOutlinePath`, not arc-only chain) |
| 2026-07-07 | L1 layer nav molecule icon: 3-dot cluster + convex hull from live proportions (dotR 10, renderPadding 5, clusterR 9) |
| 2026-07-07 | Depth naming: two navigable levels documented as **L1** (macro) and **L2** (micro); code still uses level index `3` for micro |
| 2026-07-07 | Layer navigation: Hebrew labels replaced with symbols — molecule (L1) and text blocks (L2); active 4.5rem / inactive 3.25rem icon toggle stack |
| 2026-07-07 | Warehouse launcher pill width set to 1.5× block unit |
| 2026-07-07 | Warehouse launcher: **80×40px** pill (`launcherSize`); panel height matches; arrow rotates left on hover/pin |
| 2026-07-07 | Launcher expand-drag: color-3 pill handle, color-6 arrow; drag up-left to 12×6 snap; hover arrow top-left |
| 2026-07-07 | Launcher strip hover: muted preview only (whole blocks, no drag); pin restores default; hidden scrollbar |
| 2026-07-07 | Launcher strip pin: 3-row × 8-col block panel + 4-col minimap; hover stays thin peek; no color change on pin |
| 2026-07-07 | Launcher strip: hover expands left 6 cols with tag row; click pins; outside/Escape unpins (`CONFIG.warehouse.popup.launcherStrip`) |
| 2026-07-07 | Dock blocks-only mode: `CONFIG.warehouse.dock.panels` toggles statistics/message/map; tray fills shell (`is-warehouse-dock-blocks-only`) |
| 2026-07-07 | Warehouse launcher: pill width ×3; `arrow.svg` tracks pointer (rotate toward mouse) |
| 2026-07-07 | Warehouse launcher shell: hugs pill with 5px padding (no forced square) |
| 2026-07-07 | Warehouse launcher glyph: `assets/ui/arrow.svg` replaces ^ character (color-1 mask on block pill) |
| 2026-07-07 | L1 hover (no blocks): title vertically centered in macro inter-row corridor (`.is-row-gap-y`); hull-corner offset when blocks deployed |
| 2026-07-07 | Reduced `.note-h` note title size from **24pt** (`2rem` / 32px) to **20pt** (`1.6667rem` / 26.67px) |
| 2026-07-07 | L1 hover truncation: phrase-boundary clip (8-word window) + `.note-h` pixel-fit; no char cap, no ellipsis |
| 2026-07-07 | L1 hover label length rule: first line, max **5 words** + **42 chars**, append **…**; CSS cap `min(28rem, 42vw)` |
| 2026-07-07 | Physics dot collider radius **12px → 8px** (`CONFIG.physics.body.radius`) |
| 2026-07-07 | L1 hover label: **10px** from hull top corner (no shell-grid Y snap); pinned on hover start, does not follow molecule |
| 2026-07-07 | L1 macro dot visual render **5px → 10px radius** (`renderScale` 1→2, 20px diameter); visual only |
| 2026-07-07 | L1 bottom canvas reserve: **0** when warehouse popup collapsed; full `--site-l1-bottom-chrome` when popup open |
| 2026-07-07 | L1 molecule hull visual padding **3px → 5px** (`renderPadding`) — corner radius **8px → 10px** (dotR 5 + pad 5) |
| 2026-07-07 | Canvas background grid marks disabled (`showGridMarks: false`) — L1 crosses, L2 diagonals, L3 dots hidden |
| 2026-07-07 | Warehouse launcher pill: standard action-block width + inspector metadata ^ glyph (general-h, rotated) |
| 2026-07-07 | Warehouse launcher: bottom-right square (color 6, 5px radius) with inner color-3 block pill; 40px inset |
| 2026-07-07 | Warehouse popup collapsed: hide all shell/panel decorative corners until panel opens |
| 2026-07-07 | Warehouse popup: removed screen dimming — backdrop is transparent (click-outside dismiss only) |
| 2026-07-07 | Warehouse popup mode: dock hidden by default; bottom **כלים** launcher opens slide-up panel; minimap inside popup; clear + deployed blocks float when closed |
| 2026-07-06 | Opening fix: defer canvas mount until palette loaded; transparent art canvas so text stays visible behind molecules |
| 2026-07-06 | Opening sequence: blank → slow cursor → slow typewriter → molecules fade over text; `contentBlurPx: 5`; text z-index behind art |
| 2026-07-06 | Opening title: typewriter on load (RTL logical chars + blink cursor); subtle breathe after typing until art fades in |
| 2026-07-06 | Opening load: title-only hold (`is-art-pending`) with breathe animation; molecules + subtitle fade in after first canvas paint (`is-art-ready`) |
| 2026-07-06 | Censored L3: original `--site-micro-note-min-height` + fluid body; redaction bars use note-t/note-h line-box height |
| 2026-07-06 | Opening screen warm boot: preload fonts/assets, prepareBoot (warehouse, physics, minimap), archive wall during threshold |
| 2026-07-06 | Opening screen implemented: silhouette art from cache, ceremonial copy, Continue → Exp 1; dev bypass via `?skipOpening=1` |
| 2026-07-05 | Documented planned opening screen: silhouette forms as abstract decorative art (`experience-model.md`); tokens TBD |
| 2026-07-05 | L1 molecule hover restored to floating `.molecule-hover-title` on canvas (title mode); warehouse hover port unused |
| 2026-07-05 | Focus inspector: details panel bottom aligns to shell row 10; gap sync targets `.artifact-inspector-metadata__details` |
| 2026-07-05 | L1 molecule hover: warehouse **hover port** (left) + **system message port** (right) with flickering cursor; midpoint divider; title types on hover (`messageTypewriterMsPerChar: 35`) |
| 2026-07-05 | L1 hover: position pinned on hover start (no follow); blocks row max 5 pills/row (`moleculeHoverBlocksPerRow`) — **superseded for title mode** by dock hover port |
| 2026-07-05 | Removed `.note-h` / `.note-title` letter-spacing (`−0.02em`) |
| 2026-07-05 | L1 dock click indication: tray slot stays default pill during ghost arc (no empty-slot ghost) |
| 2026-07-05 | L1 hover A/B trial: `mixed` mode — title chip vs attached-block pill row (`moleculeHoverMode`, `moleculeHoverBlocksPercent`) |
| 2026-07-05 | L1 hover label font reverted to **TheBasics-Dots** (matches `.note-h`) |
| 2026-07-05 | L1 hover label font: **Narkiss Yair Bold** at `var(--type-display-size)` |
| 2026-07-05 | L1 hover label: balanced inset — 10px inline / 5px block + `line-height: 1` (font metrics were inflating vertical) |
| 2026-07-05 | L1 hover label typography matches source: `.note-title` or `.note-body` (not forced `.note-h`) |
| 2026-07-05 | L1 hover label: word cap (`moleculeHoverMaxWords: 10`) at whole-word boundaries; no ellipsis |
| 2026-07-05 | L1 hover label: removed ellipsis; max width `min(80vw, 56rem)` (was `min(42vw, 28rem)`) |
| 2026-07-05 | L1 molecule hover label: focus-card shadow (`0 8px 32px rgba(16,16,16,0.14)`) |
| 2026-07-05 | Restored `.note-h` note titles to `TheBasics-Dots.woff2` (24pt, weight 400) |
| 2026-07-05 | `.note-h` weight reduced from Black (900) to Bold (700) — `MiriamLibre-Bold.woff2` |
| 2026-07-05 | L1 molecule hover label padding set to `var(--space-10)` (10px) all sides |
| 2026-07-05 | L1 molecule hover label padding tightened to `var(--space-5)` (5px) |
| 2026-07-05 | L1 molecule hover label: note-card frame (color 1 fill, 5px radius, L3 padding) hugging title text |
| 2026-07-05 | Reduced `.note-h` note title size to **24pt** (`2rem` / 32px) |
| 2026-07-05 | Reduced `.note-h` note title size from `2.84375rem` (45.5px) to `2.25rem` (36px) |
| 2026-07-05 | `.note-h` note titles switched to `MiriamLibre-Black.woff2` at unchanged `2.84375rem` size |
| 2026-07-05 | Stanza (מחרוזת) wavy typology underline reduced to 1px stroke in 3px box |
| 2026-07-05 | Trial: `.note-h` note titles switched to `TheBasics-Dots.woff2` at unchanged `2.84375rem` size |
| 2026-07-05 | Switched `.note-h` note titles to `FrankRuhl_Universal-Mono` at unchanged `2.84375rem` size |
| 2026-07-05 | L1 clear button (`נקה לוח`) aligned with L2/L3 — message panel left edge, 10px above dock |
| 2026-07-05 | L1 molecule hover: first title line (`.note-h`) above hull; restored full macro deploy arc to canvas center |
| 2026-07-05 | L1 dock click indication: slower (720ms), full travel to canvas center; tray slot shows empty-slot ghost during animation only |
| 2026-07-05 | L1 focus tap: hull/dot click opens inspector via `openMacroNoteAt`; nav-surface tap uses physics hit test; `index.html` cache-busts `app.js` on build |
| 2026-07-05 | L1 dock block click: muted ghost (`is-macro-indication`) arcs to visible canvas center as deploy hint; real block stays in tray until drag |
| 2026-07-05 | Focus open from L1 macro: molecule click opens inspector (synthetic L3 card + FLIP from hull center); macro dots hidden while source slot empty |
| 2026-07-05 | Block Variations (Figma): default/muted/empty/attached/remove states; tag hover 2px sheet-color border; remove × on deployed hover; no pill shadows; removed `interactivePillChrome` experiment |
| 2026-07-05 | Layer navigation: removed corner decorations from label boxes |
| 2026-07-05 | L1 minimap viewport clipped to visible canvas (`warehouse-top`); pan/marker aligned with scroll clamp |
| 2026-07-05 | Focus open FLIP: single L3 card DOM through flyer → panel (no rebuild); unified `transform: scale(8/6)` end-to-end; pixel-slot alignment; shadow only after landing; card restored to grid on close |
| 2026-07-05 | L3 note min height **7 → 6 site rows** |
| 2026-07-05 | L3 note column width **8 → 6 site cols** — ~4 cards across viewport (was ~3) |
| 2026-07-05 | Focus metadata: author code uppercase (`MFR`); typology field Hebrew via `typologyLabels` |
| 2026-07-05 | Site shell grid 18×10 → **24×12**; warehouse **2 rows** (rows 11–12); dock/map **20+4 cols**; statistics **4 cols**; contentColumns L2/L3 **4/8**; grid marks every 3rd line; L3 min height **7 rows** |
| 2026-07-04 | English-only notes auto-detect to LTR (optional sheet override); mirrored card padding, ID lane, and L2 silhouette alignment |
| 2026-07-04 | Freed layer nav label box height from fixed shell slots; padding now grows the binding box |
| 2026-07-04 | Sized layer nav label cells to font ink + padding and aligned boxes to marker cell height |
| 2026-07-04 | Increased layer navigation inter-label gap to 10px (`var(--space-10)`) |
| 2026-07-04 | Enlarged `.general-h` by 10pt; reverted mistaken `.general-t` enlargement |
| 2026-07-04 | Restored note ID vertical centering; left inset 10px from card edge |
| 2026-07-04 | Set L3 note-card left padding to 100px and note ID vertical inset/padding to 10px |
| 2026-07-04 | Added 5px top padding to L3 note cards and tightened title-to-body gap to 10px |
| 2026-07-04 | Set `.note-h` letter spacing to −2% (`-0.02em`) |
| 2026-07-04 | Restored `.note-h` to Neoklass Bold Italic after the Medium Italic trial |
| 2026-07-04 | Removed 5% letter spacing from `.note-h` note titles |
| 2026-07-04 | Switched `.note-h` from Neoklass Bold Italic to Neoklass Medium Italic |
| 2026-07-04 | Restored `.note-t` to `1.125rem` after the 16px trial |
| 2026-07-04 | Reduced `.note-t` by 2px to `1rem` and set `.note-h` letter spacing to 5% |
| 2026-07-04 | Halved `.note-h` to `2.84375rem` and restored `.general-h` to `3.625rem` |
| 2026-07-04 | Increased `.note-h` by 5px to `5.6875rem` and reduced `.general-h` by 5px to `3.3125rem` |
| 2026-07-04 | Reverted L2 MesoMock silhouettes to no outline |
| 2026-07-04 | Restored L3 note titles to Neoklass `.note-h` after the FrankRuhl trial |
| 2026-07-04 | Switched L3 note titles to `FrankRuhl_Universal-Mono` while keeping the `.note-h` size |
| 2026-07-04 | Pixel-aligned L2 generated outline paths with a 1px SVG bleed for even hairline weight |
| 2026-07-04 | Increased L3 note-card left padding to protect the vertical note ID lane |
| 2026-07-04 | Kept L2 generated outline SVGs unclipped and crisp-edged to match site decoration hairlines |
| 2026-07-04 | Matched note-related author pills to tag-pill colors and added dark block-panel hover for tag/author note pills |
| 2026-07-04 | Replaced the L2 drop-shadow outline trial with generated SVG outer-contour paths |
| 2026-07-04 | Let L2 meso glyph wrappers overflow visibly so outside silhouette outlines are not clipped |
| 2026-07-04 | Removed L3 note-card borders and bottom tag/author pill outlines |
| 2026-07-04 | Changed the L2 MesoMock outline from per-line inset strokes to an outside-only frame outline |
| 2026-07-04 | Added a 1px color-4 outline trial to L2 MesoMock silhouettes |
| 2026-07-04 | Moved the opened focus note start position up to the beginning of shell row 2 |
| 2026-07-04 | Restored the 1px color-4 outline on L3 grid note cards |
| 2026-07-04 | Positioned the opened focus note at the beginning of shell row 3 and reset inspector scroll on each open |
| 2026-07-04 | Added `var(--space-5)` corner radius to L3 grid note cards |
| 2026-07-04 | Let the focus popup use the full viewport height as its scrollport so content can reach the top and bottom edges |
| 2026-07-04 | Set L3 tag-to-card spacing to `var(--space-10)` and note-group vertical spacing to `var(--space-20)` |
| 2026-07-04 | Removed L3 grid note outlines and tightened tag rows to sit directly under their note cards |
| 2026-07-04 | Renamed the live connection stat to `חיבורים פעילים` and added animated counting for warehouse statistics values |
| 2026-07-04 | Pushed the layer navigation marker curved corners outward to slightly overhang the top and bottom label edges |
| 2026-07-04 | Reduced the layer navigation marker curved corners to match the 6px action dock corner decoration scale |
| 2026-07-04 | Narrowed `.general-t` letter spacing trial to 5% |
| 2026-07-04 | Centered the layer navigation marker divider ticks between the layer labels |
| 2026-07-04 | Matched the layer navigation marker to 1px non-scaling hairlines and centered the `X` more accurately on labels |
| 2026-07-04 | Restored the layer navigation marker curved corners and mounted the skeleton as a fixed panel-level object |
| 2026-07-04 | Tightened warehouse statistics rows so categories and outputs share one line with normal line-height spacing |
| 2026-07-04 | Rebuilt the layer navigation marker as a mostly static three-cell table; only the `X` and vertical-line gap move |
| 2026-07-04 | Added live warehouse statistics rows for active connections and connected notes, with right-label/left-value layout |
| 2026-07-04 | Mapped the layer navigation marker `X` to top/middle/bottom SVG cells for macro/meso/micro |
| 2026-07-04 | Added a lightweight one-shot internal vector reveal to the layer navigation marker SVG |
| 2026-07-04 | Updated `.general-h` and runtime nav type token to responsive 3.625rem (58px) |
| 2026-07-04 | Set layer navigation label text to responsive 3.625rem (58px) |
| 2026-07-04 | Set layer navigation label text to responsive 3.75rem (60px) |
| 2026-07-04 | Set layer navigation label text to responsive 4rem (64px) |
| 2026-07-04 | Set layer navigation label text to responsive 4.25rem for the requested 68pt design size |
| 2026-07-04 | Reduced layer navigation label text to scale with the 2.5-row stack while leaving `.general-h` at 4.375rem |
| 2026-07-04 | Reduced the full three-label navigation stack to 2.5 shell rows total, with gaps included |
| 2026-07-04 | Returned active layer navigation label and marker to the original label column |
| 2026-07-04 | Offset the active layer navigation label and marker 20px left from the inactive column |
| 2026-07-04 | Increased inactive layer navigation hover shift to 20px using `var(--space-20)` |
| 2026-07-04 | Fixed layer navigation hover so only inactive labels shift left by 5px |
| 2026-07-04 | Set `.general-h` and layer navigation label text to responsive 4.375rem (70px) |
| 2026-07-04 | Enlarged the full three-label navigation stack to 3 shell rows total, with gaps included |
| 2026-07-04 | Made the full three-label navigation stack 225% of a shell row, with the 5px gaps included in the unit |
| 2026-07-04 | Shifted layer navigation label placement from row centers to the 75% vertical guide of each shell row |
| 2026-07-04 | Restored layer navigation slot spacing to shell row centers after increasing label padding |
| 2026-07-04 | Increased layer navigation label padding to 10px while keeping 64px text and row-centered placement |
| 2026-07-04 | Set `.general-h` and layer navigation labels to responsive 4rem font size |
| 2026-07-04 | Tested 75%-row-height layer navigation labels while keeping the 5px inter-label gap |
| 2026-07-04 | Resized layer navigation labels to two-thirds of a shell row and restored the 5px inter-label gap |
| 2026-07-04 | Tightened layer navigation spacing so half-row-height labels occupy consecutive half-row slots |
| 2026-07-04 | Tested half-row-height layer navigation labels with nav-specific `.general-h` scaling |
| 2026-07-04 | Moved the row-centered layer navigation stack up to anchor the active label on shell row 4 |
| 2026-07-04 | Moved the row-centered layer navigation stack up one shell row so the active label anchors on row 5 |
| 2026-07-04 | Centered layer navigation labels on adjacent site-shell row centers while keeping the active label fixed on row 6 |
| 2026-07-04 | Moved the layer navigation selection SVG to the right side of the active label |
| 2026-07-04 | Corrected layer navigation palette to use color 3 and color 6 for active/inactive states |
| 2026-07-05 | Typology pills: Hebrew foreground + English ghost background; patterns remapped (block solid, list dashed, fragment dotted, stanza wavy); 1px underline; dock order Block→List→Fragment→Stanza |
| 2026-07-05 | L3 note-related pill row includes typology blocks (pattern underline, same hover as tag/author) |
| 2026-07-04 | Added typology action blocks — same pill chrome with pattern underlines (dots/lines/zigzag/stripes) per sheet Typology column |
| 2026-07-04 | Reduced layer navigation label padding and inter-label gap to 5px using `var(--space-5)` |
| 2026-07-04 | Switched layer navigation type hierarchy so the active layer is large and inactive layers are small; restored color-6 rectangular boxes with 10px padding |
| 2026-07-04 | Added original L2 line silhouettes inside stable minimap frame markers after saving the successful frame-echo reference |
| 2026-07-04 | Expanded shared block/tag pill dot-text gap to 10px using `var(--space-10)` |
| 2026-07-04 | Reduced L1/L2/L3 site-grid marks to every second row/column crossing |
| 2026-07-04 | Added inner decorative corner marks at the action dock/map gap |
| 2026-07-04 | Restored L2 minimap viewport echo with frame rectangles while keeping detailed fragments disabled |
| 2026-07-04 | Rolled L2 minimap back to stable frame rectangles after detailed silhouette fragments caused missing/stacked markers |
| 2026-07-04 | Set message/statistics paragraph indent to 20px using `var(--space-20)` |
| 2026-07-04 | Reduced message/statistics paragraph indent to 30px using `var(--space-30)` |
| 2026-07-04 | Increased message/statistics paragraph indent to 40px using `var(--space-40)` |
| 2026-07-04 | Set message/statistics right padding to 10px and added 20px paragraph indent |
| 2026-07-04 | Moved warehouse divider endpoints to 5px and joined the message/block divider to the statistics divider |
| 2026-07-04 | Removed message panel outer side inset so the 20px internal padding is not doubled |
| 2026-07-04 | Reduced message/statistics top padding to 10px while keeping side/bottom inset at 20px |
| 2026-07-04 | Set message/statistics panel padding to 20px and block-panel padding to 10px using spacing tokens |
| 2026-07-04 | Matched message and statistics panel top/side inset to 5px and top-aligned message text |
| 2026-07-04 | Corrected warehouse left-side decorative corner orientations from the top-right SVG asset |
| 2026-07-04 | Set action dock block-panel content padding to 5px, including the gap below the separator hairline |
| 2026-07-04 | Aligned action dock block-panel padding to the message port/divider inset and 5px message spacing |
| 2026-07-03 | Locked block/tag pill sizing invariant: same dimensions everywhere, color only changes by context |
| 2026-07-03 | L2 minimap switched from note centers to visible meso frame/silhouette rectangles for canvas alignment |
| 2026-07-03 | Matched action/L3 tag pill sizing to L1 molecule dots and tightened dock tray horizontal gap |
| 2026-07-03 | L1 minimap switched from note centers to live macro dots for denser viewport-marker alignment |
| 2026-07-03 | Reduced `.general-t` from 20px to responsive `1rem` and converted typography spec away from `pt` units |
| 2026-07-03 | Restored L1 molecule dots above macro canvas backing |
| 2026-07-03 | Minimap viewport marker updated to track the raw browser viewport for row alignment |
| 2026-07-03 | Added 5px text inset token for action dock text areas |
| 2026-07-03 | L1 grid crosses moved behind an opaque macro molecule backing, matching L2/L3 depth behavior |
| 2026-07-03 | Removed L1 molecule hover ID badge; hover remains visual/click feedback only |
| 2026-07-03 | Warehouse statistics moved to top of left panel |
| 2026-07-03 | Map panel details and fixed viewport marker reduced for quieter warehouse chrome |
| 2026-07-03 | Message port height aligned to half a site-shell row |
| 2026-07-03 | Unified `.general-t` / NarkissYair mono bold rendering and disabled font synthesis |
| 2026-07-03 | Added Figma px to CSS `--space-*` spacing-token translation rule |
| 2026-07-03 | Action block text reset: no stroke, shadow, paint-order changes, or font synthesis |
| 2026-07-03 | Warehouse block tray gaps tightened to 15px horizontal / 10px vertical |
| 2026-07-03 | Warehouse split into separate action dock and map panels with site-grid gap |
| 2026-07-03 | Warehouse message/block divider moved between message row and block tray |
| 2026-07-03 | Enforced `.general-t` class on warehouse/action blocks |
| 2026-07-03 | Warehouse block tray fixed: 60px horizontal gap, compact vertical row gap |
| 2026-07-03 | Warehouse dock internals fixed: statistics left, block panel/message middle |
| 2026-07-03 | Warehouse shell fixed: dock on left, map on right, divider lines restored |
| 2026-07-03 | Exhibition redesign implemented: tokens, warehouse dock/map, layer nav, L3 cards, inspector popup |
| 2026-07-03 | SVG assets added: `layer-nav-marker.svg`, `decoration-corner-tr.svg` |
