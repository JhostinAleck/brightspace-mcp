import type { Course } from './Course.js';
import type { CourseId } from './CourseId.js';
import type { Classmate } from './Classmate.js';

export interface CourseRepository {
  findMyCourses(opts?: { activeOnly?: boolean }): Promise<Course[]>;
  findById(id: CourseId): Promise<Course | null>;
  findRoster(id: CourseId): Promise<Classmate[]>;
  findClasslistEmails(id: CourseId): Promise<string[]>;
}
