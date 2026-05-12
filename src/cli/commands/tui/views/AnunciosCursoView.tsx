import React, { useCallback } from 'react';
import { Box, Text, useInput } from 'ink';
import type { TuiDeps } from '../types.js';
import type { OrgUnitId } from '@/shared-kernel/types/OrgUnitId.js';
import { useAsyncData } from '../shared/useAsyncData.js';
import { Spinner } from '../shared/Spinner.js';

function stripHtml(html: string): string {
  return html
    .replace(/<[^>]+>/g, '')
    // numeric entities: &#237; → í
    .replace(/&#(\d+);/g, (_, code: string) => String.fromCharCode(parseInt(code, 10)))
    // hex entities: &#x00e9; → é
    .replace(/&#x([0-9a-fA-F]+);/g, (_, code: string) => String.fromCharCode(parseInt(code, 16)))
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&nbsp;/g, ' ')
    .replace(/&iexcl;/g, '¡')
    .replace(/&aacute;/g, 'á').replace(/&eacute;/g, 'é').replace(/&iacute;/g, 'í')
    .replace(/&oacute;/g, 'ó').replace(/&uacute;/g, 'ú').replace(/&ntilde;/g, 'ñ')
    .replace(/&Aacute;/g, 'Á').replace(/&Eacute;/g, 'É').replace(/&Iacute;/g, 'Í')
    .replace(/&Oacute;/g, 'Ó').replace(/&Uacute;/g, 'Ú').replace(/&Ntilde;/g, 'Ñ')
    .replace(/&uuml;/g, 'ü').replace(/&ouml;/g, 'ö').replace(/&auml;/g, 'ä')
    .trim();
}

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
        const body = a.html ? stripHtml(a.html) : null;
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
          </Box>
        );
      })}
      <Text color="gray" dimColor>{t('tui.ann_curso.hint')}</Text>
    </Box>
  );
}
