import { defineConfig } from 'vite';

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
