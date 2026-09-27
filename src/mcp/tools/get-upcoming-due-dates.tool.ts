import type { CourseRepository } from '@/contexts/courses/domain/CourseRepository.js';
import type { AssignmentRepository } from '@/contexts/assignments/domain/AssignmentRepository.js';
import { getUpcomingDueDates } from '@/contexts/assignments/application/getUpcomingDueDates.js';
import type { QuizRepository } from '@/contexts/quizzes/domain/QuizRepository.js';
import { getUpcomingQuizzes } from '@/contexts/quizzes/application/getUpcomingQuizzes.js';
import { getUpcomingDueDatesSchema } from '@/mcp/schemas.js';
import { OrgUnitId } from '@/shared-kernel/types/OrgUnitId.js';
import { CourseId } from '@/contexts/courses/domain/CourseId.js';
import { AssignmentId } from '@/contexts/assignments/domain/AssignmentId.js';
import type { OutputContext } from '@/shared-kernel/output/index.js';

export interface GetUpcomingDueDatesDeps {
  courseRepo: CourseRepository;
  assignmentRepo: AssignmentRepository;
  /** Quizzes with a due/end date in the window are listed alongside assignments. */
  quizRepo: QuizRepository;
  output: OutputContext;
}

interface DueItem {
  at: Date | null;
  line: (dueStr: string, course: string) => string;
  courseOrgUnitId: number;
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
  const [upcoming, quizzes] = await Promise.all([
    getUpcomingDueDates({ repo: deps.assignmentRepo, courseIds, from, to }),
    getUpcomingQuizzes({ repo: deps.quizRepo, courseIds, from, to }),
  ]);

  const items: DueItem[] = [
    ...upcoming.map((a): DueItem => ({
      at: a.dueDate.toDate(),
      courseOrgUnitId: a.courseOrgUnitId,
      line: (dueStr, course) => ` • ${dueStr} — ${course}: ${a.name} (id=${AssignmentId.toNumber(a.id)})`,
    })),
    ...quizzes.map(({ quiz, deadline }): DueItem => ({
      at: deadline,
      courseOrgUnitId: quiz.courseOrgUnitId,
      line: (dueStr, course) => ` • ${dueStr} — ${course}: [quiz] ${quiz.name} (quiz_id=${quiz.id})`,
    })),
  ].sort((a, b) => (a.at?.getTime() ?? Infinity) - (b.at?.getTime() ?? Infinity));

  if (items.length === 0) {
    return { content: [{ type: 'text' as const, text: `Nothing due in the next ${input.days} days.` }] };
  }
  const courseNameByOrgUnit = new Map<number, string>();
  for (const c of courses) courseNameByOrgUnit.set(CourseId.toNumber(c.id), c.name);

  const lines = items.map((item) => {
    const dueStr = item.at ? deps.output.formatDate(item.at, 'datetime') : 'no due date';
    const course = courseNameByOrgUnit.get(item.courseOrgUnitId) ?? `course ${item.courseOrgUnitId}`;
    return item.line(dueStr, course);
  });
  const text =
    input.format === 'detailed'
      ? `Upcoming due dates (next ${input.days} days):\n${lines.join('\n')}`
      : `Due in next ${input.days} days:\n${lines.join('\n')}`;
  const footer = deps.output.metaFooter();
  const body = footer ? `${text}\n\n${footer}` : text;
  return { content: [{ type: 'text' as const, text: body }] };
}
