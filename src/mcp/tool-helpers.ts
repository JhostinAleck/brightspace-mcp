import type { Course } from '@/contexts/courses/Course.js';
import { CourseId } from '@/contexts/courses/CourseId.js';
import type { Grade } from '@/contexts/grades/domain/Grade.js';
import { LetterGrade } from '@/contexts/grades/domain/LetterGrade.js';
import type { Feedback } from '@/contexts/assignments/domain/Feedback.js';
import type { Assignment } from '@/contexts/assignments/domain/Assignment.js';
import { AssignmentId } from '@/contexts/assignments/domain/AssignmentId.js';
import type { Classmate } from '@/contexts/courses/Classmate.js';
import type { Syllabus } from '@/contexts/content/domain/Syllabus.js';
import type { Module } from '@/contexts/content/domain/Module.js';
import type { Announcement } from '@/contexts/communications/domain/Announcement.js';
import type { DiscussionForum } from '@/contexts/communications/domain/DiscussionForum.js';
import type { CalendarEvent } from '@/contexts/calendar/domain/CalendarEvent.js';

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

export function feedbackToText(fb: Feedback | null): string {
  if (!fb) return 'No feedback posted yet.';
  const score = fb.score !== null && fb.outOf !== null ? `${fb.score}/${fb.outOf}` : 'ungraded';
  const pct = fb.percent !== null ? ` (${fb.percent.toFixed(1)}%)` : '';
  const text = fb.text ? `\n\n"${fb.text}"` : '';
  const released = fb.releasedAt ? `\nReleased: ${fb.releasedAt.toISOString().slice(0, 10)}` : '';
  return `Feedback: ${score}${pct}${released}${text}`;
}

export function assignmentsToCompact(assignments: Assignment[]): string {
  if (assignments.length === 0) return 'No assignments.';
  const lines = assignments.map((a) => {
    const due = a.dueDate.toDate()?.toISOString().slice(0, 10) ?? 'no due date';
    const submitted = a.hasSubmission ? ' [submitted]' : '';
    return ` • ${a.name} — due ${due}${submitted} (id=${AssignmentId.toNumber(a.id)})`;
  });
  return `Assignments:\n${lines.join('\n')}`;
}

export function assignmentsToDetailed(assignments: Assignment[]): string {
  if (assignments.length === 0) return 'No assignments.';
  return assignments.map((a) => {
    const due = a.dueDate.toDate()?.toISOString() ?? 'no due date';
    const instructions = a.instructions ? `\n  Instructions: ${a.instructions.replace(/\s+/g, ' ').slice(0, 200)}` : '';
    const subs = a.submissions.length
      ? `\n  Submissions: ${a.submissions.length}, last at ${a.submissions[a.submissions.length - 1]!.submittedAt.toISOString()}`
      : '\n  Submissions: none';
    return `• ${a.name} (id=${AssignmentId.toNumber(a.id)})\n  Due: ${due}${instructions}${subs}`;
  }).join('\n');
}

export function rosterToText(classmates: Classmate[]): string {
  if (classmates.length === 0) return 'No classmates found.';
  const lines = classmates.map((c) => {
    const email = c.email ? ` · ${c.email}` : '';
    return ` • ${c.displayName} [${c.role}]${email}`;
  });
  return `Roster (${classmates.length}):\n${lines.join('\n')}`;
}

export function emailsToText(emails: string[]): string {
  if (emails.length === 0) return 'No emails found.';
  return emails.join(', ');
}

export function syllabusToText(s: Syllabus | null): string {
  if (!s) return 'No syllabus posted yet.';
  const stripped = (s.html ?? '').replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();
  const updated = s.updatedAt ? `\nUpdated: ${s.updatedAt.toISOString().slice(0, 10)}` : '';
  return `${s.title}:${updated}\n\n${stripped.slice(0, 2000)}${stripped.length > 2000 ? '…' : ''}`;
}

export function courseContentToText(modules: readonly Module[], depth: number): string {
  if (modules.length === 0) return 'No course content posted yet.';
  const render = (mods: readonly Module[], level: number): string[] => {
    const out: string[] = [];
    for (const m of mods) {
      out.push(`${'  '.repeat(level)}📁 ${m.title}`);
      for (const t of m.topics) out.push(`${'  '.repeat(level + 1)}· ${t.title} [${t.kind}] (id=${t.id})`);
      if (level < depth) out.push(...render(m.submodules, level + 1));
    }
    return out;
  };
  return `Course content:\n${render(modules, 0).join('\n')}`;
}

export function announcementsToText(items: Announcement[]): string {
  if (items.length === 0) return 'No announcements.';
  const lines = items.map((a) => {
    const author = a.authorName ? ` — ${a.authorName}` : '';
    const body = (a.html ?? '').replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 200);
    return ` • ${a.postedAt.toISOString().slice(0, 10)}: ${a.title}${author}\n    ${body}`;
  });
  return `Announcements:\n${lines.join('\n')}`;
}

export function discussionsToText(forums: DiscussionForum[]): string {
  if (forums.length === 0) return 'No discussion forums.';
  const out: string[] = [];
  for (const f of forums) {
    out.push(`📋 ${f.name}`);
    if (f.topics.length === 0) out.push('  (no topics)');
    for (const t of f.topics) {
      const last = t.lastPostAt ? `, last ${t.lastPostAt.toISOString().slice(0, 10)}` : '';
      out.push(`  · ${t.name} (${t.postCount} posts${last})`);
    }
  }
  return out.join('\n');
}

export function calendarEventsToText(events: CalendarEvent[], days: number): string {
  if (events.length === 0) return `No events in the next ${days} days.`;
  const lines = events.map((e) => {
    const loc = e.location ? ` @ ${e.location}` : '';
    const end = e.endAt ? ` → ${e.endAt.toISOString().slice(11, 16)}` : '';
    return ` • ${e.startAt.toISOString().slice(0, 16).replace('T', ' ')}${end} — ${e.title}${loc}`;
  });
  return `Events in next ${days} days:\n${lines.join('\n')}`;
}
