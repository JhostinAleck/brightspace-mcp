import React, { useState, useCallback } from 'react';
import { Box, Text, useInput } from 'ink';
import type { TuiDeps } from '../types.js';
import { useAsyncData } from '../shared/useAsyncData.js';
import { Spinner } from '../shared/Spinner.js';

interface CacheStats { hits: number; misses: number; hitRate: number; }

export function CacheView({ deps }: { deps: TuiDeps }) {
  const [clearing, setClearing] = useState(false);
  const [clearMsg, setClearMsg] = useState<string | null>(null);

  const fetcher = useCallback((): Promise<CacheStats> => {
    const snap = deps.metrics.snapshot();
    const cnt = snap.counters;
    const h = cnt['http.cache.hit'] ?? 0;
    const m = cnt['http.cache.miss'] ?? 0;
    const t = h + m;
    return Promise.resolve({ hits: h, misses: m, hitRate: t > 0 ? Math.round((h / t) * 100) : 0 });
  }, [deps]);

  const { data, loading, reload } = useAsyncData(fetcher);

  useInput(async (input) => {
    if (input === 'r') { reload(); setClearMsg(null); return; }
    if (input === 'c' && !clearing) {
      setClearing(true);
      try {
        if (deps.httpCache) await deps.httpCache.clearAll();
        setClearMsg(`✓ Caché limpiado · ${new Date().toLocaleTimeString('es-419')}`);
        reload();
      } finally {
        setClearing(false);
      }
    }
  });

  if (loading) return <Box padding={1}><Spinner label="Cargando estadísticas…" /></Box>;

  const stats = data ?? { hits: 0, misses: 0, hitRate: 0 };

  return (
    <Box flexDirection="column" padding={1}>
      <Text bold color="blueBright">Estadísticas de caché</Text>
      <Text>Hit rate:  <Text color={stats.hitRate > 50 ? 'green' : 'yellow'}>{stats.hitRate}%</Text></Text>
      <Text>Hits:      <Text color="green">{stats.hits}</Text></Text>
      <Text>Misses:    <Text color="red">{stats.misses}</Text></Text>
      <Text>Total:     {stats.hits + stats.misses}</Text>

      {clearMsg && <Box marginTop={1}><Text color="green">{clearMsg}</Text></Box>}
      {clearing && <Text color="yellow">Limpiando…</Text>}

      <Box marginTop={1}>
        <Text color="gray" dimColor>c: limpiar caché · r: refrescar</Text>
      </Box>
    </Box>
  );
}
