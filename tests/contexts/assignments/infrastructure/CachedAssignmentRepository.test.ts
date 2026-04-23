import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { CachedAssignmentRepository } from '@/contexts/assignments/infrastructure/CachedAssignmentRepository';
import { FakeAssignmentRepository } from '@tests/helpers/fakes/FakeAssignmentRepository';
import { InMemoryCache } from '@/shared-kernel/cache/InMemoryCache';
import { Assignment } from '@/contexts/assignments/domain/Assignment';
import { AssignmentId } from '@/contexts/assignments/domain/AssignmentId';
import { DueDate } from '@/contexts/assignments/domain/DueDate';
import { Feedback } from '@/contexts/assignments/domain/Feedback';
import { OrgUnitId } from '@/shared-kernel/types/OrgUnitId';

const a = (id: number, courseOrgUnit: number, name: string) =>
  new Assignment({
    id: AssignmentId.of(id),
    courseOrgUnitId: courseOrgUnit,
    name,
    instructions: null,
    dueDate: DueDate.unspecified(),
    submissions: [],
  });

describe('CachedAssignmentRepository', () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  it('caches findByCourse results', async () => {
    const inner = new FakeAssignmentRepository(new Map([[101, [a(1, 101, 'Essay')]]]));
    const spy = vi.spyOn(inner, 'findByCourse');
    const repo = new CachedAssignmentRepository(inner, new InMemoryCache(), {
      listTtlMs: 60_000,
      feedbackTtlMs: 60_000,
    });
    await repo.findByCourse(OrgUnitId.of(101));
    await repo.findByCourse(OrgUnitId.of(101));
    expect(spy).toHaveBeenCalledTimes(1);
  });

  it('caches findFeedback separately per (course, assignment)', async () => {
    const feedback = new Feedback({ score: 90, outOf: 100, text: 'good', releasedAt: new Date() });
    const inner = new FakeAssignmentRepository(
      new Map(),
      new Map([[`${101}:${5001}`, feedback]]),
    );
    const spy = vi.spyOn(inner, 'findFeedback');
    const repo = new CachedAssignmentRepository(inner, new InMemoryCache(), {
      listTtlMs: 60_000,
      feedbackTtlMs: 60_000,
    });
    await repo.findFeedback(OrgUnitId.of(101), AssignmentId.of(5001));
    await repo.findFeedback(OrgUnitId.of(101), AssignmentId.of(5001));
    expect(spy).toHaveBeenCalledTimes(1);
  });

  it('caches null feedback (distinguishes from cache miss)', async () => {
    const inner = new FakeAssignmentRepository(new Map());
    const spy = vi.spyOn(inner, 'findFeedback');
    const repo = new CachedAssignmentRepository(inner, new InMemoryCache(), {
      listTtlMs: 60_000,
      feedbackTtlMs: 60_000,
    });
    await repo.findFeedback(OrgUnitId.of(101), AssignmentId.of(5001));
    await repo.findFeedback(OrgUnitId.of(101), AssignmentId.of(5001));
    expect(spy).toHaveBeenCalledTimes(1);
  });
});
