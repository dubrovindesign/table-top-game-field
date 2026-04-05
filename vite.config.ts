import { defineConfig } from 'vite';
import { VitePWA } from 'vite-plugin-pwa';

const MP_PORT = Number(process.env.MP_PORT ?? 3333);

/** Browser → same host as the page; Vite forwards raw WebSocket to roomServer (see MP_PORT). */
const mpWsProxy = {
  '/__mp_ws': {
    target: `http://127.0.0.1:${MP_PORT}`,
    changeOrigin: true,
    ws: true,
  },
} as const;

export default defineConfig({
  plugins: [
    VitePWA({
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
        globPatterns: ['**/*.{js,css,html,ico,svg,woff2}'],
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
