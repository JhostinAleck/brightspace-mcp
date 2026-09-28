import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

import { describe, expect, it } from 'vitest';

import { findHistoryGroupId, parseSubmissionHistory } from '@/contexts/assignments/infrastructure/parseSubmissionHistory';

const FIXTURES = resolve(__dirname, '../../../fixtures/assignments');
const groupHtml = readFileSync(resolve(FIXTURES, 'submission-history-group.html'), 'utf-8');
const individualHtml = readFileSync(resolve(FIXTURES, 'submission-history-individual.html'), 'utf-8');

describe('findHistoryGroupId', () => {
  const list = '<a href="folders_history.d2l?db=11&amp;grpid=900&amp;isprv=0&amp;bp=0&amp;ou=101">h</a>' +
    '<a href="folders_history.d2l?db=12&amp;grpid=0&amp;isprv=0">h</a>';

  it('reads the group id from the folder list link', () => {
    expect(findHistoryGroupId(list, 11)).toBe('900');
  });

  it('returns 0 for individual folders', () => {
    expect(findHistoryGroupId(list, 12)).toBe('0');
  });

  it('returns null when the folder has no history link', () => {
    expect(findHistoryGroupId(list, 1)).toBeNull();
    expect(findHistoryGroupId(list, 111)).toBeNull();
  });
});

describe('parseSubmissionHistory', () => {
  it('parses group history rows with submitter, date and several files', () => {
    const subs = parseSubmissionHistory(groupHtml);
    expect(subs.map((s) => s.id)).toEqual(['7000001', '7000002']);
    expect(subs[1]).toEqual({
      id: '7000002',
      submittedAt: null,
      submittedAtLabel: 'Jan 12, 2030 11:30 PM',
      submittedBy: 'Student Example',
      comment: null,
      files: [
        { name: 'report.pdf', sizeBytes: null, sizeLabel: '1.2 MB', url: '/d2l/common/viewFile.d2lfile/Database/MTAy/report.pdf?ou=101&fid=1' },
        { name: 'data set.csv', sizeBytes: null, sizeLabel: '3 KB', url: '/d2l/common/viewFile.d2lfile/Database/MTAz/data%20set.csv?ou=101' },
      ],
    });
  });

  it('parses individual history rows (no submitter column) with a comment', () => {
    const [sub] = parseSubmissionHistory(individualHtml);
    expect(sub?.submittedBy).toBeNull();
    expect(sub?.submittedAtLabel).toBe('Feb 1, 2030 8:15 AM');
    expect(sub?.comment).toBe('Team: Alice & Bob');
    expect(sub?.files).toEqual([
      { name: 'essay.docx', sizeBytes: null, sizeLabel: '20 KB', url: '/d2l/common/viewFile.d2lfile/Database/MjAx/essay.docx?ou=202' },
    ]);
  });

  it('returns nothing when the page has no submission grid', () => {
    expect(parseSubmissionHistory('<html><table class="x"></table></html>')).toEqual([]);
  });
});
