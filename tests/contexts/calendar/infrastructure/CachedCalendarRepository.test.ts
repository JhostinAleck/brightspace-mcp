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
});
