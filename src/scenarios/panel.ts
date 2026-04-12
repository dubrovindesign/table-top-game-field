/**
 * Scenarios browser: official + custom lists, import/export, apply with confirmation.
 */

import type { ApplyScenarioResult } from './apply.ts';
import { downloadScenarioJson, importScenariosFromJsonText } from './io.ts';
import { loadOfficialScenarioDocuments } from './official.ts';
import { list as listCustomScenarios, removeById, upsert } from './store.ts';
import type { ImportConflictStrategy } from './store.ts';
import type { ScenarioDocument } from './types.ts';
import {
  difficultyLabelRu,
  newScenarioDocumentId,
  parseTagsInput,
  scenarioOrientationLabelRu,
} from './panelHelpers.ts';

export type ScenariosPanelOptions = {
  buildCustomScenarioDocument: (meta: {
    name: string;
    description: string;
    tags: string[];
    difficulty: 'easy' | 'normal' | 'hard';
  }) => ScenarioDocument;
  applyScenario: (raw: unknown) => ApplyScenarioResult;
  /** After applying a scenario to the live board (e.g. scheduleRender). */
  afterScenarioMutation?: () => void;
};

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

function btn(label: string, cls: string, onClick: () => void): HTMLButtonElement {
  const b = el('button', cls, label) as HTMLButtonElement;
  b.type = 'button';
  b.addEventListener('click', (e) => {
    e.stopPropagation();
    onClick();
  });
  return b;
}

const APPLY_CONFIRM =
  'Применить этот сценарий? Текущее состояние поля будет полностью заменено (включая ориентацию доски).';
const DELETE_CONFIRM = 'Удалить этот сценарий из «Моих»? Это действие нельзя отменить.';
const IMPORT_CONFLICT_HINT =
  'При совпадении id с уже сохранёнными сценариями: OK — заменить существующие, Отмена — импортировать копии с новыми id.';

function showStorageFailure(actionLabel: string, error: unknown): void {
  const detail = error instanceof Error ? ` ${error.message}` : '';
  window.alert(`Не удалось ${actionLabel}. Ошибка сохранения в localStorage.${detail}`);
}

export function createScenariosPanel(opts: ScenariosPanelOptions): {
  open: () => void;
  close: () => void;
  readonly root: HTMLElement;
} {
  let officialDocs: ScenarioDocument[] = [];
  let activeTab: 'official' | 'custom' = 'official';

  const backdrop = el('div', 'scenarios-panel-backdrop scenarios-panel-backdrop--hidden');
  backdrop.setAttribute('role', 'presentation');

  const panel = el('div', 'scenarios-panel');
  panel.setAttribute('role', 'dialog');
  panel.setAttribute('aria-modal', 'true');
  panel.setAttribute('aria-label', 'Сценарии');

  const header = el('div', 'scenarios-panel-header');
  header.appendChild(el('div', 'scenarios-panel-title', 'Сценарии'));
  const closeBtn = btn('×', 'scenarios-panel-close', () => close());
  closeBtn.setAttribute('aria-label', 'Закрыть');
  header.appendChild(closeBtn);

  const tabRow = el('div', 'scenarios-panel-tabs');
  const tabOfficial = btn('Официальные', 'scenarios-panel-tab', () => setTab('official'));
  const tabCustom = btn('Мои', 'scenarios-panel-tab', () => setTab('custom'));
  tabRow.appendChild(tabOfficial);
  tabRow.appendChild(tabCustom);

  const toolbar = el('div', 'scenarios-panel-toolbar');
  const importInput = el('input') as HTMLInputElement;
  importInput.type = 'file';
  importInput.accept = 'application/json,.json';
  importInput.className = 'scenarios-panel-file-input';
  importInput.setAttribute('aria-hidden', 'true');
  const importBtn = btn('Импорт JSON', 'scenarios-panel-btn scenarios-panel-btn--secondary', () =>
    importInput.click(),
  );
  toolbar.appendChild(importBtn);
  toolbar.appendChild(importInput);

  const body = el('div', 'scenarios-panel-body');

  const createSection = el('div', 'scenarios-create-section');
  createSection.appendChild(el('div', 'scenarios-create-heading', 'Создать из текущего поля'));
  const createName = el('input', 'scenarios-field') as HTMLInputElement;
  createName.type = 'text';
  createName.placeholder = 'Название *';
  createName.autocomplete = 'off';
  const createDesc = el('textarea', 'scenarios-field scenarios-field--textarea') as HTMLTextAreaElement;
  createDesc.placeholder = 'Описание *';
  createDesc.rows = 2;
  const createTags = el('input', 'scenarios-field') as HTMLInputElement;
  createTags.type = 'text';
  createTags.placeholder = 'Теги (через запятую)';
  const createDiff = el('select', 'scenarios-field') as HTMLSelectElement;
  for (const [value, label] of [
    ['easy', 'Лёгкий'],
    ['normal', 'Нормальный'],
    ['hard', 'Сложный'],
  ] as const) {
    const o = document.createElement('option');
    o.value = value;
    o.textContent = label;
    createDiff.appendChild(o);
  }
  const createBtn = btn('Сохранить сценарий', 'scenarios-panel-btn scenarios-panel-btn--primary', () => {
    const name = createName.value.trim();
    if (!name) {
      window.alert('Укажите название сценария.');
      return;
    }
    const description = createDesc.value.trim();
    if (!description) {
      window.alert('Укажите описание сценария.');
      return;
    }
    const doc = opts.buildCustomScenarioDocument({
      name,
      description,
      tags: parseTagsInput(createTags.value),
      difficulty: createDiff.value as 'easy' | 'normal' | 'hard',
    });
    try {
      upsert(doc);
    } catch (error) {
      showStorageFailure('сохранить сценарий', error);
      return;
    }
    refreshAndRender();
  });
  createSection.appendChild(createName);
  createSection.appendChild(createDesc);
  createSection.appendChild(createTags);
  createSection.appendChild(createDiff);
  createSection.appendChild(createBtn);

  const metaOverlay = el('div', 'scenarios-meta-overlay scenarios-meta-overlay--hidden');
  const metaDialog = el('div', 'scenarios-meta-dialog');
  metaDialog.appendChild(el('div', 'scenarios-meta-title', 'Редактировать метаданные'));
  const editName = el('input', 'scenarios-field') as HTMLInputElement;
  editName.type = 'text';
  const editDesc = el('textarea', 'scenarios-field scenarios-field--textarea') as HTMLTextAreaElement;
  editDesc.rows = 3;
  const editTags = el('input', 'scenarios-field') as HTMLInputElement;
  editTags.type = 'text';
  const editDiff = el('select', 'scenarios-field') as HTMLSelectElement;
  for (const [value, label] of [
    ['easy', 'Лёгкий'],
    ['normal', 'Нормальный'],
    ['hard', 'Сложный'],
  ] as const) {
    const o = document.createElement('option');
    o.value = value;
    o.textContent = label;
    editDiff.appendChild(o);
  }
  const metaActions = el('div', 'scenarios-meta-actions');
  let editingId: string | null = null;
  metaActions.appendChild(
    btn('Отмена', 'scenarios-panel-btn scenarios-panel-btn--secondary', () => closeMetaEditor()),
  );
  metaActions.appendChild(
    btn('Сохранить', 'scenarios-panel-btn scenarios-panel-btn--primary', () => {
      if (!editingId) return;
      const existing = listCustomScenarios().find((d) => d.id === editingId);
      if (!existing) {
        closeMetaEditor();
        return;
      }
      const name = editName.value.trim();
      if (!name) {
        window.alert('Укажите название.');
        return;
      }
      const description = editDesc.value.trim();
      if (!description) {
        window.alert('Укажите описание.');
        return;
      }
      try {
        upsert({
          ...existing,
          meta: {
            ...existing.meta,
            name,
            description,
            tags: parseTagsInput(editTags.value),
            difficulty: editDiff.value as 'easy' | 'normal' | 'hard',
            updatedAt: new Date().toISOString(),
          },
        });
      } catch (error) {
        showStorageFailure('обновить сценарий', error);
        return;
      }
      closeMetaEditor();
      refreshAndRender();
    }),
  );
  metaDialog.appendChild(editName);
  metaDialog.appendChild(editDesc);
  metaDialog.appendChild(editTags);
  metaDialog.appendChild(editDiff);
  metaDialog.appendChild(metaActions);
  metaOverlay.appendChild(metaDialog);

  function openMetaEditor(doc: ScenarioDocument): void {
    editingId = doc.id;
    editName.value = doc.meta.name;
    editDesc.value = doc.meta.description;
    editTags.value = doc.meta.tags.join(', ');
    editDiff.value = doc.meta.difficulty;
    metaOverlay.classList.remove('scenarios-meta-overlay--hidden');
  }

  function closeMetaEditor(): void {
    editingId = null;
    metaOverlay.classList.add('scenarios-meta-overlay--hidden');
  }

  metaOverlay.addEventListener('click', (e) => {
    if (e.target === metaOverlay) closeMetaEditor();
  });

  function setTab(tab: 'official' | 'custom'): void {
    activeTab = tab;
    tabOfficial.classList.toggle('scenarios-panel-tab--active', tab === 'official');
    tabCustom.classList.toggle('scenarios-panel-tab--active', tab === 'custom');
    createSection.classList.toggle('scenarios-create-section--hidden', tab !== 'custom');
    toolbar.classList.toggle('scenarios-panel-toolbar--hidden', tab !== 'custom');
    renderCardList();
  }

  function tryApply(doc: ScenarioDocument): void {
    if (!window.confirm(APPLY_CONFIRM)) return;
    const result = opts.applyScenario(doc);
    if (!result.ok) {
      window.alert(result.error);
      return;
    }
    opts.afterScenarioMutation?.();
    close();
  }

  function promptImportConflict(): ImportConflictStrategy {
    return window.confirm(IMPORT_CONFLICT_HINT) ? 'replace' : 'keep-both';
  }

  importInput.addEventListener('change', () => {
    const file = importInput.files?.[0];
    importInput.value = '';
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      const text = typeof reader.result === 'string' ? reader.result : '';
      const conflict = promptImportConflict();
      const result = importScenariosFromJsonText(text, conflict);
      if (!result.ok) {
        window.alert(result.error);
        return;
      }
      window.alert(`Импортировано сценариев: ${result.value.imported}.`);
      refreshAndRender();
    };
    reader.onerror = () => {
      const reason =
        reader.error instanceof Error && reader.error.message
          ? ` ${reader.error.message}`
          : '';
      window.alert(`Не удалось прочитать выбранный JSON-файл.${reason}`);
    };
    reader.readAsText(file);
  });

  function renderCard(doc: ScenarioDocument, mode: 'official' | 'custom'): HTMLElement {
    const card = el('article', 'scenarios-card');
    card.appendChild(el('div', 'scenarios-card-name', doc.meta.name));
    const desc = doc.meta.description.trim() || '—';
    card.appendChild(el('div', 'scenarios-card-desc', desc));
    const tags =
      doc.meta.tags.length > 0 ? doc.meta.tags.map((t) => `#${t}`).join(' ') : '—';
    card.appendChild(el('div', 'scenarios-card-tags', tags));
    const metaRow = el('div', 'scenarios-card-meta');
    metaRow.appendChild(
      el('span', 'scenarios-card-pill', difficultyLabelRu(doc.meta.difficulty)),
    );
    metaRow.appendChild(
      el('span', 'scenarios-card-pill scenarios-card-pill--muted', scenarioOrientationLabelRu(doc.boardOrientation)),
    );
    card.appendChild(metaRow);

    const actions = el('div', 'scenarios-card-actions');
    actions.appendChild(
      btn('Применить', 'scenarios-panel-btn scenarios-panel-btn--small scenarios-panel-btn--primary', () =>
        tryApply(doc),
      ),
    );
    if (mode === 'custom') {
      actions.appendChild(
        btn('Правка', 'scenarios-panel-btn scenarios-panel-btn--small', () => openMetaEditor(doc)),
      );
      actions.appendChild(
        btn('Дубль', 'scenarios-panel-btn scenarios-panel-btn--small', () => {
          const copy: ScenarioDocument = {
            ...doc,
            id: newScenarioDocumentId(),
            kind: 'custom',
            meta: {
              ...doc.meta,
              name: `${doc.meta.name} (копия)`,
              updatedAt: new Date().toISOString(),
            },
          };
          try {
            upsert(copy);
          } catch (error) {
            showStorageFailure('создать копию сценария', error);
            return;
          }
          refreshAndRender();
        }),
      );
      actions.appendChild(
        btn('Экспорт', 'scenarios-panel-btn scenarios-panel-btn--small', () => {
          const safe = doc.meta.name.replace(/[^\w\u0400-\u04FF\-]+/g, '_').slice(0, 80) || 'scenario';
          downloadScenarioJson(doc, `${safe}.json`, { pretty: true });
        }),
      );
      actions.appendChild(
        btn('Удалить', 'scenarios-panel-btn scenarios-panel-btn--small scenarios-panel-btn--danger', () => {
          if (!window.confirm(DELETE_CONFIRM)) return;
          try {
            removeById(doc.id);
          } catch (error) {
            showStorageFailure('удалить сценарий', error);
            return;
          }
          refreshAndRender();
        }),
      );
    }
    card.appendChild(actions);
    return card;
  }

  function renderCardList(): void {
    body.replaceChildren();
    const listEl = el('div', 'scenarios-card-grid');
    if (activeTab === 'official') {
      if (officialDocs.length === 0) {
        listEl.appendChild(el('div', 'scenarios-panel-empty', 'Нет официальных сценариев.'));
      } else {
        for (const d of officialDocs) listEl.appendChild(renderCard(d, 'official'));
      }
    } else {
      const custom = listCustomScenarios();
      if (custom.length === 0) {
        listEl.appendChild(
          el('div', 'scenarios-panel-empty', 'Пока нет сохранённых сценариев — создайте из поля или импортируйте JSON.'),
        );
      } else {
        for (const d of custom) listEl.appendChild(renderCard(d, 'custom'));
      }
    }
    body.appendChild(listEl);
  }

  function refreshAndRender(): void {
    try {
      officialDocs = loadOfficialScenarioDocuments();
    } catch (e) {
      officialDocs = [];
      const msg = e instanceof Error ? e.message : String(e);
      console.error('[scenarios] loadOfficialScenarioDocuments', e);
      window.alert(`Не удалось загрузить официальные сценарии: ${msg}`);
    }
    renderCardList();
  }

  function open(): void {
    backdrop.classList.remove('scenarios-panel-backdrop--hidden');
    closeMetaEditor();
    refreshAndRender();
    setTab(activeTab);
  }

  function close(): void {
    closeMetaEditor();
    backdrop.classList.add('scenarios-panel-backdrop--hidden');
  }

  panel.appendChild(header);
  panel.appendChild(tabRow);
  panel.appendChild(toolbar);
  panel.appendChild(body);
  panel.appendChild(createSection);
  backdrop.appendChild(panel);
  backdrop.appendChild(metaOverlay);
  document.body.appendChild(backdrop);

  closeBtn.addEventListener('click', (e) => {
    e.stopPropagation();
    close();
  });
  backdrop.addEventListener('click', (e) => {
    if (e.target === backdrop) close();
  });
  document.addEventListener(
    'keydown',
    function onEsc(ev: KeyboardEvent) {
      if (ev.key !== 'Escape') return;
      if (!backdrop.classList.contains('scenarios-panel-backdrop--hidden')) {
        if (!metaOverlay.classList.contains('scenarios-meta-overlay--hidden')) {
          closeMetaEditor();
          ev.stopPropagation();
          return;
        }
        close();
      }
    },
    true,
  );

  return { open, close, root: backdrop };
}
