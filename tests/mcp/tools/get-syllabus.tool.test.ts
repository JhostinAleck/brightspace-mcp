import { describe, it, expect } from 'vitest';
import { handleGetSyllabus } from '@/mcp/tools/get-syllabus.tool';
import { FakeContentRepository } from '@tests/helpers/fakes/FakeContentRepository';
import { Syllabus } from '@/contexts/content/domain/Syllabus';
import { testOutputContext } from '../../helpers/test-output-context.js';

describe('get_syllabus tool', () => {
  it('strips HTML and formats syllabus text', async () => {
    const syl = new Syllabus({ courseOrgUnitId: 101, title: 'ECE 264 Syllabus', html: '<p>Welcome <b>class</b></p>', updatedAt: null, sourceUrl: null });
    const repo = new FakeContentRepository(new Map([[101, syl]]));
    const r = await handleGetSyllabus({ contentRepo: repo, output: testOutputContext() }, { course_id: 101 });
    expect(r.content[0]?.text).toContain('Welcome class');
    expect(r.content[0]?.text).not.toContain('<');
  });

  it('returns "no syllabus" message when absent', async () => {
    const repo = new FakeContentRepository();
    const r = await handleGetSyllabus({ contentRepo: repo, output: testOutputContext() }, { course_id: 101 });
    expect(r.content[0]?.text).toMatch(/no syllabus/i);
  });
});
