/**
 * «Мои ростеры» — вкладка в панели армии: сохранение текущего состава,
 * список сохранённых ростеров, детальный модальный диалог.
 */

import {
  getCatalogUnit,
  getLeader,
  listInventoryItemsForLeader,
  rosterSpawnPoints,
} from '../armyCatalog.ts';
import { GOD_CARDS } from '../godCards.ts';
import { listRosters, newRosterId, removeRosterById, upsertRoster } from './store.ts';
import type { RosterDocument } from './types.ts';

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

function godCardName(id: string): string {
  const c = GOD_CARDS.find((g) => g.id === id);
  return c?.title ?? id;
}

function inventoryItemName(leaderId: string, itemId: string): string {
  for (const def of listInventoryItemsForLeader(leaderId)) {
    if (def.id === itemId) return def.name;
  }
  return itemId;
}

function inventoryItemPoints(leaderId: string, itemId: string): number {
  for (const def of listInventoryItemsForLeader(leaderId)) {
    if (def.id === itemId) return def.points;
  }
  return 0;
}

/** Суммарные очки ростера: юнит — за размещение, инвентарь — один раз по itemId. */
export function sumRosterDocPoints(doc: RosterDocument): number {
  let s = 0;
  for (const u of doc.units) {
    s += rosterSpawnPoints(u.leaderId, u.unitId);
  }
  const seenItems = new Set<string>();
  for (const it of doc.inventory) {
    if (seenItems.has(it.itemId)) continue;
    seenItems.add(it.itemId);
    s += inventoryItemPoints(it.leaderId, it.itemId);
  }
  return s;
}

/** Ведущий лидер — лидер с наибольшим числом очков в ростере. */
export function primaryLeaderId(doc: RosterDocument): string | null {
  const totals = new Map<string, number>();
  for (const u of doc.units) {
    totals.set(u.leaderId, (totals.get(u.leaderId) ?? 0) + rosterSpawnPoints(u.leaderId, u.unitId));
  }
  let best: string | null = null;
  let bestPts = -1;
  for (const [id, pts] of totals) {
    if (pts > bestPts) {
      bestPts = pts;
      best = id;
    }
  }
  if (best) return best;
  if (doc.inventory[0]) return doc.inventory[0].leaderId;
  return null;
}

function leaderDisplayName(leaderId: string): string {
  return getLeader(leaderId)?.name ?? leaderId;
}

function unitDisplayName(unitId: string): string {
  return getCatalogUnit(unitId)?.card.name ?? unitId;
}

export type RostersPanelOptions = {
  getCurrentRoster: () => {
    units: RosterDocument['units'];
    godPieces: RosterDocument['godPieces'];
    inventory: RosterDocument['inventory'];
  };
  applyRoster: (doc: RosterDocument) => void;
};

export class RostersPanel {
  readonly root: HTMLElement;
  private listEl: HTMLElement;
  private modalOverlay: HTMLElement;
  private modalBody: HTMLElement;
  private opts: RostersPanelOptions;

  constructor(opts: RostersPanelOptions) {
    this.opts = opts;
    this.root = el('div', 'rosters-panel');

    const toolbar = el('div', 'rosters-toolbar');
    const saveBtn = el('button', 'rosters-save-btn', 'Сохранить текущий ростер') as HTMLButtonElement;
    saveBtn.type = 'button';
    saveBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      this.saveCurrent();
    });
    toolbar.appendChild(saveBtn);
    this.root.appendChild(toolbar);

    this.listEl = el('div', 'rosters-list');
    this.root.appendChild(this.listEl);

    this.modalOverlay = el('div', 'rosters-modal-overlay');
    this.modalOverlay.hidden = true;
    this.modalOverlay.addEventListener('click', (e) => {
      if (e.target === this.modalOverlay) this.closeModal();
    });
    this.modalBody = el('div', 'rosters-modal');
    this.modalOverlay.appendChild(this.modalBody);
    this.root.appendChild(this.modalOverlay);
  }

  refresh(): void {
    this.listEl.replaceChildren();
    const docs = listRosters();
    if (docs.length === 0) {
      this.listEl.appendChild(el('div', 'rosters-empty', 'Нет сохранённых ростеров'));
      return;
    }
    for (const doc of docs) {
      this.listEl.appendChild(this.makeListRow(doc));
    }
  }

  private saveCurrent(): void {
    const cur = this.opts.getCurrentRoster();
    if (cur.units.length === 0 && cur.godPieces.length === 0 && cur.inventory.length === 0) {
      window.alert('Сейчас на столе нет юнитов, карт богов или инвентаря из армии.');
      return;
    }
    const name = window.prompt('Название ростера:', '');
    if (name === null) return;
    const trimmed = name.trim();
    if (trimmed === '') return;
    const now = new Date().toISOString();
    const doc: RosterDocument = {
      id: newRosterId(),
      version: 2,
      meta: { name: trimmed, createdAt: now, updatedAt: now },
      units: cur.units,
      godPieces: cur.godPieces,
      inventory: cur.inventory,
    };
    upsertRoster(doc);
    this.refresh();
  }

  private makeListRow(doc: RosterDocument): HTMLElement {
    const row = el('div', 'rosters-list-row');
    row.tabIndex = 0;
    row.setAttribute('role', 'button');

    const main = el('div', 'rosters-list-main');
    const title = el('div', 'rosters-list-title', doc.meta.name);
    const sub = el('div', 'rosters-list-sub');
    const leaderId = primaryLeaderId(doc);
    const leaderName = leaderId ? leaderDisplayName(leaderId) : '—';
    const pts = sumRosterDocPoints(doc);
    sub.textContent = `Лидер: ${leaderName} · ${pts} очк.`;
    main.appendChild(title);
    main.appendChild(sub);
    row.appendChild(main);

    const actions = el('div', 'rosters-list-actions');
    const takeBtn = el('button', 'rosters-take-btn', 'Взять за стол') as HTMLButtonElement;
    takeBtn.type = 'button';
    takeBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      this.opts.applyRoster(doc);
    });
    const delBtn = el('button', 'rosters-del-btn', '🗑') as HTMLButtonElement;
    delBtn.type = 'button';
    delBtn.title = 'Удалить ростер';
    delBtn.setAttribute('aria-label', 'Удалить ростер');
    delBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      if (!window.confirm(`Удалить ростер «${doc.meta.name}»?`)) return;
      removeRosterById(doc.id);
      this.refresh();
    });
    actions.appendChild(takeBtn);
    actions.appendChild(delBtn);
    row.appendChild(actions);

    row.addEventListener('click', () => this.openDetail(doc));
    row.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' || e.key === ' ') {
        e.preventDefault();
        this.openDetail(doc);
      }
    });

    return row;
  }

  private openDetail(doc: RosterDocument): void {
    this.modalBody.replaceChildren();

    const header = el('div', 'rosters-modal-header');
    const h = el('div', 'rosters-modal-title', doc.meta.name);
    const closeBtn = el('button', 'rosters-modal-close', '×') as HTMLButtonElement;
    closeBtn.type = 'button';
    closeBtn.addEventListener('click', () => this.closeModal());
    header.appendChild(h);
    header.appendChild(closeBtn);
    this.modalBody.appendChild(header);

    const leaderId = primaryLeaderId(doc);
    const leaderLine = el('div', 'rosters-modal-line');
    leaderLine.textContent = `Лидер: ${leaderId ? leaderDisplayName(leaderId) : '—'}`;
    this.modalBody.appendChild(leaderLine);

    const pointsLine = el('div', 'rosters-modal-line');
    pointsLine.textContent = `Очки: ${sumRosterDocPoints(doc)}`;
    this.modalBody.appendChild(pointsLine);

    if (doc.units.length > 0) {
      const section = el('div', 'rosters-modal-section');
      section.appendChild(el('div', 'rosters-modal-section-title', 'Юниты'));
      // Группируем по лидеру, далее по unitId с подсчётом размещений.
      const byLeader = new Map<string, Map<string, number>>();
      for (const u of doc.units) {
        let m = byLeader.get(u.leaderId);
        if (!m) {
          m = new Map<string, number>();
          byLeader.set(u.leaderId, m);
        }
        m.set(u.unitId, (m.get(u.unitId) ?? 0) + 1);
      }
      for (const [lid, m] of byLeader) {
        const grp = el('div', 'rosters-modal-group');
        grp.appendChild(el('div', 'rosters-modal-group-title', leaderDisplayName(lid)));
        for (const [uid, count] of m) {
          const pts = rosterSpawnPoints(lid, uid) * count;
          const line = el('div', 'rosters-modal-line');
          line.textContent = `${unitDisplayName(uid)} × ${count} · ${pts} очк.`;
          grp.appendChild(line);
        }
        section.appendChild(grp);
      }
      this.modalBody.appendChild(section);
    }

    if (doc.godPieces.length > 0) {
      const section = el('div', 'rosters-modal-section');
      section.appendChild(el('div', 'rosters-modal-section-title', 'Карты богов'));
      const seen = new Set<string>();
      for (const piece of doc.godPieces) {
        for (const id of piece.ids) {
          if (seen.has(id)) continue;
          seen.add(id);
          section.appendChild(el('div', 'rosters-modal-line', godCardName(id)));
        }
      }
      this.modalBody.appendChild(section);
    }

    if (doc.inventory.length > 0) {
      const section = el('div', 'rosters-modal-section');
      section.appendChild(el('div', 'rosters-modal-section-title', 'Инвентарь'));
      const seen = new Set<string>();
      for (const it of doc.inventory) {
        if (seen.has(it.itemId)) continue;
        seen.add(it.itemId);
        const pts = inventoryItemPoints(it.leaderId, it.itemId);
        const line = el('div', 'rosters-modal-line');
        line.textContent = `${inventoryItemName(it.leaderId, it.itemId)} · ${pts} очк.`;
        section.appendChild(line);
      }
      this.modalBody.appendChild(section);
    }

    const footer = el('div', 'rosters-modal-footer');
    const applyBtn = el('button', 'rosters-take-btn rosters-modal-apply', 'Взять за стол') as HTMLButtonElement;
    applyBtn.type = 'button';
    applyBtn.addEventListener('click', () => {
      this.opts.applyRoster(doc);
      this.closeModal();
    });
    footer.appendChild(applyBtn);
    this.modalBody.appendChild(footer);

    this.modalOverlay.hidden = false;
  }

  private closeModal(): void {
    this.modalOverlay.hidden = true;
    this.modalBody.replaceChildren();
  }
}
