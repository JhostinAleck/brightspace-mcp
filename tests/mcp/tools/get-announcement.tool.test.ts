import { describe, it, expect, afterEach } from 'vitest';
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { handleGetAnnouncement } from '@/mcp/tools/get-announcement.tool';
import { FakeCommunicationsRepository } from '@tests/helpers/fakes/FakeCommunicationsRepository';
import { Announcement } from '@/contexts/communications/domain/Announcement';
import { testOutputContext } from '../../helpers/test-output-context.js';

const BODY =
  '<p>Dear students,</p><p>the midterm is on <strong>Friday</strong> &amp; covers units 1&ndash;3.</p>' +
  '<ul><li>Bring your ID</li><li>No phones</li></ul>' +
  '<p>Room list <a href="https://example.edu/rooms?d2lSessionVal=abc">here</a>.</p>' +
  `<p>${'Long paragraph. '.repeat(150)}END-MARKER</p>`;

const ann = new Announcement({
  id: 777, courseOrgUnitId: 101, title: 'Midterm next week', html: BODY, authorName: 'Instructor Two',
  postedAt: new Date('2026-04-20T12:00:00Z'), pinned: false,
  attachments: [{ id: 55, name: 'notes.txt', size: 2048 }],
});

const makeRepo = () =>
  new FakeCommunicationsRepository(new Map([[101, [ann]]]), new Map(), new Map([['101/777/55', Buffer.from('Room A: groups 1-3\nRoom B: groups 4-6\n')]]));
const deps = (repo = makeRepo()) => ({ communicationsRepo: repo, output: testOutputContext() });

let tmp: string | null = null;
afterEach(() => { if (tmp) rmSync(tmp, { recursive: true, force: true }); tmp = null; });

describe('get_announcement tool', () => {
  it('returns the full body as clean text with links and line breaks preserved', async () => {
    const r = await handleGetAnnouncement(deps(), { course_id: 101, announcement_id: 777 });
    const text = r.content.map((c) => ('text' in c ? c.text : '')).join('\n');
    expect(text).toContain('Midterm next week');
    expect(text).toContain('Instructor Two');
    expect(text).toContain('the midterm is on Friday & covers units 1–3.');
    expect(text).toContain('- Bring your ID\n- No phones');
    expect(text).toContain('here (https://example.edu/rooms)');
    expect(text).toContain('END-MARKER');
    expect(text).not.toContain('<p>');
  });

  it('lists attachments with the call to read each one', async () => {
    const r = await handleGetAnnouncement(deps(), { course_id: 101, announcement_id: 777 });
    const text = r.content.map((c) => ('text' in c ? c.text : '')).join('\n');
    expect(text).toContain('notes.txt (2 KB)');
    expect(text).toContain('get_announcement(course_id=101, announcement_id=777, attachment_id=55)');
  });

  it('reads an attachment through the shared extractor', async () => {
    const r = await handleGetAnnouncement(deps(), { course_id: 101, announcement_id: 777, attachment_id: 55 });
    const text = r.content.map((c) => ('text' in c ? c.text : '')).join('\n');
    expect(text).toContain('Room A: groups 1-3');
  });

  it('saves an attachment when save_to is given', async () => {
    tmp = mkdtempSync(join(tmpdir(), 'ann-'));
    const target = join(tmp, 'notes.txt');
    const r = await handleGetAnnouncement(deps(), { course_id: 101, announcement_id: 777, attachment_id: 55, save_to: target });
    expect(readFileSync(target, 'utf8')).toContain('Room B');
    expect(r.content.map((c) => ('text' in c ? c.text : '')).join('\n')).toContain('[Saved to:');
  });

  it('explains when the announcement or the attachment does not exist', async () => {
    const missing = await handleGetAnnouncement(deps(), { course_id: 101, announcement_id: 1 });
    expect(missing.content[0]).toMatchObject({ type: 'text' });
    expect((missing.content[0] as { text: string }).text).toMatch(/not found.*get_announcements/i);
    const noAtt = await handleGetAnnouncement(deps(), { course_id: 101, announcement_id: 777, attachment_id: 99 });
    expect((noAtt.content[0] as { text: string }).text).toContain('attachment_id=55');
  });

  it('rejects save_to without attachment_id', async () => {
    await expect(handleGetAnnouncement(deps(), { course_id: 101, announcement_id: 777, save_to: '/tmp/x' })).rejects.toThrow();
  });
});
