import { describe, it, expect, afterEach, beforeAll } from 'vitest';
import { warmPdfParser } from '@tests/helpers/zip';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import nock from 'nock';
import { D2lCommunicationsRepository } from '@/contexts/communications/infrastructure/D2lCommunicationsRepository.js';
import { D2lApiClient } from '@/contexts/http-api/D2lApiClient.js';
import { AccessToken } from '@/contexts/authentication/domain/AccessToken.js';
import { OrgUnitId } from '@/shared-kernel/types/OrgUnitId.js';

beforeAll(warmPdfParser, 60_000);

const BASE = 'https://x.com';
const announcementsFixture = JSON.parse(
  readFileSync(resolve(__dirname, '../../../fixtures/announcements/happy-path.json'), 'utf-8'),
);
const classlistFixture = JSON.parse(
  readFileSync(resolve(__dirname, '../../../fixtures/announcements/classlist.json'), 'utf-8'),
);
const forumsFixture = JSON.parse(
  readFileSync(resolve(__dirname, '../../../fixtures/discussions/forums.json'), 'utf-8'),
);

afterEach(() => nock.cleanAll());

describe('D2lCommunicationsRepository', () => {
  const makeRepo = () => {
    const client = new D2lApiClient({ baseUrl: BASE, getToken: async () => AccessToken.bearer('t') });
    return new D2lCommunicationsRepository(client, { le: '1.91' });
  };

  it('findAnnouncements parses the real news shape and drops hidden items', async () => {
    nock(BASE).get('/d2l/api/le/1.91/101/news/').reply(200, announcementsFixture);
    nock(BASE).get('/d2l/api/le/1.91/101/classlist/').reply(200, classlistFixture);
    const out = await makeRepo().findAnnouncements(OrgUnitId.of(101));
    expect(out.map((a) => a.id)).toEqual([777, 778, 780]);
    const midterm = out[0]!;
    expect(midterm.title).toBe('Midterm next week');
    expect(midterm.html).toContain('<strong>Friday</strong>');
    expect(midterm.postedAt.toISOString()).toBe('2026-04-20T12:00:00.000Z');
    expect(midterm.pinned).toBe(false);
    expect(midterm.attachments).toEqual([{ id: 16554181, name: 'Exam logistics.pdf', size: 206273 }]);
    expect(out[1]?.pinned).toBe(true);
  });

  it('resolves CreatedBy to a display name via the classlist, never exposing raw ids', async () => {
    nock(BASE).get('/d2l/api/le/1.91/101/news/').reply(200, announcementsFixture);
    nock(BASE).get('/d2l/api/le/1.91/101/classlist/').reply(200, classlistFixture);
    const out = await makeRepo().findAnnouncements(OrgUnitId.of(101));
    expect(out[0]?.authorName).toBe('Instructor Two');
    expect(out[1]?.authorName).toBeNull(); // IsAuthorInfoShown: false
    expect(out[2]?.authorName).toBeNull(); // not in the classlist
    expect(out[2]?.html).toBe('Plain text only.'); // falls back to Body.Text
  });

  it('caches the classlist per course and omits authors when it is forbidden', async () => {
    nock(BASE).get('/d2l/api/le/1.91/101/news/').twice().reply(200, announcementsFixture);
    const cl = nock(BASE).get('/d2l/api/le/1.91/101/classlist/').once().reply(403, { Errors: [] });
    const repo = makeRepo();
    const first = await repo.findAnnouncements(OrgUnitId.of(101));
    const second = await repo.findAnnouncements(OrgUnitId.of(101));
    expect(cl.isDone()).toBe(true);
    expect(first.every((a) => a.authorName === null)).toBe(true);
    expect(second.every((a) => a.authorName === null)).toBe(true);
  });

  it('findAnnouncement fetches one news item; null when missing or hidden', async () => {
    nock(BASE).get('/d2l/api/le/1.91/101/news/777').reply(200, announcementsFixture[0]);
    nock(BASE).get('/d2l/api/le/1.91/101/classlist/').reply(200, classlistFixture);
    nock(BASE).get('/d2l/api/le/1.91/101/news/404').reply(404, {});
    nock(BASE).get('/d2l/api/le/1.91/101/news/779').reply(200, announcementsFixture[2]);
    const repo = makeRepo();
    const one = await repo.findAnnouncement(OrgUnitId.of(101), 777);
    expect(one?.title).toBe('Midterm next week');
    expect(one?.authorName).toBe('Instructor Two');
    expect(await repo.findAnnouncement(OrgUnitId.of(101), 404)).toBeNull();
    expect(await repo.findAnnouncement(OrgUnitId.of(101), 779)).toBeNull();
  });

  it('downloadAnnouncementAttachment GETs the Valence attachment route', async () => {
    nock(BASE)
      .get('/d2l/api/le/1.91/101/news/777/attachments/16554181')
      .reply(200, Buffer.from('%PDF-1.7 fake'));
    const buf = await makeRepo().downloadAnnouncementAttachment(OrgUnitId.of(101), 777, 16554181);
    expect(buf.toString('latin1').startsWith('%PDF')).toBe(true);
  });

  it('findDiscussions fetches forums then topics', async () => {
    nock(BASE).get('/d2l/api/le/1.91/101/discussions/forums/').reply(200, forumsFixture.forums);
    nock(BASE)
      .get('/d2l/api/le/1.91/101/discussions/forums/500/topics/')
      .reply(200, forumsFixture.topics_500);
    const client = new D2lApiClient({ baseUrl: BASE, getToken: async () => AccessToken.bearer('t') });
    const repo = new D2lCommunicationsRepository(client, { le: '1.91' });
    const out = await repo.findDiscussions(OrgUnitId.of(101));
    expect(out).toHaveLength(1);
    expect(out[0]?.topics[0]?.name).toBe('Q&A');
    expect(out[0]?.topics[0]?.postCount).toBe(42);
  });
});
