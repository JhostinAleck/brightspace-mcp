import { describe, it, expect } from 'vitest';
import { handleListMyCourses } from '@/mcp/tools/list-my-courses.tool.js';
import { FakeCourseRepository } from '@tests/helpers/fakes/FakeCourseRepository.js';
import { Course } from '@/contexts/courses/domain/Course.js';
import { CourseId } from '@/contexts/courses/domain/CourseId.js';
import { testOutputContext } from '../../helpers/test-output-context.js';

describe('list_my_courses tool', () => {
  it('returns compact text with active courses by default', async () => {
    const repo = new FakeCourseRepository([
      new Course({ id: CourseId.of(1), name: 'ECE 264', code: 'ECE26400', active: true }),
    ]);
    const result = await handleListMyCourses({ courseRepo: repo, output: testOutputContext() }, {});
    expect(result.content[0]?.text).toContain('ECE 264');
    expect(result.content[0]?.text).toContain('1 course');
  });

  it('returns detailed when format=detailed', async () => {
    const repo = new FakeCourseRepository([
      new Course({
        id: CourseId.of(1),
        name: 'ECE 264',
        code: 'ECE26400',
        active: true,
        startDate: new Date('2026-01-01'),
        endDate: new Date('2026-05-01'),
      }),
    ]);
    const r = await handleListMyCourses({ courseRepo: repo, output: testOutputContext() }, { format: 'detailed' });
    expect(r.content[0]?.text).toContain('ECE 264');
  });
});
