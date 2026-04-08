/**
 * Локальные настройки приложения (localStorage) + кнопка в тулбаре.
 */

const WHEEL_STORAGE_KEY = 'hex-board-wheel-behavior';

export type WheelBehavior = 'zoom' | 'pan';

let wheelBehavior: WheelBehavior = loadWheelBehavior();
const wheelListeners = new Set<() => void>();

function loadWheelBehavior(): WheelBehavior {
  try {
    const v = localStorage.getItem(WHEEL_STORAGE_KEY);
    if (v === 'pan' || v === 'zoom') return v;
  } catch {
    /* ignore */
  }
  return 'zoom';
}

export function getWheelBehavior(): WheelBehavior {
  return wheelBehavior;
}

function setWheelBehavior(next: WheelBehavior): void {
  if (wheelBehavior === next) return;
  wheelBehavior = next;
  try {
    localStorage.setItem(WHEEL_STORAGE_KEY, next);
  } catch {
    /* ignore */
  }
  for (const fn of wheelListeners) fn();
}

/** Вызов при смене режима колеса (для синхронизации UI). */
export function onWheelBehaviorChange(cb: () => void): () => void {
  wheelListeners.add(cb);
  return () => wheelListeners.delete(cb);
}

export type TouchModToggles = {
  getAlt: () => boolean;
  getShift: () => boolean;
  setAlt: (on: boolean) => void;
  setShift: (on: boolean) => void;
};

/**
 * Кнопка «Настройки» и всплывающая панель. Вставлять в `ArmyBuilderPanel` toolbar
 * после якоря мультиплеера (тот же ряд, что Армия | Мультиплеер | …).
 */
export function mountAppSettingsToolbar(
  toolbarMount: HTMLElement,
  touchMods?: TouchModToggles,
): void {
  const anchor = document.createElement('div');
  anchor.className = 'app-settings-toolbar-anchor';

  const toggleBtn = document.createElement('button');
  toggleBtn.type = 'button';
  toggleBtn.className = 'app-settings-menu-btn';
  toggleBtn.setAttribute('aria-label', 'Настройки');
  toggleBtn.title = 'Настройки';
  toggleBtn.setAttribute('aria-expanded', 'false');
  toggleBtn.setAttribute('aria-haspopup', 'dialog');
  toggleBtn.innerHTML = `<svg class="app-settings-menu-btn-icon" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M19.14 12.94c.04-.31.06-.63.06-.94 0-.31-.02-.63-.06-.94l2.03-1.58a.49.49 0 0 0 .12-.61l-1.92-3.32a.488.488 0 0 0-.59-.22l-2.39.96c-.5-.38-1.03-.7-1.62-.94l-.36-2.54a.484.484 0 0 0-.48-.41h-3.84c-.24 0-.43.17-.47.41l-.36 2.54c-.59.24-1.13.57-1.62.94l-2.39-.96c-.22-.08-.47 0-.59.22L2.74 8.87c-.12.21-.08.47.12.61l2.03 1.58c-.04.31-.07.63-.07.94s.02.63.06.93l-2.03 1.58a.49.49 0 0 0-.12.61l1.92 3.32c.12.22.37.29.59.22l2.39-.96c.5.38 1.03.7 1.62.94l.36 2.54c.05.24.24.41.48.41h3.84c.24 0 .44-.17.48-.41l.36-2.54c.59-.24 1.13-.56 1.62-.94l2.39.96c.22.08.47 0 .59-.22l1.92-3.32c.12-.22.07-.47-.12-.61l-2.01-1.58zM12 15.6A3.6 3.6 0 1 1 15.6 12 3.6 3.6 0 0 1 12 15.6z"/></svg>`;

  const root = document.createElement('div');
  root.className = 'app-settings-root app-settings-popover-hidden';
  root.setAttribute('role', 'dialog');
  root.setAttribute('aria-label', 'Настройки');
  root.innerHTML = `
    <div class="app-settings-panel">
      <div class="app-settings-title">Настройки</div>
      <fieldset class="app-settings-fieldset">
        <legend class="app-settings-legend">Колёсико и тачпад</legend>
        <label class="app-settings-option">
          <input type="radio" name="hex-wheel-behavior" value="zoom" />
          <span>Зум — прокрутка приближает и отдаляет</span>
        </label>
        <label class="app-settings-option">
          <input type="radio" name="hex-wheel-behavior" value="pan" />
          <span>Панорама — прокрутка двигает камеру</span>
        </label>
      </fieldset>
      <p class="app-settings-hint">В режиме панорамы зум остаётся на <strong>Ctrl</strong>+прокрутка или жестом «щипок» на тачпаде.</p>
      ${
        touchMods
          ? `<fieldset class="app-settings-fieldset app-settings-touch-mods">
        <legend class="app-settings-legend">Сенсорный экран</legend>
        <label class="app-settings-option">
          <input type="checkbox" name="hex-touch-alt" />
          <span>Режим «Alt» — превью дальности по наведению (как удерживать Alt)</span>
        </label>
        <label class="app-settings-option">
          <input type="checkbox" name="hex-touch-shift" />
          <span>Режим «Shift» — превью атаки с карточки (как удерживать Shift)</span>
        </label>
        <p class="app-settings-hint">Два пальца на поле: панорама и масштаб. Долгое нажатие на фишку — маркеры эффектов (как ПКМ).</p>
      </fieldset>`
          : ''
      }
    </div>
  `;

  let popoverOpen = false;
  function setPopoverOpen(open: boolean): void {
    popoverOpen = open;
    root.classList.toggle('app-settings-popover-hidden', !open);
    toggleBtn.setAttribute('aria-expanded', open ? 'true' : 'false');
  }

  function syncRadios(): void {
    const v = getWheelBehavior();
    const rZoom = root.querySelector<HTMLInputElement>('input[value="zoom"]');
    const rPan = root.querySelector<HTMLInputElement>('input[value="pan"]');
    if (rZoom) rZoom.checked = v === 'zoom';
    if (rPan) rPan.checked = v === 'pan';
    if (touchMods) {
      const cAlt = root.querySelector<HTMLInputElement>('input[name="hex-touch-alt"]');
      const cShift = root.querySelector<HTMLInputElement>('input[name="hex-touch-shift"]');
      if (cAlt) cAlt.checked = touchMods.getAlt();
      if (cShift) cShift.checked = touchMods.getShift();
    }
  }

  toggleBtn.addEventListener('click', (e) => {
    e.stopPropagation();
    if (!popoverOpen) syncRadios();
    setPopoverOpen(!popoverOpen);
  });

  root.querySelectorAll('input[name="hex-wheel-behavior"]').forEach((input) => {
    input.addEventListener('change', () => {
      const el = input as HTMLInputElement;
      if (!el.checked) return;
      if (el.value === 'zoom' || el.value === 'pan') setWheelBehavior(el.value);
    });
  });

  document.addEventListener(
    'pointerdown',
    (e) => {
      if (!popoverOpen) return;
      if (anchor.contains(e.target as Node)) return;
      setPopoverOpen(false);
    },
    true,
  );

  onWheelBehaviorChange(syncRadios);
  syncRadios();

  if (touchMods) {
    const cAlt = root.querySelector<HTMLInputElement>('input[name="hex-touch-alt"]');
    const cShift = root.querySelector<HTMLInputElement>('input[name="hex-touch-shift"]');
    cAlt?.addEventListener('change', () => {
      touchMods.setAlt(!!cAlt?.checked);
    });
    cShift?.addEventListener('change', () => {
      touchMods.setShift(!!cShift?.checked);
    });
  }

  anchor.appendChild(toggleBtn);
  anchor.appendChild(root);
  toolbarMount.appendChild(anchor);
}
