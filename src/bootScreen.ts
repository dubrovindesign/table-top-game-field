/**
 * Full-screen boot overlay: logo + animated progress while critical images and fonts load.
 */

import { FACTIONS } from './armyCatalog.ts';
import { uniqueGodCardSpriteSheetUrls, preloadGodCardSpriteSheets } from './godCards.ts';
import { EFFECT_MARKERS } from './effectMarkerMenu.ts';
import { ETHER_VORTEX_DOMAINS } from './etherVortex.ts';
import { EPHYR_CARD_SPRITE_SRC } from './ephiriumVortexSprite.ts';
import { defaultRenderConfig } from './renderer.ts';

const LOGO_SRC = '/mobile-logo.webp';

/** Matches `main.ts` field + default unit sprites (huge uses null). */
const BOARD_AND_UNIT_URLS: readonly string[] = [
  '/fieldwithtrees.png',
  '/tern-unit-1.jpg',
  '/Frame 144.png',
  '/Frame 118.png',
  '/Frame 193.png',
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
];

function collectBootImageUrls(): string[] {
  const set = new Set<string>();
  for (const u of BOARD_AND_UNIT_URLS) set.add(u);
  if (defaultRenderConfig.terrainImageSrc) set.add(defaultRenderConfig.terrainImageSrc);
  set.add(EPHYR_CARD_SPRITE_SRC);
  for (const u of uniqueGodCardSpriteSheetUrls()) set.add(u);
  for (const d of ETHER_VORTEX_DOMAINS) set.add(d.imageSrc);
  for (const f of FACTIONS) set.add(f.panelIconSrc);
  for (const m of EFFECT_MARKERS) set.add(m.iconSrc);
  for (const u of DICE_FACE_URLS) set.add(u);
  set.add(LOGO_SRC);
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

/**
 * Blocks until heavy images, god card sheets, and Langar are ready; shows branded overlay.
 */
export async function runInitialBootScreen(): Promise<void> {
  const ui = mountBootScreen();
  const urls = collectBootImageUrls();
  const totalSteps = urls.length + 2;
  let doneSteps = 0;

  const syncBar = (): void => {
    ui.setProgress(doneSteps, totalSteps);
  };

  ui.setCaption('Загрузка текстур и арта…');
  syncBar();

  await preloadImagesWithProgress(urls, (d, t) => {
    doneSteps = d;
    syncBar();
    ui.setCaption(`Загрузка… ${d} / ${t}`);
  });

  doneSteps = urls.length;
  syncBar();
  ui.setCaption('Карты богов…');

  try {
    await preloadGodCardSpriteSheets();
  } catch (e) {
    console.warn(e);
  }
  doneSteps = urls.length + 1;
  syncBar();

  ui.setCaption('Шрифты…');
  if (document.fonts) {
    try {
      await document.fonts.load('16px Langar');
    } catch {
      /* ignore */
    }
  }
  doneSteps = urls.length + 2;
  syncBar();
  ui.setCaption('Готово');

  await ui.remove();
}
