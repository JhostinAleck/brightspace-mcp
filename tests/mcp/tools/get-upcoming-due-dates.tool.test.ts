import { describe, it, expect } from 'vitest';
import { handleGetUpcomingDueDates } from '@/mcp/tools/get-upcoming-due-dates.tool';
import { FakeCourseRepository } from '@tests/helpers/fakes/FakeCourseRepository';
import { FakeAssignmentRepository } from '@tests/helpers/fakes/FakeAssignmentRepository';
import { Course } from '@/contexts/courses/Course';
import { CourseId } from '@/contexts/courses/CourseId';
import { Assignment } from '@/contexts/assignments/domain/Assignment';
import { AssignmentId } from '@/contexts/assignments/domain/AssignmentId';
import { DueDate } from '@/contexts/assignments/domain/DueDate';

const course = (id: number, name: string) =>
  new Course({ id: CourseId.of(id), name, code: `C${id}`, active: true });

const asn = (id: number, courseOrgUnit: number, name: string, due: Date) =>
  new Assignment({
    id: AssignmentId.of(id),
    courseOrgUnitId: courseOrgUnit,
    name,
    instructions: null,
    dueDate: DueDate.at(due),
    submissions: [],
  });

describe('get_upcoming_due_dates tool', () => {
  it('aggregates assignments across all active courses inside the window', async () => {
    const courseRepo = new FakeCourseRepository([course(101, 'ECE 264'), course(202, 'MA 261')]);
    const assignmentRepo = new FakeAssignmentRepository(new Map([
      [101, [asn(1, 101, 'ECE Essay', new Date(Date.now() + 24 * 60 * 60 * 1000))]],
      [202, [asn(2, 202, 'MA Test', new Date(Date.now() + 48 * 60 * 60 * 1000))]],
    ]));
    const r = await handleGetUpcomingDueDates(
      { courseRepo, assignmentRepo },
      { days: 7 },
    );
    expect(r.content[0]?.text).toContain('ECE Essay');
    expect(r.content[0]?.text).toContain('MA Test');
  });

  it('excludes due dates beyond the window', async () => {
    const courseRepo = new FakeCourseRepository([course(101, 'ECE 264')]);
    const assignmentRepo = new FakeAssignmentRepository(new Map([
      [101, [asn(1, 101, 'FarFuture', new Date(Date.now() + 60 * 24 * 60 * 60 * 1000))]],
    ]));
    const r = await handleGetUpcomingDueDates(
      { courseRepo, assignmentRepo },
      { days: 7 },
    );
    expect(r.content[0]?.text).toMatch(/nothing|no upcoming/i);
  });

  it('returns friendly message when no active courses', async () => {
    const courseRepo = new FakeCourseRepository([]);
    const assignmentRepo = new FakeAssignmentRepository(new Map());
    const r = await handleGetUpcomingDueDates(
      { courseRepo, assignmentRepo },
      { days: 7 },
    );
    expect(r.content[0]?.text).toMatch(/no upcoming|nothing/i);
  });
});
