import { describe, it, expect } from 'vitest';
import { handleGetAnnouncements } from '@/mcp/tools/get-announcements.tool';
import { FakeCommunicationsRepository } from '@tests/helpers/fakes/FakeCommunicationsRepository';
import { Announcement } from '@/contexts/communications/domain/Announcement';
import { testOutputContext } from '../../helpers/test-output-context.js';

describe('get_announcements tool', () => {
  it('formats announcements in reverse chronological order', async () => {
    const repo = new FakeCommunicationsRepository(new Map([[101, [
      new Announcement({ id: 1, courseOrgUnitId: 101, title: 'First', html: '<p>body</p>', authorName: 'Prof', postedAt: new Date('2026-04-19') }),
      new Announcement({ id: 2, courseOrgUnitId: 101, title: 'Second', html: null, authorName: null, postedAt: new Date('2026-04-22') }),
    ]]]));
    const r = await handleGetAnnouncements({ communicationsRepo: repo, output: testOutputContext() }, { course_id: 101 });
    const text = r.content[0]?.text ?? '';
    expect(text.indexOf('Second')).toBeLessThan(text.indexOf('First'));
  });

  it('respects limit', async () => {
    const repo = new FakeCommunicationsRepository(new Map([[101, [
      new Announcement({ id: 1, courseOrgUnitId: 101, title: 'A', html: null, authorName: null, postedAt: new Date('2026-04-22') }),
      new Announcement({ id: 2, courseOrgUnitId: 101, title: 'B', html: null, authorName: null, postedAt: new Date('2026-04-21') }),
    ]]]));
    const r = await handleGetAnnouncements({ communicationsRepo: repo, output: testOutputContext() }, { course_id: 101, limit: 1 });
    const text = r.content[0]?.text ?? '';
    expect(text).toContain('A');
    expect(text).not.toContain('B');
  });
});
