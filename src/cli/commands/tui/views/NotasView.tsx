import React, { useCallback } from 'react';
import { Box, Text, useInput } from 'ink';
import type { TuiDeps } from '../types.js';
import type { OrgUnitId } from '@/shared-kernel/types/OrgUnitId.js';
import { useAsyncData } from '../shared/useAsyncData.js';
import { Spinner } from '../shared/Spinner.js';

function gradeColor(pct: number): string {
  if (pct >= 85) return 'green';
  if (pct >= 70) return 'yellow';
  return 'red';
}

export function NotasView({ orgUnitId, deps }: { orgUnitId: OrgUnitId; deps: TuiDeps }) {
  const fetcher = useCallback(
    () => deps.gradeRepo.findByCourse(orgUnitId),
    [deps, orgUnitId],
  );
  const { data, loading, error, reload } = useAsyncData(fetcher);

  useInput((input) => { if (input === 'r') reload(); });

  if (loading) return <Box><Spinner label="Cargando notas…" /></Box>;
  if (error) return <Box><Text color="red">✗ {error}</Text></Box>;
  if (!data) return null;

  const graded = data.filter((g) => g.percent !== null);
  const avg =
    graded.length > 0
      ? graded.reduce((s, g) => s + (g.percent ?? 0), 0) / graded.length
      : null;

  return (
    <Box flexDirection="column">
      {avg !== null && (
        <Box marginBottom={1}>
          <Text bold>Promedio: </Text>
          <Text color={gradeColor(avg)} bold>{avg.toFixed(1)}%</Text>
        </Box>
      )}

      {data.length === 0 && <Text color="gray">  Sin calificaciones registradas</Text>}

      {data.map((g) => (
        <Box key={g.itemId} justifyContent="space-between">
          <Text>{g.itemName.slice(0, 40)}</Text>
          <Text color={g.percent !== null ? gradeColor(g.percent) : 'gray'}>
            {g.percent !== null ? `${g.percent.toFixed(1)}%` : '—'}
            {g.displayedGrade ? ` (${g.displayedGrade})` : ''}
          </Text>
        </Box>
      ))}

      <Text color="gray" dimColor>r: refrescar</Text>
    </Box>
  );
}
