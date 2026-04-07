/**
 * Кнопка «Установить приложение» в тулбаре (beforeinstallprompt + подсказка вручную).
 */

function isStandaloneDisplay(): boolean {
  if (typeof window.matchMedia === 'function' && window.matchMedia('(display-mode: standalone)').matches) {
    return true;
  }
  return (navigator as Navigator & { standalone?: boolean }).standalone === true;
}

function installHintParagraph(): string {
  const ua = navigator.userAgent;
  if (/iPhone|iPad|iPod/i.test(ua) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1)) {
    return 'В Safari: «Поделиться» (квадрат со стрелкой) → «На экран Домой».';
  }
  if (/Android/i.test(ua)) {
    return 'В Chrome: меню (⋮) → «Установить приложение» или «Добавить на главный экран».';
  }
  return 'В Chrome или Edge: меню (⋮) → «Установить приложение…». Либо значок установки в адресной строке.';
}

export function mountPwaInstallToolbar(toolbarMount: HTMLElement): void {
  if (isStandaloneDisplay()) return;

  const anchor = document.createElement('div');
  anchor.className = 'pwa-install-toolbar-anchor';

  const btn = document.createElement('button');
  btn.type = 'button';
  btn.className = 'pwa-install-menu-btn';
  btn.setAttribute('aria-label', 'Установить приложение');
  btn.title = 'Установить на устройство (PWA)';
  btn.setAttribute('aria-haspopup', 'dialog');
  btn.setAttribute('aria-expanded', 'false');
  btn.innerHTML = `<svg class="pwa-install-menu-btn-icon" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M19 9h-4V3H9v6H5l7 7 7-7zM5 18v2h14v-2H5z"/></svg>`;

  const root = document.createElement('div');
  root.className = 'pwa-install-root pwa-install-popover-hidden';
  root.setAttribute('role', 'dialog');
  root.setAttribute('aria-label', 'Как установить приложение');
  root.innerHTML = `
    <div class="pwa-install-panel">
      <div class="pwa-install-title">Установить приложение</div>
      <p class="pwa-install-hint"></p>
    </div>
  `;
  const hintEl = root.querySelector('.pwa-install-hint');
  if (hintEl) hintEl.textContent = installHintParagraph();

  let deferred: BeforeInstallPromptEvent | null = null;
  let popoverOpen = false;

  function setPopoverOpen(open: boolean): void {
    popoverOpen = open;
    root.classList.toggle('pwa-install-popover-hidden', !open);
    btn.setAttribute('aria-expanded', open ? 'true' : 'false');
  }

  function hideToolbar(): void {
    anchor.classList.add('pwa-install-toolbar-anchor--gone');
  }

  window.addEventListener('beforeinstallprompt', (e) => {
    e.preventDefault();
    deferred = e as BeforeInstallPromptEvent;
    btn.title = 'Установить на устройство — готово к установке';
  });

  window.addEventListener('appinstalled', () => {
    deferred = null;
    setPopoverOpen(false);
    hideToolbar();
  });

  btn.addEventListener('click', async (e) => {
    e.stopPropagation();
    if (deferred) {
      try {
        await deferred.prompt();
        await deferred.userChoice;
      } catch {
        /* ignore */
      }
      deferred = null;
      btn.title = 'Установить на устройство (PWA)';
      setPopoverOpen(false);
      return;
    }
    setPopoverOpen(!popoverOpen);
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

  anchor.appendChild(btn);
  anchor.appendChild(root);
  toolbarMount.appendChild(anchor);
}
