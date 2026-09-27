import type { CalendarRepository } from '@/contexts/calendar/domain/CalendarRepository.js';
import { CalendarEvent } from '@/contexts/calendar/domain/CalendarEvent.js';
import type { D2lApiClient } from '@/contexts/http-api/D2lApiClient.js';
import { D2lApiError } from '@/contexts/http-api/errors.js';
import { fetchAllObjectListPages } from '@/contexts/http-api/pagination.js';
import { parseValidDate } from '@/shared-kernel/date/parseValidDate.js';
import { stripHtmlPreservingLinks } from '@/shared-kernel/text/stripHtml.js';
import { OrgUnitId } from '@/shared-kernel/types/OrgUnitId.js';

/**
 * D2L `EventDataInfo` (only the fields we read). Verified against a live
 * tenant (LE 1.99): `Title`, `StartDateTime`/`EndDateTime` (UTC ISO, null for
 * all-day events), `StartDay`/`EndDay` (calendar days for all-day events),
 * `Description` is a plain string that frequently contains HTML, and the
 * location is `LocationName` ("" when unset).
 */
interface CalendarEventDto {
  CalendarEventId?: number;
  OrgUnitId?: number;
  Title?: string | null;
  Description?: string | null;
  IsAllDayEvent?: boolean;
  StartDateTime?: string | null;
  EndDateTime?: string | null;
  StartDay?: string | null;
  EndDay?: string | null;
  LocationName?: string | null;
}

export interface D2lCalendarRepositoryOptions { le: string; }

/**
 * Parse an all-day `StartDay`/`EndDay` value. Anchored at 12:00 UTC so the
 * calendar day survives rendering in any timezone within ±11h.
 */
function parseDay(raw: string | null | undefined): Date | null {
  if (!raw) return null;
  const day = /^(\d{4}-\d{2}-\d{2})/.exec(raw)?.[1];
  return day ? parseValidDate(`${day}T12:00:00.000Z`) : null;
}

function nonEmpty(s: string | null | undefined): string | null {
  const trimmed = s?.trim();
  return trimmed ? trimmed : null;
}

/**
 * Endpoints (read-only):
 *   - GET /d2l/api/le/{ver}/{ou}/calendar/events/myEvents/?startDateTime&endDateTime
 *     ObjectListPage, filtered server-side to the window and to what the
 *     calling user can see. Primary.
 *   - GET /d2l/api/le/{ver}/{ou}/calendar/events/
 *     Bare array of every event in the org unit; it IGNORES date params, so we
 *     filter client-side. Fallback for tenants/versions without myEvents.
 */
export class D2lCalendarRepository implements CalendarRepository {
  constructor(
    private readonly client: D2lApiClient,
    private readonly versions: D2lCalendarRepositoryOptions,
  ) {}

  async findEvents(courseId: OrgUnitId, from: Date, to: Date): Promise<CalendarEvent[]> {
    const orgUnit = OrgUnitId.toNumber(courseId);
    const base = `/d2l/api/le/${this.versions.le}/${orgUnit}/calendar/events/`;
    let dtos: CalendarEventDto[];
    try {
      const qs = `startDateTime=${encodeURIComponent(from.toISOString())}&endDateTime=${encodeURIComponent(to.toISOString())}`;
      dtos = await fetchAllObjectListPages<CalendarEventDto>(this.client, `${base}myEvents/?${qs}`);
    } catch (err) {
      if (!(err instanceof D2lApiError && err.status === 404)) throw err;
      const all = await this.client.get<CalendarEventDto[] | null>(base);
      dtos = Array.isArray(all) ? all : [];
    }

    const fromMs = from.getTime();
    const toMs = to.getTime();
    return dtos
      .map((dto) => this.toEvent(dto, orgUnit))
      .filter((e): e is CalendarEvent => e !== null)
      .filter((e) => {
        const start = e.startAt.getTime();
        const end = (e.endAt ?? e.startAt).getTime();
        return start <= toMs && end >= fromMs;
      });
  }

  private toEvent(dto: CalendarEventDto, fallbackOrgUnit: number): CalendarEvent | null {
    if (typeof dto.CalendarEventId !== 'number') return null;
    const isAllDay = dto.IsAllDayEvent === true || (!dto.StartDateTime && !!dto.StartDay);
    const startAt = parseValidDate(dto.StartDateTime) ?? parseDay(dto.StartDay);
    if (!startAt) return null;
    const endAt = parseValidDate(dto.EndDateTime) ?? parseDay(dto.EndDay);
    const description = typeof dto.Description === 'string' ? nonEmpty(stripHtmlPreservingLinks(dto.Description)) : null;
    return new CalendarEvent({
      id: dto.CalendarEventId,
      courseOrgUnitId: typeof dto.OrgUnitId === 'number' ? dto.OrgUnitId : fallbackOrgUnit,
      title: nonEmpty(dto.Title) ?? '(untitled event)',
      description,
      startAt,
      endAt,
      location: nonEmpty(dto.LocationName),
      isAllDay,
    });
  }
}
