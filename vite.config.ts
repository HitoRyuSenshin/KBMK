import { defineConfig } from 'vite';
import { resolve } from 'node:path';

// Renderer only. The main/preload processes are compiled with tsc
// (see tsconfig.main.json) so `npm start` is a plain build + electron.
export default defineConfig({
  root: resolve(__dirname, 'src/renderer'),
  base: './',
  build: {
    outDir: resolve(__dirname, 'dist/renderer'),
    emptyOutDir: true,
  },
});
