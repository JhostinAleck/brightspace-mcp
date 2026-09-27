import { describe, it, expect } from 'vitest';
import { getAnnouncement } from '@/contexts/communications/application/getAnnouncement';
import { readAnnouncementAttachment } from '@/contexts/communications/application/readAnnouncementAttachment';
import { Announcement } from '@/contexts/communications/domain/Announcement';
import { FakeCommunicationsRepository } from '@tests/helpers/fakes/FakeCommunicationsRepository';
import { OrgUnitId } from '@/shared-kernel/types/OrgUnitId';

const ann = new Announcement({
  id: 7, courseOrgUnitId: 101, title: 'Exam', html: '<p>x</p>', authorName: null,
  postedAt: new Date('2026-04-20'), attachments: [{ id: 55, name: 'rooms.pdf', size: 3 }],
});
const repo = () =>
  new FakeCommunicationsRepository(new Map([[101, [ann]]]), new Map(), new Map([['101/7/55', Buffer.from('pdf')]]));

describe('getAnnouncement', () => {
  it('returns the announcement or null', async () => {
    expect((await getAnnouncement({ repo: repo(), courseId: OrgUnitId.of(101), announcementId: 7 }))?.title).toBe('Exam');
    expect(await getAnnouncement({ repo: repo(), courseId: OrgUnitId.of(101), announcementId: 8 })).toBeNull();
  });
});

describe('readAnnouncementAttachment', () => {
  it('downloads an attachment listed on the announcement', async () => {
    const r = await readAnnouncementAttachment({ repo: repo(), courseId: OrgUnitId.of(101), announcementId: 7, attachmentId: 55 });
    expect(r.status).toBe('ok');
    if (r.status !== 'ok') return;
    expect(r.attachment.name).toBe('rooms.pdf');
    expect(r.content.toString()).toBe('pdf');
  });

  it('reports a missing announcement or attachment without downloading', async () => {
    const f = repo();
    expect((await readAnnouncementAttachment({ repo: f, courseId: OrgUnitId.of(101), announcementId: 8, attachmentId: 55 })).status).toBe('announcement_not_found');
    const r = await readAnnouncementAttachment({ repo: f, courseId: OrgUnitId.of(101), announcementId: 7, attachmentId: 99 });
    expect(r.status).toBe('attachment_not_found');
  });
});
