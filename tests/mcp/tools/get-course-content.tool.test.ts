import { describe, it, expect } from 'vitest';
import { handleGetCourseContent } from '@/mcp/tools/get-course-content.tool';
import { FakeContentRepository } from '@tests/helpers/fakes/FakeContentRepository';
import { Module } from '@/contexts/content/domain/Module';
import { Topic } from '@/contexts/content/domain/Topic';
import { testOutputContext } from '../../helpers/test-output-context.js';

describe('get_course_content tool', () => {
  it('renders module tree with topics', async () => {
    const topic = new Topic({ id: 1, title: 'Lecture 1', kind: 'file', url: null, fileExtension: 'pdf' });
    const mod = new Module({ id: 100, title: 'Week 1', topics: [topic], submodules: [] });
    const repo = new FakeContentRepository(new Map(), new Map([[101, [mod]]]));
    const r = await handleGetCourseContent({ contentRepo: repo, output: testOutputContext() }, { course_id: 101 });
    expect(r.content[0]?.text).toContain('Week 1');
    expect(r.content[0]?.text).toContain('Lecture 1');
  });

  it('returns "no content" message when empty', async () => {
    const repo = new FakeContentRepository();
    const r = await handleGetCourseContent({ contentRepo: repo, output: testOutputContext() }, { course_id: 101 });
    expect(r.content[0]?.text).toMatch(/no course content/i);
  });
});
