import preact from '@preact/preset-vite';
import { defineConfig } from 'vite';

// The widget: static assets served by the Worker (ADR 0002). No inline scripts, so it runs under a strict CSP (#7).
export default defineConfig({
  root: 'src/widget',
  base: '/',
  plugins: [preact()],
  css: { postcss: {} },
  build: {
    outDir: '../../dist/widget',
    emptyOutDir: true,
    modulePreload: { polyfill: false },
  },
});
