import type { CalendarRepository } from '@/contexts/calendar/domain/CalendarRepository.js';
import { getCalendarEvents } from '@/contexts/calendar/application/getCalendarEvents.js';
import { getCalendarEventsSchema } from '@/mcp/schemas.js';
import { calendarEventsToText } from '@/mcp/tool-helpers.js';
import { OrgUnitId } from '@/shared-kernel/types/OrgUnitId.js';
import type { OutputContext } from '@/shared-kernel/output/index.js';

export interface GetCalendarEventsDeps { calendarRepo: CalendarRepository; output: OutputContext; }

export async function handleGetCalendarEvents(deps: GetCalendarEventsDeps, rawInput: unknown) {
  const input = getCalendarEventsSchema.parse(rawInput);
  const from = new Date();
  const to = new Date(from.getTime() + input.days * 24 * 60 * 60 * 1000);
  const events = await getCalendarEvents({
    repo: deps.calendarRepo,
    courseId: OrgUnitId.of(input.course_id),
    from,
    to,
  });
  const text = calendarEventsToText(events, input.days, deps.output);
  const footer = deps.output.metaFooter();
  const body = footer ? `${text}\n\n${footer}` : text;
  return { content: [{ type: 'text' as const, text: body }] };
}
