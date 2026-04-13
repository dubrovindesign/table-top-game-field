# Implementation Plan: Dead Score Pill Near Dead Zone

**Spec:** `docs/superpowers/specs/2026-04-14-dead-score-pill-near-zone-design.md`

## Steps

### Step 1 — `src/style.css`: add pill positioning rule inside wrap

Add after the existing `.dead-score-mount` rule:

```css
.dead-unit-table-wrap .dead-score-mount {
  position: absolute;
  top: 0;
  left: 0;
  transform: translateY(calc(-100% - 4px));
  pointer-events: none;
  z-index: 1;
}
```

No other CSS changes needed.

---

### Step 2 — `src/deadUnitDock.ts`: mount pills in constructor, expose value elements

In `DeadUnitDock`:

1. Add two public fields to the class:
   ```ts
   myScoreValueEl!: HTMLElement;
   oppScoreValueEl!: HTMLElement;
   ```

2. In `constructor`, after `this.myWrap.appendChild(this.myZone)`:
   ```ts
   const myScoreMount = document.createElement('div');
   mountDeadScorePill(myScoreMount, 'local');
   this.myWrap.appendChild(myScoreMount);
   this.myScoreValueEl = myScoreMount.querySelector('.dead-score-pill__value') as HTMLElement;
   ```

3. After `this.oppWrap.appendChild(this.oppZone)`:
   ```ts
   const oppScoreMount = document.createElement('div');
   mountDeadScorePill(oppScoreMount, 'opponent');
   this.oppWrap.appendChild(oppScoreMount);
   this.oppScoreValueEl = oppScoreMount.querySelector('.dead-score-pill__value') as HTMLElement;
   ```

Note: `mountDeadScorePill` is defined in `main.ts`. If it cannot be imported into `deadUnitDock.ts` (circular dependency risk), inline the equivalent logic directly.

---

### Step 3 — `src/main.ts` → `mountTopTurnPanel`: remove pill setup

- Delete the two `mountDeadScorePill(...)` calls
- Delete `const opponentDeadScoreMount` and `const localDeadScoreMount` variables
- Remove `opponentDeadScoreMount` and `localDeadScoreMount` from the `opponentWingStack` / `localWingStack` `appendChild` calls
- Remove these two fields from the function's return type annotation and return statement

---

### Step 4 — `src/main.ts` → `refreshDeadScorePills`: update element references

Replace:
```ts
const locEl = topTurnPanel.localDeadScoreMount.querySelector('.dead-score-pill__value');
const oppEl = topTurnPanel.opponentDeadScoreMount.querySelector('.dead-score-pill__value');
if (locEl) locEl.textContent = `☠ ${localStats.points}`;
if (oppEl) oppEl.textContent = `☠ ${oppStats.points}`;
```

With:
```ts
deadUnitDock.myScoreValueEl.textContent = `☠ ${localStats.points}`;
deadUnitDock.oppScoreValueEl.textContent = `☠ ${oppStats.points}`;
```

(The null-checks are no longer needed — elements are guaranteed to exist after construction.)

---

### Step 5 — Fix any TypeScript errors

- The return type of `mountTopTurnPanel` references `localDeadScoreMount` and `opponentDeadScoreMount` — remove them from the interface/type.
- Check all usages of the `topTurnPanel` object for any remaining references to those fields and remove them.

---

## Order of execution

1 → 2 → 3 → 4 → 5 (in this order to keep the code compiling at each step)

## Verification

- Build passes (`tsc` / `vite build`) with no type errors
- Open the app, camera pan/zoom: pills follow their zones
- Pills no longer appear in the top turn panel
