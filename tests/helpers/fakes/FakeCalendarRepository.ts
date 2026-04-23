import type { CalendarRepository } from '@/contexts/calendar/domain/CalendarRepository.js';
import type { CalendarEvent } from '@/contexts/calendar/domain/CalendarEvent.js';
import { OrgUnitId } from '@/shared-kernel/types/OrgUnitId.js';

export class FakeCalendarRepository implements CalendarRepository {
  constructor(private readonly byCourse: Map<number, CalendarEvent[]> = new Map()) {}

  async findEvents(courseId: OrgUnitId, from: Date, to: Date): Promise<CalendarEvent[]> {
    const all = this.byCourse.get(OrgUnitId.toNumber(courseId)) ?? [];
    return all.filter((e) => {
      const t = e.startAt.getTime();
      return t >= from.getTime() && t <= to.getTime();
    });
  }
}
