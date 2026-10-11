import type { AuthorAssociation } from '../../shared/types';

/**
 * IPL labels instead of GitHub's repository roles (#21): owners, members and collaborators of the content
 * repositories are the IPL team; contributors keep their label; everyone else (and bots) gets no badge.
 */
export function associationKey(association: AuthorAssociation): string | null {
  if (association === 'OWNER' || association === 'MEMBER' || association === 'COLLABORATOR') return 'iplTeam';
  if (association === 'CONTRIBUTOR' || association === 'FIRST_TIME_CONTRIBUTOR') return 'CONTRIBUTOR';
  return null;
}
