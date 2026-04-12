import {
  BOARD_OBJECT_CATALOG,
  listBoardObjectCategories,
  type BoardObjectCatalogItem,
} from './boardObjectCatalog';

export const BOARD_OBJECT_DND_MIME = 'application/x-board-object';

export type BoardObjectDragPayload = {
  kind: 'boardObject';
  objectId: string;
};

export type ObjectsPanelOptions = {
  onTouchArmPayload?: (json: string) => void;
};

function el<K extends keyof HTMLElementTagNameMap>(
  tag: K,
  cls?: string,
  text?: string,
): HTMLElementTagNameMap[K] {
  const node = document.createElement(tag);
  if (cls) node.className = cls;
  if (text !== undefined) node.textContent = text;
  return node;
}

function categoryLabel(category: string): string {
  if (category === 'domain-badges') return 'Domain Badges';
  if (category === 'smoke') return 'Smoke';
  if (category === 'prisoners') return 'Пленники';
  if (category === 'terrain') return 'Terrain';
  if (category === 'ether-vortex') return 'Ether Vortex';
  return category;
}

export class ObjectsPanel {
  private root: HTMLElement;
  private panel: HTMLElement;
  private overlay: HTMLElement;
  private menuWrap: HTMLElement;
  private listEl: HTMLElement;
  private categoryTabs: HTMLElement;
  private open = false;
  private selectedCategory: string;
  private opts: ObjectsPanelOptions;

  constructor(toolbarMount: HTMLElement, opts: ObjectsPanelOptions = {}) {
    this.opts = opts;
    this.selectedCategory = listBoardObjectCategories()[0] ?? '';

    this.root = el('div', 'objects-panel-root');
    toolbarMount.appendChild(this.root);

    this.menuWrap = el('div', 'objects-menu-wrap');
    const openBtn = el('button', 'army-menu-btn objects-menu-btn');
    openBtn.type = 'button';
    openBtn.setAttribute('aria-label', 'Открыть панель объектов');
    openBtn.title = 'Objects';
    openBtn.textContent = '+';
    openBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      this.setOpen(true);
    });
    this.menuWrap.appendChild(openBtn);
    this.root.appendChild(this.menuWrap);

    this.overlay = el('div', 'objects-panel-overlay');
    this.panel = el('aside', 'objects-panel');
    const header = el('div', 'objects-panel-header');
    const title = el('div', 'objects-panel-title', 'Объекты');
    const closeBtn = el('button', 'objects-panel-close', '×');
    closeBtn.type = 'button';
    closeBtn.addEventListener('click', () => this.setOpen(false));
    header.appendChild(title);
    header.appendChild(closeBtn);

    this.categoryTabs = el('div', 'objects-category-tabs');
    this.listEl = el('div', 'objects-list');

    this.panel.appendChild(header);
    this.panel.appendChild(this.categoryTabs);
    this.panel.appendChild(this.listEl);

    this.root.appendChild(this.overlay);
    this.root.appendChild(this.panel);

    document.addEventListener('pointerdown', this.boundDocPointerDown, true);
    window.addEventListener('keydown', this.boundKey);

    this.renderCategoryTabs();
    this.renderList();
  }

  private readonly boundDocPointerDown = (e: PointerEvent): void => {
    if (!this.open) return;
    const path = e.composedPath();
    if (path.includes(this.panel) || path.includes(this.menuWrap)) return;
    this.setOpen(false);
  };

  private readonly boundKey = (e: KeyboardEvent): void => {
    if (e.key !== 'Escape') return;
    if (!this.open) return;
    this.setOpen(false);
  };

  dispose(): void {
    document.removeEventListener('pointerdown', this.boundDocPointerDown, true);
    window.removeEventListener('keydown', this.boundKey);
    this.root.remove();
  }

  isPanelOpen(): boolean {
    return this.open;
  }

  isScreenPointOverPanel(screenX: number, screenY: number): boolean {
    if (!this.open) return false;
    const r = this.panel.getBoundingClientRect();
    return screenX >= r.left && screenX < r.right && screenY >= r.top && screenY < r.bottom;
  }

  private setOpen(on: boolean): void {
    this.open = on;
    this.overlay.classList.toggle('objects-panel-overlay-visible', on);
    this.panel.classList.toggle('objects-panel-open', on);
    if (on) this.renderList();
  }

  private renderCategoryTabs(): void {
    this.categoryTabs.replaceChildren();
    for (const category of listBoardObjectCategories()) {
      const tab = el('button', 'objects-category-tab', categoryLabel(category));
      tab.type = 'button';
      tab.classList.toggle('objects-category-tab-active', category === this.selectedCategory);
      tab.addEventListener('click', () => {
        this.selectedCategory = category;
        this.renderCategoryTabs();
        this.renderList();
      });
      this.categoryTabs.appendChild(tab);
    }
  }

  private renderList(): void {
    this.listEl.replaceChildren();
    const items = BOARD_OBJECT_CATALOG.filter((item) => item.category === this.selectedCategory);
    if (items.length === 0) {
      this.listEl.appendChild(el('div', 'objects-list-empty', 'Нет объектов в категории'));
      return;
    }
    for (const item of items) {
      this.listEl.appendChild(this.makeObjectCard(item));
    }
  }

  private makeObjectCard(item: BoardObjectCatalogItem): HTMLElement {
    const wrap = el('div', 'objects-item');
    wrap.tabIndex = 0;
    wrap.setAttribute('role', 'button');
    wrap.setAttribute('aria-label', `${item.name}, ${item.footprint}`);
    wrap.title = 'Перетащите на стол';

    const thumb = el('div', 'objects-item-thumb');
    thumb.style.backgroundImage = `url("${item.sprite}")`;
    thumb.draggable = true;
    const footprintIcon = el('img', 'objects-item-thumb-footprint-icon') as HTMLImageElement;
    footprintIcon.src = item.footprint === 'hex' ? '/hex-icon.svg' : '/hexon-icon.svg';
    const footprintLabel = item.footprint === 'hex' ? '1 hex' : '1 hexon';
    footprintIcon.alt = footprintLabel;
    footprintIcon.title = footprintLabel;
    thumb.appendChild(footprintIcon);

    const name = el('div', 'objects-item-name');
    const nameText = el('span', 'objects-item-name-text', item.name);
    name.appendChild(nameText);

    wrap.appendChild(thumb);
    wrap.appendChild(name);

    let dragStarted = false;
    let tapX = 0;
    let tapY = 0;
    wrap.addEventListener('pointerdown', (e) => {
      if (e.pointerType === 'mouse' && e.button !== 0) return;
      dragStarted = false;
      tapX = e.clientX;
      tapY = e.clientY;
    });

    thumb.addEventListener('dragstart', (e) => {
      dragStarted = true;
      const payload: BoardObjectDragPayload = { kind: 'boardObject', objectId: item.id };
      const json = JSON.stringify(payload);
      e.dataTransfer?.setData(BOARD_OBJECT_DND_MIME, json);
      e.dataTransfer?.setData('text/plain', json);
      if (e.dataTransfer) e.dataTransfer.effectAllowed = 'copy';
    });

    wrap.addEventListener('pointerup', (e) => {
      if (e.pointerType === 'mouse') return;
      if (dragStarted || !this.opts.onTouchArmPayload) return;
      const dx = e.clientX - tapX;
      const dy = e.clientY - tapY;
      if (dx * dx + dy * dy > 100) return;
      const payload: BoardObjectDragPayload = { kind: 'boardObject', objectId: item.id };
      this.opts.onTouchArmPayload(JSON.stringify(payload));
    });

    return wrap;
  }
}
