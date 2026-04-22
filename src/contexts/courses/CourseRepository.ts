import type { Course } from './Course.js';
import type { CourseId } from './CourseId.js';

export interface CourseRepository {
  findMyCourses(opts?: { activeOnly?: boolean }): Promise<Course[]>;
  findById(id: CourseId): Promise<Course | null>;
}
