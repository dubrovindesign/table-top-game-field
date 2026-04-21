/**
 * Scenarios browser: official + custom lists, import/export, apply with confirmation.
 */

import type { ApplyScenarioResult } from './apply.ts';
import { downloadScenarioJson, importScenariosFromJsonText } from './io.ts';
import { OfficialApiError } from './officialApi.ts';
import { list as listCustomScenarios, removeById, upsert } from './store.ts';
import type { ImportConflictStrategy } from './store.ts';
import type { ScenarioDocument } from './types.ts';
import {
  difficultyLabelRu,
  newScenarioDocumentId,
  parseTagsInput,
  scenarioOrientationLabelRu,
  type EditableScenarioMeta,
} from './panelHelpers.ts';

export type ScenariosPanelOptions = {
  buildCustomScenarioDocument: (meta: EditableScenarioMeta) => ScenarioDocument;
  applyScenario: (raw: unknown) => ApplyScenarioResult;
  /** After applying a scenario to the live board (e.g. scheduleRender). */
  afterScenarioMutation?: () => void;
  /** Called after a successful scenario apply with the applied document. */
  onScenarioApplied?: (doc: ScenarioDocument) => void;
  /** Runtime official catalog from HTTP API (not static seed). */
  loadOfficialScenarios: () => Promise<ScenarioDocument[]>;
  updateOfficialScenario: (doc: ScenarioDocument) => Promise<ScenarioDocument>;
  /** Official document for PUT with updated meta only — snapshot/orientation copied from base. */
  buildOfficialScenarioMetaOnly: (base: ScenarioDocument, meta: EditableScenarioMeta) => ScenarioDocument;
  /** Scenario (custom or official) with current live board snapshot + orientation, meta copied from base. */
  buildScenarioWithCurrentBoard: (base: ScenarioDocument) => ScenarioDocument;
};

export type ScenariosPanelHandle = {
  open: () => void;
  close: () => void;
  readonly root: HTMLElement;
  /**
   * When the server broadcasts official catalog changes — refresh list and, if the user is editing
   * that official scenario, arm the LWW save confirmation.
   */
  onOfficialScenariosRemoteInvalidation: (
    changedIds: readonly string[],
    options?: { silent?: boolean },
  ) => void;
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
  'Применить этот сценарий на стол? Текущее состояние поля будет полностью заменено (включая ориентацию доски).';
const DELETE_CONFIRM = 'Удалить этот сценарий из «Моих»? Это действие нельзя отменить.';
const IMPORT_CONFLICT_HINT =
  'При совпадении id с уже сохранёнными сценариями: OK — заменить существующие, Отмена — импортировать копии с новыми id.';
const OFFICIAL_SAVE_GLOBAL_CONFIRM =
  'Сохранить изменения официального сценария? Они будут видны всем пользователям и заменят текущую опубликованную версию.';
const OFFICIAL_LWW_CONFIRM =
  'Сценарий уже был изменён (другим пользователем или в другой вкладке). Сохранить и перезаписать последнюю версию?';
const CUSTOM_BOARD_OVERWRITE_CONFIRM =
  'Перезаписать сохранённые объекты сценария текущим состоянием поля? Прежний снимок доски будет заменён.';
const OFFICIAL_BOARD_OVERWRITE_CONFIRM =
  'Перезаписать официальный сценарий текущим состоянием поля? Прежний снимок доски будет заменён для всех пользователей.';

function showStorageFailure(actionLabel: string, error: unknown): void {
  const detail = error instanceof Error ? ` ${error.message}` : '';
  window.alert(`Не удалось ${actionLabel}. Ошибка сохранения в localStorage.${detail}`);
}

type MetaEditorState =
  | null
  | { kind: 'custom'; id: string }
  | {
      kind: 'official';
      base: ScenarioDocument;
      baselineUpdatedAt: string | undefined;
    };

export function createScenariosPanel(opts: ScenariosPanelOptions): ScenariosPanelHandle {
  let officialDocs: ScenarioDocument[] = [];
  let activeTab: 'official' | 'custom' = 'official';
  let metaEditorState: MetaEditorState = null;
  /** True when a remote change may have superseded the baseline snapshot for the open official editor. */
  let officialLwwPending = false;
  /** Guards against overlapping loads (latest response wins). */
  let officialLoadSeq = 0;
  /** Prevents duplicate save submits from the same dialog state. */
  let metaSaveInFlight = false;

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

  const officialToolbar = el('div', 'scenarios-panel-toolbar scenarios-panel-toolbar--start');
  const randomBtn = btn(
    'Выбрать случайный сценарий',
    'scenarios-panel-btn scenarios-panel-btn--primary',
    () => startRandomOfficialPick(),
  );
  officialToolbar.appendChild(randomBtn);

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
    void refreshAndRender();
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
  const metaCancelBtn = btn(
    'Отмена',
    'scenarios-panel-btn scenarios-panel-btn--secondary',
    () => closeMetaEditor(),
  );
  const metaSaveBtn = btn('Сохранить', 'scenarios-panel-btn scenarios-panel-btn--primary', () => {
    void commitMetaEditor();
  });
  metaActions.appendChild(metaCancelBtn);
  metaActions.appendChild(metaSaveBtn);
  metaDialog.appendChild(editName);
  metaDialog.appendChild(editDesc);
  metaDialog.appendChild(editTags);
  metaDialog.appendChild(editDiff);
  metaDialog.appendChild(metaActions);
  metaOverlay.appendChild(metaDialog);

  function openMetaEditor(doc: ScenarioDocument, mode: 'custom' | 'official'): void {
    if (mode === 'official') {
      metaEditorState = {
        kind: 'official',
        base: doc,
        baselineUpdatedAt: doc.meta.updatedAt,
      };
      officialLwwPending = false;
    } else {
      metaEditorState = { kind: 'custom', id: doc.id };
    }
    editName.value = doc.meta.name;
    editDesc.value = doc.meta.description;
    editTags.value = doc.meta.tags.join(', ');
    editDiff.value = doc.meta.difficulty;
    metaOverlay.classList.remove('scenarios-meta-overlay--hidden');
  }

  function closeMetaEditor(): void {
    if (metaSaveInFlight) return;
    metaEditorState = null;
    officialLwwPending = false;
    metaOverlay.classList.add('scenarios-meta-overlay--hidden');
  }

  function setMetaEditorSavingState(inFlight: boolean): void {
    metaSaveInFlight = inFlight;
    metaSaveBtn.disabled = inFlight;
    metaCancelBtn.disabled = inFlight;
  }

  async function commitMetaEditor(): Promise<void> {
    if (metaSaveInFlight) return;
    const state = metaEditorState;
    if (!state) return;

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
    const meta: EditableScenarioMeta = {
      name,
      description,
      tags: parseTagsInput(editTags.value),
      difficulty: editDiff.value as 'easy' | 'normal' | 'hard',
    };

    if (state.kind === 'custom') {
      const existing = listCustomScenarios().find((d) => d.id === state.id);
      if (!existing) {
        closeMetaEditor();
        return;
      }
      try {
        upsert({
          ...existing,
          meta: {
            ...existing.meta,
            ...meta,
            updatedAt: new Date().toISOString(),
          },
        });
      } catch (error) {
        showStorageFailure('обновить сценарий', error);
        return;
      }
      closeMetaEditor();
      void refreshAndRender();
      return;
    }

    if (officialLwwPending && !window.confirm(OFFICIAL_LWW_CONFIRM)) {
      return;
    }
    if (!window.confirm(OFFICIAL_SAVE_GLOBAL_CONFIRM)) {
      return;
    }

    const built = opts.buildOfficialScenarioMetaOnly(state.base, meta);
    setMetaEditorSavingState(true);
    try {
      await opts.updateOfficialScenario(built);
    } catch (error) {
      const msg =
        error instanceof OfficialApiError
          ? error.message
          : error instanceof Error
            ? error.message
            : String(error);
      window.alert(`Не удалось сохранить официальный сценарий. ${msg}`);
      setMetaEditorSavingState(false);
      return;
    }
    setMetaEditorSavingState(false);
    closeMetaEditor();
    void refreshAndRender();
  }

  metaOverlay.addEventListener('click', (e) => {
    if (e.target === metaOverlay) closeMetaEditor();
  });

  const randomOverlay = el('div', 'scenarios-random-overlay scenarios-random-overlay--hidden');
  const randomStage = el('div', 'scenarios-random-stage');
  const randomRoller = el('div', 'scenarios-random-roller');
  const randomDetail = el('div', 'scenarios-random-detail scenarios-random-detail--hidden');
  const randomDetailTitle = el('div', 'scenarios-random-detail-title', 'Выпавший сценарий');
  const randomDetailName = el('div', 'scenarios-random-detail-name');
  const randomDetailMeta = el('div', 'scenarios-card-meta');
  const randomDetailDesc = el('div', 'scenarios-random-detail-desc');
  const randomDetailTags = el('div', 'scenarios-card-tags');
  const randomActions = el('div', 'scenarios-meta-actions');
  const randomCancelBtn = btn(
    'Отмена',
    'scenarios-panel-btn scenarios-panel-btn--secondary',
    () => closeRandomOverlay(),
  );
  const randomApplyBtn = btn(
    'Применить',
    'scenarios-panel-btn scenarios-panel-btn--primary',
    () => {},
  );
  randomActions.appendChild(randomCancelBtn);
  randomActions.appendChild(randomApplyBtn);
  randomDetail.appendChild(randomDetailTitle);
  randomDetail.appendChild(randomDetailName);
  randomDetail.appendChild(randomDetailMeta);
  randomDetail.appendChild(randomDetailDesc);
  randomDetail.appendChild(randomDetailTags);
  randomDetail.appendChild(randomActions);
  randomStage.appendChild(randomRoller);
  randomStage.appendChild(randomDetail);
  randomOverlay.appendChild(randomStage);
  randomOverlay.addEventListener('click', (e) => {
    if (e.target === randomOverlay) closeRandomOverlay();
  });

  function setTab(tab: 'official' | 'custom'): void {
    activeTab = tab;
    tabOfficial.classList.toggle('scenarios-panel-tab--active', tab === 'official');
    tabCustom.classList.toggle('scenarios-panel-tab--active', tab === 'custom');
    createSection.classList.toggle('scenarios-create-section--hidden', tab !== 'custom');
    toolbar.classList.toggle('scenarios-panel-toolbar--hidden', tab !== 'custom');
    officialToolbar.classList.toggle('scenarios-panel-toolbar--hidden', tab !== 'official');
    renderCardList();
  }

  function tryApply(doc: ScenarioDocument): void {
    if (!window.confirm(APPLY_CONFIRM)) return;
    applyDocDirectly(doc);
  }

  function applyDocDirectly(doc: ScenarioDocument): void {
    const result = opts.applyScenario(doc);
    if (!result.ok) {
      window.alert(result.error);
      return;
    }
    opts.afterScenarioMutation?.();
    opts.onScenarioApplied?.(doc);
    close();
  }

  function startRandomOfficialPick(): void {
    if (officialDocs.length === 0) {
      window.alert('Нет доступных официальных сценариев.');
      return;
    }
    const pool = officialDocs;
    const finalDoc = pool[Math.floor(Math.random() * pool.length)]!;
    randomOverlay.classList.remove('scenarios-random-overlay--hidden');
    randomOverlay.classList.remove('scenarios-random-overlay--landed');
    randomOverlay.classList.remove('scenarios-random-overlay--reveal');
    randomRoller.classList.remove('scenarios-random-roller--hidden');
    randomDetail.classList.add('scenarios-random-detail--hidden');
    randomRoller.textContent = pool[0]!.meta.name;

    const totalTicks = 22;
    let tick = 0;
    function step(): void {
      if (tick >= totalTicks) {
        randomRoller.textContent = finalDoc.meta.name;
        randomOverlay.classList.add('scenarios-random-overlay--landed');
        window.setTimeout(revealDetail, 700);
        return;
      }
      const name = pool[Math.floor(Math.random() * pool.length)]!.meta.name;
      randomRoller.textContent = name;
      const t = tick / totalTicks;
      const delay = 40 + t * t * 320;
      tick++;
      window.setTimeout(step, delay);
    }
    function revealDetail(): void {
      randomDetailName.textContent = finalDoc.meta.name;
      randomDetailDesc.textContent = finalDoc.meta.description.trim() || '—';
      randomDetailMeta.replaceChildren();
      randomDetailMeta.appendChild(
        el('span', 'scenarios-card-pill', difficultyLabelRu(finalDoc.meta.difficulty)),
      );
      randomDetailMeta.appendChild(
        el(
          'span',
          'scenarios-card-pill scenarios-card-pill--muted',
          scenarioOrientationLabelRu(finalDoc.boardOrientation),
        ),
      );
      randomDetailTags.textContent =
        finalDoc.meta.tags.length > 0 ? finalDoc.meta.tags.map((t) => `#${t}`).join(' ') : '—';
      randomApplyBtn.onclick = () => {
        closeRandomOverlay();
        applyDocDirectly(finalDoc);
      };
      randomRoller.classList.add('scenarios-random-roller--hidden');
      randomOverlay.classList.add('scenarios-random-overlay--reveal');
      randomDetail.classList.remove('scenarios-random-detail--hidden');
    }
    step();
  }

  function closeRandomOverlay(): void {
    randomOverlay.classList.add('scenarios-random-overlay--hidden');
  }

  async function overwriteScenarioWithCurrentBoard(
    doc: ScenarioDocument,
    mode: 'official' | 'custom',
  ): Promise<void> {
    const confirmMsg =
      mode === 'official' ? OFFICIAL_BOARD_OVERWRITE_CONFIRM : CUSTOM_BOARD_OVERWRITE_CONFIRM;
    if (!window.confirm(confirmMsg)) return;
    const built = opts.buildScenarioWithCurrentBoard(doc);
    if (mode === 'custom') {
      try {
        upsert(built);
      } catch (error) {
        showStorageFailure('сохранить стол в сценарий', error);
        return;
      }
      void refreshAndRender();
      return;
    }
    try {
      await opts.updateOfficialScenario(built);
    } catch (error) {
      const msg =
        error instanceof OfficialApiError
          ? error.message
          : error instanceof Error
            ? error.message
            : String(error);
      window.alert(`Не удалось сохранить официальный сценарий. ${msg}`);
      return;
    }
    void refreshAndRender();
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
      void refreshAndRender();
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
    const descLines = desc.split('\n');
    const needsCollapse = descLines.length > 3 || desc.length > 220;
    const descEl = el('div', 'scenarios-card-desc');
    if (needsCollapse) {
      const preview =
        descLines.slice(0, 3).join('\n').slice(0, 220).replace(/\s+$/, '') + '…';
      descEl.textContent = preview;
      card.appendChild(descEl);
      let expanded = false;
      const toggle = btn('Развернуть описание', 'scenarios-card-desc-toggle', () => {
        expanded = !expanded;
        descEl.textContent = expanded ? desc : preview;
        toggle.textContent = expanded ? 'Свернуть описание' : 'Развернуть описание';
      });
      card.appendChild(toggle);
    } else {
      descEl.textContent = desc;
      card.appendChild(descEl);
    }
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
      btn('Применить на стол', 'scenarios-panel-btn scenarios-panel-btn--small scenarios-panel-btn--primary', () =>
        tryApply(doc),
      ),
    );
    actions.appendChild(
      btn('Редактировать', 'scenarios-panel-btn scenarios-panel-btn--small', () =>
        openMetaEditor(doc, mode),
      ),
    );
    actions.appendChild(
      btn('Сохранить со стола', 'scenarios-panel-btn scenarios-panel-btn--small', () => {
        void overwriteScenarioWithCurrentBoard(doc, mode);
      }),
    );
    if (mode === 'custom') {
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
          void refreshAndRender();
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
          void refreshAndRender();
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
          el(
            'div',
            'scenarios-panel-empty',
            'Пока нет сохранённых сценариев — создайте из поля или импортируйте JSON.',
          ),
        );
      } else {
        for (const d of custom) listEl.appendChild(renderCard(d, 'custom'));
      }
    }
    body.appendChild(listEl);
  }

  function syncOfficialLwwFromLoadedList(): void {
    if (metaEditorState?.kind !== 'official') return;
    const { base, baselineUpdatedAt } = metaEditorState;
    const loaded = officialDocs.find((d) => d.id === base.id);
    if (!loaded) return;
    if (loaded.meta.updatedAt !== baselineUpdatedAt) {
      officialLwwPending = true;
    }
  }

  async function refreshAndRender(options?: { silent?: boolean }): Promise<void> {
    const silent = options?.silent ?? false;
    const loadSeq = ++officialLoadSeq;
    try {
      const loaded = await opts.loadOfficialScenarios();
      if (loadSeq !== officialLoadSeq) return;
      officialDocs = loaded;
    } catch (e) {
      if (loadSeq !== officialLoadSeq) return;
      officialDocs = [];
      const msg = e instanceof Error ? e.message : String(e);
      console.error('[scenarios] loadOfficialScenarios', e);
      if (!silent) {
        window.alert(`Не удалось загрузить официальные сценарии: ${msg}`);
      }
    }
    syncOfficialLwwFromLoadedList();
    renderCardList();
  }

  function open(): void {
    backdrop.classList.remove('scenarios-panel-backdrop--hidden');
    closeMetaEditor();
    closeRandomOverlay();
    setTab(activeTab);
    void refreshAndRender();
  }

  function close(): void {
    closeMetaEditor();
    closeRandomOverlay();
    backdrop.classList.add('scenarios-panel-backdrop--hidden');
  }

  function onOfficialScenariosRemoteInvalidation(
    changedIds: readonly string[],
    options?: { silent?: boolean },
  ): void {
    if (metaEditorState?.kind === 'official' && changedIds.includes(metaEditorState.base.id)) {
      officialLwwPending = true;
    }
    void refreshAndRender({ silent: options?.silent ?? false });
  }

  panel.appendChild(header);
  panel.appendChild(tabRow);
  panel.appendChild(officialToolbar);
  panel.appendChild(toolbar);
  panel.appendChild(body);
  panel.appendChild(createSection);
  backdrop.appendChild(panel);
  backdrop.appendChild(metaOverlay);
  backdrop.appendChild(randomOverlay);
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
        if (!randomOverlay.classList.contains('scenarios-random-overlay--hidden')) {
          closeRandomOverlay();
          ev.stopPropagation();
          return;
        }
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

  return { open, close, root: backdrop, onOfficialScenariosRemoteInvalidation };
}
