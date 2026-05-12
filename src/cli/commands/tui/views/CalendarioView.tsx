import React, { useCallback } from 'react';
import { Box, Text, useInput } from 'ink';
import type { TuiDeps } from '../types.js';
import { useAsyncData } from '../shared/useAsyncData.js';
import { Spinner } from '../shared/Spinner.js';
import { OrgUnitId } from '@/shared-kernel/types/OrgUnitId.js';
import { CourseId } from '@/contexts/courses/domain/CourseId.js';
import { getUpcomingDueDates } from '@/contexts/assignments/application/getUpcomingDueDates.js';

interface CalItem {
  date: Date;
  title: string;
  courseName: string;
  type: 'event' | 'assignment';
}

export function CalendarioView({ deps }: { deps: TuiDeps }) {
  const t = deps.output.t;
  const locale = deps.output.locale;

  const fetcher = useCallback(async (): Promise<CalItem[]> => {
    const allCourses = await deps.courseRepo.findMyCourses({ activeOnly: true });
    const courses = allCourses
      .sort((a, b) => (b.startDate?.getTime() ?? 0) - (a.startDate?.getTime() ?? 0))
      .slice(0, 15);
    const now = new Date();
    const thirtyDays = new Date(now.getTime() + 30 * 24 * 60 * 60 * 1000);
    const courseIds = courses.map((c) => OrgUnitId.of(CourseId.toNumber(c.id)));
    const courseNameById = new Map(courses.map((c) => [CourseId.toNumber(c.id), c.name]));

    const [eventArrays, assignments] = await Promise.all([
      Promise.all(
        courses.map(async (c) => {
          const oid = OrgUnitId.of(CourseId.toNumber(c.id));
          const events = await deps.calendarRepo.findEvents(oid, now, thirtyDays).catch(() => []);
          return events.map((e): CalItem => ({
            date: e.startAt,
            title: e.title,
            courseName: c.name,
            type: 'event',
          }));
        }),
      ),
      getUpcomingDueDates({ repo: deps.assignmentRepo, courseIds, from: now, to: thirtyDays }),
    ]);

    const assignmentItems: CalItem[] = assignments
      .filter((a) => !a.hasSubmission && a.dueDate.toDate() !== null)
      .map((a) => ({
        date: a.dueDate.toDate()!,
        title: a.name,
        courseName: courseNameById.get(a.courseOrgUnitId) ?? `id:${a.courseOrgUnitId}`,
        type: 'assignment' as const,
      }));

    return [...eventArrays.flat(), ...assignmentItems].sort(
      (a, b) => a.date.getTime() - b.date.getTime(),
    );
  }, [deps]);

  const { data, loading, error, reload } = useAsyncData(fetcher);

  useInput((input, key) => { if (key.ctrl && input === 'r') reload(); });

  if (loading) return <Box padding={1}><Spinner label={t('tui.calendario.loading')} /></Box>;
  if (error) return <Box padding={1}><Text color="red">✗ {error}</Text></Box>;
  if (!data) return null;

  return (
    <Box flexDirection="column" padding={1}>
      <Box marginBottom={1}><Text bold color="blueBright">{t('tui.calendario.title')}</Text></Box>

      {data.length === 0 && <Text color="gray">  {t('tui.calendario.empty')}</Text>}

      {data.map((item, i) => (
        <Box key={i} marginBottom={0}>
          <Text color="gray">
            {item.date.toLocaleDateString(locale, { weekday: 'short', month: 'short', day: 'numeric' })}{' '}
          </Text>
          <Text color={item.type === 'assignment' ? 'yellow' : 'white'}>
            {item.type === 'assignment' ? '📝 ' : '📅 '}
            {item.title.slice(0, 34)}
          </Text>
          <Text color="gray"> · {item.courseName.slice(0, 20)}</Text>
        </Box>
      ))}

      <Box marginTop={1}>
        <Text color="gray" dimColor>{t('tui.calendario.hint')}</Text>
      </Box>
    </Box>
  );
}
