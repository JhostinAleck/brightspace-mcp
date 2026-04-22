import type { CourseRepository } from './CourseRepository.js';
import type { Course } from './Course.js';

export interface ListMyCoursesInput {
  repo: CourseRepository;
  activeOnly?: boolean;
}

export async function listMyCourses(input: ListMyCoursesInput): Promise<Course[]> {
  return input.repo.findMyCourses({ activeOnly: input.activeOnly ?? true });
}
