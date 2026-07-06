# Opening screen — interactive threshold (next phase)

**Date:** 2026-07-06  
**Status:** planned  
**Depends on:** L2 meso grid background (implemented), warm boot (implemented)

---

## Problem

The current **כניסה** button is functional but passive — it does not teach the laboratory frame, nor does it feel like a ceremonial act of consent/readiness. The user wants an **interactive affordance** that:

1. **Educates** — introduces nosiness, private phone notes, blocks/tags, depth, roaming vs focus
2. **Activates** — requires intentional gesture, not a generic click
3. **Signals readiness** — clear moment when the visitor is allowed to enter Experience 1

---

## Design direction

Keep the **L2 gradient silhouette wall** as the immersive background. Replace the centered pill button with a **foreground ritual** that sits in the content layer (`opening-screen__content`) and optionally interacts with the grid.

Tone: slick, curious, ceremonial — not tutorial modal or legal checkbox.

---

## Recommended concept: **“משוך להסתכל” (Pull to look)**

A horizontal **threshold bar** (warehouse chrome — color 3 track, color 1 handle) that the visitor drags RTL toward a marked edge. While dragging:

| Progress | Feedback |
|----------|----------|
| 0–30% | Subtitle copy: invitation to look (`מבט אל תוך מילים…`) |
| 30–70% | Staged **micro-lessons** fade in above the bar (2–3 lines, `.general-t`) — see copy table below |
| 70–95% | Grid **brightens** slightly (`--opening-meso-opacity` → 1); handle label shifts |
| 100% | Haptic-like snap; bar completes; auto-dismiss into spatial lab (same exit animation as today) |

**Why this works:** mirrors exhibition **edge-scroll / roaming** muscle memory; drag is intentional; progress teaches without a separate “Next” tour.

### Micro-lesson copy (Hebrew, staged by drag %)

| Stage | Text |
|-------|------|
| 1 | `פתקים אישיים — נכתבו בטלפון, לא לפרסום.` |
| 2 | `מותר לשוטט. מותר לסנן. מותר להתעניין.` |
| 3 | `גררו בלוקים — הפתקים יגיבו.` *(optional: animate a ghost block icon)* |

---

## Alternative concepts (if pull feels wrong on iMac mouse)

| Concept | Interaction | Teaches |
|---------|-------------|---------|
| **Hold the dot** | Press & hold 2s on a floating `.layer-dot` pulsing in center | Macro layer / molecules |
| **Deploy one block** | Mini dock with 3 tag pills; drag one onto a silhouette “surface” ring | Blocks + capture |
| **Type one word** | Single `.general-t` input; match any archive word from `ArchiveIndex` (fuzzy) | Search / nosiness |
| **Silhouette hover trail** | Move cursor — nearest glyphs briefly brighten; after N hovers, threshold unlocks | Density of archive |

**Recommendation:** start with **pull bar** (simplest on exhibition hardware, no dependency on warehouse DOM).

---

## Technical approach

### New module surface

Extend [`js/opening-screen.js`](../../js/opening-screen.js) or add `js/opening-threshold.js`:

```
OpeningThreshold.init(containerEl)
OpeningThreshold.onComplete → OpeningScreen.dismiss()
OpeningThreshold.setProgress(0..1) → updates copy + grid opacity
```

### HTML (replace button in `index.html`)

```html
<div class="opening-threshold">
  <div class="opening-threshold__lessons" aria-live="polite"></div>
  <div class="opening-threshold__track">
    <div class="opening-threshold__fill"></div>
    <button type="button" class="opening-threshold__handle general-t" aria-label="משוך להסתכל">
      ← משוך
    </button>
  </div>
</div>
```

### CSS

- Track: full width of content panel, height ~`var(--space-40)`, radius `--space-5`
- Handle: pill matching action blocks; `transform: translateX(calc(var(--threshold-progress) * (100% - handleWidth)))`
- RTL: drag **left** increases progress (matches Hebrew reading direction toward entry)
- `pointer-events: auto` on threshold only; grid stays decorative

### Config (`CONFIG.opening.threshold`)

```js
threshold: {
    mode: 'pull',           // pull | hold | block | hover
    completeAt: 0.92,       // snap threshold
    minDisplayMs: 1800,     // still enforce minimum time before drag starts
    lessonStages: [ ... ]   // Hebrew strings keyed by progress
}
```

### Boot / dismiss

- Remove plain `.opening-screen__continue` click handler
- `OpeningThreshold.onComplete` calls existing `OpeningScreen.dismiss()` — warm boot unchanged
- Keep dev bypass `?skipOpening=1`

---

## Phased build

| Phase | Deliverable |
|-------|-------------|
| **A** | Pull bar UI + progress → dismiss; staged copy; grid opacity link |
| **B** | Ghost block hint at stage 2; sound optional (off by default) |
| **C** | A/B one alternate mode (`hold` or `block`) behind `CONFIG.opening.threshold.mode` |

---

## Verification

1. Exhibition path: must complete pull (or hold) — no instant skip except dev bypass
2. Copy stages appear in order; no English leak
3. Dismiss still triggers `flushPendingBoot` — spatial lab instant
4. Grid remains non-interactive (pointer-events none) unless hover-trail mode chosen
5. Keyboard: handle focusable; Enter at 100% progress enters site

---

## Out of scope

- Experience 2 path on opening (still single entry → Exp 1)
- Full p5 mandala bake on opening grid (keep SVG gradients for perf; optional later)
- Replacing Hebrew title/subtitle with note data
