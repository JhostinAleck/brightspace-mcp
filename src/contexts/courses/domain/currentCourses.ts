/**
 * Deciding whether an enrollment is "current".
 *
 * D2L's `Access.IsActive` is true for every course a student ever took, so it
 * cannot tell this term from 2021. Students also cannot read course-offering
 * or semester details (`/lp/.../courses/{id}` and `/orgstructure/{id}` are
 * 403), so the only signals are the enrollment's access window, when the user
 * last opened the course, and its code. The rule:
 *
 * 1. Dated end: current if it has not ended and started (or starts within
 *    UPCOMING_DAYS).
 * 2. Start only: current if it started within OPEN_ENDED_DAYS (or starts
 *    within UPCOMING_DAYS).
 * 3. No dates: current if the user opened it within RECENT_ACCESS_DAYS, or its
 *    code shares a term token (a run of 5+ digits, e.g. `202620`) with a fully
 *    dated course that is current by rule 1.
 */
export interface EnrollmentWindow {
  code: string;
  startDate?: Date;
  endDate?: Date;
  lastAccessed?: Date;
}

const DAY_MS = 24 * 60 * 60 * 1000;
export const UPCOMING_DAYS = 30;
export const OPEN_ENDED_DAYS = 183;
export const RECENT_ACCESS_DAYS = 45;

function termTokens(code: string): string[] {
  return code.match(/\d{5,}/g) ?? [];
}

function isCurrentByDates(e: EnrollmentWindow, now: Date): boolean | null {
  const startsSoonEnough = !e.startDate || e.startDate.getTime() <= now.getTime() + UPCOMING_DAYS * DAY_MS;
  if (e.endDate) return e.endDate.getTime() >= now.getTime() && startsSoonEnough;
  if (e.startDate) return startsSoonEnough && e.startDate.getTime() >= now.getTime() - OPEN_ENDED_DAYS * DAY_MS;
  return null;
}

export function isCurrentEnrollment(e: EnrollmentWindow, now: Date, all: readonly EnrollmentWindow[]): boolean {
  const byDates = isCurrentByDates(e, now);
  if (byDates !== null) return byDates;
  if (e.lastAccessed && e.lastAccessed.getTime() >= now.getTime() - RECENT_ACCESS_DAYS * DAY_MS) return true;
  const tokens = termTokens(e.code);
  if (tokens.length === 0) return false;
  return all.some(
    (s) =>
      s !== e &&
      s.startDate !== undefined &&
      s.endDate !== undefined &&
      isCurrentByDates(s, now) === true &&
      termTokens(s.code).some((t) => tokens.includes(t)),
  );
}
