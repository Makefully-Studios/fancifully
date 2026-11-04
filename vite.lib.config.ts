import { defineConfig } from 'vite';
import path from 'node:path';

export default defineConfig({
  build: {
    lib: {
      entry: path.resolve('src/index.ts'),
      name: 'Fancifully',
      formats: ['es', 'iife'],
      fileName: (format) => (format === 'iife' ? 'fancifully.iife.js' : 'fancifully.js'),
    },
    cssCodeSplit: false,
    outDir: 'dist',
    emptyOutDir: true,
    rollupOptions: {
      external: ['springroll', 'fabric'],
      output: {
        exports: 'named',
        assetFileNames: 'fancifully.css',
        globals: {
          springroll: 'springroll',
          fabric: 'fabric',
        },
      },
    },
  },
});
