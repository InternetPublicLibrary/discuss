import js from '@eslint/js';
import vitest from '@vitest/eslint-plugin';
import globals from 'globals';
import tseslint from 'typescript-eslint';

export default tseslint.config(
  { ignores: ['node_modules/', 'dist/', '.wrangler/', 'test-results/', 'playwright-report/', 'styles/', 'locales/'] },
  js.configs.recommended,
  ...tseslint.configs.strict,
  { files: ['src/widget/**', 'src/client/**', 'e2e/host/**'], languageOptions: { globals: globals.browser } },
  { files: ['scripts/**/*.mjs', 'e2e/**/*.mjs', 'e2e/**/*.ts', 'playwright.config.ts'], languageOptions: { globals: globals.node } },
  {
    files: ['src/**/*.test.{ts,tsx}'],
    plugins: { vitest },
    rules: {
      ...vitest.configs.recommended.rules,
      'vitest/no-conditional-expect': 'error',
      'vitest/no-conditional-in-test': 'error',
    },
  },
);
