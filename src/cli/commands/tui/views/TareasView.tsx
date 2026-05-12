import React, { useState, useCallback } from 'react';
import { Box, Text, useInput } from 'ink';
import type { TuiDeps } from '../types.js';
import type { OrgUnitId } from '@/shared-kernel/types/OrgUnitId.js';
import { useAsyncData } from '../shared/useAsyncData.js';
import { Spinner } from '../shared/Spinner.js';

type Filter = 'pendientes' | 'enviadas' | 'todas';

function formatDueDate(d: Date | null, locale: string, t: (k: string) => string): string {
  if (!d) return t('tui.tareas.no_date');
  const diff = d.getTime() - Date.now();
  if (diff < 0) return `${t('tui.tareas.overdue')} ${d.toLocaleDateString(locale)}`;
  if (diff < 2 * 24 * 60 * 60 * 1000) return `${t('tui.tareas.tomorrow')} ${d.toLocaleDateString(locale)}`;
  return d.toLocaleDateString(locale, { weekday: 'short', month: 'short', day: 'numeric' });
}

export function TareasView({ orgUnitId, deps }: { orgUnitId: OrgUnitId; deps: TuiDeps }) {
  const t = deps.output.t;
  const locale = deps.output.locale;
  const [filter, setFilter] = useState<Filter>('pendientes');

  const fetcher = useCallback(
    () => deps.assignmentRepo.findByCourse(orgUnitId),
    [deps, orgUnitId],
  );
  const { data, loading, error, reload } = useAsyncData(fetcher);

  useInput((input, key) => {
    if (key.ctrl && input === 'r') reload();
    if (input === '1') setFilter('pendientes');
    if (input === '2') setFilter('enviadas');
    if (input === '3') setFilter('todas');
  });

  if (loading) return <Box><Spinner label={t('tui.tareas.loading')} /></Box>;
  if (error) return <Box><Text color="red">✗ {error}</Text></Box>;
  if (!data) return null;

  const filtered = data.filter((a) => {
    if (filter === 'pendientes') return !a.hasSubmission;
    if (filter === 'enviadas') return a.hasSubmission;
    return true;
  });

  const filterLabels: Record<Filter, string> = {
    pendientes: t('tui.tareas.pending'),
    enviadas: t('tui.tareas.submitted'),
    todas: t('tui.tareas.all'),
  };

  return (
    <Box flexDirection="column">
      {/* Filter bar */}
      <Box marginBottom={1} gap={2}>
        {(['pendientes', 'enviadas', 'todas'] as Filter[]).map((f, i) => (
          <Text key={f} color={filter === f ? 'greenBright' : 'gray'} bold={filter === f}>
            {i + 1} {filterLabels[f]}
          </Text>
        ))}
        <Text color="gray">({filtered.length})</Text>
      </Box>

      {filtered.length === 0 && (
        <Text color="gray">  {t('tui.tareas.empty')}</Text>
      )}

      {filtered.map((a) => {
        const due = a.dueDate.toDate();
        const color = a.hasSubmission ? 'green' : due && due.getTime() < Date.now() ? 'red' : 'white';
        return (
          <Box key={String(a.id)} flexDirection="column" marginBottom={1}>
            <Text color={color}>
              {a.hasSubmission ? '✓' : '!'} {a.name}
            </Text>
            <Text color="gray">    {formatDueDate(due, locale, t)}</Text>
          </Box>
        );
      })}

      <Text color="gray" dimColor>{t('tui.tareas.hint')}</Text>
    </Box>
  );
}
