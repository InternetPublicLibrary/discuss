import { defineConfig } from 'vite';

// client.js: one self-contained IIFE embedded by IPL pages (no dependencies, no eval).
export default defineConfig({
  build: {
    outDir: 'dist/widget',
    emptyOutDir: false,
    lib: { entry: 'src/client/client.ts', formats: ['iife'], name: 'discussClient', fileName: () => 'client.js' },
    minify: true,
  },
});
