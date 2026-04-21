/**
 * Right-side slide-in panel showing the currently applied scenario's full description,
 * opened by clicking the scenario badge next to the Ephirium Vortex button.
 */

import { difficultyLabelRu, scenarioOrientationLabelRu } from './panelHelpers.ts';
import type { ScenarioDocument } from './types.ts';

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

export type AppliedScenarioSidePanelHandle = {
  open: (doc: ScenarioDocument) => void;
  close: () => void;
};

export function createAppliedScenarioSidePanel(): AppliedScenarioSidePanelHandle {
  const backdrop = el(
    'div',
    'applied-scenario-backdrop applied-scenario-backdrop--hidden',
  );
  backdrop.setAttribute('role', 'presentation');

  const panel = el('aside', 'applied-scenario-panel');
  panel.setAttribute('role', 'dialog');
  panel.setAttribute('aria-modal', 'false');
  panel.setAttribute('aria-label', 'Применённый сценарий');

  const header = el('div', 'applied-scenario-header');
  const title = el('div', 'applied-scenario-title', 'Применённый сценарий');
  const closeBtn = el('button', 'applied-scenario-close', '×') as HTMLButtonElement;
  closeBtn.type = 'button';
  closeBtn.setAttribute('aria-label', 'Закрыть');
  closeBtn.addEventListener('click', () => close());
  header.appendChild(title);
  header.appendChild(closeBtn);

  const body = el('div', 'applied-scenario-body');
  const nameEl = el('div', 'applied-scenario-name');
  const metaRow = el('div', 'scenarios-card-meta');
  const descEl = el('div', 'applied-scenario-desc');
  const tagsEl = el('div', 'scenarios-card-tags');
  body.appendChild(nameEl);
  body.appendChild(metaRow);
  body.appendChild(descEl);
  body.appendChild(tagsEl);

  panel.appendChild(header);
  panel.appendChild(body);
  backdrop.appendChild(panel);
  document.body.appendChild(backdrop);

  backdrop.addEventListener('click', (e) => {
    if (e.target === backdrop) close();
  });

  document.addEventListener('keydown', (ev: KeyboardEvent) => {
    if (ev.key !== 'Escape') return;
    if (!backdrop.classList.contains('applied-scenario-backdrop--hidden')) {
      close();
      ev.stopPropagation();
    }
  });

  function open(doc: ScenarioDocument): void {
    nameEl.textContent = doc.meta.name;
    descEl.textContent = doc.meta.description.trim() || '—';
    metaRow.replaceChildren();
    metaRow.appendChild(
      el('span', 'scenarios-card-pill', difficultyLabelRu(doc.meta.difficulty)),
    );
    metaRow.appendChild(
      el(
        'span',
        'scenarios-card-pill scenarios-card-pill--muted',
        scenarioOrientationLabelRu(doc.boardOrientation),
      ),
    );
    tagsEl.textContent =
      doc.meta.tags.length > 0 ? doc.meta.tags.map((t) => `#${t}`).join(' ') : '—';
    backdrop.classList.remove('applied-scenario-backdrop--hidden');
  }

  function close(): void {
    backdrop.classList.add('applied-scenario-backdrop--hidden');
  }

  return { open, close };
}
