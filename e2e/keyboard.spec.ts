import { expect, type Page, test } from '@playwright/test';
import { GITHUB, mockApi, widgetUrl } from './fixtures';

// Spec 004 / #13: the whole flow works without a mouse.
async function tabOrder(page: Page, steps = 120): Promise<string[]> {
  const names: string[] = [];
  for (let step = 0; step < steps; step += 1) {
    await page.keyboard.press('Tab');
    names.push(await page.evaluate(() => {
      const element = document.activeElement as HTMLElement | null;
      return element ? `${element.tagName.toLowerCase()}:${element.getAttribute('aria-label') ?? element.textContent?.trim() ?? ''}` : '';
    }));
  }
  return names;
}

test('signed out: sign-in, reactions and hidden comments are reachable by Tab', async ({ page }) => {
  await mockApi(page, null);
  await page.goto(widgetUrl());
  await expect(page.locator('article').first()).toBeVisible();

  const order = await tabOrder(page);

  expect(order).toContain('button:Sign in with GitHub');
  expect(order).toContain('button:Show comment');
  expect(order.some((name) => name.startsWith('summary:Comment actions'))).toBe(true);
});

test('signed in: write, preview and comment with the keyboard only', async ({ page }) => {
  await mockApi(page, GITHUB);
  let posted: unknown;
  await page.route('**/api/comments', async (route) => {
    posted = route.request().postDataJSON();
    const comment = { id: 'C9', author: { avatarUrl: 'https://avatars.githubusercontent.com/u/1', login: 'octocat', url: 'https://github.com/octocat' }, viewerDidAuthor: true, createdAt: '2026-10-11T00:00:00Z', url: 'https://github.com/o/r/discussions/7#C9', authorAssociation: 'NONE', lastEditedAt: null, deletedAt: null, isMinimized: false, minimizedReason: null, bodyHTML: '<p>From the keyboard</p>', reactions: {}, upvoteCount: 0, viewerHasUpvoted: false, viewerCanUpvote: false, replyCount: 0, replies: [], repliesStartCursor: null };
    await route.fulfill({ status: 201, json: { discussionId: 'D_1', comment } });
  });
  await page.goto(widgetUrl());
  await expect(page.getByText('Signed in as The Octocat').last()).toBeVisible();

  const box = page.getByRole('textbox', { name: 'Write a comment' });
  for (let step = 0; step < 150 && !(await box.evaluate((element) => element === document.activeElement)); step += 1) await page.keyboard.press('Tab');
  await expect(box).toBeFocused();
  await page.keyboard.type('From the keyboard');

  // The main comment box (the reply boxes come earlier, inside each comment).
  const form = page.locator('.gsc-comments > form');
  await page.keyboard.press('Shift+Tab');
  await expect(form.getByRole('tab', { name: 'Preview' })).toBeFocused();
  await page.keyboard.press('Enter');
  await expect(form.getByRole('tab', { name: 'Preview' })).toHaveAttribute('aria-selected', 'true');

  const submit = form.getByRole('button', { name: 'Comment', exact: true });
  for (let step = 0; step < 10 && !(await submit.evaluate((element) => element === document.activeElement)); step += 1) await page.keyboard.press('Tab');
  await expect(submit).toBeFocused();
  await page.keyboard.press('Enter');

  await expect(page.getByText('From the keyboard').last()).toBeVisible();
  expect(posted).toMatchObject({ body: 'From the keyboard' });
});

test('reaction buttons announce their state', async ({ page }) => {
  await mockApi(page, GITHUB);
  await page.goto(widgetUrl());
  await expect(page.locator('article').first()).toBeVisible();

  await expect(page.getByRole('button', { name: 'Remove +1 reaction' }).first()).toHaveAttribute('aria-pressed', 'true');
  await expect(page.getByRole('button', { name: 'Add Love reaction' }).first()).toHaveAttribute('aria-pressed', 'false');
});

test('the ORCID author badge has an accessible name', async ({ page }) => {
  await mockApi(page, null);
  await page.goto(widgetUrl());

  await expect(page.getByLabel('ORCID iD 0000-0002-1825-0097').first()).toBeVisible();
});
