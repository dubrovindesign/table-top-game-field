/**
 * Кнопка «Установить приложение» в тулбаре (событие beforeinstallprompt).
 */

function isStandaloneDisplay(): boolean {
  if (typeof window.matchMedia === 'function' && window.matchMedia('(display-mode: standalone)').matches) {
    return true;
  }
  return (navigator as Navigator & { standalone?: boolean }).standalone === true;
}

export function mountPwaInstallToolbar(toolbarMount: HTMLElement): void {
  if (isStandaloneDisplay()) return;

  const anchor = document.createElement('div');
  anchor.className = 'pwa-install-toolbar-anchor';

  const btn = document.createElement('button');
  btn.type = 'button';
  btn.className = 'pwa-install-menu-btn pwa-install-menu-btn--hidden';
  btn.setAttribute('aria-label', 'Установить приложение');
  btn.title = 'Установить на устройство (PWA)';
  btn.innerHTML = `<svg class="pwa-install-menu-btn-icon" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M19 9h-4V3H9v6H5l7 7 7-7zM5 18v2h14v-2H5z"/></svg>`;

  let deferred: BeforeInstallPromptEvent | null = null;

  function setVisible(visible: boolean): void {
    btn.classList.toggle('pwa-install-menu-btn--hidden', !visible);
  }

  window.addEventListener('beforeinstallprompt', (e) => {
    e.preventDefault();
    deferred = e as BeforeInstallPromptEvent;
    setVisible(true);
  });

  window.addEventListener('appinstalled', () => {
    deferred = null;
    setVisible(false);
  });

  btn.addEventListener('click', async () => {
    if (!deferred) return;
    try {
      await deferred.prompt();
      await deferred.userChoice;
    } catch {
      /* ignore */
    }
    deferred = null;
    setVisible(false);
  });

  anchor.appendChild(btn);
  toolbarMount.appendChild(anchor);
}
