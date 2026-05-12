import React, { useCallback } from 'react';
import { Box, Text, useInput } from 'ink';
import type { TuiDeps } from '../types.js';
import { useAsyncData } from '../shared/useAsyncData.js';
import { Spinner } from '../shared/Spinner.js';
import { OrgUnitId } from '@/shared-kernel/types/OrgUnitId.js';
import { CourseId } from '@/contexts/courses/domain/CourseId.js';
import type { CalendarEvent } from '@/contexts/calendar/domain/CalendarEvent.js';

interface EventWithCourse {
  event: CalendarEvent;
  courseName: string;
}

export function CalendarioView({ deps }: { deps: TuiDeps }) {
  const fetcher = useCallback(async (): Promise<EventWithCourse[]> => {
    const allCourses = await deps.courseRepo.findMyCourses({ activeOnly: true });
    const courses = allCourses
      .sort((a, b) => (b.startDate?.getTime() ?? 0) - (a.startDate?.getTime() ?? 0))
      .slice(0, 15);
    const now = new Date();
    const thirtyDays = new Date(now.getTime() + 30 * 24 * 60 * 60 * 1000);

    const arrays = await Promise.all(
      courses.map(async (c) => {
        const oid = OrgUnitId.of(CourseId.toNumber(c.id));
        const events = await deps.calendarRepo.findEvents(oid, now, thirtyDays).catch(() => []);
        return events.map((e) => ({ event: e, courseName: c.name }));
      }),
    );

    return arrays
      .flat()
      .sort((a, b) => a.event.startAt.getTime() - b.event.startAt.getTime());
  }, [deps]);

  const { data, loading, error, reload } = useAsyncData(fetcher);

  useInput((input) => { if (input === 'r') reload(); });

  if (loading) return <Box padding={1}><Spinner label="Cargando calendario…" /></Box>;
  if (error) return <Box padding={1}><Text color="red">✗ {error}</Text></Box>;
  if (!data) return null;

  return (
    <Box flexDirection="column" padding={1}>
      <Box marginBottom={1}><Text bold color="blueBright">Próximos 30 días</Text></Box>

      {data.length === 0 && <Text color="gray">  Sin eventos próximos</Text>}

      {data.map(({ event, courseName }) => (
        <Box key={event.id} marginBottom={1}>
          <Text color="gray">
            {event.startAt.toLocaleDateString('es-419', { weekday: 'short', month: 'short', day: 'numeric' })}{' '}
          </Text>
          <Text>{event.title.slice(0, 36)}</Text>
          <Text color="gray"> · {courseName.slice(0, 24)}</Text>
          {event.location && <Text color="gray"> @ {event.location.slice(0, 20)}</Text>}
        </Box>
      ))}

      <Text color="gray" dimColor>r: refrescar</Text>
    </Box>
  );
}
