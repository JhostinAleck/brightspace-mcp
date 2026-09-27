import { z } from 'zod';
import type { CommunicationsRepository } from '@/contexts/communications/domain/CommunicationsRepository.js';
import { getAnnouncement } from '@/contexts/communications/application/getAnnouncement.js';
import { readAnnouncementAttachment } from '@/contexts/communications/application/readAnnouncementAttachment.js';
import { announcementToText } from '@/mcp/announcement-helpers.js';
import { extractedToMcpContent, saveBufferToDisk, type McpContentBlock } from '@/mcp/file-content.js';
import { extractFileContent } from '@/shared-kernel/extract/extractFileContent.js';
import { OrgUnitId } from '@/shared-kernel/types/OrgUnitId.js';
import type { OutputContext } from '@/shared-kernel/output/index.js';

export const getAnnouncementSchema = z
  .object({
    course_id: z.number().int().positive(),
    announcement_id: z.number().int().positive(),
    attachment_id: z.number().int().positive().optional(),
    save_to: z.string().min(1).optional(),
  })
  .strict();

export interface GetAnnouncementDeps { communicationsRepo: CommunicationsRepository; output: OutputContext; }

const text = (t: string): { content: McpContentBlock[] } => ({ content: [{ type: 'text', text: t }] });

function notFound(courseId: number, announcementId: number): { content: McpContentBlock[] } {
  return text(
    `Announcement ${announcementId} not found in course ${courseId} (it may be hidden or deleted). ` +
      `Use get_announcements(course_id=${courseId}) to list the current ones.`,
  );
}

export async function handleGetAnnouncement(deps: GetAnnouncementDeps, rawInput: unknown) {
  const input = getAnnouncementSchema.parse(rawInput);
  if (input.save_to !== undefined && input.attachment_id === undefined) {
    throw new Error('save_to requires attachment_id (it saves an attachment file).');
  }
  const courseId = OrgUnitId.of(input.course_id);

  if (input.attachment_id === undefined) {
    const a = await getAnnouncement({ repo: deps.communicationsRepo, courseId, announcementId: input.announcement_id });
    if (!a) return notFound(input.course_id, input.announcement_id);
    const footer = deps.output.metaFooter();
    const body = announcementToText(a, deps.output);
    return text(footer ? `${body}\n\n${footer}` : body);
  }

  const r = await readAnnouncementAttachment({
    repo: deps.communicationsRepo,
    courseId,
    announcementId: input.announcement_id,
    attachmentId: input.attachment_id,
  });
  if (r.status === 'announcement_not_found') return notFound(input.course_id, input.announcement_id);
  if (r.status === 'attachment_not_found') {
    const ids = r.announcement.attachments.map((f) => `${f.name} (attachment_id=${f.id})`);
    return text(
      `Announcement ${input.announcement_id} has no attachment ${input.attachment_id}. ` +
        (ids.length > 0 ? `Its attachments: ${ids.join(', ')}.` : 'It has no attachments.'),
    );
  }

  const notes: string[] = [];
  if (input.save_to) notes.push(`[Saved to: ${saveBufferToDisk(r.content, input.save_to)}]`);
  const extracted = await extractFileContent(r.content, { filename: r.attachment.name });
  return { content: extractedToMcpContent(extracted, { notes }) };
}
