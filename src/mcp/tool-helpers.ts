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
import type { DiscussionForum } from '@/contexts/communications/domain/DiscussionForum.js';
import type { CalendarEvent } from '@/contexts/calendar/domain/CalendarEvent.js';
import { rubricAssessmentsToText } from '@/mcp/rubric-helpers.js';
import { summarizeDescription } from './module-description.js';

export function coursesToCompact(courses: Course[], ctx: OutputContext): string {
  if (courses.length === 0) return ctx.t('courses.empty');
  const items = courses.map((c) => {
    const tag = c.active ? '' : ` ${ctx.md.italic(`[${ctx.t('courses.inactive')}]`)}`;
    return `${ctx.md.bold(c.name)} (id=${CourseId.toNumber(c.id)}) — ${c.code}${tag}`;
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
  const rubrics = fb.rubricAssessments ?? [];
  return [
    ctx.md.h4(ctx.t('feedback.header')),
    `${score}${pct}${released}${text}`,
    ...(rubrics.length > 0 ? [rubricAssessmentsToText(rubrics, ctx)] : []),
  ].join('\n\n');
}

function assignmentStatus(a: Assignment, ctx: OutputContext): string {
  if (a.submissionStatus === 'unknown') {
    return ctx.t(a.kind === 'group' ? 'assignments.status_unknown_group' : 'assignments.status_unknown');
  }
  return a.hasSubmission ? ctx.t('assignments.submitted') : ctx.t('assignments.not_submitted');
}

/** Due date, or the folder close date when D2L has no due date (EndDate only). */
function assignmentDue(a: Assignment, ctx: OutputContext): string {
  const dueDate = a.dueDate.toDate();
  if (dueDate) return ctx.formatDate(dueDate, 'datetime');
  if (a.endDate) return ctx.t('assignments.closes', { when: ctx.formatDate(a.endDate, 'datetime') });
  return ctx.t('assignments.no_due');
}

function assignmentMetadataLines(a: Assignment, ctx: OutputContext): string[] {
  const label = (key: string, value: string) => `${ctx.md.bold(ctx.t(key))}: ${value}`;
  const lines: string[] = [];
  const due = a.dueDate.toDate();
  if (due && a.endDate && a.endDate.getTime() !== due.getTime()) {
    lines.push(label('assignments.closes_label', ctx.formatDate(a.endDate, 'datetime')));
  }
  if (a.startDate) lines.push(label('assignments.opens', ctx.formatDate(a.startDate, 'datetime')));
  if (a.points !== null && a.points !== undefined) {
    lines.push(label('assignments.points', ctx.formatDecimal(a.points)));
  }
  if (a.kind === 'group') lines.push(label('assignments.kind', ctx.t('assignments.kind_group')));
  const types = a.allowedFileTypes;
  if (types?.mode === 'custom') {
    lines.push(label('assignments.file_types', types.extensions.join(', ')));
  } else if (types?.mode === 'restricted') {
    lines.push(label('assignments.file_types', ctx.t('assignments.file_types_restricted', { code: types.code })));
  }
  const links = a.linkAttachments ?? [];
  if (links.length > 0) {
    lines.push(label('assignments.links', links.map((l) => ctx.md.link(l.name, l.url)).join(', ')));
  }
  const rubrics = a.rubrics ?? [];
  if (rubrics.length > 0) {
    lines.push(label('assignments.rubric', rubrics.map((r) => ctx.t('assignments.rubric_hint', { name: r.name })).join('; ')));
  }
  return lines;
}

export function assignmentsToCompact(assignments: Assignment[], ctx: OutputContext): string {
  if (assignments.length === 0) return ctx.t('assignments.empty');
  const headers = [
    ctx.t('assignments.table_headers.name'),
    ctx.t('assignments.table_headers.due'),
    ctx.t('assignments.table_headers.status'),
  ];
  const rows = assignments.map((a) => [
    `${a.name} (id=${AssignmentId.toNumber(a.id)})`,
    assignmentDue(a, ctx),
    assignmentStatus(a, ctx),
  ]);
  return [ctx.md.h3(ctx.t('assignments.header')), ctx.md.table(headers, rows)].join('\n\n');
}

export function assignmentsToDetailed(assignments: Assignment[], ctx: OutputContext): string {
  if (assignments.length === 0) return ctx.t('assignments.empty');
  const blocks = assignments.map((a) => {
    const instructions = a.instructions
      ? `\n${ctx.md.bold(ctx.t('assignments.instructions'))}: ${a.instructions.replace(/\s+/g, ' ').slice(0, 200)}`
      : '';
    const lastSub =
      a.submissions.length > 0 ? a.submissions[a.submissions.length - 1]!.submittedAt : null;
    let subs: string;
    if (a.submissionStatus === 'unknown') {
      subs = ctx.t(a.kind === 'group' ? 'assignments.submissions_unknown_group' : 'assignments.submissions_unknown');
    } else if (a.submissions.length === 0) {
      subs = ctx.t('assignments.submissions_none');
    } else {
      subs = ctx.t('assignments.submissions_count', {
        count: a.submissions.length,
        when: ctx.formatDate(lastSub, 'datetime'),
      });
    }
    return [
      ctx.md.h4(`${a.name} (id=${AssignmentId.toNumber(a.id)})`),
      `${ctx.md.bold(ctx.t('assignments.table_headers.due'))}: ${assignmentDue(a, ctx)}`,
      ...assignmentMetadataLines(a, ctx),
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
  courseId?: number,
): string {
  if (modules.length === 0) return ctx.t('content.empty');
  const lines: string[] = [];
  const courseIdHint = courseId !== undefined ? `course_id=${courseId}, ` : '';
  let describedModules = 0;
  const walk = (mods: readonly Module[], level: number): void => {
    for (const m of mods) {
      const indent = '  '.repeat(level + 1);
      // Module descriptions often hold the actual material (links to PDFs,
      // embedded videos): show a short excerpt + the links they contain.
      const desc = summarizeDescription(m.descriptionHtml);
      lines.push(`${'  '.repeat(level)}- ${ctx.md.bold(m.title)}${desc ? ` (module_id=${m.id})` : ''}`);
      if (desc) {
        describedModules++;
        if (desc.excerpt && desc.excerpt !== m.title.trim()) lines.push(`${indent}${ctx.md.italic(desc.excerpt)}`);
        for (const link of desc.links) lines.push(`${indent}↳ ${link}`);
        if (desc.excerptTruncated || desc.hiddenLinks > 0) {
          const more = desc.hiddenLinks > 0 ? `+${desc.hiddenLinks} more link(s); ` : '';
          lines.push(`${indent}↳ (${more}full text: get_module(${courseIdHint}module_id=${m.id}))`);
        }
      }
      for (const topic of m.topics) {
        // D2L classifies some quicklinks (e.g. a Zoom link dropped into a
        // module) as 'other' rather than 'link', but the Url field is still
        // populated — show it whenever it's present, not just for kind='link'.
        const urlSuffix = topic.url ? ` — ${topic.url}` : '';
        const broken = topic.isBroken ? ' [broken]' : '';
        lines.push(
          `${indent}- ${topic.title} ${ctx.md.italic(`[${topic.kind}]`)} (id=${topic.id})${broken}${urlSuffix}`,
        );
      }
      if (level < depth) walk(m.submodules, level + 1);
    }
  };
  walk(modules, 0);
  const footer = describedModules > 0
    ? '\n\n_Read a module description in full with get_module(course_id, module_id); download linked /content/enforced/... files with get_course_file(course_id, path)._'
    : '';
  return [ctx.md.h3(ctx.t('content.header')), lines.join('\n')].join('\n\n') + footer;
}

export { announcementsToText, announcementToText } from './announcement-helpers.js';

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
    const hasRange = e.endAt !== null && e.endAt.getTime() !== e.startAt.getTime();
    let when: string;
    if (e.isAllDay) {
      const startDay = ctx.formatDate(e.startAt, 'short');
      const endDay = hasRange && e.endAt ? ctx.formatDate(e.endAt, 'short') : startDay;
      when = endDay !== startDay ? `${startDay} → ${endDay}` : startDay;
    } else {
      const start = ctx.formatDate(e.startAt, 'datetime');
      const end = hasRange && e.endAt
        ? ` → ${ctx.formatDate(e.endAt, 'datetime').split(',').slice(-1)[0]?.trim() ?? ''}`
        : '';
      when = `${start}${end}`;
    }
    const loc = e.location ? ` @ ${e.location}` : '';
    const desc = e.description
      ? ` — ${e.description.length > 160 ? `${e.description.slice(0, 157)}...` : e.description}`
      : '';
    return `${when} — ${ctx.md.bold(e.title)}${loc}${desc}`;
  });
  return [ctx.md.h3(ctx.t('calendar.title_window', { days })), ctx.md.bulletList(items)].join(
    '\n\n',
  );
}
