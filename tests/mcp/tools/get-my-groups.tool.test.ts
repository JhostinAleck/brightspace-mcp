import { describe, expect, it } from 'vitest';

import { handleGetMyGroups } from '@/mcp/tools/get-my-groups.tool.js';
import { Group, type GroupRepository } from '@/contexts/groups/domain/Group.js';

const mkRepo = (groups: Group[]): GroupRepository => ({
  findMyGroups: async () => groups,
});

describe('handleGetMyGroups', () => {
  it('returns "not in any groups" when the list is empty', async () => {
    const result = await handleGetMyGroups({ groupRepo: mkRepo([]) }, { course_id: 100 });
    expect(result.content[0]?.text).toContain('not in any groups');
  });

  it('renders category, group, and member roster', async () => {
    const result = await handleGetMyGroups(
      { groupRepo: mkRepo([
        new Group({
          id: 99, categoryId: 7, categoryName: 'Lab Groups', name: 'Group 9',
          members: [
            { userId: 1, displayName: 'Jane Doe', username: 'jane' },
            { userId: 2, displayName: 'Carlos Pérez' },
          ],
        }),
      ]) },
      { course_id: 100 },
    );
    const text = result.content[0]?.text ?? '';
    expect(text).toContain('Lab Groups → Group 9');
    expect(text).toContain('Jane Doe');
    expect(text).toContain('(jane)');
    expect(text).toContain('Carlos Pérez');
  });

  it('shows "no members listed" when empty roster', async () => {
    const result = await handleGetMyGroups(
      { groupRepo: mkRepo([
        new Group({ id: 1, categoryId: 1, categoryName: 'A', name: 'B', members: [] }),
      ]) },
      { course_id: 100 },
    );
    expect(result.content[0]?.text).toContain('no members listed');
  });
});
