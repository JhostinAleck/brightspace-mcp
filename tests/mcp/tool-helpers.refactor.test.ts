import { describe, expect, it } from 'vitest';
import {
  coursesToCompact,
  gradesToCompact,
  assignmentsToCompact,
  feedbackToText,
  rosterToText,
  emailsToText,
  syllabusToText,
  courseContentToText,
  announcementsToText,
  discussionsToText,
  calendarEventsToText,
} from '@/mcp/tool-helpers.js';
import { testOutputContext } from '../helpers/test-output-context.js';

const ctx = testOutputContext({ locale: 'en-US' });
const ctxEs = testOutputContext({ locale: 'es-419' });

describe('tool-helpers after refactor', () => {
  it('coursesToCompact en empty', () => {
    expect(coursesToCompact([], ctx)).toBe('You have no courses.');
  });

  it('coursesToCompact es empty', () => {
    expect(coursesToCompact([], ctxEs)).toBe('No tienes cursos.');
  });

  it('gradesToCompact en empty', () => {
    expect(gradesToCompact([], ctx)).toBe('No grades posted yet.');
  });

  it('gradesToCompact es empty', () => {
    expect(gradesToCompact([], ctxEs)).toBe('Aún no hay calificaciones.');
  });

  it('assignmentsToCompact en empty', () => {
    expect(assignmentsToCompact([], ctx)).toBe('No assignments.');
  });

  it('feedbackToText null', () => {
    expect(feedbackToText(null, ctx)).toBe('No feedback posted yet.');
  });

  it('rosterToText en empty', () => {
    expect(rosterToText([], ctx)).toBe('No classmates found.');
  });

  it('emailsToText empty', () => {
    expect(emailsToText([], ctx)).toBe('No emails found.');
  });

  it('syllabusToText null', () => {
    expect(syllabusToText(null, ctx)).toBe('No syllabus posted yet.');
  });

  it('courseContentToText empty', () => {
    expect(courseContentToText([], 2, ctx)).toBe('No course content posted yet.');
  });

  it('announcementsToText en empty', () => {
    expect(announcementsToText([], ctx)).toBe('No announcements.');
  });

  it('discussionsToText en empty', () => {
    expect(discussionsToText([], ctx)).toBe('No discussion forums.');
  });

  it('calendarEventsToText en empty', () => {
    expect(calendarEventsToText([], 7, ctx)).toBe('No events in the next 7 days.');
  });
});
