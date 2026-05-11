import type { OutputContext } from '@/shared-kernel/output/index.js';
import type { Course } from '@/contexts/courses/domain/Course.js';
import { CourseId } from '@/contexts/courses/domain/CourseId.js';
import type { Grade } from '@/contexts/grades/domain/Grade.js';
import { LetterGrade } from '@/contexts/grades/domain/LetterGrade.js';
import type { Feedback } from '@/contexts/assignments/domain/Feedback.js';
import type { Assignment } from '@/contexts/assignments/domain/Assignment.js';
import { AssignmentId } from '@/contexts/assignments/domain/AssignmentId.js';
import type { Classmate } from '@/contexts/courses/domain/Classmate.js';
import type { Syllabus } from '@/contexts/content/domain/Syllabus.js';
import type { Module } from '@/contexts/content/domain/Module.js';
import type { Announcement } from '@/contexts/communications/domain/Announcement.js';
import type { DiscussionForum } from '@/contexts/communications/domain/DiscussionForum.js';
import type { CalendarEvent } from '@/contexts/calendar/domain/CalendarEvent.js';

export function coursesToCompact(courses: Course[], ctx: OutputContext): string {
  if (courses.length === 0) return ctx.t('courses.empty');
  const items = courses.map((c) => {
    const tag = c.active ? '' : ` ${ctx.md.italic(`[${ctx.t('courses.inactive')}]`)}`;
    return `${ctx.md.bold(c.name)} — ${c.code}${tag}`;
  });
  return [
    ctx.md.h3(ctx.t('courses.count', { count: courses.length })),
    ctx.md.bulletList(items),
  ].join('\n\n');
}

export function coursesToDetailed(courses: Course[], ctx: OutputContext): string {
  if (courses.length === 0) return ctx.t('courses.empty');
  const headers = [
    ctx.t('courses.table_headers.name'),
    ctx.t('courses.table_headers.code'),
    ctx.t('courses.table_headers.status'),
  ];
  const rows = courses.map((c) => [
    `${c.name} (id=${CourseId.toNumber(c.id)})`,
    c.code,
    c.active ? '' : ctx.t('courses.inactive'),
  ]);
  return [ctx.md.h3(ctx.t('courses.header')), ctx.md.table(headers, rows)].join('\n\n');
}

export function gradesToCompact(grades: Grade[], ctx: OutputContext): string {
  if (grades.length === 0) return ctx.t('grades.empty');
  const items = grades.map((g) => {
    const pct = g.percent === null ? ctx.t('grades.ungraded') : ctx.formatPercent(g.percent);
    const letter = g.percent === null ? '' : ` (${LetterGrade.fromPercent(g.percent).letter})`;
    return `${ctx.md.bold(g.itemName)}: ${pct}${letter}`;
  });
  return [ctx.md.h3(ctx.t('grades.header')), ctx.md.bulletList(items)].join('\n\n');
}

export function gradesToDetailed(grades: Grade[], ctx: OutputContext): string {
  if (grades.length === 0) return ctx.t('grades.empty');
  const headers = [
    ctx.t('grades.table_headers.item'),
    ctx.t('grades.table_headers.score'),
    ctx.t('grades.table_headers.percent'),
    ctx.t('grades.table_headers.letter'),
  ];
  const rows = grades.map((g) => {
    const pts = g.pointsEarned === null ? '—' : ctx.formatPoints(g.pointsEarned, g.pointsMax ?? 0);
    const pct = g.percent === null ? ctx.t('grades.ungraded') : ctx.formatPercent(g.percent);
    const letter = g.percent === null ? '' : LetterGrade.fromPercent(g.percent).letter;
    return [g.itemName, pts, pct, letter];
  });
  return [ctx.md.h3(ctx.t('grades.header')), ctx.md.table(headers, rows)].join('\n\n');
}

export function feedbackToText(fb: Feedback | null, ctx: OutputContext): string {
  if (!fb) return ctx.t('feedback.none');
  const score =
    fb.score !== null && fb.outOf !== null
      ? ctx.formatPoints(fb.score, fb.outOf)
      : ctx.t('grades.ungraded');
  const pct = fb.percent !== null ? ` (${ctx.formatPercent(fb.percent)})` : '';
  const released = fb.releasedAt
    ? `\n${ctx.t('feedback.released_at', { when: ctx.formatDate(fb.releasedAt) })}`
    : '';
  const text = fb.text ? `\n\n${ctx.md.blockquote(fb.text)}` : '';
  return [ctx.md.h4(ctx.t('feedback.header')), `${score}${pct}${released}${text}`].join('\n\n');
}

export function assignmentsToCompact(assignments: Assignment[], ctx: OutputContext): string {
  if (assignments.length === 0) return ctx.t('assignments.empty');
  const headers = [
    ctx.t('assignments.table_headers.name'),
    ctx.t('assignments.table_headers.due'),
    ctx.t('assignments.table_headers.status'),
  ];
  const rows = assignments.map((a) => {
    const dueDate = a.dueDate.toDate();
    const due = dueDate ? ctx.formatDate(dueDate, 'datetime') : ctx.t('assignments.no_due');
    const status = a.hasSubmission
      ? ctx.t('assignments.submitted')
      : ctx.t('assignments.not_submitted');
    return [`${a.name} (id=${AssignmentId.toNumber(a.id)})`, due, status];
  });
  return [ctx.md.h3(ctx.t('assignments.header')), ctx.md.table(headers, rows)].join('\n\n');
}

export function assignmentsToDetailed(assignments: Assignment[], ctx: OutputContext): string {
  if (assignments.length === 0) return ctx.t('assignments.empty');
  const blocks = assignments.map((a) => {
    const dueDate = a.dueDate.toDate();
    const due = dueDate ? ctx.formatDate(dueDate, 'datetime') : ctx.t('assignments.no_due');
    const instructions = a.instructions
      ? `\n${ctx.md.bold(ctx.t('assignments.instructions'))}: ${a.instructions.replace(/\s+/g, ' ').slice(0, 200)}`
      : '';
    const lastSub =
      a.submissions.length > 0 ? a.submissions[a.submissions.length - 1]!.submittedAt : null;
    const subs =
      a.submissions.length === 0
        ? ctx.t('assignments.submissions_none')
        : ctx.t('assignments.submissions_count', {
            count: a.submissions.length,
            when: ctx.formatDate(lastSub, 'datetime'),
          });
    return [
      ctx.md.h4(`${a.name} (id=${AssignmentId.toNumber(a.id)})`),
      `${ctx.md.bold(ctx.t('assignments.table_headers.due'))}: ${due}`,
      instructions.trim(),
      subs,
    ]
      .filter(Boolean)
      .join('\n');
  });
  return [ctx.md.h3(ctx.t('assignments.header')), blocks.join('\n\n')].join('\n\n');
}

export function rosterToText(classmates: Classmate[], ctx: OutputContext): string {
  if (classmates.length === 0) return ctx.t('roster.empty');
  const items = classmates.map((c) => {
    const email = c.email ? ` · ${c.email}` : '';
    return `${ctx.md.bold(c.displayName)} ${ctx.md.italic(`[${c.role}]`)}${email}`;
  });
  return [
    ctx.md.h3(ctx.t('roster.count', { count: classmates.length })),
    ctx.md.bulletList(items),
  ].join('\n\n');
}

export function emailsToText(emails: string[], ctx: OutputContext): string {
  if (emails.length === 0) return ctx.t('emails.empty');
  return emails.join(', ');
}

export function syllabusToText(s: Syllabus | null, ctx: OutputContext): string {
  if (!s) return ctx.t('syllabus.empty');
  const stripped = (s.html ?? '')
    .replace(/<[^>]+>/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
  const updated = s.updatedAt
    ? `_${ctx.t('syllabus.updated_at', { when: ctx.formatDate(s.updatedAt) })}_`
    : '';
  const body = stripped.slice(0, 2000) + (stripped.length > 2000 ? '…' : '');
  return [ctx.md.h3(s.title), updated, body].filter(Boolean).join('\n\n');
}

export function courseContentToText(
  modules: readonly Module[],
  depth: number,
  ctx: OutputContext,
): string {
  if (modules.length === 0) return ctx.t('content.empty');
  const lines: string[] = [];
  const walk = (mods: readonly Module[], level: number): void => {
    for (const m of mods) {
      lines.push(`${'  '.repeat(level)}- ${ctx.md.bold(m.title)}`);
      for (const topic of m.topics) {
        lines.push(
          `${'  '.repeat(level + 1)}- ${topic.title} ${ctx.md.italic(`[${topic.kind}]`)} (id=${topic.id})`,
        );
      }
      if (level < depth) walk(m.submodules, level + 1);
    }
  };
  walk(modules, 0);
  return [ctx.md.h3(ctx.t('content.header')), lines.join('\n')].join('\n\n');
}

export function announcementsToText(items: Announcement[], ctx: OutputContext): string {
  if (items.length === 0) return ctx.t('announcements.empty');
  const headers = [
    ctx.t('announcements.table_headers.date'),
    ctx.t('announcements.table_headers.title'),
    ctx.t('announcements.table_headers.author'),
  ];
  const rows = items.map((a) => {
    const body = (a.html ?? '')
      .replace(/<[^>]+>/g, ' ')
      .replace(/\s+/g, ' ')
      .trim()
      .slice(0, 100);
    return [
      ctx.formatDate(a.postedAt),
      `${a.title}${body ? ` — ${ctx.md.italic(body)}` : ''}`,
      a.authorName ?? '',
    ];
  });
  return [ctx.md.h3(ctx.t('announcements.header')), ctx.md.table(headers, rows)].join('\n\n');
}

export function discussionsToText(forums: DiscussionForum[], ctx: OutputContext): string {
  if (forums.length === 0) return ctx.t('discussions.empty');
  const blocks = forums.map((f) => {
    const head = ctx.md.h4(f.name);
    if (f.topics.length === 0) return `${head}\n_${ctx.t('discussions.no_topics')}_`;
    const items = f.topics.map((topic) => {
      const post = ctx.t('discussions.post_count', { count: topic.postCount });
      const last = topic.lastPostAt
        ? `, ${ctx.t('discussions.last_post', { when: ctx.formatDate(topic.lastPostAt) })}`
        : '';
      return `${topic.name} (${post}${last})`;
    });
    return `${head}\n${ctx.md.bulletList(items)}`;
  });
  return [ctx.md.h3(ctx.t('discussions.header')), blocks.join('\n\n')].join('\n\n');
}

export function calendarEventsToText(
  events: CalendarEvent[],
  days: number,
  ctx: OutputContext,
): string {
  if (events.length === 0) return ctx.t('calendar.empty_window', { days });
  const items = events.map((e) => {
    const start = ctx.formatDate(e.startAt, 'datetime');
    const end = e.endAt
      ? ` → ${ctx.formatDate(e.endAt, 'datetime').split(',').slice(-1)[0]?.trim() ?? ''}`
      : '';
    const loc = e.location ? ` @ ${e.location}` : '';
    return `${start}${end} — ${ctx.md.bold(e.title)}${loc}`;
  });
  return [ctx.md.h3(ctx.t('calendar.title_window', { days })), ctx.md.bulletList(items)].join(
    '\n\n',
  );
}
