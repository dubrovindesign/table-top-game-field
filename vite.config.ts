import { defineConfig } from 'vite';

export default defineConfig({
  server: {
    host: true,
  },
  /** Иначе `vite preview` слушает только 127.0.0.1 — со второго ноутбука по LAN не зайти. */
  preview: {
    host: true,
    port: 4173,
  },
});
