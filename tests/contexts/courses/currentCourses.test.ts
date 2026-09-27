import { describe, it, expect } from 'vitest';
import { isCurrentEnrollment, type EnrollmentWindow } from '@/contexts/courses/domain/currentCourses.js';

const NOW = new Date('2026-09-27T12:00:00Z');
const w = (p: Partial<EnrollmentWindow>): EnrollmentWindow => ({ code: 'X', ...p });
const d = (iso: string) => new Date(iso);

describe('isCurrentEnrollment', () => {
  const termSiblings: EnrollmentWindow[] = [];

  it('keeps a course whose access window contains now', () => {
    expect(isCurrentEnrollment(w({ startDate: d('2026-08-03'), endDate: d('2026-12-18') }), NOW, termSiblings)).toBe(true);
  });

  it('drops a course whose access window ended', () => {
    expect(isCurrentEnrollment(w({ startDate: d('2026-01-20'), endDate: d('2026-06-12') }), NOW, termSiblings)).toBe(false);
  });

  it('keeps an open-start course that has not ended yet', () => {
    expect(isCurrentEnrollment(w({ endDate: d('2027-01-01') }), NOW, termSiblings)).toBe(true);
  });

  it('keeps a course starting within the next 30 days, drops one starting later', () => {
    expect(isCurrentEnrollment(w({ startDate: d('2026-10-15'), endDate: d('2027-02-01') }), NOW, termSiblings)).toBe(true);
    expect(isCurrentEnrollment(w({ startDate: d('2027-01-20'), endDate: d('2027-06-01') }), NOW, termSiblings)).toBe(false);
  });

  it('keeps an open-ended course only if it started within ~6 months', () => {
    expect(isCurrentEnrollment(w({ startDate: d('2026-08-01') }), NOW, termSiblings)).toBe(true);
    expect(isCurrentEnrollment(w({ startDate: d('2025-08-01') }), NOW, termSiblings)).toBe(false);
  });

  it('keeps an undated course opened in the last 45 days, drops an old one', () => {
    expect(isCurrentEnrollment(w({ lastAccessed: d('2026-09-25') }), NOW, termSiblings)).toBe(true);
    expect(isCurrentEnrollment(w({ lastAccessed: d('2026-01-17') }), NOW, termSiblings)).toBe(false);
    expect(isCurrentEnrollment(w({}), NOW, termSiblings)).toBe(false);
  });

  it('keeps an undated course sharing a term token with a dated current course', () => {
    const siblings = [w({ code: '202620_ABCD2106_F', startDate: d('2026-08-03'), endDate: d('2026-12-18') })];
    expect(isCurrentEnrollment(w({ code: 'UN_202620_ABCD2106_I' }), NOW, siblings)).toBe(true);
    // short digit runs (course numbers) are not term tokens
    expect(isCurrentEnrollment(w({ code: 'UN_202410_ABCD2106_I' }), NOW, siblings)).toBe(false);
  });

  it('ignores siblings that are not fully dated or not current', () => {
    const siblings = [
      w({ code: 'AC_202610_PRE', endDate: d('2027-01-01') }),
      w({ code: '202510_ABCD1000_1', startDate: d('2025-01-21'), endDate: d('2025-06-13') }),
    ];
    expect(isCurrentEnrollment(w({ code: 'UN_202610_X' }), NOW, siblings)).toBe(false);
    expect(isCurrentEnrollment(w({ code: 'UN_202510_X' }), NOW, siblings)).toBe(false);
  });
});
