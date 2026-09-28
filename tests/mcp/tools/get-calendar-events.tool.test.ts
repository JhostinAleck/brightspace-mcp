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

  it('renders times in the configured timezone, not UTC', async () => {
    // 04:59:59Z on day X+1 is 23:59 on day X in Bogotá (UTC-5).
    const start = new Date(Date.now() + 2 * 24 * 60 * 60 * 1000);
    start.setUTCHours(4, 59, 59, 0);
    const e = new CalendarEvent({
      id: 2, courseOrgUnitId: 101, title: 'Assignment 4', description: null,
      startAt: start, endAt: start, location: null,
    });
    const repo = new FakeCalendarRepository(new Map([[101, [e]]]));
    const r = await handleGetCalendarEvents(
      { calendarRepo: repo, output: testOutputContext({ tz: 'America/Bogota', locale: 'en-US' }) },
      { course_id: 101 },
    );
    const text = r.content[0]?.text ?? '';
    expect(text).toContain('Assignment 4');
    expect(text).toContain('11:59');
    expect(text).not.toContain('4:59');
    // Zero-length events (start === end) do not render a redundant "→ end".
    expect(text).not.toContain('→');
  });

  it('renders all-day events as a date without a time and includes a description snippet', async () => {
    const day = new Date(Date.now() + 3 * 24 * 60 * 60 * 1000);
    day.setUTCHours(12, 0, 0, 0);
    const e = new CalendarEvent({
      id: 3, courseOrgUnitId: 101, title: 'Reading week', description: 'No lectures this week',
      startAt: day, endAt: day, location: null, isAllDay: true,
    });
    const repo = new FakeCalendarRepository(new Map([[101, [e]]]));
    const r = await handleGetCalendarEvents(
      { calendarRepo: repo, output: testOutputContext({ tz: 'America/Bogota', locale: 'en-US' }) },
      { course_id: 101 },
    );
    const text = r.content[0]?.text ?? '';
    expect(text).toContain('Reading week');
    expect(text).toContain('No lectures this week');
    expect(text).not.toMatch(/\d{1,2}:\d{2}/);
  });
});
