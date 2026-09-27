import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { CachedAssignmentRepository } from '@/contexts/assignments/infrastructure/CachedAssignmentRepository';
import { FakeAssignmentRepository } from '@tests/helpers/fakes/FakeAssignmentRepository';
import { InMemoryCache } from '@/shared-kernel/cache/InMemoryCache';
import { Assignment } from '@/contexts/assignments/domain/Assignment';
import { AssignmentId } from '@/contexts/assignments/domain/AssignmentId';
import { DueDate } from '@/contexts/assignments/domain/DueDate';
import { Feedback } from '@/contexts/assignments/domain/Feedback';
import { OrgUnitId } from '@/shared-kernel/types/OrgUnitId';
import { Rubric } from '@/contexts/assignments/domain/Rubric';

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

  it('preserves assignment metadata and rubrics across a cache round-trip', async () => {
    const rubric = new Rubric({
      id: 8001,
      name: 'R',
      description: null,
      overallLevels: [{ id: 1, name: 'Top', rangeStart: 85 }],
      groups: [{
        name: 'G',
        levels: [{ id: 2, name: 'L', points: null }],
        criteria: [{ id: 3, name: 'C', cells: [{ levelId: 2, description: 'd', points: 4 }] }],
      }],
    });
    const rich = new Assignment({
      id: AssignmentId.of(7),
      courseOrgUnitId: 101,
      name: 'Lab',
      instructions: null,
      dueDate: DueDate.unspecified(),
      submissions: [],
      submissionMode: 'append',
      submissionsKnown: false,
      kind: 'group',
      points: 5,
      startDate: new Date('2026-09-01T00:00:00Z'),
      endDate: new Date('2026-09-28T00:00:00Z'),
      linkAttachments: [{ name: 'Guide', url: 'https://example.edu' }],
      allowedFileTypes: { mode: 'custom', extensions: ['pdf'] },
      rubrics: [rubric],
    });
    const inner = new FakeAssignmentRepository(new Map([[101, [rich]]]));
    const repo = new CachedAssignmentRepository(inner, new InMemoryCache(), {
      listTtlMs: 60_000,
      feedbackTtlMs: 60_000,
    });
    await repo.findByCourse(OrgUnitId.of(101));
    const [cached] = await repo.findByCourse(OrgUnitId.of(101));
    expect(cached?.submissionMode).toBe('append');
    expect(cached?.submissionStatus).toBe('unknown');
    expect(cached?.kind).toBe('group');
    expect(cached?.points).toBe(5);
    expect(cached?.startDate?.toISOString()).toBe('2026-09-01T00:00:00.000Z');
    expect(cached?.endDate?.toISOString()).toBe('2026-09-28T00:00:00.000Z');
    expect(cached?.linkAttachments).toEqual([{ name: 'Guide', url: 'https://example.edu' }]);
    expect(cached?.allowedFileTypes).toEqual({ mode: 'custom', extensions: ['pdf'] });
    expect(cached?.rubrics[0]?.maxPoints).toBe(4);
  });

  it('caches findRubrics per (course, assignment)', async () => {
    const rubric = new Rubric({ id: 1, name: 'R', description: null, groups: [], overallLevels: [] });
    const inner = new FakeAssignmentRepository(new Map(), new Map(), new Map([['101:5001', [rubric]]]));
    const spy = vi.spyOn(inner, 'findRubrics');
    const repo = new CachedAssignmentRepository(inner, new InMemoryCache(), {
      listTtlMs: 60_000,
      feedbackTtlMs: 60_000,
    });
    await repo.findRubrics(OrgUnitId.of(101), AssignmentId.of(5001));
    const out = await repo.findRubrics(OrgUnitId.of(101), AssignmentId.of(5001));
    expect(spy).toHaveBeenCalledTimes(1);
    expect(out[0]?.name).toBe('R');
  });

  it('preserves rubric outcomes and displayed grade across a feedback cache round-trip', async () => {
    const feedback = new Feedback({
      score: 4.5,
      outOf: 5,
      text: null,
      releasedAt: null,
      displayedGrade: '4.50',
      rubricAssessments: [{
        rubricId: 1,
        rubricName: 'R',
        score: 9,
        maxPoints: 10,
        levelName: 'Top',
        feedback: null,
        criteria: [{ groupName: 'G', criterionName: 'C', levelName: 'L', score: 5, maxPoints: 5, feedback: 'ok' }],
      }],
    });
    const inner = new FakeAssignmentRepository(new Map(), new Map([['101:5001', feedback]]));
    const repo = new CachedAssignmentRepository(inner, new InMemoryCache(), {
      listTtlMs: 60_000,
      feedbackTtlMs: 60_000,
    });
    await repo.findFeedback(OrgUnitId.of(101), AssignmentId.of(5001));
    const cached = await repo.findFeedback(OrgUnitId.of(101), AssignmentId.of(5001));
    expect(cached?.displayedGrade).toBe('4.50');
    expect(cached?.rubricAssessments[0]?.criteria[0]?.feedback).toBe('ok');
  });
});
