import { describe, it, expect } from 'vitest';
import { handleGetCalendarEvents } from '@/mcp/tools/get-calendar-events.tool';
import { FakeCalendarRepository } from '@tests/helpers/fakes/FakeCalendarRepository';
import { CalendarEvent } from '@/contexts/calendar/domain/CalendarEvent';
import { testOutputContext } from '../../helpers/test-output-context.js';

describe('get_calendar_events tool', () => {
  it('lists events with locations and times', async () => {
    const e = new CalendarEvent({
      id: 1,
      courseOrgUnitId: 101,
      title: 'Midterm',
      description: null,
      startAt: new Date(Date.now() + 24 * 60 * 60 * 1000),
      endAt: null,
      location: 'MSEE B012',
    });
    const repo = new FakeCalendarRepository(new Map([[101, [e]]]));
    const r = await handleGetCalendarEvents({ calendarRepo: repo, output: testOutputContext() }, { course_id: 101 });
    expect(r.content[0]?.text).toContain('Midterm');
    expect(r.content[0]?.text).toContain('MSEE B012');
  });

  it('returns empty message when no events in window', async () => {
    const repo = new FakeCalendarRepository();
    const r = await handleGetCalendarEvents({ calendarRepo: repo, output: testOutputContext() }, { course_id: 101 });
    expect(r.content[0]?.text).toMatch(/no events/i);
  });
});
