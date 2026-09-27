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
import { Module } from '@/contexts/content/domain/Module.js';
import { Topic } from '@/contexts/content/domain/Topic.js';

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
    expect(feedbackToText(null, ctx)).toBe('Not graded yet — no feedback posted.');
  });

  it('rosterToText en empty', () => {
    expect(rosterToText([], ctx)).toBe('No classmates found.');
  });

  it('emailsToText empty', () => {
    expect(emailsToText([], ctx)).toContain('get_roster');
  });

  it('syllabusToText null', () => {
    expect(syllabusToText(null, ctx)).toBe('No syllabus posted yet.');
  });

  it('courseContentToText empty', () => {
    expect(courseContentToText([], 2, ctx)).toBe('No course content posted yet.');
  });

  it('courseContentToText includes the URL for link-kind topics (e.g. a Zoom link)', () => {
    const modules = [
      new Module({
        id: 1,
        title: 'Enlaces y grabaciones sesiones sincrónicas',
        topics: [
          new Topic({ id: 10, title: 'Zoom', kind: 'link', url: 'https://uniandes.zoom.us/j/12345', fileExtension: null }),
          new Topic({ id: 11, title: 'Syllabus.pdf', kind: 'file', url: null, fileExtension: 'pdf' }),
        ],
        submodules: [],
      }),
    ];
    const text = courseContentToText(modules, 2, ctx);
    expect(text).toContain('Zoom');
    expect(text).toContain('https://uniandes.zoom.us/j/12345');
    // A file-kind topic with no url must not grow a stray " — " suffix.
    expect(text).not.toContain('Syllabus.pdf — ');
  });

  it('courseContentToText also shows the URL when D2L classified the quicklink as "other" (observed for some Zoom links)', () => {
    const modules = [
      new Module({
        id: 1,
        title: 'Sala Zoom y grabaciones',
        topics: [
          new Topic({ id: 20, title: 'Zoom', kind: 'other', url: 'https://uniandes.zoom.us/j/99999', fileExtension: null }),
        ],
        submodules: [],
      }),
    ];
    const text = courseContentToText(modules, 2, ctx);
    expect(text).toContain('https://uniandes.zoom.us/j/99999');
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
