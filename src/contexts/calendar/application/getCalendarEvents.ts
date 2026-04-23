import type { CalendarRepository } from '@/contexts/calendar/domain/CalendarRepository.js';
import type { CalendarEvent } from '@/contexts/calendar/domain/CalendarEvent.js';
import type { OrgUnitId } from '@/shared-kernel/types/OrgUnitId.js';

export interface GetCalendarEventsInput {
  repo: CalendarRepository;
  courseId: OrgUnitId;
  from: Date;
  to: Date;
}

export async function getCalendarEvents(input: GetCalendarEventsInput): Promise<CalendarEvent[]> {
  const events = await input.repo.findEvents(input.courseId, input.from, input.to);
  return events.slice().sort((a, b) => a.startAt.getTime() - b.startAt.getTime());
}
