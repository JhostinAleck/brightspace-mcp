import { describe, it, expect } from 'vitest';
import { handleGetDiscussions } from '@/mcp/tools/get-discussions.tool';
import { FakeCommunicationsRepository } from '@tests/helpers/fakes/FakeCommunicationsRepository';
import { DiscussionForum } from '@/contexts/communications/domain/DiscussionForum';
import { DiscussionTopic } from '@/contexts/communications/domain/DiscussionTopic';
import { testOutputContext } from '../../helpers/test-output-context.js';

describe('get_discussions tool', () => {
  it('renders forums with topics and post counts', async () => {
    const topic = new DiscussionTopic({ id: 1, name: 'Q&A', description: null, postCount: 42, lastPostAt: null });
    const forum = new DiscussionForum({ id: 100, name: 'Main', topics: [topic] });
    const repo = new FakeCommunicationsRepository(new Map(), new Map([[101, [forum]]]));
    const r = await handleGetDiscussions({ communicationsRepo: repo, output: testOutputContext() }, { course_id: 101 });
    expect(r.content[0]?.text).toContain('Main');
    expect(r.content[0]?.text).toContain('Q&A');
    expect(r.content[0]?.text).toContain('42 posts');
  });
});
