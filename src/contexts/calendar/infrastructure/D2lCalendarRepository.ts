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
    const parseDate = (s: string | null | undefined): Date | null => {
      if (!s) return null;
      const d = new Date(s);
      return Number.isNaN(d.getTime()) ? null : d;
    };
    return dtos
      .map((dto) => {
        const startAt = parseDate(dto.StartDate);
        if (!startAt) return null;
        return new CalendarEvent({
          id: dto.Id,
          courseOrgUnitId: orgUnit,
          title: dto.Name,
          description: dto.Description?.Text ?? null,
          startAt,
          endAt: parseDate(dto.EndDate),
          location: dto.Location ?? null,
        });
      })
      .filter((e): e is CalendarEvent => e !== null);
  }
}
