import { describe, it, expect } from 'vitest';
import { assignmentsToCompact, assignmentsToDetailed } from '@/mcp/tool-helpers.js';
import { Assignment, type AssignmentProps } from '@/contexts/assignments/domain/Assignment';
import { AssignmentId } from '@/contexts/assignments/domain/AssignmentId';
import { DueDate } from '@/contexts/assignments/domain/DueDate';
import { Rubric } from '@/contexts/assignments/domain/Rubric';
import { loadAllCatalogs, SUPPORTED_LOCALES } from '@/shared-kernel/output/i18n/catalog-loader.js';
import { testOutputContext } from '../helpers/test-output-context.js';

const make = (overrides: Partial<AssignmentProps> = {}) =>
  new Assignment({
    id: AssignmentId.of(7001),
    courseOrgUnitId: 101,
    name: 'Lab 4',
    instructions: null,
    dueDate: DueDate.unspecified(),
    submissions: [],
    ...overrides,
  });

const rubric = new Rubric({
  id: 8001,
  name: 'Lab 4 rubric',
  description: null,
  overallLevels: [],
  groups: [{
    name: 'G',
    levels: [{ id: 1, name: 'L', points: null }],
    criteria: [{ id: 2, name: 'C', cells: [{ levelId: 1, description: 'VERY LONG CELL TEXT', points: 5 }] }],
  }],
});

describe('assignment rendering — submission status', () => {
  it('compact shows "status unavailable (group assignment)" instead of "not submitted"', () => {
    const out = assignmentsToCompact([make({ kind: 'group', submissionsKnown: false })], testOutputContext({ locale: 'en-US' }));
    expect(out).toContain('status unavailable (group assignment)');
    expect(out).not.toContain('not submitted');
  });

  it('compact localizes the unknown status (es-419)', () => {
    const out = assignmentsToCompact([make({ kind: 'group', submissionsKnown: false })], testOutputContext({ locale: 'es-419' }));
    expect(out).toContain('estado no disponible (tarea grupal)');
  });

  it('compact shows a generic unknown status for individual folders', () => {
    const out = assignmentsToCompact([make({ submissionsKnown: false })], testOutputContext({ locale: 'en-US' }));
    expect(out).toContain('status unavailable');
    expect(out).not.toContain('group assignment');
  });

  it('detailed does not claim "Submissions: none" when the status is unknown', () => {
    const out = assignmentsToDetailed([make({ kind: 'group', submissionsKnown: false })], testOutputContext({ locale: 'en-US' }));
    expect(out).not.toContain('Submissions: none');
    expect(out).toContain('status unavailable (group assignment)');
  });
});

describe('assignment rendering — close date', () => {
  it('compact shows the close date when there is no due date', () => {
    const out = assignmentsToCompact(
      [make({ endDate: new Date('2026-09-28T04:59:59Z') })],
      testOutputContext({ locale: 'en-US', tz: 'UTC' }),
    );
    expect(out).toContain('closes');
    expect(out).toContain('2026');
    expect(out).not.toContain('no due date');
  });
});

describe('assignment rendering — detailed metadata', () => {
  const ctx = testOutputContext({ locale: 'en-US', tz: 'UTC' });
  const out = assignmentsToDetailed([
    make({
      kind: 'group',
      points: 5,
      startDate: new Date('2026-09-01T05:00:00Z'),
      endDate: new Date('2026-09-28T04:59:59Z'),
      linkAttachments: [{ name: 'Lab guide', url: 'https://example.edu/lab-guide' }],
      allowedFileTypes: { mode: 'custom', extensions: ['pdf', 'docx'] },
      rubrics: [rubric],
    }),
  ], ctx);

  it('shows points, opens/closes, kind, links and allowed file types', () => {
    expect(out).toContain('Points');
    expect(out).toContain('5');
    expect(out).toContain('Opens');
    expect(out).toContain('closes');
    expect(out).toContain('group');
    expect(out).toContain('[Lab guide](https://example.edu/lab-guide)');
    expect(out).toContain('pdf, docx');
  });

  it('only hints at the rubric instead of inlining it', () => {
    expect(out).toContain('Lab 4 rubric');
    expect(out).toContain('get_assignment_rubric');
    expect(out).not.toContain('VERY LONG CELL TEXT');
  });

  it('shows a separate close date when it differs from the due date', () => {
    const text = assignmentsToDetailed([
      make({ dueDate: DueDate.at(new Date('2026-09-20T04:59:59Z')), endDate: new Date('2026-09-28T04:59:59Z') }),
    ], ctx);
    expect(text).toContain('Closes');
  });

  it('omits allowed file types when any type is accepted', () => {
    expect(assignmentsToDetailed([make()], ctx)).not.toContain('Allowed file types');
  });
});

describe('i18n catalogs — assignment keys', () => {
  const keys = [
    'status_unknown',
    'status_unknown_group',
    'submissions_unknown',
    'submissions_unknown_group',
    'closes',
    'closes_label',
    'opens',
    'points',
    'kind',
    'kind_group',
    'kind_individual',
    'file_types',
    'file_types_restricted',
    'links',
    'rubric',
    'rubric_hint',
  ];
  it.each(SUPPORTED_LOCALES)('%s defines every new assignments.* key', (locale) => {
    const assignments = loadAllCatalogs()[locale].assignments as Record<string, unknown>;
    for (const k of keys) expect(assignments[k], `${locale} assignments.${k}`).toBeTypeOf('string');
  });
});
