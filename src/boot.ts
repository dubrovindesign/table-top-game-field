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
await runInitialBootScreen({ mainModulePromise });
