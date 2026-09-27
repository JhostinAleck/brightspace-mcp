import type { OutputContext } from '@/shared-kernel/output/index.js';
import type { Announcement, AnnouncementAttachment } from '@/contexts/communications/domain/Announcement.js';
import { htmlToPlainText, htmlToText } from '@/shared-kernel/text/htmlLinks.js';

/** Characters of body text shown per announcement in the list view. */
export const ANNOUNCEMENT_EXCERPT_CHARS = 300;

export function formatFileSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function excerpt(text: string, max: number): { text: string; truncated: boolean } {
  if (text.length <= max) return { text, truncated: false };
  const cut = text.slice(0, max);
  const lastSpace = cut.lastIndexOf(' ');
  return { text: `${(lastSpace > max * 0.6 ? cut.slice(0, lastSpace) : cut).trimEnd()}…`, truncated: true };
}

function metaLine(a: Announcement, ctx: OutputContext): string {
  const pin = a.pinned ? ` ${ctx.md.italic(`[${ctx.t('announcements.pinned')}]`)}` : '';
  return `${[ctx.formatDate(a.postedAt), a.authorName].filter(Boolean).join(' · ')}${pin}`;
}

function fullTextCall(a: Announcement, attachment?: AnnouncementAttachment): string {
  const att = attachment ? `, attachment_id=${attachment.id}` : '';
  return `get_announcement(course_id=${a.courseOrgUnitId}, announcement_id=${a.id}${att})`;
}

export interface AnnouncementsToTextOptions {
  /** How many announcements exist in total (before `limit`). */
  total?: number;
}

/**
 * Compact list: title, id, date/author, a ~300 char excerpt (marked when
 * truncated, with the call that returns the full text) and attachments.
 */
export function announcementsToText(
  items: Announcement[],
  ctx: OutputContext,
  opts: AnnouncementsToTextOptions = {},
): string {
  if (items.length === 0) return ctx.t('announcements.empty');
  const total = opts.total ?? items.length;
  const header =
    total > items.length
      ? `${ctx.t('announcements.header')} (${ctx.t('announcements.showing', { shown: items.length, total })})`
      : ctx.t('announcements.header');
  const blocks = items.map((a) => {
    const lines = [`- ${ctx.md.bold(a.title)} (id=${a.id}) — ${metaLine(a, ctx)}`];
    const body = a.html ? htmlToPlainText(a.html) : '';
    if (body) {
      const ex = excerpt(body, ANNOUNCEMENT_EXCERPT_CHARS);
      const more = ex.truncated
        ? ` ${ctx.md.italic(`(truncated, ${body.length} chars; full text: ${fullTextCall(a)})`)}`
        : '';
      lines.push(`  ${ex.text}${more}`);
    }
    if (a.attachments.length > 0) {
      const files = a.attachments.map((f) => `${f.name} (${formatFileSize(f.size)}, attachment_id=${f.id})`);
      lines.push(`  ${ctx.t('announcements.attachments')}: ${files.join(', ')}`);
    }
    return lines.join('\n');
  });
  return [ctx.md.h3(header), blocks.join('\n')].join('\n\n');
}

/** One announcement in full: body as text with links kept, plus attachments. */
export function announcementToText(a: Announcement, ctx: OutputContext): string {
  const parts = [
    ctx.md.h3(a.title),
    `${metaLine(a, ctx)} (course_id=${a.courseOrgUnitId}, announcement_id=${a.id})`,
  ];
  const body = a.html ? htmlToText(a.html) : '';
  if (body) parts.push(body);
  if (a.attachments.length > 0) {
    const files = a.attachments.map(
      (f) => `- ${f.name} (${formatFileSize(f.size)}) — read with ${fullTextCall(a, f)}`,
    );
    parts.push(`${ctx.md.bold(`${ctx.t('announcements.attachments')}:`)}\n${files.join('\n')}`);
  }
  return parts.join('\n\n');
}
