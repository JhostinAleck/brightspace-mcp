import { existsSync, mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { handleGetMySubmissions } from '@/mcp/tools/get-my-submissions.tool';
import type { MySubmission } from '@/contexts/assignments/domain/MySubmission';
import { FakeAssignmentRepository } from '@tests/helpers/fakes/FakeAssignmentRepository';

const subs: MySubmission[] = [
  {
    id: '6', submittedAt: new Date('2030-01-12T14:00:00.000Z'), submittedAtLabel: null, submittedBy: 'Student Example',
    comment: 'final version',
    files: [
      { name: 'report.txt', sizeBytes: 2048, sizeLabel: null, url: '/u/6/report' },
      { name: 'data.csv', sizeBytes: 3 * 1024 * 1024, sizeLabel: null, url: '/u/6/data' },
    ],
  },
  {
    id: '5', submittedAt: null, submittedAtLabel: 'Jan 10, 2030 9:00 AM', submittedBy: null, comment: null,
    files: [{ name: 'report.txt', sizeBytes: null, sizeLabel: '1 KB', url: '/u/5/report' }],
  },
];
const binaries = new Map([
  ['/u/6/report', Buffer.from('final report body')],
  ['/u/6/data', Buffer.from('a,b\n1,2\n')],
  ['/u/5/report', Buffer.from('draft report body')],
]);

const deps = (list: MySubmission[] = subs) => ({
  assignmentRepo: new FakeAssignmentRepository(new Map(), new Map(), new Map(), new Map([['101:11', list]]), binaries),
});
const run = async (input: Record<string, unknown>, list?: MySubmission[]) => {
  const r = await handleGetMySubmissions(deps(list), { course_id: 101, assignment_id: 11, ...input });
  return r.content.map((c) => (c.type === 'text' ? c.text : '')).join('\n');
};

let dir: string;
beforeEach(() => { dir = mkdtempSync(join(tmpdir(), 'my-subs-')); });
afterEach(() => rmSync(dir, { recursive: true, force: true }));

describe('get_my_submissions tool', () => {
  it('lists submissions newest first with files, sizes, dates and comments', async () => {
    const text = await run({});
    expect(text).toContain('2 submission(s)');
    expect(text).toContain('## Submission 6 — 2030-01-12T14:00:00.000Z by Student Example');
    expect(text).toContain('Comment: final version');
    expect(text).toContain('- report.txt (2 KB)');
    expect(text).toContain('- data.csv (3.0 MB)');
    expect(text).toContain('## Submission 5 — Jan 10, 2030 9:00 AM');
    expect(text).toContain('- report.txt (1 KB)');
    expect(text.indexOf('Submission 6')).toBeLessThan(text.indexOf('Submission 5'));
    expect(text).toMatch(/file_name/);
  });

  it('says so when nothing was submitted', async () => {
    expect(await run({}, [])).toMatch(/no submissions/i);
  });

  it('reads the newest file with a matching name (case-insensitive)', async () => {
    const text = await run({ file_name: 'REPORT.TXT' });
    expect(text).toContain('final report body');
    expect(text).toContain('[Submission 6');
  });

  it('reads an older version when the submission is selected', async () => {
    expect(await run({ file_name: 'report.txt', submission_id: '5' })).toContain('draft report body');
  });

  it('reports unknown submissions and file names with the listing', async () => {
    expect(await run({ submission_id: '99' })).toMatch(/Submission 99 not found[\s\S]*Submission 6/);
    expect(await run({ file_name: 'nope.pdf' })).toMatch(/No submitted file named "nope.pdf"/);
  });

  it('saves only the latest submission when no filter is given', async () => {
    const text = await run({ save_to: dir });
    expect(readFileSync(join(dir, 'report.txt'), 'utf8')).toBe('final report body');
    expect(existsSync(join(dir, 'data.csv'))).toBe(true);
    expect(existsSync(join(dir, '5-report.txt'))).toBe(false);
    expect(text).toContain(`[Saved to: ${join(dir, 'report.txt')}]`);
  });

  it('prefixes repeated names with the submission id instead of overwriting', async () => {
    await run({ save_to: dir, file_name: 'report.txt' });
    expect(readFileSync(join(dir, 'report.txt'), 'utf8')).toBe('final report body');
    expect(readFileSync(join(dir, '5-report.txt'), 'utf8')).toBe('draft report body');
  });

  it('keeps saves inside save_to even for hostile names and reports failures', async () => {
    const hostile: MySubmission[] = [{
      id: '7', submittedAt: null, submittedAtLabel: null, submittedBy: null, comment: null,
      files: [
        { name: '../../escape.txt', sizeBytes: 1, sizeLabel: null, url: '/u/6/report' },
        { name: 'missing.bin', sizeBytes: 1, sizeLabel: null, url: '/u/none' },
      ],
    }];
    const text = await run({ save_to: dir }, hostile);
    expect(existsSync(join(dir, 'escape.txt'))).toBe(true);
    expect(text).toMatch(/Save failed for missing\.bin/);
  });
});
