/**
 * Установка PWA: без отдельной кнопки в тулбаре — вызов из меню «⋯».
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

export type PwaInstallMenuHandle = {
  open: () => Promise<void>;
};

/**
 * Готовит логику установки и всплывающую подсказку. `null`, если приложение уже в режиме установки.
 */
export function createPwaInstallMenuFlow(): PwaInstallMenuHandle | null {
  if (isStandaloneDisplay()) return null;

  const anchor = document.createElement('div');
  anchor.className = 'pwa-install-toolbar-anchor pwa-install-toolbar-anchor--ghost';
  anchor.style.cssText =
    'position:fixed;top:52px;left:12px;width:0;height:0;overflow:visible;z-index:189;pointer-events:none;';

  const root = document.createElement('div');
  root.className = 'pwa-install-root pwa-install-popover-hidden';
  root.style.pointerEvents = 'auto';
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
  }

  window.addEventListener('beforeinstallprompt', (e) => {
    e.preventDefault();
    deferred = e as BeforeInstallPromptEvent;
  });

  window.addEventListener('appinstalled', () => {
    deferred = null;
    setPopoverOpen(false);
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

  anchor.appendChild(root);
  document.body.appendChild(anchor);

  async function open(): Promise<void> {
    if (deferred) {
      try {
        await deferred.prompt();
        await deferred.userChoice;
      } catch {
        /* ignore */
      }
      deferred = null;
      setPopoverOpen(false);
      return;
    }
    setPopoverOpen(true);
  }

  return { open };
}
