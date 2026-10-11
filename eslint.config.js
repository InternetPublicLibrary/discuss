import js from '@eslint/js';
import vitest from '@vitest/eslint-plugin';
import globals from 'globals';
import tseslint from 'typescript-eslint';

export default tseslint.config(
  // Upstream giscus (Next.js) code stays for reference until the port reaches parity; it is not built.
  {
    ignores: [
      'node_modules/', 'dist/', 'test-results/', 'playwright-report/', '.wrangler/', 'components/', 'lib/', 'pages/', 'services/', 'styles/', 'public/',
      'locales/', 'client.ts', 'i18n.js', 'next.config.js', 'next-env.d.ts', 'postcss.config.js', 'prettier.config.js',
      'tailwind.config.js', '.eslintrc.js', '.stylelintrc.js',
    ],
  },
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
