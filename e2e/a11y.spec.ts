import AxeBuilder from '@axe-core/playwright';
import { expect, test } from '@playwright/test';
import { GITHUB, mockApi, ORCID, widgetUrl } from './fixtures';

// Spec 004 / #13: no serious or critical axe violations in any sign-in state, IPL theme or locale.
const STATES = [['signed out', null], ['GitHub', GITHUB], ['ORCID', ORCID]] as const;

for (const theme of ['ipl-light', 'ipl-dark']) {
  for (const lang of ['en', 'pt-BR']) {
    for (const [state, session] of STATES) {
      test(`axe: ${state}, ${theme}, ${lang}`, async ({ page }) => {
        await mockApi(page, session);
        await page.goto(widgetUrl({ theme, lang }));
        await expect(page.locator('article').first()).toBeVisible();
        await expect(page.locator('link#discuss-theme')).toHaveAttribute('href', `/themes/${theme}.css`);

        const results = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa']).analyze();
        const serious = results.violations.filter((violation) => violation.impact === 'serious' || violation.impact === 'critical');

        expect(serious.map((violation) => `${violation.id}: ${violation.nodes.map((node) => node.target.join(' ')).join(', ')}`)).toEqual([]);
      });
    }
  }
}
