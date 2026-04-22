import { describe, it, expect } from 'vitest';
import { listMyCourses } from '@/contexts/courses/listMyCourses.js';
import { FakeCourseRepository } from '@tests/helpers/fakes/FakeCourseRepository.js';
import { Course } from '@/contexts/courses/Course.js';
import { CourseId } from '@/contexts/courses/CourseId.js';

const c = (id: number, name: string, active = true) =>
  new Course({ id: CourseId.of(id), name, code: `C${id}`, active });

describe('listMyCourses', () => {
  it('returns all courses when activeOnly is false', async () => {
    const repo = new FakeCourseRepository([c(1, 'A', true), c(2, 'B', false)]);
    const result = await listMyCourses({ repo, activeOnly: false });
    expect(result).toHaveLength(2);
  });
  it('filters inactive when activeOnly is true', async () => {
    const repo = new FakeCourseRepository([c(1, 'A', true), c(2, 'B', false)]);
    const result = await listMyCourses({ repo, activeOnly: true });
    expect(result).toHaveLength(1);
    expect(result[0]?.name).toBe('A');
  });
});
