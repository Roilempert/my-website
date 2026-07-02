# Work sessions — how to use

This folder is for **topics you choose in real time** — not a pre-made task list.

---

## Three ways to start

**A — Quick (no file)**  
Open an agent chat and describe what you want in words. Enough for small fixes.

**B — Documented session (recommended)**  
1. Copy `TEMPLATE.md` to a new file, e.g.:

```
docs/work/2026-06-18-meso-transition.md
```

2. Fill in "What I want" and "Verification".
3. Open a new agent chat — attach the file (`@`) and paste the prompt from the bottom of the template.

**C — Agent creates for you**  
In chat: "Create a work session for [topic] from TEMPLATE." The agent will fill and save a file here.

---

## What lives where

**TEMPLATE.md**  
Empty template — do not edit; only copy.

**Dated file**  
e.g. `2026-06-18-….md` — your session; move to `archive/` when done (or delete).

**archive/**  
Completed sessions kept for reference (e.g. `2026-06-22-l2-grid-stable.md`).

**docs/CHECKPOINT.md**  
Physics stability — permanent doc, not a session.

**AGENTS.md**  
Project context — permanent doc.

---

## Closing a session

In the session file:

- Update **Status** to `done` or `paused`
- Add a line under **Notes / follow-up** — what remains, if anything
- If a permanent decision was made — move it to `docs/` as its own file (e.g. `block-cap-policy.md`)

No automatic sync between chats — only what you or the agent write to the file.
