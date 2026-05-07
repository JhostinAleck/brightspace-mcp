import type { CourseRepository } from '@/contexts/courses/domain/CourseRepository.js';
import type { Course } from '@/contexts/courses/domain/Course.js';
import { CourseId } from '@/contexts/courses/domain/CourseId.js';
import type { Classmate } from '@/contexts/courses/domain/Classmate.js';

export class FakeCourseRepository implements CourseRepository {
  constructor(
    private readonly courses: Course[],
    private readonly rosterByCourse: Map<number, Classmate[]> = new Map(),
  ) {}

  async findMyCourses(opts?: { activeOnly?: boolean }): Promise<Course[]> {
    return opts?.activeOnly ? this.courses.filter((c) => c.active) : this.courses;
  }

  async findById(id: CourseId): Promise<Course | null> {
    return this.courses.find((c) => CourseId.toNumber(c.id) === CourseId.toNumber(id)) ?? null;
  }

  async findRoster(id: CourseId): Promise<Classmate[]> {
    return this.rosterByCourse.get(CourseId.toNumber(id)) ?? [];
  }

  async findClasslistEmails(id: CourseId): Promise<string[]> {
    const roster = await this.findRoster(id);
    return roster.map((c) => c.email).filter((e): e is string => e !== null);
  }
}
