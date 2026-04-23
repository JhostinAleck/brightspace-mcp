import type { CalendarRepository } from '@/contexts/calendar/domain/CalendarRepository.js';
import { CalendarEvent } from '@/contexts/calendar/domain/CalendarEvent.js';
import type { D2lApiClient } from '@/contexts/http-api/D2lApiClient.js';
import { OrgUnitId } from '@/shared-kernel/types/OrgUnitId.js';

interface CalendarEventDto {
  Id: number;
  Name: string;
  Description?: { Text?: string | null; Html?: string | null } | null;
  StartDate: string;
  EndDate?: string | null;
  Location?: string | null;
}

export interface D2lCalendarRepositoryOptions { le: string; }

export class D2lCalendarRepository implements CalendarRepository {
  constructor(
    private readonly client: D2lApiClient,
    private readonly versions: D2lCalendarRepositoryOptions,
  ) {}

  async findEvents(courseId: OrgUnitId, from: Date, to: Date): Promise<CalendarEvent[]> {
    const orgUnit = OrgUnitId.toNumber(courseId);
    const qs = `rangeStart=${from.toISOString()}&rangeEnd=${to.toISOString()}`;
    const dtos = await this.client.get<CalendarEventDto[]>(
      `/d2l/api/le/${this.versions.le}/${orgUnit}/calendar/events/?${qs}`,
    );
    return dtos.map((dto) => new CalendarEvent({
      id: dto.Id,
      courseOrgUnitId: orgUnit,
      title: dto.Name,
      description: dto.Description?.Text ?? null,
      startAt: new Date(dto.StartDate),
      endAt: dto.EndDate ? new Date(dto.EndDate) : null,
      location: dto.Location ?? null,
    }));
  }
}
