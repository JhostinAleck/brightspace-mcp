import type { CalendarRepository } from '@/contexts/calendar/domain/CalendarRepository.js';
import { CalendarEvent } from '@/contexts/calendar/domain/CalendarEvent.js';
import { OrgUnitId } from '@/shared-kernel/types/OrgUnitId.js';
import type { Cache } from '@/shared-kernel/cache/Cache.js';

export interface CachedCalendarRepositoryTtls {
  ttlMs: number;
}

const PREFIX = 'calendar:';

interface EventPlain {
  id: number;
  courseOrgUnitId: number;
  title: string;
  description: string | null;
  startAtIso: string;
  endAtIso: string | null;
  location: string | null;
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
  });
}

export class CachedCalendarRepository implements CalendarRepository {
  constructor(
    private readonly inner: CalendarRepository,
    private readonly cache: Cache,
    private readonly ttls: CachedCalendarRepositoryTtls,
  ) {}

  async findEvents(courseId: OrgUnitId, from: Date, to: Date): Promise<CalendarEvent[]> {
    const key = `${PREFIX}${OrgUnitId.toNumber(courseId)}:${from.toISOString()}:${to.toISOString()}`;
    const cached = await this.cache.get<EventPlain[]>(key);
    if (cached) return cached.map(fromPlain);
    const fresh = await this.inner.findEvents(courseId, from, to);
    await this.cache.set(key, fresh.map(toPlain), this.ttls.ttlMs);
    return fresh;
  }
}
