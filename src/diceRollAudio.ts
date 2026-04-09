/**
 * Short “picker wheel” ticks during dice slot animation (Web Audio, no assets).
 */

let ctxSingleton: AudioContext | null = null;

export function getDiceAudioContext(): AudioContext | null {
  if (typeof window === 'undefined') return null;
  if (ctxSingleton) return ctxSingleton;
  const AC =
    window.AudioContext ||
    (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
  if (!AC) return null;
  ctxSingleton = new AC();
  return ctxSingleton;
}

/** Call from user gestures so the first tick is not blocked by autoplay policy. */
export function resumeDiceAudio(): Promise<void> {
  const ctx = getDiceAudioContext();
  if (!ctx || ctx.state !== 'suspended') return Promise.resolve();
  return ctx.resume().catch(() => undefined);
}

/** Slightly quieter than before — still audible as UI feedback. */
const TICK_PEAK_GAIN = 0.042;
/** First tick in a roll: a bit softer than the rest (edge transients). */
const FIRST_TICK_GAIN_SCALE = 0.68;
/**
 * Browsers quantize `setTimeout`; sub-ms “ideal” gaps from u⁴ collapse to 0 and two ticks fire as one
 * ~2× loud hit. Keep a real minimum spacing (still allows a fast drum ~70 Hz).
 */
const MIN_TICK_GAP_MS = 14;

/** Stops one tick’s nodes (used when cutting a roll short or starting a new one). */
const activeDiceTickVoices: Array<() => void> = [];

/**
 * Stops all in-flight tick sounds. Clearing timeouts alone is not enough — oscillators keep
 * ringing ~20ms; rapid re-rolls stack and clip. Call before scheduling a new loop and on cancel.
 */
export function silenceAllDiceTickVoices(): void {
  const copy = activeDiceTickVoices.slice();
  activeDiceTickVoices.length = 0;
  for (const stop of copy) {
    try {
      stop();
    } catch {
      /* ignore */
    }
  }
}

function playDiceTickInternal(
  ctx: AudioContext,
  opts?: { gainScale?: number; softAttack?: boolean },
): void {
  const gainScale = opts?.gainScale ?? 1;
  const soft = opts?.softAttack ?? false;
  const peak = TICK_PEAK_GAIN * gainScale;
  const t = ctx.currentTime;
  const osc = ctx.createOscillator();
  const gain = ctx.createGain();
  osc.type = 'triangle';
  osc.frequency.setValueAtTime(3400, t);
  osc.frequency.exponentialRampToValueAtTime(1100, t + 0.005);
  if (soft) {
    gain.gain.setValueAtTime(0.0001, t);
    gain.gain.linearRampToValueAtTime(peak, t + 0.0025);
  } else {
    gain.gain.setValueAtTime(peak, t);
  }
  gain.gain.exponentialRampToValueAtTime(0.0001, t + 0.016);
  osc.connect(gain);
  gain.connect(ctx.destination);

  let killed = false;
  const detachFromList = (fn: () => void): void => {
    const i = activeDiceTickVoices.indexOf(fn);
    if (i >= 0) activeDiceTickVoices.splice(i, 1);
  };

  const stopThisVoice = (): void => {
    if (killed) return;
    killed = true;
    detachFromList(stopThisVoice);
    const now = ctx.currentTime;
    try {
      gain.gain.cancelScheduledValues(now);
      const v = gain.gain.value;
      gain.gain.setValueAtTime(Math.max(v, 0.0001), now);
      gain.gain.exponentialRampToValueAtTime(0.0001, now + 0.003);
      osc.stop(now + 0.004);
    } catch {
      try {
        osc.disconnect();
        gain.disconnect();
      } catch {
        /* ignore */
      }
    }
  };

  activeDiceTickVoices.push(stopThisVoice);
  osc.onended = () => {
    detachFromList(stopThisVoice);
    try {
      osc.disconnect();
      gain.disconnect();
    } catch {
      /* ignore */
    }
  };

  osc.start(t);
  osc.stop(t + 0.02);
}

export function playDiceTick(): void {
  const ctx = getDiceAudioContext();
  if (!ctx || ctx.state === 'closed') return;
  try {
    playDiceTickInternal(ctx);
  } catch {
    /* ignore */
  }
}

/**
 * Tick timestamps: dense at the start (fast “drum”), sparse at the end (slowdown), then silence.
 * Quartic ease-in (u⁴): small gaps early, large gaps late — sounds decelerate, not accelerate.
 * Enforces `MIN_TICK_GAP_MS` so scheduled times never collapse to the same timer bucket.
 */
function deceleratingTickTimesMs(durationMs: number): number[] {
  const d = Math.max(0, durationMs);
  if (d <= 0) return [];

  const MIN_N = 16;
  const MAX_N = 48;
  const n = Math.min(MAX_N, Math.max(MIN_N, Math.round(d / 46)));
  /** Last tick around ~88% of the spin; tail matches visual settle. */
  const END_FRACTION = 0.88;
  const maxT = d * END_FRACTION;

  const raw: number[] = [];
  for (let i = 0; i < n; i++) {
    const u = n <= 1 ? 0 : i / (n - 1);
    raw.push(maxT * u ** 4);
  }

  const times: number[] = [];
  let last = -MIN_TICK_GAP_MS;
  for (const ideal of raw) {
    const t = Math.min(maxT, Math.max(ideal, last + MIN_TICK_GAP_MS));
    if (times.length > 0 && t <= last + 0.01) continue;
    times.push(t);
    last = t;
    if (t >= maxT - 0.01) break;
  }
  return times;
}

/** Repeating ticks for `durationMs` (aligned with CSS transition length). Returns cancel. */
export function startDiceTickLoop(durationMs: number): () => void {
  const timeoutIds: ReturnType<typeof setTimeout>[] = [];
  let cancelled = false;

  const stop = (): void => {
    for (const id of timeoutIds) clearTimeout(id);
    timeoutIds.length = 0;
    silenceAllDiceTickVoices();
  };

  const arm = (): void => {
    if (cancelled) return;
    silenceAllDiceTickVoices();
    const times = deceleratingTickTimesMs(durationMs);
    times.forEach((delayMs, idx) => {
      const id = window.setTimeout(() => {
        if (cancelled) return;
        const first = idx === 0;
        const ctx = getDiceAudioContext();
        if (!ctx || ctx.state === 'closed') return;
        try {
          playDiceTickInternal(ctx, {
            gainScale: first ? FIRST_TICK_GAIN_SCALE : 1,
            softAttack: first,
          });
        } catch {
          /* ignore */
        }
      }, Math.round(delayMs));
      timeoutIds.push(id);
    });
  };

  void resumeDiceAudio().then(() => {
    if (!cancelled) arm();
  });

  return () => {
    cancelled = true;
    stop();
  };
}

