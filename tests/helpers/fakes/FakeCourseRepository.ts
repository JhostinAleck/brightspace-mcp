import type { CourseRepository } from '@/contexts/courses/CourseRepository.js';
import type { Course } from '@/contexts/courses/Course.js';
import { CourseId } from '@/contexts/courses/CourseId.js';
import type { Classmate } from '@/contexts/courses/Classmate.js';

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
