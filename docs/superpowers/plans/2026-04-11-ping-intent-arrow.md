# Ping Intent Arrow Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a transient animated "look here" arrow ping that works on tablet and desktop without breaking existing left/right-click board interactions.

**Architecture:** Use a single-shot arming model (`pingIntentArmed`) driven by `Space` or a floating `Ping` control. Emit transient multiplayer events (`pingIntent`/`peerPingIntent`) and render pings as canvas world-space effects with TTL-based animation; do not store them in board snapshots.

**Tech Stack:** TypeScript, Vite client, WebSocket room server (`ws`), existing canvas `renderer.ts`.

**Spec:** `docs/superpowers/specs/2026-04-11-ping-intent-arrow-design.md`

---

## File Structure (planned changes)

| File | Responsibility |
|------|----------------|
| `src/multiplayer/protocol.ts` | Add typed ping-intent wire messages and parsing rules |
| `server/roomServer.ts` | Relay ping-intent events to room peers as transient events |
| `src/multiplayer/session.ts` | Send local ping-intent with cooldown; receive peer ping-intent and forward to renderer |
| `src/renderer.ts` | Store active ping markers, animate/draw, garbage-collect by TTL |
| `src/main.ts` | `pingIntentArmed` state machine, Space handling, board click interception, spawn local ping |
| `src/style.css` | Floating `Ping` control styles (desktop + touch-safe) |
| `tests/multiplayer/protocol.test.ts` | Parser tests for new message types |
| `package.json` | Test command for protocol parser test |

---

### Task 1: Add protocol parser tests first (TDD anchor)

**Files:**
- Create: `tests/multiplayer/protocol.test.ts`
- Modify: `package.json`

- [ ] **Step 1: Add a focused test script**

```json
{
  "scripts": {
    "test:protocol": "tsx --test tests/multiplayer/protocol.test.ts"
  }
}
```

- [ ] **Step 2: Write failing tests for the new client message**

```ts
import test from 'node:test';
import assert from 'node:assert/strict';
import { parseClientMessage } from '../../src/multiplayer/protocol.ts';

test('parseClientMessage accepts pingIntent with finite board coordinates', () => {
  const msg = parseClientMessage(JSON.stringify({ type: 'pingIntent', boardX: 12.5, boardY: -9 }));
  assert.deepEqual(msg, { type: 'pingIntent', boardX: 12.5, boardY: -9 });
});

test('parseClientMessage rejects pingIntent with non-number coordinates', () => {
  const msg = parseClientMessage(JSON.stringify({ type: 'pingIntent', boardX: '12', boardY: 7 }));
  assert.equal(msg, null);
});
```

- [ ] **Step 3: Run test to verify fail**

Run: `npm run test:protocol`  
Expected: FAIL because `pingIntent` is not yet in `ClientToServerMessage` / parser.

- [ ] **Step 4: Commit**

```bash
git add package.json tests/multiplayer/protocol.test.ts
git commit -m "test(mp): add failing parser tests for ping intent message"
```

---

### Task 2: Extend wire protocol for ping-intent

**Files:**
- Modify: `src/multiplayer/protocol.ts`
- Test: `tests/multiplayer/protocol.test.ts`

- [ ] **Step 1: Add protocol types**

```ts
export type ClientToServerMessage =
  | { type: 'createRoom' }
  | { type: 'joinRoom'; roomId: string; role: 'player' | 'spectator' }
  | { type: 'pointer'; boardX: number; boardY: number }
  | { type: 'pingIntent'; boardX: number; boardY: number }
  // ...

export type ServerToClientMessage =
  // ...
  | { type: 'peerPingIntent'; fromId: string; boardX: number; boardY: number }
  | { type: 'pong'; t: number };
```

- [ ] **Step 2: Parse `pingIntent` in `parseClientMessage`**

```ts
if (t === 'pingIntent') {
  const boardX = (o as { boardX?: number }).boardX;
  const boardY = (o as { boardY?: number }).boardY;
  if (typeof boardX !== 'number' || typeof boardY !== 'number') return null;
  if (!Number.isFinite(boardX) || !Number.isFinite(boardY)) return null;
  return { type: 'pingIntent', boardX, boardY };
}
```

- [ ] **Step 3: Run protocol tests**

Run: `npm run test:protocol`  
Expected: PASS.

- [ ] **Step 4: Commit**

```bash
git add src/multiplayer/protocol.ts tests/multiplayer/protocol.test.ts
git commit -m "feat(mp): add ping intent protocol messages"
```

---

### Task 3: Relay ping-intent on room server

**Files:**
- Modify: `server/roomServer.ts`

- [ ] **Step 1: Add relay branch for `pingIntent`**

```ts
if (msg.type === 'pingIntent') {
  if (!meta.roomId) return;
  broadcastRoom(
    meta.roomId,
    { type: 'peerPingIntent', fromId: meta.id, boardX: msg.boardX, boardY: msg.boardY },
    ws,
  );
  return;
}
```

- [ ] **Step 2: Run build/type check**

Run: `npm run build`  
Expected: PASS (no TS errors in shared protocol usage).

- [ ] **Step 3: Commit**

```bash
git add server/roomServer.ts
git commit -m "feat(mp): relay transient ping intent events in room server"
```

---

### Task 4: Render animated transient ping markers

**Files:**
- Modify: `src/renderer.ts`

- [ ] **Step 1: Add marker model + constants**

```ts
type PingMarker = { boardX: number; boardY: number; createdAtMs: number; color: string };
const PING_TTL_MS = 1200;
```

- [ ] **Step 2: Add renderer API**

```ts
spawnPingMarker(boardX: number, boardY: number, color: string): void {
  this.pingMarkers.push({ boardX, boardY, createdAtMs: performance.now(), color });
}
```

- [ ] **Step 3: Draw and garbage-collect in render pass**

```ts
private drawPingMarkers(nowMs: number): void {
  this.pingMarkers = this.pingMarkers.filter((m) => nowMs - m.createdAtMs < PING_TTL_MS);
  for (const m of this.pingMarkers) {
    const age = nowMs - m.createdAtMs;
    const alpha = age < 150 ? age / 150 : age < 900 ? 1 : Math.max(0, 1 - (age - 900) / 300);
    const scale = age < 150 ? 0.85 + (0.15 * age) / 150 : 1;
    this.drawPingArrowAt(m.boardX, m.boardY, alpha, scale, m.color);
  }
}
```

- [ ] **Step 4: Hook `drawPingMarkers(performance.now())` into the main draw order near other transient overlays (after board base, before/with remote pointers).**

- [ ] **Step 5: Run build**

Run: `npm run build`  
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add src/renderer.ts
git commit -m "feat(renderer): add animated transient ping arrow markers"
```

---

### Task 5: Wire multiplayer session to send/receive ping-intent

**Files:**
- Modify: `src/multiplayer/session.ts`

- [ ] **Step 1: Add outbound cooldown constant/state**

```ts
const PING_CLIENT_COOLDOWN_MS = 300;
let lastPingIntentSent = 0;
```

- [ ] **Step 2: Add sender helper**

```ts
export function sendPingIntentAtBoard(boardX: number, boardY: number): void {
  if (!currentRoomId || !client.connected) return;
  const now = performance.now();
  if (now - lastPingIntentSent < PING_CLIENT_COOLDOWN_MS) return;
  lastPingIntentSent = now;
  client.send({ type: 'pingIntent', boardX, boardY });
}
```

- [ ] **Step 3: Handle inbound `peerPingIntent`**

```ts
if (msg.type === 'peerPingIntent') {
  if (msg.fromId === myId) return;
  renderer.spawnPingMarker(msg.boardX, msg.boardY, colorForPeerId(msg.fromId));
  scheduleRender();
  return;
}
```

- [ ] **Step 4: Reset `lastPingIntentSent` on reconnect/disconnect alongside existing pointer reset points.**

- [ ] **Step 5: Run build + protocol tests**

Run: `npm run build && npm run test:protocol`  
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add src/multiplayer/session.ts
git commit -m "feat(mp): wire ping intent send/receive with cooldown"
```

---

### Task 6: Implement input model and spawn local pings in main

**Files:**
- Modify: `src/main.ts`

- [ ] **Step 1: Add ping state and guard helpers**

```ts
let pingIntentArmed = false;
let pingButtonHeldDesktop = false;

function canArmPingFromKeyboard(): boolean {
  const ae = document.activeElement as HTMLElement | null;
  if (!ae) return true;
  if (ae.closest('[contenteditable="true"]')) return false;
  const tag = ae.tagName;
  return tag !== 'INPUT' && tag !== 'TEXTAREA' && tag !== 'SELECT';
}
```

- [ ] **Step 2: Add keyboard arm/disarm (`Space`)**

```ts
window.addEventListener('keydown', (e) => {
  if (e.code !== 'Space') return;
  if (!canArmPingFromKeyboard()) return;
  pingIntentArmed = true;
});

window.addEventListener('keyup', (e) => {
  if (e.code !== 'Space') return;
  pingIntentArmed = false;
});
```

- [ ] **Step 3: Add floating ping control behavior**

```ts
// Desktop: hold button arms; release disarms (without shot if no board click).
// Touch: tap-to-arm single-shot.
```

Implementation detail for this step:
- create/update a `button` element in existing overlay UI bootstrap;
- pointer handlers:
  - `pointerdown` with mouse/pen -> `pingButtonHeldDesktop = true; pingIntentArmed = true;`
  - `pointerup|pointercancel` mouse/pen -> `pingButtonHeldDesktop = false; pingIntentArmed = false;`
  - `click` touch -> `pingIntentArmed = true` (single-shot arm).

- [ ] **Step 4: Intercept board primary click/tap before normal unit select/drag logic**

```ts
if (isPrimaryBoardPointer && pingIntentArmed) {
  const p = screenToBoard(e.clientX, e.clientY);
  renderer.spawnPingMarker(p.x, p.y, '#f59e0b');
  sendPingIntentAtBoard(p.x, p.y);
  pingIntentArmed = false;
  e.preventDefault();
  return;
}
```

- [ ] **Step 5: Add blur/focus reset**

```ts
window.addEventListener('blur', () => {
  pingIntentArmed = false;
  pingButtonHeldDesktop = false;
});
```

- [ ] **Step 6: Ensure right-click menu handlers and double-click unit-card behavior remain unchanged outside `pingIntentArmed`.**

- [ ] **Step 7: Run build**

Run: `npm run build`  
Expected: PASS.

- [ ] **Step 8: Commit**

```bash
git add src/main.ts
git commit -m "feat(input): add unified ping intent arming and board trigger"
```

---

### Task 7: Add/adjust floating Ping button styles

**Files:**
- Modify: `src/style.css`

- [ ] **Step 1: Add floating control styles**

```css
.ping-intent-fab {
  position: fixed;
  right: 16px;
  bottom: 92px;
  z-index: 90;
  border-radius: 999px;
  min-width: 64px;
  height: 40px;
  padding: 0 14px;
  touch-action: manipulation;
}

.ping-intent-fab--armed {
  box-shadow: 0 0 0 2px rgba(245, 158, 11, 0.5);
}
```

- [ ] **Step 2: Add responsive tweak for touch layouts (larger tap target).**

- [ ] **Step 3: Run build**

Run: `npm run build`  
Expected: PASS.

- [ ] **Step 4: Commit**

```bash
git add src/style.css
git commit -m "feat(ui): add floating ping button styles for desktop and tablet"
```

---

### Task 8: End-to-end verification and regression checks

**Files:**
- Modify (if needed): `docs/superpowers/specs/2026-04-11-ping-intent-arrow-design.md` (only if behavior clarification is discovered during verification)

- [ ] **Step 1: Run full command set**

Run: `npm run test:protocol && npm run build`  
Expected: both PASS.

- [ ] **Step 2: Manual scenario checks**

- Desktop: `Space + LMB` on board spawns arrow; expires by TTL.
- Desktop: floating `Ping` hold + click board also spawns arrow.
- Tablet/touch emulator: tap `Ping` (arm) then tap board spawns arrow.
- Right-click context menus still open on units/vortex.
- Double-click unit card behavior unchanged when not armed.
- Two clients in one room: peer receives ping with expected color and no flood under rapid input.
- `Space` while focused in text input does not arm ping.

- [ ] **Step 3: Final commit**

```bash
git add -A
git commit -m "feat(mp): add cross-platform transient ping intent arrow"
```

---

## Self-review checklist

- **Spec coverage:** Input model, visual animation, multiplayer transient transport, anti-spam, edge cases, and DoD are all mapped to Tasks 1-8.
- **Placeholder scan:** No TBD/TODO placeholders; each task has concrete files, commands, and expected outcomes.
- **Type consistency:** Uses `pingIntent` (C->S) and `peerPingIntent` (S->C) consistently across protocol, server, session, and renderer.
