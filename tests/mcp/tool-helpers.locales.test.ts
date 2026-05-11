/* eslint-disable @typescript-eslint/no-explicit-any */
import { describe, expect, it } from 'vitest';
import {
  coursesToCompact,
  coursesToDetailed,
  gradesToCompact,
  gradesToDetailed,
  assignmentsToCompact,
  assignmentsToDetailed,
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
import type { SupportedLocale } from '@/shared-kernel/output/index.js';

const LOCALES: SupportedLocale[] = ['en-US', 'es-419', 'pt-BR', 'fr-CA'];

// Minimal realistic fixtures — enough to exercise the formatting paths
// CourseId is a branded number (not { value: N }), so pass raw numbers as id
const courses = [
  { id: 1, name: 'Cálculo I', code: 'MATE-1101', active: true, startDate: null, endDate: null },
  { id: 2, name: 'Programación', code: 'ISIS-1221', active: false, startDate: null, endDate: null },
] as any;

const grades = [
  { itemName: 'Quiz 1', percent: 85.5, pointsEarned: 17, pointsMax: 20, displayedGrade: null },
  { itemName: 'Lab 2', percent: null, pointsEarned: null, pointsMax: 100, displayedGrade: null },
] as any;

// Construct minimal Assignment-shaped objects
const dueDate = {
  toDate: () => new Date('2026-06-15T16:00:00Z'),
};

// AssignmentId is also a branded number — pass raw number
const assignments = [
  {
    id: 10,
    name: 'Taller 1',
    dueDate,
    hasSubmission: false,
    instructions: 'Resolver los ejercicios del libro.',
    submissions: [],
  },
] as any;

const classmates = [
  { displayName: 'Ana García', role: 'Student', email: 'ana@uni.edu' },
  { displayName: 'Prof. Rodríguez', role: 'Instructor', email: null },
] as any;

const emails = ['student1@uni.edu', 'student2@uni.edu'];

const syllabus = {
  title: 'Programa del curso MATE-1101',
  html: '<p>Este curso cubre cálculo diferencial e integral.</p>',
  updatedAt: new Date('2026-01-10T09:00:00Z'),
} as any;

const modules = [
  {
    title: 'Módulo 1: Límites',
    topics: [{ title: 'Introducción a límites', kind: 'File', id: 101 }],
    submodules: [],
  },
] as any;

const announcements = [
  {
    postedAt: new Date('2026-05-01T10:00:00Z'),
    title: 'Examen parcial',
    authorName: 'Prof. Rodríguez',
    html: '<p>El examen será el viernes a las 9am.</p>',
  },
] as any;

const discussions = [
  {
    name: 'Foro general',
    topics: [
      {
        name: 'Preguntas del parcial',
        postCount: 5,
        lastPostAt: new Date('2026-05-10T14:00:00Z'),
      },
    ],
  },
] as any;

const events = [
  {
    startAt: new Date('2026-05-20T09:00:00Z'),
    endAt: new Date('2026-05-20T11:00:00Z'),
    title: 'Parcial Final',
    location: 'Aula ML-102',
  },
] as any;

const feedback = {
  score: 17,
  outOf: 20,
  percent: 85,
  releasedAt: new Date('2026-04-15T12:00:00Z'),
  text: 'Buen trabajo, pero revisar los límites laterales.',
} as any;

for (const locale of LOCALES) {
  describe(`tool-helpers @ ${locale}`, () => {
    const ctx = testOutputContext({ locale });

    it('coursesToCompact', () => {
      expect(coursesToCompact(courses, ctx)).toMatchSnapshot();
    });
    it('coursesToDetailed', () => {
      expect(coursesToDetailed(courses, ctx)).toMatchSnapshot();
    });
    it('gradesToCompact', () => {
      expect(gradesToCompact(grades, ctx)).toMatchSnapshot();
    });
    it('gradesToDetailed', () => {
      expect(gradesToDetailed(grades, ctx)).toMatchSnapshot();
    });
    it('assignmentsToCompact', () => {
      expect(assignmentsToCompact(assignments, ctx)).toMatchSnapshot();
    });
    it('assignmentsToDetailed', () => {
      expect(assignmentsToDetailed(assignments, ctx)).toMatchSnapshot();
    });
    it('feedbackToText', () => {
      expect(feedbackToText(feedback, ctx)).toMatchSnapshot();
    });
    it('rosterToText', () => {
      expect(rosterToText(classmates, ctx)).toMatchSnapshot();
    });
    it('emailsToText', () => {
      expect(emailsToText(emails, ctx)).toMatchSnapshot();
    });
    it('syllabusToText', () => {
      expect(syllabusToText(syllabus, ctx)).toMatchSnapshot();
    });
    it('courseContentToText', () => {
      expect(courseContentToText(modules, 2, ctx)).toMatchSnapshot();
    });
    it('announcementsToText', () => {
      expect(announcementsToText(announcements, ctx)).toMatchSnapshot();
    });
    it('discussionsToText', () => {
      expect(discussionsToText(discussions, ctx)).toMatchSnapshot();
    });
    it('calendarEventsToText', () => {
      expect(calendarEventsToText(events, 30, ctx)).toMatchSnapshot();
    });
  });
}
