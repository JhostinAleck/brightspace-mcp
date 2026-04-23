import type { CourseRepository } from '@/contexts/courses/CourseRepository.js';
import { Course } from '@/contexts/courses/Course.js';
import { CourseId } from '@/contexts/courses/CourseId.js';
import { Classmate } from '@/contexts/courses/Classmate.js';
import { UserId } from '@/shared-kernel/types/UserId.js';
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

interface ClassmatePlain {
  userIdNumber: number;
  displayName: string;
  uniqueName: string;
  email: string | null;
  role: 'student' | 'instructor' | 'ta' | 'other';
}

function classmateToPlain(c: Classmate): ClassmatePlain {
  return {
    userIdNumber: UserId.toNumber(c.userId),
    displayName: c.displayName,
    uniqueName: c.uniqueName,
    email: c.email,
    role: c.role,
  };
}

function plainToClassmate(p: ClassmatePlain): Classmate {
  return new Classmate({
    userId: UserId.of(p.userIdNumber),
    displayName: p.displayName,
    uniqueName: p.uniqueName,
    email: p.email,
    role: p.role,
  });
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

  async findRoster(id: CourseId): Promise<Classmate[]> {
    const key = `courses:roster:${CourseId.toNumber(id)}`;
    const cached = await this.cache.get<ClassmatePlain[]>(key);
    if (cached) return cached.map(plainToClassmate);
    const fresh = await this.inner.findRoster(id);
    await this.cache.set(key, fresh.map(classmateToPlain), this.ttls.listTtlMs);
    return fresh;
  }

  async findClasslistEmails(id: CourseId): Promise<string[]> {
    const key = `courses:emails:${CourseId.toNumber(id)}`;
    const cached = await this.cache.get<string[]>(key);
    if (cached) return cached;
    const fresh = await this.inner.findClasslistEmails(id);
    await this.cache.set(key, fresh, this.ttls.listTtlMs);
    return fresh;
  }
}
