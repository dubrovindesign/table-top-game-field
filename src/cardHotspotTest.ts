/**
 * Standalone dev page: image card + normalized hotspot rects, hover highlight.
 * Open /card-hotspot-test.html in dev or after build.
 */

import './cardHotspotTest.css';

import type { HotspotFile } from './catalog/hotspotTypes';

export type { HotspotFile, HotspotRegion } from './catalog/hotspotTypes';

function el<K extends keyof HTMLElementTagNameMap>(
  tag: K,
  cls?: string,
  text?: string,
): HTMLElementTagNameMap[K] {
  const e = document.createElement(tag);
  if (cls) e.className = cls;
  if (text !== undefined) e.textContent = text;
  return e;
}

function mount(data: HotspotFile): void {
  document.body.classList.add('cht-body');

  const wrap = el('div', 'cht-wrap');
  const head = el('div', 'cht-head');
  const h1 = el('h1', '', data.title ?? 'Card hotspots');
  head.appendChild(h1);
  head.appendChild(
    el(
      'p',
      '',
      'Наведите на полупрозрачные области — подсветка показывает зону клика. Координаты в JSON заданы в долях ширины/высоты картинки.',
    ),
  );
  wrap.appendChild(head);

  const card = el('div', 'cht-card');
  const img = document.createElement('img');
  img.src = data.image;
  img.alt = data.title ?? 'Card';
  card.appendChild(img);

  const status = el('div', 'cht-status', '');

  for (const r of data.regions) {
    const btn = el('button', 'cht-hotspot');
    btn.type = 'button';
    btn.setAttribute('aria-label', r.label);
    btn.style.setProperty('--x', String(r.x));
    btn.style.setProperty('--y', String(r.y));
    btn.style.setProperty('--w', String(r.w));
    btn.style.setProperty('--h', String(r.h));
    btn.title = `${r.label} (${r.id})`;
    btn.addEventListener('click', () => {
      status.textContent = `Клик: ${r.label} — id «${r.id}»`;
      console.log('[cardHotspotTest]', r.id, r);
    });
    btn.addEventListener('mouseenter', () => {
      status.textContent = `${r.label} (${r.id})`;
    });
    btn.addEventListener('mouseleave', () => {
      status.textContent = '';
    });
    card.appendChild(btn);
  }

  wrap.appendChild(card);
  wrap.appendChild(status);
  wrap.appendChild(
    el(
      'div',
      'cht-hint',
      'Подстройте доли в public/card-hotspots/kellantra-on-lagvud.hotspots.json при смещении арта. Размер эталона указан в referenceSize.',
    ),
  );
  document.body.appendChild(wrap);
}

async function main(): Promise<void> {
  const url = new URLSearchParams(window.location.search).get('data');
  const jsonPath = url && url.length > 0 ? url : '/card-hotspots/kellantra-on-lagvud.hotspots.json';
  const res = await fetch(jsonPath);
  if (!res.ok) throw new Error(`Failed to load ${jsonPath}: ${res.status}`);
  const data = (await res.json()) as HotspotFile;
  if (!data.image || !Array.isArray(data.regions)) throw new Error('Invalid hotspot JSON');
  mount(data);
}

main().catch((e) => {
  document.body.classList.add('cht-body');
  document.body.appendChild(el('p', '', String(e)));
  console.error(e);
});
