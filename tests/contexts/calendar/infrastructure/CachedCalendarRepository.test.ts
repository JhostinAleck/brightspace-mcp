import { describe, it, expect, vi } from 'vitest';
import { CachedCalendarRepository } from '@/contexts/calendar/infrastructure/CachedCalendarRepository';
import { FakeCalendarRepository } from '@tests/helpers/fakes/FakeCalendarRepository';
import { CalendarEvent } from '@/contexts/calendar/domain/CalendarEvent';
import { InMemoryCache } from '@/shared-kernel/cache/InMemoryCache';
import { OrgUnitId } from '@/shared-kernel/types/OrgUnitId';

describe('CachedCalendarRepository', () => {
  it('caches events by (course, from, to) window', async () => {
    const e = new CalendarEvent({ id: 1, courseOrgUnitId: 101, title: 'E', description: null, startAt: new Date('2026-05-01'), endAt: null, location: null });
    const inner = new FakeCalendarRepository(new Map([[101, [e]]]));
    const spy = vi.spyOn(inner, 'findEvents');
    const repo = new CachedCalendarRepository(inner, new InMemoryCache(), { ttlMs: 60_000 });
    const from = new Date('2026-04-01');
    const to = new Date('2026-06-01');
    await repo.findEvents(OrgUnitId.of(101), from, to);
    await repo.findEvents(OrgUnitId.of(101), from, to);
    expect(spy).toHaveBeenCalledTimes(1);
  });

  it('caches separately for different windows', async () => {
    const inner = new FakeCalendarRepository();
    const spy = vi.spyOn(inner, 'findEvents');
    const repo = new CachedCalendarRepository(inner, new InMemoryCache(), { ttlMs: 60_000 });
    await repo.findEvents(OrgUnitId.of(101), new Date('2026-04-01'), new Date('2026-05-01'));
    await repo.findEvents(OrgUnitId.of(101), new Date('2026-05-01'), new Date('2026-06-01'));
    expect(spy).toHaveBeenCalledTimes(2);
  });

  it('reuses the cache for "now"-based windows that differ only by milliseconds within a day', async () => {
    const inner = new FakeCalendarRepository();
    const spy = vi.spyOn(inner, 'findEvents');
    const repo = new CachedCalendarRepository(inner, new InMemoryCache(), { ttlMs: 60_000 });
    await repo.findEvents(OrgUnitId.of(101), new Date('2026-09-27T15:00:00.123Z'), new Date('2026-12-26T15:00:00.123Z'));
    await repo.findEvents(OrgUnitId.of(101), new Date('2026-09-27T15:02:07.456Z'), new Date('2026-12-26T15:02:07.456Z'));
    expect(spy).toHaveBeenCalledTimes(1);
  });

  it('still returns only events inside the exact requested window', async () => {
    const mk = (id: number, iso: string) => new CalendarEvent({ id, courseOrgUnitId: 101, title: `E${id}`, description: null, startAt: new Date(iso), endAt: null, location: null });
    const inner = new FakeCalendarRepository(new Map([[101, [
      mk(1, '2026-09-27T08:00:00Z'), // same day, before `from`
      mk(2, '2026-09-27T20:00:00Z'),
      mk(3, '2026-10-01T23:00:00Z'), // same day as `to`, after it
    ]]]));
    const repo = new CachedCalendarRepository(inner, new InMemoryCache(), { ttlMs: 60_000 });
    const events = await repo.findEvents(OrgUnitId.of(101), new Date('2026-09-27T15:00:00Z'), new Date('2026-10-01T12:00:00Z'));
    expect(events.map((e) => e.id)).toEqual([2]);
  });
});
