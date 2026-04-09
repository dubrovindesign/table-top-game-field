/**
 * Board canvas drag feedback.
 * Lift: `public/sfx/openbottle.mp3` (HTMLAudioElement).
 * Drop: synthesized Web Audio (filtered noise + low thump).
 */

const LIFT_SRC = '/sfx/openbottle.mp3';

const liftAudio = new Audio(LIFT_SRC);
liftAudio.preload = 'auto';
liftAudio.volume = 0.1125;

let ctx: AudioContext | null = null;

if (typeof window !== 'undefined') {
  window.addEventListener(
    'pointerdown',
    () => {
      const c = getAudioContext();
      if (c && c.state === 'suspended') void c.resume();
    },
    { capture: true, passive: true },
  );
}

function getAudioContext(): AudioContext | null {
  if (ctx) return ctx;
  const Ctor =
    window.AudioContext ??
    (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
  if (!Ctor) return null;
  ctx = new Ctor();
  return ctx;
}

function resumeAndRun(fn: (c: AudioContext) => void): void {
  const c = getAudioContext();
  if (!c) return;
  const run = (): void => fn(c);
  if (c.state === 'suspended') {
    void c.resume().then(run).catch(run);
  } else {
    run();
  }
}

/** Master gain for synthesized drop (noise + thump). */
const DROP_GAIN = 0.35;

/** Card-on-table — filtered noise burst + low thump. */
function playDropInternal(c: AudioContext): void {
  const t = c.currentTime;
  const g = DROP_GAIN;
  const duration = 0.1;
  const n = Math.floor(c.sampleRate * duration);
  const buf = c.createBuffer(1, n, c.sampleRate);
  const ch = buf.getChannelData(0);
  for (let i = 0; i < n; i++) {
    ch[i] = (Math.random() * 2 - 1) * Math.exp(-i / (c.sampleRate * 0.018));
  }
  const noise = c.createBufferSource();
  noise.buffer = buf;
  const lp = c.createBiquadFilter();
  lp.type = 'lowpass';
  lp.frequency.setValueAtTime(2200, t);
  const gNoise = c.createGain();
  gNoise.gain.setValueAtTime(0.11 * g, t);
  gNoise.gain.exponentialRampToValueAtTime(0.0008 * g, t + duration);
  noise.connect(lp);
  lp.connect(gNoise);
  gNoise.connect(c.destination);
  noise.start(t);
  noise.stop(t + duration);

  const osc = c.createOscillator();
  const gOsc = c.createGain();
  osc.type = 'sine';
  osc.frequency.setValueAtTime(200, t);
  osc.frequency.exponentialRampToValueAtTime(55, t + 0.09);
  gOsc.gain.setValueAtTime(0, t);
  gOsc.gain.linearRampToValueAtTime(0.22 * g, t + 0.003);
  gOsc.gain.exponentialRampToValueAtTime(0.0008 * g, t + 0.11);
  osc.connect(gOsc);
  gOsc.connect(c.destination);
  osc.start(t);
  osc.stop(t + 0.12);
}

export function playBoardDragLift(): void {
  liftAudio.currentTime = 0;
  void liftAudio.play().catch(() => {});
}

export function playBoardDragDrop(): void {
  resumeAndRun(playDropInternal);
}
