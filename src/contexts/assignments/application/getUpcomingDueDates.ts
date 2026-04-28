import type { AssignmentRepository } from '@/contexts/assignments/domain/AssignmentRepository.js';
import type { Assignment } from '@/contexts/assignments/domain/Assignment.js';
import type { OrgUnitId } from '@/shared-kernel/types/OrgUnitId.js';

export interface GetUpcomingDueDatesInput {
  repo: AssignmentRepository;
  courseIds: OrgUnitId[];
  from: Date;
  to: Date;
}

export async function getUpcomingDueDates(
  input: GetUpcomingDueDatesInput,
): Promise<Assignment[]> {
  if (input.courseIds.length === 0) return [];
  const perCourse: Assignment[][] = [];
  for (const id of input.courseIds) {
    perCourse.push(await input.repo.findByCourse(id));
  }
  const flat = perCourse.flat();
  const inWindow = flat.filter((a) => a.dueDate.isWithin(input.from, input.to));
  return inWindow.sort((x, y) => {
    const xd = x.dueDate.toDate();
    const yd = y.dueDate.toDate();
    if (!xd || !yd) return 0;
    return xd.getTime() - yd.getTime();
  });
}
