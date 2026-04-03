/**
 * Ephirium vortex — fixed button (top-right): each draw picks a random card (uniform among 16);
 * up to two cards visible next to the button; each closable with ×.
 */

import { EPHIRIUM_VORTEX_CARDS, type EphiriumVortexCardDef } from './ephiriumVortexCards';
import {
  EPHYR_CARD_SPRITE_SRC,
  EPHYR_SPRITE_BG_SIZE_X,
  ephyrCardBackBgPercent,
  ephyrSpriteBgPercentForFace,
} from './ephiriumVortexSprite';

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

export class EphiriumVortexUi {
  private root: HTMLElement;
  private cardsRow: HTMLElement;
  private drawBtn: HTMLButtonElement;
  /** Open card roots in DOM order: first drawn = index 0 (visually nearest button in row-reverse). */
  private openRoots: HTMLElement[] = [];

  constructor(parent: HTMLElement) {
    this.root = el('div', 'ev-root');
    parent.appendChild(this.root);

    this.cardsRow = el('div', 'ev-cards-row');
    this.root.appendChild(this.cardsRow);

    this.drawBtn = el('button', 'ev-draw-btn') as HTMLButtonElement;
    this.drawBtn.type = 'button';
    this.drawBtn.title = 'Вытянуть карту вихря';
    this.drawBtn.setAttribute('aria-label', 'Вытянуть карту эфирного вихря');
    const img = el('img') as HTMLImageElement;
    img.src = '/ephirium-button.svg';
    img.alt = '';
    img.className = 'ev-draw-btn-img';
    this.drawBtn.appendChild(img);
    this.drawBtn.addEventListener('click', () => this.onDrawClick());
    this.root.appendChild(this.drawBtn);

    this.syncButtonState();
  }

  dispose(): void {
    this.root.remove();
  }

  private syncButtonState(): void {
    const full = this.openRoots.length >= 2;
    this.drawBtn.disabled = full;
    this.drawBtn.classList.toggle('ev-draw-btn-disabled', full);
    this.drawBtn.title = full
      ? 'Закройте одну из карт, чтобы вытянуть ещё'
      : 'Вытянуть карту вихря';
  }

  private drawNextCard(): { def: EphiriumVortexCardDef; spriteIndex: number } {
    const n = EPHIRIUM_VORTEX_CARDS.length;
    const spriteIndex = Math.floor(Math.random() * n);
    return { def: EPHIRIUM_VORTEX_CARDS[spriteIndex]!, spriteIndex };
  }

  private onDrawClick(): void {
    if (this.openRoots.length >= 2) return;
    const { def, spriteIndex } = this.drawNextCard();
    const cardRoot = this.buildCard(def, spriteIndex);
    this.openRoots.push(cardRoot);
    this.cardsRow.appendChild(cardRoot);
    this.syncButtonState();
  }

  private applySpriteBg(el: HTMLElement, xPct: number, yPct: number): void {
    el.style.backgroundImage = `url(${EPHYR_CARD_SPRITE_SRC})`;
    el.style.backgroundRepeat = 'no-repeat';
    el.style.backgroundSize = `${EPHYR_SPRITE_BG_SIZE_X} auto`;
    el.style.backgroundPosition = `${xPct}% ${yPct}%`;
  }

  private buildCard(def: EphiriumVortexCardDef, spriteIndex: number): HTMLElement {
    const wrap = el('div', 'ev-card');
    wrap.setAttribute('role', 'dialog');
    wrap.setAttribute(
      'aria-label',
      `${def.title}. Положительно: ${def.positive} Отрицательно: ${def.negative}`,
    );

    const close = el('button', 'ev-card-close') as HTMLButtonElement;
    close.type = 'button';
    close.textContent = '×';
    close.title = 'Закрыть';
    close.setAttribute('aria-label', 'Закрыть карту');
    close.addEventListener('click', (e) => {
      e.stopPropagation();
      this.closeCard(wrap);
    });
    wrap.appendChild(close);

    const flip = el('div', 'ev-card-flip');
    const inner = el('div', 'ev-card-flip-inner');
    const faceBack = el('div', 'ev-card-face ev-card-face--back');
    const backPct = ephyrCardBackBgPercent();
    this.applySpriteBg(faceBack, backPct.xPct, backPct.yPct);

    const faceFront = el('div', 'ev-card-face ev-card-face--front');
    const facePct = ephyrSpriteBgPercentForFace(spriteIndex);
    this.applySpriteBg(faceFront, facePct.xPct, facePct.yPct);

    inner.appendChild(faceBack);
    inner.appendChild(faceFront);
    flip.appendChild(inner);
    wrap.appendChild(flip);

    const prefersReduced =
      typeof window !== 'undefined' &&
      window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
    if (prefersReduced) {
      inner.classList.add('ev-card-flip-inner--revealed');
    } else {
      requestAnimationFrame(() => {
        requestAnimationFrame(() => {
          inner.classList.add('ev-card-flip-inner--revealed');
        });
      });
    }

    return wrap;
  }

  private closeCard(wrap: HTMLElement): void {
    const i = this.openRoots.indexOf(wrap);
    if (i === -1 || wrap.classList.contains('ev-card--exit')) return;
    this.openRoots.splice(i, 1);
    this.syncButtonState();

    const reduce =
      typeof window !== 'undefined' &&
      window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;

    const cleanup = (): void => {
      if (!wrap.parentNode) return;
      wrap.remove();
    };

    if (reduce) {
      cleanup();
      return;
    }

    wrap.classList.add('ev-card--exit');
    wrap.addEventListener('animationend', cleanup, { once: true });
    window.setTimeout(cleanup, 700);
  }
}
