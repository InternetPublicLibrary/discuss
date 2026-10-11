import { render } from 'preact';
import { describe, expect, it } from 'vitest';
import type { Comment as CommentData } from '../../shared/types';
import { associationKey } from '../lib/association';
import { readConfig } from '../lib/config';
import { I18nProvider, loadMessages } from '../lib/i18n';
import { Comment } from './Comment';

const base: CommentData = {
  id: 'C1', author: { avatarUrl: 'a', login: 'ana', url: 'https://github.com/ana', name: 'Ana Souza' }, viewerDidAuthor: false, createdAt: '2026-10-01T00:00:00Z', url: 'u',
  authorAssociation: 'MEMBER', lastEditedAt: null, deletedAt: null, isMinimized: false, minimizedReason: null, bodyHTML: '<p>x</p>', reactions: {} as CommentData['reactions'],
  upvoteCount: 0, viewerHasUpvoted: false, viewerCanUpvote: false, replyCount: 0, replies: [], repliesStartCursor: null,
};

async function show(comment: CommentData) {
  const messages = await loadMessages('en');
  const root = document.body.appendChild(document.createElement('div'));
  render(
    <I18nProvider locale="en" messages={messages} fallback={messages}>
      <Comment comment={comment} config={readConfig('?repo=o/r&term=x')} discussionId="D" locked={false} />
    </I18nProvider>,
    root,
  );
  return root;
}

describe('author labels and names (#21)', () => {
  it.each([
    ['OWNER', 'iplTeam'],
    ['MEMBER', 'iplTeam'],
    ['COLLABORATOR', 'iplTeam'],
    ['CONTRIBUTOR', 'CONTRIBUTOR'],
    ['NONE', null],
    ['APP', null],
  ] as const)('maps %s to %s', (association, key) => {
    expect(associationKey(association)).toBe(key);
  });

  it('shows "Name (@handle)" and the IPL label instead of Owner/Member', async () => {
    const root = await show(base);

    expect(root.textContent).toContain('Ana Souza(@ana)');
    expect(root.textContent).toContain('IPL team');
    expect(root.textContent).not.toMatch(/Member|Owner/);
  });

  it('shows only the handle when there is no profile name', async () => {
    const root = await show({ ...base, author: { ...base.author, name: null }, authorAssociation: 'NONE' });

    expect(root.querySelector('.gsc-comment-author-avatar')?.textContent).toBe('ana');
  });

  it('never shows the bot or a bot badge for ORCID comments', async () => {
    const root = await show({ ...base, author: { avatarUrl: 'a', login: 'ipl-discuss[bot]', url: 'u' }, authorAssociation: 'APP', orcidAuthor: { id: '0000-0002-1825-0097', name: 'Josiah Carberry', profileUrl: 'x' } });

    expect(root.textContent).not.toContain('ipl-discuss');
    expect(root.textContent).not.toMatch(/\bApp\b|Bot/);
    expect(root.textContent).toContain('Josiah Carberry');
  });
});
