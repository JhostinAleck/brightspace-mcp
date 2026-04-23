import type { CourseRepository } from '@/contexts/courses/CourseRepository.js';
import { Course } from '@/contexts/courses/Course.js';
import { CourseId } from '@/contexts/courses/CourseId.js';
import type { Cache } from '@/shared-kernel/cache/Cache.js';

export interface CachedCourseRepositoryTtls {
  listTtlMs: number;
  byIdTtlMs: number;
}

const PREFIX = 'courses:';

interface CoursePlain {
  id: number;
  name: string;
  code: string;
  active: boolean;
  startDateIso?: string;
  endDateIso?: string;
}

function toPlain(course: Course): CoursePlain {
  const plain: CoursePlain = {
    id: CourseId.toNumber(course.id),
    name: course.name,
    code: course.code,
    active: course.active,
  };
  if (course.startDate) plain.startDateIso = course.startDate.toISOString();
  if (course.endDate) plain.endDateIso = course.endDate.toISOString();
  return plain;
}

function fromPlain(plain: CoursePlain): Course {
  const props: {
    id: ReturnType<typeof CourseId.of>;
    name: string;
    code: string;
    active: boolean;
    startDate?: Date;
    endDate?: Date;
  } = {
    id: CourseId.of(plain.id),
    name: plain.name,
    code: plain.code,
    active: plain.active,
  };
  if (plain.startDateIso) props.startDate = new Date(plain.startDateIso);
  if (plain.endDateIso) props.endDate = new Date(plain.endDateIso);
  return new Course(props);
}

export class CachedCourseRepository implements CourseRepository {
  constructor(
    private readonly inner: CourseRepository,
    private readonly cache: Cache,
    private readonly ttls: CachedCourseRepositoryTtls,
  ) {}

  async findMyCourses(opts?: { activeOnly?: boolean }): Promise<Course[]> {
    const activeOnly = opts?.activeOnly ?? true;
    const key = `${PREFIX}list:${activeOnly ? 'active' : 'all'}`;
    const cached = await this.cache.get<CoursePlain[]>(key);
    if (cached) return cached.map(fromPlain);
    const fresh = await this.inner.findMyCourses({ activeOnly });
    await this.cache.set(key, fresh.map(toPlain), this.ttls.listTtlMs);
    return fresh;
  }

  async findById(id: CourseId): Promise<Course | null> {
    const key = `${PREFIX}byId:${CourseId.toNumber(id)}`;
    const cached = await this.cache.get<CoursePlain | null>(key);
    if (cached !== undefined && cached !== null) return fromPlain(cached);
    const fresh = await this.inner.findById(id);
    await this.cache.set(key, fresh ? toPlain(fresh) : null, this.ttls.byIdTtlMs);
    return fresh;
  }
}
