import React, { useCallback } from 'react';
import { Box, Text, useInput } from 'ink';
import type { TuiDeps } from '../types.js';
import { useAsyncData } from '../shared/useAsyncData.js';
import { Spinner } from '../shared/Spinner.js';
import { OrgUnitId } from '@/shared-kernel/types/OrgUnitId.js';
import { CourseId } from '@/contexts/courses/domain/CourseId.js';
import { getUpcomingDueDates } from '@/contexts/assignments/application/getUpcomingDueDates.js';
import type { Assignment } from '@/contexts/assignments/domain/Assignment.js';
import type { Announcement } from '@/contexts/communications/domain/Announcement.js';

interface InicioData {
  upcoming: Assignment[];
  announcements: Announcement[];
  activeCount: number;
  authOk: boolean;
}

function formatDate(d: Date, locale: string): string {
  return d.toLocaleDateString(locale, { weekday: 'short', month: 'short', day: 'numeric' });
}

function assignmentColor(a: Assignment): string {
  const due = a.dueDate.toDate();
  if (!due || a.hasSubmission) return 'green';
  const diff = due.getTime() - Date.now();
  if (diff < 0) return 'red';
  if (diff < 2 * 24 * 60 * 60 * 1000) return 'red';
  if (diff < 7 * 24 * 60 * 60 * 1000) return 'yellow';
  return 'white';
}

export function InicioView({ deps }: { deps: TuiDeps }) {
  const t = deps.output.t;
  const locale = deps.output.locale;

  const fetcher = useCallback(async (): Promise<InicioData> => {
    let authOk = true;
    let allCourses: Awaited<ReturnType<typeof deps.courseRepo.findMyCourses>> = [];
    try {
      allCourses = await deps.courseRepo.findMyCourses({ activeOnly: true });
    } catch {
      authOk = false;
    }

    const activeCount = allCourses.length;
    const courses = allCourses
      .sort((a, b) => (b.startDate?.getTime() ?? 0) - (a.startDate?.getTime() ?? 0))
      .slice(0, 15);
    const courseIds = courses.map((c) => OrgUnitId.of(CourseId.toNumber(c.id)));
    const now = new Date();
    const sevenDays = new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000);

    const [upcoming, annArrays] = await Promise.all([
      authOk
        ? getUpcomingDueDates({ repo: deps.assignmentRepo, courseIds, from: now, to: sevenDays })
        : Promise.resolve([]),
      authOk
        ? Promise.all(
            courses.map((c) =>
              deps.communicationsRepo
                .findAnnouncements(OrgUnitId.of(CourseId.toNumber(c.id)))
                .catch(() => []),
            ),
          )
        : Promise.resolve([]),
    ]);

    const announcements = (Array.isArray(annArrays[0]) ? annArrays.flat() : [])
      .sort((a, b) => b.postedAt.getTime() - a.postedAt.getTime())
      .slice(0, 5);

    return { upcoming, announcements, activeCount, authOk };
  }, [deps]);

  const { data, loading, error, reload } = useAsyncData(fetcher);

  useInput((input, key) => {
    if (key.ctrl && input === 'r') reload();
  });

  if (loading) return <Box padding={1}><Spinner label={t('tui.inicio.loading')} /></Box>;
  if (error) return <Box padding={1}><Text color="red">✗ {error}</Text><Text color="gray"> {t('tui.common.retry')}</Text></Box>;
  if (!data) return null;

  const { upcoming, announcements, activeCount, authOk } = data;

  return (
    <Box flexDirection="column" padding={1}>
      <Box gap={3} flexGrow={1}>

        {/* Column 1: Upcoming assignments */}
        <Box flexDirection="column" flexBasis="33%">
          <Text bold color="blueBright">{t('tui.inicio.upcoming_header')}</Text>
          {upcoming.length === 0 && <Text color="gray">  {t('tui.inicio.empty_upcoming')}</Text>}
          {upcoming.slice(0, 8).map((a) => {
            const due = a.dueDate.toDate();
            const color = assignmentColor(a);
            const prefix = a.hasSubmission ? '✓' : '!';
            return (
              <Text key={String(a.id)} color={color}>
                {prefix} {a.name.slice(0, 28)}{due ? ` · ${formatDate(due, locale)}` : ''}
              </Text>
            );
          })}
        </Box>

        {/* Column 2: Auth / connection status */}
        <Box flexDirection="column" flexBasis="33%">
          <Text bold color="blueBright">{t('tui.inicio.status_header')}</Text>
          <Text color={authOk ? 'green' : 'red'}>
            {authOk ? t('tui.inicio.connected') : t('tui.inicio.disconnected')}
          </Text>
          {authOk && (
            <Text color="gray">
              {t('tui.inicio.active_courses', { count: activeCount })}
            </Text>
          )}
          <Box marginTop={1} flexDirection="column">
            <Text color="gray">perfil: <Text color="white">{deps.profile}</Text></Text>
            <Text color="gray">locale: <Text color="white">{locale}</Text></Text>
            <Text color="gray">tz:     <Text color="white">{deps.output.tz}</Text></Text>
          </Box>
        </Box>

        {/* Column 3: Recent announcements */}
        <Box flexDirection="column" flexBasis="33%">
          <Text bold color="blueBright">{t('tui.inicio.ann_header')}</Text>
          {announcements.length === 0 && <Text color="gray">  {t('tui.inicio.empty_ann')}</Text>}
          {announcements.map((a) => (
            <Box key={a.id} flexDirection="column" marginBottom={1}>
              <Text>{a.title.slice(0, 32)}</Text>
              <Text color="gray">  {formatDate(a.postedAt, locale)}</Text>
            </Box>
          ))}
        </Box>

      </Box>
      <Text color="gray" dimColor>{t('tui.notas.hint')}</Text>
    </Box>
  );
}
