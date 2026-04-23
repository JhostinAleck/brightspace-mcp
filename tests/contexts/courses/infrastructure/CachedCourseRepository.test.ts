import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { CachedCourseRepository } from '@/contexts/courses/infrastructure/CachedCourseRepository.js';
import { FakeCourseRepository } from '@tests/helpers/fakes/FakeCourseRepository.js';
import { InMemoryCache } from '@/shared-kernel/cache/InMemoryCache.js';
import { Course } from '@/contexts/courses/Course.js';
import { CourseId } from '@/contexts/courses/CourseId.js';

const c = (id: number, name: string, active = true) =>
  new Course({ id: CourseId.of(id), name, code: `C${id}`, active });

describe('CachedCourseRepository', () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  it('delegates to inner repo on first call and caches result', async () => {
    const inner = new FakeCourseRepository([c(1, 'A'), c(2, 'B', false)]);
    const innerSpy = vi.spyOn(inner, 'findMyCourses');
    const repo = new CachedCourseRepository(inner, new InMemoryCache(), { listTtlMs: 60_000, byIdTtlMs: 60_000 });
    const r1 = await repo.findMyCourses({ activeOnly: true });
    const r2 = await repo.findMyCourses({ activeOnly: true });
    expect(r1).toHaveLength(1);
    expect(r2).toHaveLength(1);
    expect(innerSpy).toHaveBeenCalledTimes(1);
  });

  it('caches separately by activeOnly value', async () => {
    const inner = new FakeCourseRepository([c(1, 'A'), c(2, 'B', false)]);
    const innerSpy = vi.spyOn(inner, 'findMyCourses');
    const repo = new CachedCourseRepository(inner, new InMemoryCache(), { listTtlMs: 60_000, byIdTtlMs: 60_000 });
    await repo.findMyCourses({ activeOnly: true });
    await repo.findMyCourses({ activeOnly: false });
    expect(innerSpy).toHaveBeenCalledTimes(2);
  });

  it('expires after TTL', async () => {
    const inner = new FakeCourseRepository([c(1, 'A')]);
    const innerSpy = vi.spyOn(inner, 'findMyCourses');
    const repo = new CachedCourseRepository(inner, new InMemoryCache(), { listTtlMs: 1_000, byIdTtlMs: 1_000 });
    await repo.findMyCourses();
    vi.advanceTimersByTime(1_500);
    await repo.findMyCourses();
    expect(innerSpy).toHaveBeenCalledTimes(2);
  });

  it('findById is cached separately', async () => {
    const inner = new FakeCourseRepository([c(1, 'A')]);
    const innerSpy = vi.spyOn(inner, 'findById');
    const repo = new CachedCourseRepository(inner, new InMemoryCache(), { listTtlMs: 60_000, byIdTtlMs: 60_000 });
    await repo.findById(CourseId.of(1));
    await repo.findById(CourseId.of(1));
    expect(innerSpy).toHaveBeenCalledTimes(1);
  });
});
