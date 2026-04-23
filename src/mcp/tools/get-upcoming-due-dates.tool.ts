import type { CourseRepository } from '@/contexts/courses/CourseRepository.js';
import type { AssignmentRepository } from '@/contexts/assignments/domain/AssignmentRepository.js';
import { getUpcomingDueDates } from '@/contexts/assignments/application/getUpcomingDueDates.js';
import { getUpcomingDueDatesSchema } from '@/mcp/schemas.js';
import { OrgUnitId } from '@/shared-kernel/types/OrgUnitId.js';
import { CourseId } from '@/contexts/courses/CourseId.js';
import { AssignmentId } from '@/contexts/assignments/domain/AssignmentId.js';

export interface GetUpcomingDueDatesDeps {
  courseRepo: CourseRepository;
  assignmentRepo: AssignmentRepository;
}

export async function handleGetUpcomingDueDates(
  deps: GetUpcomingDueDatesDeps,
  rawInput: unknown,
) {
  const input = getUpcomingDueDatesSchema.parse(rawInput);
  const courses = await deps.courseRepo.findMyCourses({ activeOnly: true });
  if (courses.length === 0) {
    return { content: [{ type: 'text' as const, text: 'No upcoming due dates — you are not enrolled in any active courses.' }] };
  }
  const courseIds = courses.map((c) => OrgUnitId.of(CourseId.toNumber(c.id)));
  const from = new Date();
  const to = new Date(from.getTime() + input.days * 24 * 60 * 60 * 1000);
  const upcoming = await getUpcomingDueDates({
    repo: deps.assignmentRepo,
    courseIds,
    from,
    to,
  });
  if (upcoming.length === 0) {
    return { content: [{ type: 'text' as const, text: `Nothing due in the next ${input.days} days.` }] };
  }
  const courseNameByOrgUnit = new Map<number, string>();
  for (const c of courses) courseNameByOrgUnit.set(CourseId.toNumber(c.id), c.name);

  const lines = upcoming.map((a) => {
    const due = a.dueDate.toDate();
    const dueStr = due ? due.toISOString().slice(0, 16).replace('T', ' ') : 'no due date';
    const course = courseNameByOrgUnit.get(a.courseOrgUnitId) ?? `course ${a.courseOrgUnitId}`;
    return ` • ${dueStr} — ${course}: ${a.name} (id=${AssignmentId.toNumber(a.id)})`;
  });
  const text =
    input.format === 'detailed'
      ? `Upcoming due dates (next ${input.days} days):\n${lines.join('\n')}`
      : `Due in next ${input.days} days:\n${lines.join('\n')}`;
  return { content: [{ type: 'text' as const, text }] };
}
