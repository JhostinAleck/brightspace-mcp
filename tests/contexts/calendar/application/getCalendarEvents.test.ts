import { describe, it, expect } from 'vitest';
import { getCalendarEvents } from '@/contexts/calendar/application/getCalendarEvents';
import { CalendarEvent } from '@/contexts/calendar/domain/CalendarEvent';
import { FakeCalendarRepository } from '@tests/helpers/fakes/FakeCalendarRepository';
import { OrgUnitId } from '@/shared-kernel/types/OrgUnitId';

describe('getCalendarEvents', () => {
  it('returns events inside the window sorted by startAt', async () => {
    const e1 = new CalendarEvent({ id: 1, courseOrgUnitId: 101, title: 'Later', description: null, startAt: new Date('2026-05-05T10:00:00Z'), endAt: null, location: null });
    const e2 = new CalendarEvent({ id: 2, courseOrgUnitId: 101, title: 'Earlier', description: null, startAt: new Date('2026-05-01T10:00:00Z'), endAt: null, location: null });
    const repo = new FakeCalendarRepository(new Map([[101, [e1, e2]]]));
    const out = await getCalendarEvents({ repo, courseId: OrgUnitId.of(101), from: new Date('2026-04-01'), to: new Date('2026-06-01') });
    expect(out.map((x) => x.title)).toEqual(['Earlier', 'Later']);
  });
});
