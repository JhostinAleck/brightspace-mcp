import React, { useState, useCallback } from 'react';
import { Box, Text, useInput } from 'ink';
import type { TuiDeps } from '../types.js';
import type { OrgUnitId } from '@/shared-kernel/types/OrgUnitId.js';
import { useAsyncData } from '../shared/useAsyncData.js';
import { Spinner } from '../shared/Spinner.js';

type Filter = 'pendientes' | 'enviadas' | 'todas';

function formatDueDate(d: Date | null): string {
  if (!d) return 'sin fecha';
  const diff = d.getTime() - Date.now();
  if (diff < 0) return `vencida ${d.toLocaleDateString('es-419')}`;
  if (diff < 2 * 24 * 60 * 60 * 1000) return `mañana ${d.toLocaleDateString('es-419')}`;
  return d.toLocaleDateString('es-419', { weekday: 'short', month: 'short', day: 'numeric' });
}

export function TareasView({ orgUnitId, deps }: { orgUnitId: OrgUnitId; deps: TuiDeps }) {
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

  if (loading) return <Box><Spinner label="Cargando tareas…" /></Box>;
  if (error) return <Box><Text color="red">✗ {error}</Text></Box>;
  if (!data) return null;

  const filtered = data.filter((a) => {
    if (filter === 'pendientes') return !a.hasSubmission;
    if (filter === 'enviadas') return a.hasSubmission;
    return true;
  });

  return (
    <Box flexDirection="column">
      {/* Filter bar */}
      <Box marginBottom={1} gap={2}>
        {(['pendientes', 'enviadas', 'todas'] as Filter[]).map((f, i) => (
          <Text key={f} color={filter === f ? 'greenBright' : 'gray'} bold={filter === f}>
            {i + 1} {f.charAt(0).toUpperCase() + f.slice(1)}
          </Text>
        ))}
        <Text color="gray">({filtered.length})</Text>
      </Box>

      {filtered.length === 0 && (
        <Text color="gray">  Sin tareas en esta categoría</Text>
      )}

      {filtered.map((a) => {
        const due = a.dueDate.toDate();
        const color = a.hasSubmission ? 'green' : due && due.getTime() < Date.now() ? 'red' : 'white';
        return (
          <Box key={String(a.id)} flexDirection="column" marginBottom={1}>
            <Text color={color}>
              {a.hasSubmission ? '✓' : '!'} {a.name}
            </Text>
            <Text color="gray">    {formatDueDate(due)}</Text>
          </Box>
        );
      })}

      <Text color="gray" dimColor>1/2/3: filtrar · Ctrl+R: refrescar</Text>
    </Box>
  );
}
