/**
 * Lightweight entry: boot overlay + preload (parallel with main chunk), then the full app (main).
 */

import './bootScreen.css';
import { runInitialBootScreen } from './bootScreen.ts';

/** `vite preview` по умолчанию на 4173 — без SW, чтобы всегда подхватывался актуальный `dist/` после сборки. */
function configureServiceWorkerForEnvironment(): void {
  if (!import.meta.env.PROD || typeof window === 'undefined') return;
  const port = window.location.port;
  /** Совпадает с `preview.port` в `vite.config.ts`. */
  const isVitePreview = port === '4173';
  if (!('serviceWorker' in navigator)) return;
  if (isVitePreview) {
    void navigator.serviceWorker.getRegistrations().then((regs) => {
      for (const r of regs) void r.unregister();
    });
    return;
  }
  window.addEventListener('load', () => {
    void navigator.serviceWorker.register('/sw.js', { scope: '/' });
  });
}
configureServiceWorkerForEnvironment();

if (import.meta.env.PROD) {
  console.info('[Hex Board] сборка клиента:', __APP_BUILD_STAMP__);
}

const mainModulePromise = import('./main.ts');

function showBootFatalError(err: unknown): void {
  if (document.querySelector('[data-hex-boot-error]')) return;
  const pre = document.createElement('pre');
  pre.dataset.hexBootError = '1';
  pre.style.cssText =
    'margin:24px;font:14px/1.4 system-ui;white-space:pre-wrap;word-break:break-word;color:#c00;background:#fff;padding:16px;border:1px solid #ccc;';
  pre.textContent = `[Hex Board] Ошибка загрузки приложения.\n\n${err instanceof Error ? err.stack ?? err.message : String(err)}\n\nПроверьте консоль (F12). Частые причины: не подгрузился generated/catalog-data.json, блокировка чанков, устаревший service worker — жёсткое обновление (Ctrl+F5) или отключение SW.`;
  document.body.appendChild(pre);
}

try {
  await runInitialBootScreen({ mainModulePromise });
} catch (err) {
  console.error('[boot] runInitialBootScreen failed', err);
  showBootFatalError(err);
}
