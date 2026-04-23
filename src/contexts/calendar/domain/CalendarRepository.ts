import type { CalendarEvent } from './CalendarEvent.js';
import type { OrgUnitId } from '@/shared-kernel/types/OrgUnitId.js';

export interface CalendarRepository {
  findEvents(courseId: OrgUnitId, from: Date, to: Date): Promise<CalendarEvent[]>;
}
