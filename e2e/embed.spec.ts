import { expect, type Page, test } from '@playwright/test';
import { REASONS } from '../src/shared/reasons';
import { mockApi } from './fixtures';

// Spec 004 T5: client.js on an IPL-like page under the site's strict CSP (#7), events and reasons (#23), and the
// messages readers see when comments cannot load (#9).
const HOST = 'http://localhost:4174/en-US/computing/';
const events = (page: Page) => page.evaluate(() => (window as unknown as { discussEvents: { type: string; detail: unknown }[] }).discussEvents);
const frame = (page: Page) => page.frameLocator('iframe.discuss-frame');

function watchCsp(page: Page): string[] {
  const violations: string[] = [];
  page.on('console', (message) => {
    if (/Content Security Policy|Refused to/i.test(message.text())) violations.push(message.text());
  });
  return violations;
}

test('loads under the IPL strict CSP and announces ready', async ({ page }) => {
  const violations = watchCsp(page);
  await mockApi(page, null);
  await page.goto(HOST);

  await expect(frame(page).locator('article').first()).toBeVisible();
  await expect.poll(async () => (await events(page)).filter((event) => event.type === 'discuss:ready')).toHaveLength(1);
  expect(violations).toEqual([]);
});

test('the IPL theme toggle switches the widget theme without reloading', async ({ page }) => {
  await mockApi(page, null);
  await page.goto(HOST);
  await expect(frame(page).locator('article').first()).toBeVisible();
  const iframeSrc = await page.locator('iframe.discuss-frame').getAttribute('src');

  await page.evaluate(() => (window as unknown as { discuss: { setConfig: (config: { theme: string }) => void } }).discuss.setConfig({ theme: 'ipl-dark' }));

  await expect(frame(page).locator('link#discuss-theme')).toHaveAttribute('href', '/themes/ipl-dark.css');
  expect(await page.locator('iframe.discuss-frame').getAttribute('src')).toBe(iframeSrc);
});

test('a site the service does not allow sees a message and an origin-not-allowed event', async ({ page }) => {
  await mockApi(page, null, { health: 403 });
  await page.goto(HOST);

  await expect(page.getByText('Comments are not available on this site.')).toBeVisible();
  await expect(page.locator('iframe.discuss-frame')).toHaveCount(0);
  await expect.poll(() => events(page)).toContainEqual({ type: 'discuss:error', detail: { reason: 'origin-not-allowed' } });
});

const STATUS: Record<string, number> = { 'rate-limited': 503, 'github-unavailable': 502, 'signed-out': 401, 'discussion-not-found': 404, internal: 500 };

for (const reason of REASONS.filter((item) => item !== 'discussion-not-found')) {
  test(`posts discuss:error { reason: "${reason}" } and shows a message`, async ({ page }) => {
    await mockApi(page, null, { discussion: (route) => route.fulfill({ status: STATUS[reason] ?? 400, json: { error: { reason } } }) });
    await page.goto(HOST);

    await expect.poll(() => events(page)).toContainEqual({ type: 'discuss:error', detail: { reason } });
    await expect(frame(page).getByRole('alert')).not.toBeEmpty();
  });
}

test('a page without a discussion yet shows the empty state, not an error', async ({ page }) => {
  await mockApi(page, null, { discussion: (route) => route.fulfill({ status: 404, json: { error: { reason: 'discussion-not-found' } } }) });
  await page.goto(HOST);

  await expect(frame(page).getByText('No comments yet')).toBeVisible();
  expect((await events(page)).filter((event) => event.type === 'discuss:error')).toEqual([]);
});

test('rate limiting is explained in Portuguese too (#9)', async ({ page }) => {
  await mockApi(page, null, { discussion: (route) => route.fulfill({ status: 503, json: { error: { reason: 'rate-limited' } } }) });
  await page.goto('http://localhost:4174/pt-BR/computacao/');

  await expect(frame(page).getByRole('alert')).toContainText('temporariamente indisponíveis');
});
