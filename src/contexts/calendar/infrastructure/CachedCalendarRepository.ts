import type { CalendarRepository } from '@/contexts/calendar/domain/CalendarRepository.js';
import { CalendarEvent } from '@/contexts/calendar/domain/CalendarEvent.js';
import { OrgUnitId } from '@/shared-kernel/types/OrgUnitId.js';
import type { Cache } from '@/shared-kernel/cache/Cache.js';

export interface CachedCalendarRepositoryTtls {
  ttlMs: number;
}

const PREFIX = 'calendar:';
const DAY_MS = 24 * 60 * 60 * 1000;

interface EventPlain {
  id: number;
  courseOrgUnitId: number;
  title: string;
  description: string | null;
  startAtIso: string;
  endAtIso: string | null;
  location: string | null;
  isAllDay?: boolean;
}

function toPlain(e: CalendarEvent): EventPlain {
  return {
    id: e.id,
    courseOrgUnitId: e.courseOrgUnitId,
    title: e.title,
    description: e.description,
    startAtIso: e.startAt.toISOString(),
    endAtIso: e.endAt ? e.endAt.toISOString() : null,
    location: e.location,
    isAllDay: e.isAllDay,
  };
}

function fromPlain(p: EventPlain): CalendarEvent {
  return new CalendarEvent({
    id: p.id,
    courseOrgUnitId: p.courseOrgUnitId,
    title: p.title,
    description: p.description,
    startAt: new Date(p.startAtIso),
    endAt: p.endAtIso ? new Date(p.endAtIso) : null,
    location: p.location,
    isAllDay: p.isAllDay ?? false,
  });
}

export class CachedCalendarRepository implements CalendarRepository {
  constructor(
    private readonly inner: CalendarRepository,
    private readonly cache: Cache,
    private readonly ttls: CachedCalendarRepositoryTtls,
  ) {}

  async findEvents(courseId: OrgUnitId, from: Date, to: Date): Promise<CalendarEvent[]> {
    // Callers pass "now"-based windows, so exact timestamps never repeat.
    // Cache the enclosing whole-day (UTC) window instead and filter to the
    // exact range, so every call on the same day shares one entry.
    const dayFrom = new Date(Math.floor(from.getTime() / DAY_MS) * DAY_MS);
    const dayTo = new Date(Math.ceil(to.getTime() / DAY_MS) * DAY_MS);
    const key = `${PREFIX}${OrgUnitId.toNumber(courseId)}:${dayFrom.toISOString()}:${dayTo.toISOString()}`;
    const cached = await this.cache.get<EventPlain[]>(key);
    let events: CalendarEvent[];
    if (cached) {
      events = cached.map(fromPlain);
    } else {
      events = await this.inner.findEvents(courseId, dayFrom, dayTo);
      await this.cache.set(key, events.map(toPlain), this.ttls.ttlMs);
    }
    return events.filter((e) => e.startAt >= from && e.startAt <= to);
  }
}
