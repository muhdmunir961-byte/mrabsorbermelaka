import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';

/**
 * Frontend and backend are separate deployables. The dev proxy below is only a
 * convenience so the session cookie stays same-origin while developing; a real
 * deployment sets VITE_API_BASE_URL and talks to the API across origins.
 */
export default defineConfig({
  plugins: [react(), tailwindcss()],
  server: {
    host: '127.0.0.1',
    port: 5173,
    strictPort: true,
    proxy: {
      '/api': {
        target: process.env.API_PROXY_TARGET ?? 'http://127.0.0.1:4000',
        changeOrigin: false,
      },
    },
  },
  preview: { host: '127.0.0.1', port: 4173, strictPort: true },
  build: { outDir: 'dist', sourcemap: false },
});
