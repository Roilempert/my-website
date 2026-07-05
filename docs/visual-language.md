# Visual language — exhibition design legend

**Living document.** Update whenever colors, typography, spacing, grid marks, SVG chrome, or component styling changes. Agents: see `.cursor/rules/visual-language.mdc`.

**Status:** Spec locked (2026-07-03). **Code:** exhibition redesign implemented in `styles.css`, `js/config.js`, warehouse, navigation, inspector, L3 cards. **Deferred:** L2 `SilhouetteEngine` (MesoMock interim), physics tuning at `VISUAL_SCALE 1.0`.

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
| `--color-3` | `#2D2D2D` | Action blocks, L3 grid dots, map objects, metadata panel, related-notes section title, SVG chrome |
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
| `.general-h` | `NarkissYair-Bold-TRIAL.woff2` | `calc(3.625rem + 10pt)` | `calc(3.5rem + 10pt)` | — | Layer labels; inspector ID title; related-notes section title |
| `.general-t` | `NarkissYair-BoldMono-TRIAL.woff2` | `1rem` | `1` | letter-spacing 5%, no synthesis | Warehouse, blocks, **active** layer label, metadata labels/details, note ID |
| `.note-h` | `TheBasics-Dots.woff2` | `24pt` (`2rem` / 32px) | `0.9` | — | Note titles |
| `.note-t` | `FrankRuhl_Universal-Mono.woff2` | `1.125rem` | `1.2` | — | Note body |

**Retired for exhibition UI:** `ratzif22`, NarkissTam on note body, NarkissYair Regular for chrome.

---

## Layout — site shell grid

| Property | Value |
|----------|--------|
| Grid | **24 columns × 12 rows** (`CONFIG.siteGrid`) |
| Viewport padding | **20px** → `1.25rem` (all sides) |
| Grid marks | Every third row/column crossing (`crossStep: 3`) |

### Grid marks by depth level

| Level | Mark | Size | Color |
|-------|------|------|-------|
| L1 macro | Cross (+), behind macro molecule backing | 10×10 | color 2 |
| L2 meso | Diagonal 45° | 10px length | color 2 |
| L3 micro | Dot | 5px | color 3 |

**Do not add:** L2 extra fringe glyph, focus connector from old Figma audit.

---

## Components

### Warehouse (rows 11–12)

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
- **Viewport marker:** compact, **fixed** at center of map frame — does **not** move; map **content** pans behind it, clipped to panel bounds. Marker proportions follow the raw browser viewport; L1 uses live macro dots, and L2 uses stable meso frame rectangles with original line silhouettes drawn inside them.
- **Remove:** English `ACTION REPOSITORY` label.

### Action blocks (dock panel)

All block/tag pills share dimensions site-wide; chrome varies by **context/state** (Figma Block Variations). Tag dot color always from sheet data. No shadows on pills.

| Variant | Context | Fill | Text | Border | Dot / right mark |
|---------|---------|------|------|--------|------------------|
| **Default** | Dock, deployed, depth bar | color 3 | color 1 | none | sheet tag color (tags only) |
| **Default hover** | Dock tag pills | color 3 | color 1 | **2px** sheet tag color | sheet tag color |
| **Remove hover** | Selected/deployed removable blocks | color 3 | color 1 | none | **×** — tag color (tags) or color 1 (author/typology); click returns to dock |
| **Attached to note** | L3 / inspector pills below cards | color 1 | color 4 | none | sheet tag color — not clickable |
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

**Typology block** — same pill dimensions as tag/author; no tag dot. Visible label: Hebrew from `CONFIG.data.typologyLabels` (בלוק, רשימה, מקטע, מחרוזת). Dock order: Block → List → Fragment → Stanza (`typologyOrder`). Pattern underline on `.block-typology-mark` (`data-typology-pattern`), text color, 1px thick (wavy 3px box), 1px below label:

| Typology | Pattern | Hebrew label |
|----------|---------|--------------|
| Block | regular (solid) | בלוק |
| List | dashed | רשימה |
| Fragment | dotted | מקטע |
| Stanza | wavy | מחרוזת |

Pattern is resolved at render time via `getTypologyPattern()` (case-insensitive). Retired typology values (e.g. `Quote`) are listed in `CONFIG.data.retiredTypologies` and never become dock blocks.

### Deployed block

- **10px** above dock top (`var(--space-10)`); clear **`נקה לוח`** left edge aligned with **message band** left (after statistics column) — same on L1/L2/L3
- Clear: fill color 6 (= RESET)
- Block counter appears inside the live statistics panel

### L1 dock block click (macro)

- Tap a docked block (no drag): **muted ghost** clone (`is-macro-indication` — irrelevant/muted variant: fill color 2, text color 5, tag dot color 5) arcs from tray to the visible L1 canvas center; **tray slot keeps the real block in default dock chrome** during the animation; real block stays in tray until dragged
- Same arc easing as L2/L3 click-deploy (`macroIndicationDuration` 720ms / shared arc lift)

### L1 molecule hover

- Hull outline thickens on hover (`body.is-molecule-hover`)
- **Title mode** (`moleculeHoverMode: 'title'` — current default): floating `.molecule-hover-title` pinned on hover start; **Y** snaps to the shell row top at/above the molecule hull (`measureSiteGridTokenPx`); **X** stays on the hull edge (RTL `maxX` / LTR `minX`); first title line (or body fallback), `.note-h` scale, transparent background; word cap 10; RTL top-right / LTR top-left
- **Blocks / mixed modes** (optional): same floating label with attached-block pill row via `MicroMock.buildTagsRowHTML`; config: `moleculeHoverMode`, `moleculeHoverBlocksPercent`, `moleculeHoverBlocksPerRow`, `moleculeHoverBlocksSingleRowMax`
- Warehouse hover port (`.warehouse-hover-port`) remains in the message band but is unused for L1 hover
- Code path: `PhysicsEngine.updateMoleculeHoverState()`

### Layer navigation (right)

| State | Box | Type | Marker |
|-------|-----|------|--------|
| Active | color 3 fill, color 6 text, 10px pad (all sides), 5px radius | `.general-h` at `calc(3.625rem + 10pt)` | selection vector SVG |
| Inactive | color 6 fill, color 3 text, 10px pad (all sides), 5px radius | `.general-h` at `calc(3.625rem + 10pt)` | none |

- Label stack height follows content: `3 × label box + 2 × inter-label gap`, where each label box is `font-size + 2 × box padding` (line-height 1)
- **40px** from viewport right edge → `2.5rem`
- Active label aligns to the 75% point of shell row 4; inactive labels follow inside the 2.5-row stack
- Inactive hover only: move label left by 20px (`var(--space-20)`); active label does not hover-shift
- **Selection marker:** one fixed SVG on the right side of the layer stack — curved top/bottom skeleton and two interior dividers stay static; only the `X` and its vertical-line gap move smoothly between top/middle/bottom cells for macro/meso/micro

### L2 meso silhouettes

- Interim MesoMock silhouettes have no outline; keep the gradient line silhouettes un-stroked.

### L3 note cards

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
| Note ID | 10px from left edge → `var(--space-10)`; vertically centered on card |
| Title / body | `.note-h` / `.note-t` |

**Text direction:** Default RTL (Hebrew). English-only notes auto-detect to LTR from title+body (Latin letters, no Hebrew/Arabic script). Optional sheet column `direction` (`ltr` / `rtl` / `en` / `he`) overrides auto-detect. LTR cards mirror the ID lane to the right (`6.25rem` right padding, ID at `var(--space-10)` from right). Tag/author pills stay RTL Hebrew.

### L2 meso silhouettes (direction)

| Property | RTL (default) | LTR (English-only) |
|----------|---------------|---------------------|
| Frame alignment | `flex-end` / right | `flex-start` / left |
| Line rects | anchored right | anchored left |
| SVG clip rects | `x = viewW − width` | `x = 0` |

**Tags / typology / authors (below card):** attached variant — fill color 1, text color 4, no border, not clickable. Same sizing as dock blocks. Typology underline follows text color.

### Focus popup (inspector, all levels)

- Backdrop: color 3 @ 20% opacity
- Note scales **6 cols → 8 cols** proportionally via `--focus-card-scale` (`8/6`); inspector width is measured from the clicked card (`sourceWidth × 8/6`), not the site token alone; card interior keeps L3 proportions; tag/author/typology blocks stay grid pill size
- **Panel scaler:** `transform: scale(var(--focus-card-scale))` with measured `margin-bottom` lift — same scale path as the flyer; reserves height for tags/metadata
- **Open motion:** the clicked L3 card DOM moves into a fixed `.artifact-inspector-flyer` shell (no HTML rebuild); top-left FLIP on the scaler from source rect → shell row 2; one element, one proportional scale path; shadow only after landing; source `.note-wrapper` hidden (`visibility: hidden` on wrapper + descendants). **L1 macro:** molecule click builds a synthetic L3 card (no visible grid card at macro); FLIP starts from molecule hull center at L3 width; tap on hull or dot via `openMacroNoteAt` (physics hit test + nav-surface tap)
- Popup scrollport spans the full viewport height; focused/related content can scroll to the top and bottom viewport edges
- Focused note starts at the beginning of shell row 2 when the popup opens
- Metadata panel below focus card: bg color 6, text color 3, radius 5px; **details block** (`.artifact-inspector-metadata__details`) bottom aligns to **shell row 10** (last content row above warehouse) on short notes; long notes keep `metadataMinGap` (60px) below the focus card
- **Metadata fields:** author shows **Author Code** in uppercase (e.g. `MFR`); typology shows Hebrew label from `CONFIG.data.typologyLabels` (e.g. `רשימה` for `List`)
- **Related notes:** one section per tag subset of focus note that **exists on at least one other note**; omit unused combinations; 2 notes per row, 40px gap

---

## SVG assets

Export from Figma as **one grouped SVG per decoration** (not shape-by-shape). Save under `assets/ui/`.

**Naming:** `decoration-corner-{tl|tr|bl|br}.svg` for corner marks (orientation = how the path sits in the SVG viewBox). Reuse one file at multiple corners via CSS flip/rotate.

| File | Figma source | In code | Motion |
|------|--------------|---------|--------|
| `layer-nav-marker.svg` | `layer navigation final` (638:12) | `navigation-map.js` | Fixed curved skeleton; `X` and vertical-line gap move between marker cells |
| `decoration-corner-tr.svg` | One shell corner group (exported **top-right** orientation) | `.warehouse-shell` × 4 (mirror/rotate per corner) | Static |
| — | — | Map viewport marker | **Not SVG** — fixed DOM/canvas frame; map pans behind |

---

## Changelog

| Date | Change |
|------|--------|
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
