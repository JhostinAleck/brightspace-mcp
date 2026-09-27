import { describe, it, expect, afterEach, beforeEach } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import nock from 'nock';
import { D2lCalendarRepository } from '@/contexts/calendar/infrastructure/D2lCalendarRepository';
import { D2lApiClient } from '@/contexts/http-api/D2lApiClient';
import { AccessToken } from '@/contexts/authentication/domain/AccessToken';
import { OrgUnitId } from '@/shared-kernel/types/OrgUnitId';

const BASE = 'https://x.com';
const load = (name: string) =>
  JSON.parse(readFileSync(resolve(__dirname, `../../../fixtures/calendar/${name}`), 'utf-8'));
const page1 = load('my-events-page1.json');
const page2 = load('my-events-page2.json');

const FROM = new Date('2026-04-01T00:00:00.000Z');
const TO = new Date('2026-06-01T00:00:00.000Z');

function makeRepo(): D2lCalendarRepository {
  const client = new D2lApiClient({ baseUrl: BASE, getToken: async () => AccessToken.bearer('t') });
  return new D2lCalendarRepository(client, { le: '1.91' });
}

beforeEach(() => nock.disableNetConnect());
afterEach(() => { nock.cleanAll(); nock.enableNetConnect(); });

describe('D2lCalendarRepository', () => {
  it('queries myEvents with startDateTime/endDateTime (ISO) and follows Next pages', async () => {
    const first = nock(BASE)
      .get('/d2l/api/le/1.91/101/calendar/events/myEvents/')
      .query({ startDateTime: FROM.toISOString(), endDateTime: TO.toISOString() })
      .reply(200, page1);
    const second = nock(BASE)
      .get('/d2l/api/le/1.91/101/calendar/events/myEvents/')
      .query({ startDateTime: FROM.toISOString(), endDateTime: TO.toISOString(), bookmark: '900002' })
      .reply(200, page2);
    const out = await makeRepo().findEvents(OrgUnitId.of(101), FROM, TO);
    expect(first.isDone()).toBe(true);
    expect(second.isDone()).toBe(true);
    // 3 valid events; the one with neither StartDateTime nor StartDay is dropped.
    expect(out.map((e) => e.id).sort()).toEqual([900001, 900002, 900003]);
  });

  it('maps Title / StartDateTime / EndDateTime / LocationName and strips HTML from Description', async () => {
    nock(BASE).get('/d2l/api/le/1.91/101/calendar/events/myEvents/').query(true).reply(200, { ...page1, Next: null });
    const out = await makeRepo().findEvents(OrgUnitId.of(101), FROM, TO);
    const midterm = out.find((e) => e.id === 900002);
    expect(midterm?.title).toBe('Midterm Exam');
    expect(midterm?.courseOrgUnitId).toBe(101);
    expect(midterm?.startAt.toISOString()).toBe('2026-05-01T14:00:00.000Z');
    expect(midterm?.endAt?.toISOString()).toBe('2026-05-01T16:00:00.000Z');
    expect(midterm?.location).toBe('Room B012');
    expect(midterm?.description).toBe('In-person, bring a pencil & ID.');
    expect(midterm?.isAllDay).toBe(false);

    const lab = out.find((e) => e.id === 900001);
    expect(lab?.location).toBeNull(); // "" → null
    expect(lab?.description).toBeNull(); // "" → null
  });

  it('maps all-day events from StartDay/EndDay', async () => {
    nock(BASE).get('/d2l/api/le/1.91/101/calendar/events/myEvents/').query(true).reply(200, page2);
    const out = await makeRepo().findEvents(OrgUnitId.of(101), FROM, TO);
    expect(out).toHaveLength(1);
    const ev = out[0]!;
    expect(ev.title).toBe('Reading week');
    expect(ev.isAllDay).toBe(true);
    expect(ev.startAt.toISOString().slice(0, 10)).toBe('2026-04-20');
    expect(ev.endAt?.toISOString().slice(0, 10)).toBe('2026-04-24');
  });

  it('falls back to /calendar/events/ (bare array, no date filtering server-side) when myEvents is 404', async () => {
    nock(BASE).get('/d2l/api/le/1.91/101/calendar/events/myEvents/').query(true).reply(404, 'Not Found');
    nock(BASE).get('/d2l/api/le/1.91/101/calendar/events/').reply(200, [
      ...page1.Objects,
      { ...page1.Objects[0], CalendarEventId: 900099, Title: 'Last semester', StartDateTime: '2025-02-07T17:30:00.000Z', EndDateTime: '2025-02-07T17:30:00.000Z' },
    ]);
    const out = await makeRepo().findEvents(OrgUnitId.of(101), FROM, TO);
    expect(out.map((e) => e.id).sort()).toEqual([900001, 900002]);
  });

  it('filters events outside the window defensively', async () => {
    nock(BASE).get('/d2l/api/le/1.91/101/calendar/events/myEvents/').query(true).reply(200, {
      Objects: [{ ...page1.Objects[0], StartDateTime: '2027-01-01T00:00:00.000Z', EndDateTime: '2027-01-01T00:00:00.000Z' }],
      Next: null,
    });
    expect(await makeRepo().findEvents(OrgUnitId.of(101), FROM, TO)).toEqual([]);
  });
});
