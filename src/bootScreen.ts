/**
 * Full-screen boot overlay: logo + progress while critical assets load and `main` chunk runs.
 * Heavy art (dice, markers, god sheets, Ephyr sprite, frame PNGs) loads after overlay via idle callback.
 */

import factionsJson from './catalog/factions.json';
import type { FactionDef } from './catalog/types.ts';
import { preloadGodCardSpriteSheets } from './godCards.ts';
import { EFFECT_MARKERS } from './effectMarkerMenu.ts';
import { ETHER_VORTEX_DOMAINS } from './etherVortex.ts';
import { EPHYR_CARD_SPRITE_SRC } from './ephiriumVortexSprite.ts';
import { defaultRenderConfig } from './renderConfig.ts';

const FACTIONS = factionsJson as FactionDef[];

const LOGO_SRC = '/mobile-logo.webp';

/** Field + default small mini — needed before first paint of the board. */
const CRITICAL_IMAGE_URLS: readonly string[] = [
  '/fieldwithtrees.webp',
  '/tern-unit-1.jpg',
];

/** Dice result icons (small SVGs). */
const DICE_FACE_URLS: readonly string[] = [
  '/red-dice-miss.svg',
  '/red-dice-hit.svg',
  '/red-dice-crit.svg',
  '/white-miss.svg',
  '/white-block.svg',
  '/white-crit-block.svg',
  '/black-miss.svg',
  '/black-success.svg',
  '/green-miss.svg',
  '/green-success.svg',
  '/aid.svg',
  '/bleed.svg',
  '/fire.svg',
  '/panic.svg',
  '/slow.svg',
  '/stun.svg',
];

/** Matches `main.ts` alternate unit / big / large frames (deferred). */
const DEFERRED_FRAME_AND_FIELD_URLS: readonly string[] = [
  '/Frame 144.png',
  '/Frame 118.png',
  '/Frame 193.png',
];

function collectDeferredImageUrls(): string[] {
  const set = new Set<string>();
  for (const u of DEFERRED_FRAME_AND_FIELD_URLS) set.add(u);
  set.add(EPHYR_CARD_SPRITE_SRC);
  for (const d of ETHER_VORTEX_DOMAINS) set.add(d.imageSrc);
  for (const f of FACTIONS) set.add(f.panelIconSrc);
  for (const m of EFFECT_MARKERS) set.add(m.iconSrc);
  for (const u of DICE_FACE_URLS) set.add(u);
  return [...set];
}

function loadImage(url: string): Promise<void> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => {
      if (typeof img.decode === 'function') {
        void img.decode().then(() => resolve()).catch(() => resolve());
      } else {
        resolve();
      }
    };
    img.onerror = () => reject(new Error(`[boot] failed to load ${url}`));
    img.src = url;
  });
}

async function preloadImagesWithProgress(
  urls: string[],
  onDoneCount: (done: number, total: number) => void,
): Promise<void> {
  const total = urls.length;
  let done = 0;
  onDoneCount(0, total);
  await Promise.all(
    urls.map(async (url) => {
      try {
        await loadImage(url);
      } catch (e) {
        console.warn(e);
      } finally {
        done += 1;
        onDoneCount(done, total);
      }
    }),
  );
}

function mountBootScreen(): {
  setProgress: (done: number, total: number) => void;
  setCaption: (text: string) => void;
  remove: () => Promise<void>;
} {
  const root = document.createElement('div');
  root.className = 'boot-screen';
  root.setAttribute('role', 'progressbar');
  root.setAttribute('aria-valuemin', '0');
  root.setAttribute('aria-valuemax', '100');
  root.setAttribute('aria-valuenow', '0');
  root.innerHTML = `
    <div class="boot-screen-backdrop"></div>
    <div class="boot-screen-card">
      <img class="boot-screen-logo" src="${LOGO_SRC}" width="160" height="160" alt="" decoding="async" />
      <div class="boot-screen-bar-track" aria-hidden="true">
        <div class="boot-screen-bar-fill"></div>
        <div class="boot-screen-bar-glow"></div>
      </div>
      <p class="boot-screen-caption">Загрузка…</p>
    </div>
  `;
  document.body.appendChild(root);

  const fill = root.querySelector('.boot-screen-bar-fill') as HTMLElement;
  const caption = root.querySelector('.boot-screen-caption') as HTMLElement;

  return {
    setProgress(done: number, total: number) {
      const pct = total <= 0 ? 100 : Math.max(0, Math.min(100, Math.round((done / total) * 100)));
      fill.style.width = `${pct}%`;
      root.setAttribute('aria-valuenow', String(pct));
    },
    setCaption(text: string) {
      caption.textContent = text;
    },
    remove() {
      return new Promise<void>((resolve) => {
        root.classList.add('boot-screen--out');
        window.setTimeout(() => {
          root.remove();
          resolve();
        }, 420);
      });
    },
  };
}

function scheduleDeferredBootLoads(): void {
  const urls = collectDeferredImageUrls();
  const run = (): void => {
    void preloadGodCardSpriteSheets().catch((e) => {
      console.warn(e);
    });
    for (const u of urls) {
      const img = new Image();
      img.src = u;
    }
  };
  window.setTimeout(run, 0);
}

export type BootScreenOptions = {
  /** Resolves when `main.ts` has finished evaluating (including catalog fetch). */
  mainModulePromise: Promise<unknown>;
};

/**
 * Preloads minimal textures in parallel with the main module; defers god sheets and secondary art.
 */
export async function runInitialBootScreen(options: BootScreenOptions): Promise<void> {
  const ui = mountBootScreen();
  const critical: string[] = [LOGO_SRC, ...CRITICAL_IMAGE_URLS];
  if (defaultRenderConfig.terrainImageSrc) critical.push(defaultRenderConfig.terrainImageSrc);

  const totalTrack = critical.length + 1;
  let imagesLoaded = 0;
  let mainLoaded = false;

  const bumpProgress = (): void => {
    const done = imagesLoaded + (mainLoaded ? 1 : 0);
    ui.setProgress(done, totalTrack);
  };

  ui.setCaption('Загрузка…');
  bumpProgress();

  await Promise.all([
    options.mainModulePromise.then(() => {
      mainLoaded = true;
      bumpProgress();
    }),
    preloadImagesWithProgress(critical, (d, t) => {
      imagesLoaded = d;
      ui.setCaption(`Текстуры… ${d} / ${t}`);
      bumpProgress();
    }),
  ]);

  ui.setCaption('Готово');
  bumpProgress();
  await ui.remove();
  scheduleDeferredBootLoads();
}
