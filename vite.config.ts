import preact from '@preact/preset-vite';
import autoprefixer from 'autoprefixer';
import tailwindcss from 'tailwindcss';
import vanillaRTL from 'tailwindcss-vanilla-rtl';
import { defineConfig } from 'vite';

/** Tailwind 3 as upstream giscus used it, scoped to the widget root (`#discuss`) so host-like resets cannot win. */
export const tailwindConfig = {
  content: ['./src/widget/**/*.{ts,tsx,html}'],
  important: '#discuss',
  safelist: ['mb-0', 'py-0'],
  darkMode: 'class' as const,
  plugins: [vanillaRTL],
  corePlugins: { ...vanillaRTL.disabledCorePlugins },
  theme: {
    extend: {
      screens: {
        dsm: { raw: '(min-device-width: 640px)' },
        dmd: { raw: '(min-device-width: 768px)' },
        dlg: { raw: '(min-device-width: 1024px)' },
      },
    },
  },
};

// The widget: static assets served by the Worker (ADR 0002). No inline scripts, so it runs under a strict CSP (#7).
export default defineConfig({
  root: 'src/widget',
  base: '/',
  plugins: [preact()],
  css: { postcss: { plugins: [tailwindcss(tailwindConfig), autoprefixer()] } },
  build: {
    outDir: '../../dist/widget',
    emptyOutDir: true,
    modulePreload: { polyfill: false },
  },
});
