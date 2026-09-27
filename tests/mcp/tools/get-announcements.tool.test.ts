import { describe, it, expect } from 'vitest';
import { handleGetAnnouncements } from '@/mcp/tools/get-announcements.tool';
import { FakeCommunicationsRepository } from '@tests/helpers/fakes/FakeCommunicationsRepository';
import { Announcement } from '@/contexts/communications/domain/Announcement';
import { testOutputContext } from '../../helpers/test-output-context.js';

const LONG_HTML =
  '<p>Parcial 1 &ndash; instrucciones:</p><p>' +
  'Lleguen 15 minutos antes al sal&oacute;n asignado y traigan su carn&eacute;. '.repeat(20) +
  '</p><p>FIN-DEL-TEXTO</p>';

describe('get_announcements tool', () => {
  it('formats announcements in reverse chronological order', async () => {
    const repo = new FakeCommunicationsRepository(new Map([[101, [
      new Announcement({ id: 1, courseOrgUnitId: 101, title: 'First', html: '<p>body</p>', authorName: 'Prof', postedAt: new Date('2026-04-19') }),
      new Announcement({ id: 2, courseOrgUnitId: 101, title: 'Second', html: null, authorName: null, postedAt: new Date('2026-04-22') }),
    ]]]));
    const r = await handleGetAnnouncements({ communicationsRepo: repo, output: testOutputContext() }, { course_id: 101 });
    const text = r.content[0]?.text ?? '';
    expect(text.indexOf('Second')).toBeLessThan(text.indexOf('First'));
  });

  it('respects limit and says how many exist', async () => {
    const repo = new FakeCommunicationsRepository(new Map([[101, [
      new Announcement({ id: 1, courseOrgUnitId: 101, title: 'A', html: null, authorName: null, postedAt: new Date('2026-04-22') }),
      new Announcement({ id: 2, courseOrgUnitId: 101, title: 'B', html: null, authorName: null, postedAt: new Date('2026-04-21') }),
    ]]]));
    const r = await handleGetAnnouncements({ communicationsRepo: repo, output: testOutputContext() }, { course_id: 101, limit: 1 });
    const text = r.content[0]?.text ?? '';
    expect(text).toContain('**A**');
    expect(text).not.toContain('**B**');
    expect(text).toContain('showing 1 of 2');
  });

  it('accepts limits above 50 (courses can have more announcements)', async () => {
    const many = Array.from({ length: 58 }, (_, i) =>
      new Announcement({ id: i + 1, courseOrgUnitId: 101, title: `T${i + 1}`, html: null, authorName: null, postedAt: new Date(2026, 0, i + 1) }));
    const repo = new FakeCommunicationsRepository(new Map([[101, many]]));
    const r = await handleGetAnnouncements({ communicationsRepo: repo, output: testOutputContext() }, { course_id: 101, limit: 100 });
    const text = r.content[0]?.text ?? '';
    expect(text).toContain('**T1**');
    expect(text).toContain('**T58**');
    expect(text).not.toContain('showing');
  });

  it('shows a ~300 char decoded excerpt, marked truncated with how to get the full text', async () => {
    const repo = new FakeCommunicationsRepository(new Map([[482179, [
      new Announcement({ id: 396498, courseOrgUnitId: 482179, title: 'Parcial 1', html: LONG_HTML, authorName: 'Instructor Two', postedAt: new Date('2026-09-22') }),
    ]]]));
    const r = await handleGetAnnouncements({ communicationsRepo: repo, output: testOutputContext() }, { course_id: 482179 });
    const text = r.content[0]?.text ?? '';
    expect(text).toContain('(id=396498)');
    expect(text).toContain('Instructor Two');
    expect(text).toContain('Parcial 1 – instrucciones: Lleguen 15 minutos antes al salón asignado y traigan su carné.');
    expect(text).not.toContain('&oacute;');
    expect(text).not.toContain('FIN-DEL-TEXTO');
    expect(text).toContain('get_announcement(course_id=482179, announcement_id=396498)');
    const excerptLine = text.split('\n').find((l) => l.includes('Lleguen')) ?? '';
    expect(excerptLine.length).toBeGreaterThan(250);
    expect(excerptLine.length).toBeLessThan(500);
  });

  it('does not mark short bodies as truncated', async () => {
    const repo = new FakeCommunicationsRepository(new Map([[101, [
      new Announcement({ id: 5, courseOrgUnitId: 101, title: 'Short', html: '<p>See you Friday.</p>', authorName: null, postedAt: new Date('2026-04-22') }),
    ]]]));
    const r = await handleGetAnnouncements({ communicationsRepo: repo, output: testOutputContext() }, { course_id: 101 });
    const text = r.content[0]?.text ?? '';
    expect(text).toContain('See you Friday.');
    expect(text).not.toContain('get_announcement(');
  });

  it('lists attachments and flags pinned items', async () => {
    const repo = new FakeCommunicationsRepository(new Map([[101, [
      new Announcement({
        id: 9, courseOrgUnitId: 101, title: 'Rooms', html: '<p>x</p>', authorName: null, postedAt: new Date('2026-04-22'),
        pinned: true, attachments: [{ id: 16554181, name: 'Exam logistics.pdf', size: 206273 }],
      }),
    ]]]));
    const r = await handleGetAnnouncements({ communicationsRepo: repo, output: testOutputContext() }, { course_id: 101 });
    const text = r.content[0]?.text ?? '';
    expect(text).toContain('[Pinned]');
    expect(text).toContain('Exam logistics.pdf (201 KB, attachment_id=16554181)');
  });
});
