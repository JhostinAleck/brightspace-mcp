import type { Course } from '@/contexts/courses/Course.js';
import { CourseId } from '@/contexts/courses/CourseId.js';
import type { Grade } from '@/contexts/grades/domain/Grade.js';
import { LetterGrade } from '@/contexts/grades/domain/LetterGrade.js';

export function coursesToCompact(courses: Course[]): string {
  if (courses.length === 0) return 'You have no courses.';
  const lines = courses.map(
    (c) =>
      ` • ${c.name} — ${c.code} (id=${CourseId.toNumber(c.id)})${c.active ? '' : ' [inactive]'}`,
  );
  return `You have ${courses.length} course${courses.length === 1 ? '' : 's'}:\n${lines.join('\n')}`;
}

export function coursesToDetailed(courses: Course[]): string {
  return courses
    .map((c) => {
      const dates =
        c.startDate && c.endDate
          ? ` | ${c.startDate.toISOString().slice(0, 10)} → ${c.endDate.toISOString().slice(0, 10)}`
          : '';
      return `• ${c.name} (${c.code}, id=${CourseId.toNumber(c.id)}) [${c.active ? 'active' : 'inactive'}]${dates}`;
    })
    .join('\n');
}

export function gradesToCompact(grades: Grade[]): string {
  if (grades.length === 0) return 'No grades posted yet.';
  const lines = grades.map((g) => {
    const percent = g.percent === null ? 'ungraded' : `${g.percent.toFixed(1)}%`;
    const letter = g.percent === null ? '' : ` (${LetterGrade.fromPercent(g.percent).letter})`;
    return ` • ${g.itemName}: ${percent}${letter}`;
  });
  return `Grades:\n${lines.join('\n')}`;
}

export function gradesToDetailed(grades: Grade[]): string {
  if (grades.length === 0) return 'No grades posted yet.';
  return grades.map((g) => {
    const pct = g.percent === null ? 'ungraded' : `${g.percent.toFixed(1)}%`;
    const pts = g.pointsEarned === null ? 'n/a' : `${g.pointsEarned}/${g.pointsMax}`;
    const letter = g.percent === null ? '' : ` [${LetterGrade.fromPercent(g.percent).letter}]`;
    const displayed = g.displayedGrade ?? '';
    return `• ${g.itemName} — ${pts} = ${pct}${letter}${displayed ? ` (display: ${displayed})` : ''}`;
  }).join('\n');
}
