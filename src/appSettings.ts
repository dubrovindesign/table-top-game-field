/**
 * Локальные настройки приложения (localStorage) + панель без отдельной кнопки в тулбаре (открытие из меню «⋯»).
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

export type AppSettingsHandle = {
  open: () => void;
  close: () => void;
};

/**
 * Панель настроек. Без кнопки в тулбаре: якорь-«призрак» под левым верхним углом, открытие через `open()`.
 */
export function mountAppSettingsToolbar(
  toolbarMount: HTMLElement | null,
  touchMods?: TouchModToggles,
): AppSettingsHandle {
  const anchor = document.createElement('div');
  anchor.className =
    'app-settings-toolbar-anchor' + (toolbarMount ? '' : ' app-settings-toolbar-anchor--ghost');
  if (!toolbarMount) {
    anchor.style.cssText =
      'position:fixed;top:52px;left:12px;width:0;height:0;overflow:visible;z-index:189;pointer-events:none;';
  }

  const root = document.createElement('div');
  root.className = 'app-settings-root app-settings-popover-hidden';
  if (!toolbarMount) root.style.pointerEvents = 'auto';
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

  anchor.appendChild(root);
  if (toolbarMount) {
    toolbarMount.appendChild(anchor);
  } else {
    document.body.appendChild(anchor);
  }

  return {
    open: () => {
      syncRadios();
      setPopoverOpen(true);
    },
    close: () => setPopoverOpen(false),
  };
}
