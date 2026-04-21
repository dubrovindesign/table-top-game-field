/**
 * Кнопка «меню» в левом верхнем тулбаре: каталог, PWA, настройки, справка по управлению.
 */

export type AppMoreMenuOptions = {
  onCatalogEditor: () => void;
  /** Если null — пункт «Установить» скрыт (уже PWA). */
  onInstallApp?: () => void | Promise<void>;
  onSettings: () => void;
  onScenarios: () => void;
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

const CONTROLS_HTML = `
<div class="app-controls-help">
  <section class="app-controls-section">
    <h3 class="app-controls-heading">Камера и поле</h3>
    <ul class="app-controls-list">
      <li><strong>Колёсико</strong> — зум или панорама (режим в «Настройках»). В режиме панорамы: <strong>Ctrl</strong> + колёсико — зум.</li>
      <li><strong>Средняя кнопка мыши</strong> или <strong>Ctrl</strong> + ЛКМ — перетаскивание камеры.</li>
      <li>На тачскрине: два пальца — панорама и масштаб.</li>
    </ul>
  </section>
  <section class="app-controls-section">
    <h3 class="app-controls-heading">Фишки и выбор</h3>
    <ul class="app-controls-list">
      <li><strong>ЛКМ</strong> — выбрать юнит, ландшафт, декорации и т.д.</li>
      <li><strong>Двойной клик</strong> по миниатюре юнита — закрепить карточку и показать шаги ходьбы/бега.</li>
      <li><strong>Двойной клик</strong> по свободной карте бога на поле — перевернуть.</li>
      <li>На таче: двойное касание по миниатюре — как двойной клик; долгое нажатие на фишку — меню маркеров (как ПКМ).</li>
    </ul>
  </section>
  <section class="app-controls-section">
    <h3 class="app-controls-heading">Модификаторы</h3>
    <ul class="app-controls-list">
      <li><strong>Alt</strong> (удерживать) — превью дальности с карточки. На таче можно закрепить в «Настройках».</li>
      <li><strong>Shift</strong> — превью атаки с карточки; также увеличенный шаг поворота и калибровки (см. ниже).</li>
    </ul>
  </section>
  <section class="app-controls-section">
    <h3 class="app-controls-heading">Горячие клавиши</h3>
    <ul class="app-controls-list">
      <li><strong>Ctrl/Cmd+C</strong> — копировать выделение.</li>
      <li><strong>Ctrl/Cmd+V</strong> — вставить.</li>
      <li><strong>Ctrl/Cmd+D</strong> — дублировать.</li>
      <li><strong>Delete / Backspace</strong> — удалить выделенное.</li>
      <li><strong>Q</strong> / <strong>E</strong> — поворот выделенного (с Shift — крупный шаг).</li>
      <li><strong>R</strong> над колодой богов на поле — перетасовать колоду.</li>
      <li><strong>Ctrl+Shift+R</strong> — повернуть активное поле на 90°.</li>
    </ul>
  </section>
  <section class="app-controls-section">
    <h3 class="app-controls-heading">Пинг намерения</h3>
    <ul class="app-controls-list">
      <li>ПК: <strong>Space</strong> (удерживать) + <strong>ЛКМ</strong> по полю — поставить пинг в точке клика.</li>
      <li>Плавающая кнопка <strong>Ping</strong>: на ПК — удерживать и кликнуть по полю; на таче — тап по кнопке, затем тап по полю (single-shot).</li>
      <li>Пинг виден обоим игрокам в мультиплеере и исчезает сам.</li>
    </ul>
  </section>
  <section class="app-controls-section">
    <h3 class="app-controls-heading">Кубик</h3>
    <ul class="app-controls-list">
      <li><strong>Клик / тап</strong> по кубику — бросок.</li>
      <li><strong>Повторный клик</strong> во время анимации — мгновенно показать результат.</li>
    </ul>
  </section>
  <section class="app-controls-section">
    <h3 class="app-controls-heading">Вихри эфира и карты богов</h3>
    <ul class="app-controls-list">
      <li><strong>ЛКМ</strong> по счётчику кристаллов вихря — изменить значение.</li>
      <li><strong>ПКМ</strong> / долгое нажатие по вихрю — контекстное меню.</li>
      <li><strong>Двойной клик</strong> по свободной карте бога — перевернуть; <strong>R</strong> над колодой — перетасовать.</li>
    </ul>
  </section>
  <section class="app-controls-section">
    <h3 class="app-controls-heading">Мультиплеер</h3>
    <ul class="app-controls-list">
      <li>Рамка юнита подсвечивается цветом владельца — цвет выбирается в палитре из 6 цветов.</li>
    </ul>
  </section>
  <section class="app-controls-section">
    <h3 class="app-controls-heading">Прочее</h3>
    <ul class="app-controls-list">
      <li><strong>ПКМ</strong> по полю (долгое нажатие на таче) — круговое меню маркеров состояний.</li>
      <li>Нижняя панель на таче — быстрые действия (копировать, поворот, удалить и т.д.).</li>
    </ul>
  </section>
</div>
`;

export function mountAppMoreMenu(toolbarMount: HTMLElement, opts: AppMoreMenuOptions): void {
  const anchor = el('div', 'app-more-menu-anchor');

  const toggleBtn = el('button', 'app-more-menu-btn') as HTMLButtonElement;
  toggleBtn.type = 'button';
  toggleBtn.setAttribute('aria-label', 'Меню');
  toggleBtn.setAttribute('aria-expanded', 'false');
  toggleBtn.setAttribute('aria-haspopup', 'menu');
  toggleBtn.title = 'Меню';
  toggleBtn.innerHTML = `<svg class="app-more-menu-icon" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M3 6h18v2H3V6zm0 5h18v2H3v-2zm0 5h18v2H3v-2z"/></svg>`;

  const menu = el('div', 'app-more-menu-dropdown app-more-menu-dropdown--hidden');
  menu.setAttribute('role', 'menu');
  menu.setAttribute('aria-label', 'Дополнительные действия');

  function addItem(label: string, onActivate: () => void): void {
    const b = el('button', 'app-more-menu-item') as HTMLButtonElement;
    b.type = 'button';
    b.setAttribute('role', 'menuitem');
    b.textContent = label;
    b.addEventListener('click', (e) => {
      e.stopPropagation();
      setOpen(false);
      onActivate();
    });
    menu.appendChild(b);
  }

  addItem('Редактор каталога', () => opts.onCatalogEditor());

  addItem('Сценарии', () => opts.onScenarios());

  if (opts.onInstallApp) {
    const install = opts.onInstallApp;
    addItem('Установить на устройство', () => {
      void Promise.resolve(install());
    });
  }

  addItem('Настройки', () => opts.onSettings());

  let open = false;
  function setOpen(v: boolean): void {
    open = v;
    menu.classList.toggle('app-more-menu-dropdown--hidden', !v);
    toggleBtn.setAttribute('aria-expanded', v ? 'true' : 'false');
  }

  toggleBtn.addEventListener('click', (e) => {
    e.stopPropagation();
    setOpen(!open);
  });

  document.addEventListener(
    'pointerdown',
    (e) => {
      if (!open) return;
      if (anchor.contains(e.target as Node)) return;
      setOpen(false);
    },
    true,
  );

  anchor.appendChild(toggleBtn);
  anchor.appendChild(menu);
  toolbarMount.appendChild(anchor);

  const helpBtn = el('button', 'app-more-menu-btn app-controls-help-btn') as HTMLButtonElement;
  helpBtn.type = 'button';
  helpBtn.setAttribute('aria-label', 'Управление');
  helpBtn.title = 'Управление';
  helpBtn.textContent = '?';
  helpBtn.addEventListener('click', (e) => {
    e.stopPropagation();
    openControlsDialog();
  });
  toolbarMount.appendChild(helpBtn);
}

let controlsBackdropEl: HTMLElement | null = null;

function openControlsDialog(): void {
  if (controlsBackdropEl?.isConnected) return;

  const backdrop = el('div', 'app-controls-dialog-backdrop');
  backdrop.setAttribute('role', 'presentation');

  const dialog = el('div', 'app-controls-dialog');
  dialog.setAttribute('role', 'dialog');
  dialog.setAttribute('aria-modal', 'true');
  dialog.setAttribute('aria-label', 'Управление');

  const header = el('div', 'app-controls-dialog-header');
  header.appendChild(el('div', 'app-controls-dialog-title', 'Управление'));
  const closeBtn = el('button', 'app-controls-dialog-close', '×') as HTMLButtonElement;
  closeBtn.type = 'button';
  closeBtn.setAttribute('aria-label', 'Закрыть');
  header.appendChild(closeBtn);

  const body = el('div', 'app-controls-dialog-body');
  body.innerHTML = CONTROLS_HTML;

  dialog.appendChild(header);
  dialog.appendChild(body);
  backdrop.appendChild(dialog);
  document.body.appendChild(backdrop);
  controlsBackdropEl = backdrop;

  function close(): void {
    backdrop.remove();
    controlsBackdropEl = null;
  }

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
      if (ev.key === 'Escape') {
        document.removeEventListener('keydown', onEsc, true);
        close();
      }
    },
    true,
  );
}
