import type { CourseRepository } from '../domain/CourseRepository.js';
import type { Course } from '../domain/Course.js';

export interface ListMyCoursesInput {
  repo: CourseRepository;
  activeOnly?: boolean;
}

export async function listMyCourses(input: ListMyCoursesInput): Promise<Course[]> {
  return input.repo.findMyCourses({ activeOnly: input.activeOnly ?? true });
}
