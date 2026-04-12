import { execSync } from 'node:child_process';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import type { Plugin } from 'vite';
import { defineConfig } from 'vite';
import { VitePWA } from 'vite-plugin-pwa';

const __dirname = fileURLToPath(new URL('.', import.meta.url));

function catalogBundlePlugin(): Plugin {
  const runBundle = (): void => {
    execSync('node scripts/extract-catalog-base64-images.mjs --quiet', {
      cwd: __dirname,
      stdio: 'inherit',
    });
    execSync('node scripts/build-catalog-bundle.mjs', { cwd: __dirname, stdio: 'inherit' });
    execSync('node scripts/verify-catalog-public-assets.mjs', { cwd: __dirname, stdio: 'inherit' });
  };
  const isCatalogSourcePath = (filePath: string): boolean => {
    const normalized = filePath.replace(/\\/g, '/');
    return normalized.includes('/src/catalog/');
  };
  return {
    name: 'catalog-bundle',
    buildStart() {
      runBundle();
    },
    configureServer() {
      runBundle();
    },
    handleHotUpdate(ctx) {
      if (!isCatalogSourcePath(ctx.file)) return;
      runBundle();
      // Catalog payload is fetched as a single JSON bundle; reload to apply refreshed data.
      ctx.server.ws.send({ type: 'full-reload' });
    },
  };
}

const MP_PORT = Number(process.env.MP_PORT ?? 3333);

/** Browser → same host as the page; Vite forwards raw WebSocket to roomServer (see MP_PORT). */
const mpWsProxy = {
  '/__mp_ws': {
    target: `http://127.0.0.1:${MP_PORT}`,
    changeOrigin: true,
    ws: true,
  },
  '/api/scenarios': {
    target: `http://127.0.0.1:${MP_PORT}`,
    changeOrigin: true,
  },
} as const;

export default defineConfig({
  define: {
    /** Метка в консоли: убедиться, что превью подхватило свежий `dist/` после сборки. */
    __APP_BUILD_STAMP__: JSON.stringify(new Date().toISOString()),
  },
  build: {
    rollupOptions: {
      input: {
        main: resolve(__dirname, 'index.html'),
        cardHotspotTest: resolve(__dirname, 'card-hotspot-test.html'),
      },
    },
  },
  plugins: [
    catalogBundlePlugin(),
    VitePWA({
      /** Регистрация вручную в `boot.ts`: на `vite preview` (порт 4173) SW отключаем, иначе старый precache часто маскирует свежий `dist/`. */
      injectRegister: false,
      registerType: 'autoUpdate',
      includeAssets: ['mobile-logo.webp'],
      manifest: {
        name: 'Hex Board Game',
        short_name: 'Hex Board',
        description: 'Настольное поле с гексагональной сеткой',
        theme_color: '#121118',
        background_color: '#0a0a0c',
        display: 'standalone',
        orientation: 'any',
        scope: '/',
        start_url: '/',
        lang: 'ru',
        categories: ['games', 'entertainment'],
        icons: [
          {
            src: '/mobile-logo.webp',
            sizes: '512x512',
            type: 'image/webp',
            purpose: 'any',
          },
          {
            src: '/mobile-logo.webp',
            sizes: '192x192',
            type: 'image/webp',
            purpose: 'any',
          },
        ],
      },
      workbox: {
        // Omit `html` from precache so a stale index.html is not served from the SW
        // after deploy; navigateFallback still works when offline.
        globPatterns: ['**/*.{js,css,ico,svg,woff2}', '**/generated/catalog-data.json'],
        navigateFallback: '/index.html',
        navigateFallbackDenylist: [/^\/__mp_ws/],
        runtimeCaching: [
          {
            urlPattern: /^https:\/\/fonts\.googleapis\.com\/.*/i,
            handler: 'CacheFirst',
            options: {
              cacheName: 'google-fonts-stylesheets',
              expiration: {
                maxEntries: 4,
                maxAgeSeconds: 60 * 60 * 24 * 365,
              },
            },
          },
          {
            urlPattern: /^https:\/\/fonts\.gstatic\.com\/.*/i,
            handler: 'CacheFirst',
            options: {
              cacheName: 'google-fonts-webfonts',
              expiration: {
                maxEntries: 8,
                maxAgeSeconds: 60 * 60 * 24 * 365,
              },
            },
          },
          {
            urlPattern: ({ url }) =>
              url.origin === self.location.origin &&
              /\.(png|jpe?g|webp|gif)$/i.test(url.pathname),
            handler: 'StaleWhileRevalidate',
            options: {
              cacheName: 'game-images',
              expiration: {
                maxEntries: 120,
                maxAgeSeconds: 60 * 60 * 24 * 30,
              },
            },
          },
        ],
      },
      devOptions: {
        enabled: false,
      },
    }),
  ],
  server: {
    host: true,
    proxy: { ...mpWsProxy },
  },
  /** Иначе `vite preview` слушает только 127.0.0.1 — со второго ноутбука по LAN не зайти. */
  preview: {
    host: true,
    port: 4173,
    proxy: { ...mpWsProxy },
  },
});
