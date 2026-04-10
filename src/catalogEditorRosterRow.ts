/**
 * Shared "army roster" row layout for catalog editor lists (thumb, name, sub, actions).
 */

/** Same pencil path as catalog editor menu button. */
export const CE_EDIT_PENCIL_SVG =
  '<svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M3 17.25V21h3.75L17.81 9.94l-3.75-3.75L3 17.25zM20.71 7.04a1.003 1.003 0 0 0 0-1.42l-2.5-2.5a1.003 1.003 0 0 0-1.42 0l-1.83 1.83 3.75 3.75 1.83-1.83z"/></svg>';

export type CatalogArmyStyleRowOptions = {
  sprite?: string;
  name: string;
  sub: string;
  /** Main area opens editor / navigates when set. */
  onMainClick?: () => void;
  /** Right column (points input, icon buttons, …). */
  actions?: HTMLElement[];
  /**
   * Placed below the thumb + name row, outside the main click target (e.g. inline list inputs).
   */
  inlineBelow?: HTMLElement;
};

export function buildCatalogArmyStyleRow(opts: CatalogArmyStyleRowOptions): HTMLElement {
  const wrap = document.createElement('div');
  wrap.className = 'army-unit-row ce-catalog-army-row';

  const main: HTMLElement = opts.onMainClick
    ? (() => {
        const b = document.createElement('button');
        b.type = 'button';
        b.className = 'ce-army-row-main ce-army-row-main--btn';
        b.addEventListener('click', opts.onMainClick!);
        return b;
      })()
    : (() => {
        const d = document.createElement('div');
        d.className = 'ce-army-row-main';
        return d;
      })();

  const thumb = document.createElement('div');
  thumb.className = 'army-unit-thumb';
  if (opts.sprite) {
    const img = document.createElement('img');
    img.className = 'army-unit-thumb-img';
    img.src = opts.sprite;
    img.alt = '';
    thumb.appendChild(img);
  }

  const meta = document.createElement('div');
  meta.className = 'army-unit-meta';
  const nameEl = document.createElement('div');
  nameEl.className = 'army-unit-name';
  nameEl.textContent = opts.name;
  const subEl = document.createElement('div');
  subEl.className = 'army-unit-sub';
  subEl.textContent = opts.sub;
  meta.appendChild(nameEl);
  meta.appendChild(subEl);

  main.appendChild(thumb);
  main.appendChild(meta);

  const actionsEl =
    opts.actions?.length != null && opts.actions.length > 0
      ? (() => {
          const act = document.createElement('div');
          act.className = 'ce-army-row-actions';
          for (const n of opts.actions) act.appendChild(n);
          return act;
        })()
      : null;

  if (opts.inlineBelow) {
    wrap.classList.add('ce-catalog-army-row--stacked');
    const top = document.createElement('div');
    top.className = 'ce-catalog-army-row-top';
    top.appendChild(main);
    if (actionsEl) top.appendChild(actionsEl);
    wrap.appendChild(top);
    wrap.appendChild(opts.inlineBelow);
  } else {
    wrap.appendChild(main);
    if (actionsEl) wrap.appendChild(actionsEl);
  }

  return wrap;
}

export function createPencilEditButton(onClick: (e: Event) => void): HTMLButtonElement {
  const btn = document.createElement('button');
  btn.type = 'button';
  btn.className = 'catalog-editor-btn catalog-editor-btn-secondary ce-catalog-edit-icon-btn';
  btn.setAttribute('aria-label', 'Редактировать');
  btn.title = 'Редактировать';
  btn.innerHTML = CE_EDIT_PENCIL_SVG;
  btn.addEventListener('click', (e) => {
    e.stopPropagation();
    onClick(e);
  });
  return btn;
}
