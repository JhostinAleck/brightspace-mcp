import { describe, it, expect } from 'vitest';
import { handleGetAssignments } from '@/mcp/tools/get-assignments.tool';
import { FakeAssignmentRepository } from '@tests/helpers/fakes/FakeAssignmentRepository';
import { Assignment } from '@/contexts/assignments/domain/Assignment';
import { AssignmentId } from '@/contexts/assignments/domain/AssignmentId';
import { DueDate } from '@/contexts/assignments/domain/DueDate';

const a = (id: number, name: string, due: Date) =>
  new Assignment({
    id: AssignmentId.of(id),
    courseOrgUnitId: 101,
    name,
    instructions: null,
    dueDate: DueDate.at(due),
    submissions: [],
  });

describe('get_assignments tool', () => {
  it('returns compact list by default', async () => {
    const repo = new FakeAssignmentRepository(new Map([[101, [a(1, 'Essay', new Date('2030-05-01'))]]]));
    const r = await handleGetAssignments({ assignmentRepo: repo }, { course_id: 101 });
    expect(r.content[0]?.text).toContain('Essay');
    expect(r.content[0]?.text).toContain('2030-05-01');
  });

  it('filters past-due assignments by default', async () => {
    const repo = new FakeAssignmentRepository(new Map([[101, [
      a(1, 'Past', new Date('2020-01-01')),
      a(2, 'Future', new Date('2030-01-01')),
    ]]]));
    const r = await handleGetAssignments({ assignmentRepo: repo }, { course_id: 101 });
    expect(r.content[0]?.text).toContain('Future');
    expect(r.content[0]?.text).not.toContain('Past');
  });

  it('includes past when include_past is true', async () => {
    const repo = new FakeAssignmentRepository(new Map([[101, [
      a(1, 'Past', new Date('2020-01-01')),
    ]]]));
    const r = await handleGetAssignments({ assignmentRepo: repo }, { course_id: 101, include_past: true });
    expect(r.content[0]?.text).toContain('Past');
  });
});
