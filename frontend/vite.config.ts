import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';

/**
 * `/api/*` are serverless functions and the dev server does not run them, so on localhost every
 * one of them 404s and the board silently falls back to fixtures — which is how a change that
 * works in production reads as broken while you build it.
 *
 * They are proxied to the deployment instead of reimplemented. VITE_API_ORIGIN points somewhere
 * else when that deployment is not the one you mean.
 */
const API_ORIGIN = process.env.VITE_API_ORIGIN ?? 'https://web-production-37798.up.railway.app';

export default defineConfig({
  plugins: [react(), tailwindcss()],
  server: {
    // docs/fuzz-counter.json lives above this package: it is written by the fuzz cron, and the
    // dashboard reads it rather than carrying its own number.
    fs: { allow: ['..'] },
    proxy: { '/api': { target: API_ORIGIN, changeOrigin: true, secure: true } },
  },
});
