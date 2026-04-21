/**
 * Ephirium vortex — fixed button (top-right): each draw picks a random card (uniform among 16);
 * up to two cards visible next to the button; each closable with ×.
 * В мультиплеере набор открытых карт синхронизируется через снимок стола (см. `applyOpenIndices`).
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

export type EphiriumVortexUiOptions = {
  /** Вытянуть карту (случайный индекс задаётся снаружи, затем вызывается `applyOpenIndices`). */
  requestDraw: () => void;
  /** Закрыть карту по индексу слота (0 — первая по порядку вытягивания). */
  requestCloseSlot: (slotIndex: number) => void;
};

export class EphiriumVortexUi {
  private root: HTMLElement;
  private cardsRow: HTMLElement;
  private scenarioLabel: HTMLElement;
  private drawBtn: HTMLButtonElement;
  private lastRenderedIndices: number[] = [];
  private opts: EphiriumVortexUiOptions;

  constructor(parent: HTMLElement, opts: EphiriumVortexUiOptions) {
    this.opts = opts;
    this.root = el('div', 'ev-root');
    parent.appendChild(this.root);

    this.cardsRow = el('div', 'ev-cards-row');
    this.root.appendChild(this.cardsRow);

    this.scenarioLabel = el('div', 'ev-scenario-label ev-scenario-label--hidden');
    this.root.appendChild(this.scenarioLabel);

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

    this.cardsRow.addEventListener('click', (e) => {
      const t = e.target;
      if (!(t instanceof Element)) return;
      const btn = t.closest('button.ev-card-close');
      if (!btn || !this.cardsRow.contains(btn)) return;
      e.preventDefault();
      e.stopPropagation();
      const card = btn.closest('.ev-card');
      if (!card || card.parentElement !== this.cardsRow) return;
      const slotIndex = Array.from(this.cardsRow.children).indexOf(card);
      if (slotIndex < 0) return;
      this.opts.requestCloseSlot(slotIndex);
    });

    this.applyOpenIndices([]);
    this.syncButtonState();
  }

  dispose(): void {
    this.root.remove();
  }

  /** Показывает/скрывает подпись с именем применённого сценария слева от кнопки. */
  setScenarioName(name: string | null | undefined, onClick?: () => void): void {
    const trimmed = name?.trim() ?? '';
    if (trimmed.length === 0) {
      this.scenarioLabel.textContent = '';
      this.scenarioLabel.classList.add('ev-scenario-label--hidden');
      this.scenarioLabel.classList.remove('ev-scenario-label--clickable');
      this.scenarioLabel.onclick = null;
      return;
    }
    this.scenarioLabel.textContent = trimmed;
    this.scenarioLabel.classList.remove('ev-scenario-label--hidden');
    if (onClick) {
      this.scenarioLabel.classList.add('ev-scenario-label--clickable');
      this.scenarioLabel.setAttribute('role', 'button');
      this.scenarioLabel.setAttribute('tabindex', '0');
      this.scenarioLabel.onclick = () => onClick();
    } else {
      this.scenarioLabel.classList.remove('ev-scenario-label--clickable');
      this.scenarioLabel.removeAttribute('role');
      this.scenarioLabel.removeAttribute('tabindex');
      this.scenarioLabel.onclick = null;
    }
  }

  /** Полная перерисовка открытых карт из индексов спрайта (синхронизация MP / локальное состояние). */
  applyOpenIndices(spriteIndices: readonly number[]): void {
    const next = spriteIndices.slice(0, 2);
    if (
      next.length === this.lastRenderedIndices.length &&
      next.every((v, i) => v === this.lastRenderedIndices[i])
    ) {
      this.syncButtonState();
      return;
    }

    const prev = this.lastRenderedIndices;
    const row = this.cardsRow;

    // Одна новая карта в конце — не трогаем уже открытые DOM-узлы (без повторного flip).
    if (next.length === prev.length + 1 && prev.every((v, i) => v === next[i])) {
      const spriteIndex = next[next.length - 1]!;
      const def = EPHIRIUM_VORTEX_CARDS[spriteIndex];
      if (def) row.appendChild(this.buildCard(def, spriteIndex, { animateFlip: true }));
      this.lastRenderedIndices = next;
      this.syncButtonState();
      return;
    }

    // Закрыли последнюю карту — снять только последний узел.
    if (
      next.length === prev.length - 1 &&
      prev.slice(0, next.length).every((v, i) => v === next[i])
    ) {
      row.lastElementChild?.remove();
      this.lastRenderedIndices = next;
      this.syncButtonState();
      return;
    }

    // Закрыли первую из двух — убрать первый ребёнок, вторая карта остаётся как есть.
    if (
      next.length === prev.length - 1 &&
      prev.length >= 2 &&
      next.length >= 1 &&
      next.every((v, i) => v === prev[i + 1]!)
    ) {
      row.firstElementChild?.remove();
      this.lastRenderedIndices = next;
      this.syncButtonState();
      return;
    }

    this.lastRenderedIndices = next;
    row.replaceChildren();
    for (let slot = 0; slot < next.length; slot++) {
      const spriteIndex = next[slot]!;
      const def = EPHIRIUM_VORTEX_CARDS[spriteIndex];
      if (!def) continue;
      row.appendChild(this.buildCard(def, spriteIndex));
    }
    this.syncButtonState();
  }

  private syncButtonState(): void {
    const full = this.lastRenderedIndices.length >= 2;
    this.drawBtn.disabled = full;
    this.drawBtn.classList.toggle('ev-draw-btn-disabled', full);
    this.drawBtn.title = full
      ? 'Закройте одну из карт, чтобы вытянуть ещё'
      : 'Вытянуть карту вихря';
  }

  private onDrawClick(): void {
    if (this.lastRenderedIndices.length >= 2) return;
    this.opts.requestDraw();
  }

  private applySpriteBg(el: HTMLElement, xPct: number, yPct: number): void {
    el.style.backgroundImage = `url(${EPHYR_CARD_SPRITE_SRC})`;
    el.style.backgroundRepeat = 'no-repeat';
    el.style.backgroundSize = `${EPHYR_SPRITE_BG_SIZE_X} auto`;
    el.style.backgroundPosition = `${xPct}% ${yPct}%`;
  }

  private buildCard(
    def: EphiriumVortexCardDef,
    spriteIndex: number,
    opts?: { animateFlip?: boolean },
  ): HTMLElement {
    const animateFlip = opts?.animateFlip !== false;

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
    if (prefersReduced || !animateFlip) {
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
}
