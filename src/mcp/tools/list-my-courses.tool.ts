import type { CourseRepository } from '@/contexts/courses/CourseRepository.js';
import { listMyCourses } from '@/contexts/courses/listMyCourses.js';
import { listMyCoursesSchema } from '@/mcp/schemas.js';
import { coursesToCompact, coursesToDetailed } from '@/mcp/tool-helpers.js';

export interface ListMyCoursesDeps {
  courseRepo: CourseRepository;
}

export async function handleListMyCourses(deps: ListMyCoursesDeps, rawInput: unknown) {
  const input = listMyCoursesSchema.parse(rawInput);
  const courses = (await listMyCourses({ repo: deps.courseRepo, activeOnly: input.active_only })).slice(
    0,
    input.limit,
  );
  const text = input.format === 'detailed' ? coursesToDetailed(courses) : coursesToCompact(courses);
  return { content: [{ type: 'text' as const, text }] };
}
