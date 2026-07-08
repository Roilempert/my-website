# 2026-07-08 — L2 note focus + layer switch button fix

## Symptoms

- On L2 (micro grid, code level 3), clicking a note did **not** open the focus inspector.
- The layer switch button (top-right toggle) did not work — it was rendered `disabled`
  on L2, so the visitor could not return to L1.

Both worked in the pre-redesign version (compare commit `51b924d` / branch
`archive/2026-07-05-pre-redesign`).

## Root cause

Both were regressions introduced with the **censored theme** (`CONFIG.theme.mode = 'censored'`,
`js/note-censor.js`). The censored study loop added *hard gates* in the generic focus and
navigation paths instead of staying inside the censor module:

1. **Focus gate** — `ArtifactInspector.open()` returned early unless the note was
   "study-unlocked" (`NoteCensor.isNoteStudyUnlocked`), i.e. the visitor had first clicked
   a censored word belonging to that note. The same gate was duplicated in
   `SpatialNavigation.dispatchDepthNoteTap()` (via `NoteCensor.hitStudyNoteAt`) and in the
   `RenderEngine` note click handler. Result: a plain click on an L2 note silently did nothing.

2. **Zoom-out gate** — `NoteCensor.blocksLayerZoomOut()` (`isActive() && !hasCommittedWord()`)
   was wired into `NavigationMap.syncActiveState` / `navigateToLayer` via
   `isLayerZoomOutBlocked()`. On L2 with no committed word, the toggle button got
   `disabled` + `is-zoom-out-blocked`, so it could not be clicked at all.

## How it was diagnosed

1. Diffed current modules against the last known-good commit (`git diff 51b924d HEAD -- js/...`)
   to find where the click/toggle paths diverged.
2. Ran the site locally (`python3 -m http.server`) and drove it with Playwright MCP:
   checked `DepthController.currentLevel`, `ArtifactInspector.isActive`, the toggle button's
   `disabled`/`aria-disabled` state, and `NoteCensor.blocksLayerZoomOut()` at runtime.
   This confirmed both gates fired on a fresh L2 with zero committed words.

## Fix (all in module files, then `./build-js.sh`)

- `js/artifact-inspector.js` — `open()`: removed the "censored → refuse to open" early
  return. Kept `studyOpen` detection so unlocked study notes still open readable
  (`_forceReadableOpen`).
- `js/spatial-navigation.js` — `dispatchDepthNoteTap()`: removed the study-wrapper-only
  branch; any hit-tested note opens/closes the inspector (word commits still take priority
  earlier in the same function).
- `js/render-engine.js` — note click handler: removed the `isNoteStudyUnlocked` guard on
  the L2 path; L1 click into L2 now also auto-opens the inspector (unless
  `NoteCensor.blocksNoteFocus()`), matching `DepthTransitionOrchestrator.runNoteClick`.
- `js/navigation-map.js` — removed `isLayerZoomOutBlocked` from `syncActiveState` and
  `navigateToLayer`; the button no longer gets `disabled` from the censor gate.
  **Kept** `isLayerToggleBlocked()` — the exception that keeps the toggle clickable while
  the focus inspector is open on L2 (inspector pauses `SpatialNavigation`, and without this
  exception the button re-disables itself). Clicking it closes the inspector and switches layer.

## Traps for future agents

- `ArtifactInspector.open()` pauses `SpatialNavigation`; anything keyed off
  `SpatialNavigation.isPaused` (like the layer toggle) needs an explicit inspector
  exception — see `NavigationMap.isLayerToggleBlocked()`.
- The word-reveal interaction itself is untouched: clicking a redacted word still commits
  it and unlocks study notes. Only the *requirement* to commit before focusing / leaving
  the layer was removed. To reinstate that ceremony, re-wire
  `NoteCensor.blocksLayerZoomOut()` into `NavigationMap` (`isLayerZoomOutBlocked`) —
  the CSS for `.is-zoom-out-blocked:disabled` still exists in `styles.css`.
- Edit modules in `js/`, never `js/app.js` directly; run `./build-js.sh` (it also cache-busts
  `experience.html`).

## Verification

Playwright round-trip on the built bundle: L1 → toggle → L2, click note → inspector opens,
click again → closes, toggle → back to L1. All passed.
