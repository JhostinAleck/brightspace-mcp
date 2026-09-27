import React, { useCallback } from 'react';
import { Box, Text, useInput } from 'ink';
import type { TuiDeps } from '../types.js';
import type { OrgUnitId } from '@/shared-kernel/types/OrgUnitId.js';
import { useAsyncData } from '../shared/useAsyncData.js';
import { Spinner } from '../shared/Spinner.js';
import { htmlToPlainText } from '@/shared-kernel/text/htmlLinks.js';

export function AnunciosCursoView({ orgUnitId, deps }: { orgUnitId: OrgUnitId; deps: TuiDeps }) {
  const t = deps.output.t;
  const locale = deps.output.locale;
  const fetcher = useCallback(
    () => deps.communicationsRepo.findAnnouncements(orgUnitId),
    [deps, orgUnitId],
  );
  const { data, loading, error, reload } = useAsyncData(fetcher);

  useInput((input, key) => { if (key.ctrl && input === 'r') reload(); });

  if (loading) return <Box><Spinner label={t('tui.ann_curso.loading')} /></Box>;
  if (error) return <Box flexDirection="column"><Text color="red">✗ {error}</Text><Text color="gray">{t('tui.common.retry')}</Text></Box>;
  if (!data) return null;

  const sorted = [...data].sort((a, b) => b.postedAt.getTime() - a.postedAt.getTime());

  return (
    <Box flexDirection="column">
      {sorted.length === 0 && <Text color="gray">  {t('tui.ann_curso.empty')}</Text>}
      {sorted.map((a) => {
        const body = a.html ? htmlToPlainText(a.html) : null;
        return (
          <Box key={a.id} flexDirection="column" marginBottom={1}>
            <Text bold>{a.title}</Text>
            <Text color="gray">
              {'  '}{a.postedAt.toLocaleDateString(locale)}
              {a.authorName ? ` · ${a.authorName}` : ''}
            </Text>
            {body && (
              <Text color="white" dimColor>
                {'  '}{body.slice(0, 120)}{body.length > 120 ? '…' : ''}
              </Text>
            )}
            {a.attachments.length > 0 && (
              <Text color="gray">{'  '}{t('announcements.attachments')}: {a.attachments.map((f) => f.name).join(', ')}</Text>
            )}
          </Box>
        );
      })}
      <Text color="gray" dimColor>{t('tui.ann_curso.hint')}</Text>
    </Box>
  );
}
