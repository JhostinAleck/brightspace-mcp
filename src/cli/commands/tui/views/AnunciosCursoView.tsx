import React, { useCallback } from 'react';
import { Box, Text, useInput } from 'ink';
import type { TuiDeps } from '../types.js';
import type { OrgUnitId } from '@/shared-kernel/types/OrgUnitId.js';
import { useAsyncData } from '../shared/useAsyncData.js';
import { Spinner } from '../shared/Spinner.js';

function stripHtml(html: string): string {
  return html
    .replace(/<[^>]+>/g, '')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&nbsp;/g, ' ')
    .trim();
}

export function AnunciosCursoView({ orgUnitId, deps }: { orgUnitId: OrgUnitId; deps: TuiDeps }) {
  const fetcher = useCallback(
    () => deps.communicationsRepo.findAnnouncements(orgUnitId),
    [deps, orgUnitId],
  );
  const { data, loading, error, reload } = useAsyncData(fetcher);

  useInput((input) => { if (input === 'r') reload(); });

  if (loading) return <Box><Spinner label="Cargando anuncios…" /></Box>;
  if (error) return <Box><Text color="red">✗ {error}</Text></Box>;
  if (!data) return null;

  const sorted = [...data].sort((a, b) => b.postedAt.getTime() - a.postedAt.getTime());

  return (
    <Box flexDirection="column">
      {sorted.length === 0 && <Text color="gray">  Sin anuncios</Text>}
      {sorted.map((a) => {
        const body = a.html ? stripHtml(a.html) : null;
        return (
          <Box key={a.id} flexDirection="column" marginBottom={1}>
            <Text bold>{a.title}</Text>
            <Text color="gray">
              {'  '}{a.postedAt.toLocaleDateString('es-419')}
              {a.authorName ? ` · ${a.authorName}` : ''}
            </Text>
            {body && (
              <Text color="white" dimColor>
                {'  '}{body.slice(0, 120)}{body.length > 120 ? '…' : ''}
              </Text>
            )}
          </Box>
        );
      })}
      <Text color="gray" dimColor>r: refrescar</Text>
    </Box>
  );
}
