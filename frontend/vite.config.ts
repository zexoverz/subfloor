import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';

export default defineConfig({
  plugins: [react(), tailwindcss()],
  // docs/fuzz-counter.json lives above this package: it is written by the fuzz cron, and the
  // dashboard reads it rather than carrying its own number.
  server: { fs: { allow: ['..'] } },
});
