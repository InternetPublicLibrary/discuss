import { cloudflareTest } from '@cloudflare/vitest-plugin';
import preact from '@preact/preset-vite';
import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    projects: [
      {
        // The API runs inside workerd (Miniflare) with the bindings from wrangler.jsonc.
        plugins: [cloudflareTest({ wrangler: { configPath: './wrangler.jsonc' } })],
        test: { name: 'worker', include: ['src/worker/**/*.test.ts', 'src/shared/**/*.test.ts'] },
      },
      {
        plugins: [preact()],
        css: { postcss: {} },
        test: {
          name: 'widget',
          // jsdom: the DOM DOMPurify itself is tested against (happy-dom let event-handler attributes through).
          environment: 'jsdom',
          include: ['src/widget/**/*.test.{ts,tsx}', 'src/client/**/*.test.ts'],
        },
      },
    ],
  },
});
