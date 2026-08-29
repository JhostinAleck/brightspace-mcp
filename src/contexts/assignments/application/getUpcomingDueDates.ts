import type { AssignmentRepository } from '@/contexts/assignments/domain/AssignmentRepository.js';
import type { Assignment } from '@/contexts/assignments/domain/Assignment.js';
import type { OrgUnitId } from '@/shared-kernel/types/OrgUnitId.js';

export interface GetUpcomingDueDatesInput {
  repo: AssignmentRepository;
  courseIds: OrgUnitId[];
  from: Date;
  to: Date;
}

/**
 * A course whose dropbox is closed to us (archived term, tenant-restricted
 * tooling) answers 403/404 on the folder list. In a cross-course scan that is
 * expected noise, not a failure — skip the course and keep the rest. Direct
 * single-course reads still surface the error, which is where it is actionable.
 */
function isCourseInaccessible(err: unknown): boolean {
  const status = (err as { status?: unknown } | null | undefined)?.status;
  return status === 403 || status === 404;
}

export async function getUpcomingDueDates(
  input: GetUpcomingDueDatesInput,
): Promise<Assignment[]> {
  if (input.courseIds.length === 0) return [];
  // Parallel fan-out — each course's assignments are independent. The HTTP
  // client's bulkhead caps backend pressure so this is safe even for users
  // enrolled in many courses.
  const settled = await Promise.allSettled(
    input.courseIds.map((id) => input.repo.findByCourse(id)),
  );
  const perCourse: Assignment[][] = [];
  let firstError: unknown = null;
  for (const r of settled) {
    if (r.status === 'fulfilled') perCourse.push(r.value);
    else if (!isCourseInaccessible(r.reason)) firstError ??= r.reason;
  }
  // Only fail the whole scan on a real infrastructure error (circuit breaker,
  // network, auth) and only when no course produced results.
  if (perCourse.length === 0 && firstError) throw firstError;
  const flat = perCourse.flat();
  const inWindow = flat.filter((a) => a.dueDate.isWithin(input.from, input.to));
  return inWindow.sort((x, y) => {
    const xd = x.dueDate.toDate();
    const yd = y.dueDate.toDate();
    if (!xd || !yd) return 0;
    return xd.getTime() - yd.getTime();
  });
}
