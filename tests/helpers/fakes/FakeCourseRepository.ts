import type { CourseRepository } from '@/contexts/courses/CourseRepository.js';
import type { Course } from '@/contexts/courses/Course.js';
import { CourseId } from '@/contexts/courses/CourseId.js';

export class FakeCourseRepository implements CourseRepository {
  constructor(private readonly courses: Course[]) {}
  async findMyCourses(opts?: { activeOnly?: boolean }): Promise<Course[]> {
    return opts?.activeOnly ? this.courses.filter((c) => c.active) : this.courses;
  }
  async findById(id: CourseId): Promise<Course | null> {
    return this.courses.find((c) => CourseId.toNumber(c.id) === CourseId.toNumber(id)) ?? null;
  }
}
