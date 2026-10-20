import { defineConfig } from 'vite';
import path from 'node:path';

export default defineConfig({
  root: 'demo',
  publicDir: 'public',
  resolve: {
    alias: {
      '@makefully/fancifully': path.resolve('src/index.ts'),
    },
  },
  server: {
    port: 5174,
  },
  build: {
    outDir: '../dist/demo',
    emptyOutDir: true,
  },
});
