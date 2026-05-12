import React, { useState, useCallback } from 'react';
import { Box, Text, useInput } from 'ink';
import { existsSync, readFileSync } from 'node:fs';
import type { TuiDeps } from '../types.js';
import { useAsyncData } from '../shared/useAsyncData.js';
import { Spinner } from '../shared/Spinner.js';

interface AuditEntry { audit_ts?: string; tool?: string; cid?: string; }

export function LogsView({ deps }: { deps: TuiDeps }) {
  const [toolFilter, setToolFilter] = useState('');
  const [typing, setTyping] = useState(false);

  const fetcher = useCallback((): Promise<AuditEntry[]> => {
    if (!existsSync(deps.auditLogPath)) return Promise.resolve([]);
    const raw = readFileSync(deps.auditLogPath, 'utf8');
    const entries = raw
      .split('\n')
      .filter((l) => l.trim())
      .map((l) => { try { return JSON.parse(l) as AuditEntry; } catch { return null; } })
      .filter((e): e is AuditEntry => e !== null)
      .reverse()
      .slice(0, 50);
    return Promise.resolve(entries);
  }, [deps]);

  const { data, loading, reload } = useAsyncData(fetcher);

  useInput((input, key) => {
    if (key.ctrl && input === 'r' && !typing) { reload(); return; }
    if (input === '/' && !typing) { setTyping(true); return; }
    if (typing) {
      if (key.escape || key.return) { setTyping(false); return; }
      if (key.backspace || key.delete) { setToolFilter((f) => f.slice(0, -1)); return; }
      if (input && !key.ctrl && !key.meta) setToolFilter((f) => f + input);
    }
  });

  const filtered = (data ?? []).filter((e) =>
    !toolFilter || (e.tool ?? '').toLowerCase().includes(toolFilter.toLowerCase()),
  );

  if (loading) return <Box padding={1}><Spinner label="Cargando logs…" /></Box>;

  return (
    <Box flexDirection="column" padding={1}>
      <Box marginBottom={1}>
        <Text bold color="blueBright">Audit Log </Text>
        <Text color="gray">(últimas 50 entradas)</Text>
        {typing && (
          <Box>
            <Text color="gray"> · filtro: </Text>
            <Text>{toolFilter}</Text>
            <Text backgroundColor="blue"> </Text>
          </Box>
        )}
      </Box>

      {filtered.length === 0 && (
        <Text color="gray">
          {data?.length === 0 ? 'Sin entradas todavía' : 'Sin resultados para el filtro'}
        </Text>
      )}

      {filtered.map((e, i) => (
        <Box key={i}>
          <Text color="gray">{(e.audit_ts ?? '').slice(0, 19)} </Text>
          <Text color="blueBright">{e.tool ?? '?'}</Text>
          <Text color="gray"> cid={e.cid ?? '?'}</Text>
        </Box>
      ))}

      <Box marginTop={1}>
        <Text color="gray" dimColor>/: filtrar · Ctrl+R: refrescar</Text>
      </Box>
    </Box>
  );
}
