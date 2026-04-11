# God blind zone pointer pass-through — implementation plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let pointer events reach the canvas through empty areas of both god blind zones while keeping blind-slot cards interactive and keyboard “chrome” detection accurate (cards + border band only).

**Architecture:** CSS limits hit targets to `.god-dock-card--blind-slot` elements; `GodHandBlindDock` stores both slot layouts and implements `isPointOverBlindZoneChrome` using the same screen geometry as `computeBlindZoneLayoutForSlot` (container + `borderScreenPx` + card rects).

**Tech Stack:** TypeScript, existing `GodHandBlindDock` / `src/style.css`.

**Spec:** `docs/superpowers/specs/2026-04-11-god-blind-zone-pointer-pass-through-design.md`

---

## Files

| File | Role |
|------|------|
| `src/style.css` | `pointer-events` on zone shell vs blind-slot cards |
| `src/godHandBlindDock.ts` | `lastOppLayout`, geometric `isPointOverBlindZoneChrome` |

---

### Task 1: CSS pointer-events

**Files:**
- Modify: `src/style.css` (section `.god-blind-zone--on-table`, `.god-blind-zone-inner`, blind-slot cards)

- [ ] **Step 1:** Set `pointer-events: none` on `.god-blind-zone--on-table` and `.god-blind-zone-inner` (explicitly; zone already had `auto` — replace).

- [ ] **Step 2:** Add a rule so only blind-slot cards capture pointers, e.g.:

```css
.god-dock-card--blind-slot {
  pointer-events: auto;
}
```

(If a more specific selector is needed to beat other rules, scope under `.god-blind-table-wrap`.)

- [ ] **Step 3:** Commit

```bash
git add src/style.css
git commit -m "fix(ui): pass pointer events through god blind zone shell to canvas"
```

---

### Task 2: Geometric blind-zone chrome hit-test

**Files:**
- Modify: `src/godHandBlindDock.ts`

- [ ] **Step 1:** Add `private lastOppLayout: GodBlindZoneLayout | null = null` and set both in `applyDualBlindLayouts`:

```ts
this.lastMineLayout = mine;
this.lastOppLayout = opp;
```

- [ ] **Step 2:** Add private helpers (names illustrative):

```ts
function pointInPaddingBorder(
  x: number,
  y: number,
  layout: GodBlindZoneLayout,
): boolean {
  const { container, borderScreenPx: b } = layout;
  const L = container.left;
  const T = container.top;
  const R = L + container.width;
  const B = T + container.height;
  if (x < L || x >= R || y < T || y >= B) return false;
  const innerL = L + b;
  const innerT = T + b;
  const innerR = R - b;
  const innerB = B - b;
  return x < innerL || x >= innerR || y < innerT || y >= innerB;
}

function pointInAnyCard(
  x: number,
  y: number,
  layout: GodBlindZoneLayout,
): boolean {
  const baseL = layout.container.left;
  const baseT = layout.container.top;
  for (const c of layout.cards) {
    const left = baseL + c.left;
    const top = baseT + c.top;
    if (x >= left && x <= left + c.width && y >= top && y <= top + c.height) return true;
  }
  return false;
}
```

(Adjust `<=` vs `<` to match existing `isPointOverBlindZoneChrome` / `getBoundingClientRect` conventions — keep consistent with `godBlindZoneContainsWorldForSlot` in `main.ts`.)

- [ ] **Step 3:** Replace `isPointOverBlindZoneChrome` body:

  - If `!this.lastMineLayout && !this.lastOppLayout` return `false`.
  - For each of `this.lastMineLayout`, `this.lastOppLayout` (if non-null): if `pointInPaddingBorder(x,y,layout) || pointInAnyCard(x,y,layout)` return `true`.
  - Return `false`.

- [ ] **Step 4:** Run build

```bash
npm run build
```

Expected: completes with no TypeScript errors.

- [ ] **Step 5:** Commit

```bash
git add src/godHandBlindDock.ts
git commit -m "fix(ui): refine blind zone chrome hit-test for keyboard routing"
```

---

### Task 3: Manual verification

- [ ] Drag a god **deck** and a **unit** through the **empty** interior of **both** blind zones; release on the board — no stuck drag.
- [ ] Drag a single god **card** into your blind zone — still adds to `blindCardIds` and dock refreshes.
- [ ] With a god deck under cursor conditions for shuffle: **R** over a blind **card** / **border** strip does not shuffle; **R** over empty interior inside the frame behaves like over canvas.
- [ ] Wheel zoom over empty blind area and over a blind card — camera still zooms (`shouldApplyBoardCameraWheel`).

- [ ] **Step 2:** If all pass, final commit only if needed (e.g. doc tweak), or tag the verification in the last commit message body.

---

## Notes

- Do not change `godBlindZoneContainsWorldForSlot` / drop logic in `main.ts` unless a regression appears — spec assumes unchanged.
- Opponent blind backs use the same `.god-dock-card--blind-slot` class; `pointer-events: auto` keeps them from click-through to the board.
