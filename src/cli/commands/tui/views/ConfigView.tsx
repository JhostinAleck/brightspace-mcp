import React, { useState } from 'react';
import { Box, Text, useInput } from 'ink';
import type { TuiDeps } from '../types.js';
import { ConfigSummary } from '../config/ConfigSummary.js';
import { ConfigForm } from '../config/ConfigForm.js';
import { openInEditor } from '../config/openInEditor.js';
import { existsSync, readFileSync } from 'node:fs';
import { parse as parseYaml } from 'yaml';

type Mode = 'summary' | 'form' | 'message';

export function ConfigView({ deps }: { deps: TuiDeps }) {
  const [mode, setMode] = useState<Mode>('summary');
  const [message, setMessage] = useState<{ text: string; ok: boolean } | null>(null);

  function readCurrentValues(): Record<string, string> {
    try {
      if (!existsSync(deps.configPath)) return {};
      const yaml = parseYaml(readFileSync(deps.configPath, 'utf8')) as Record<string, unknown>;
      const profiles = yaml['profiles'] as Record<string, unknown> | undefined;
      const prof = profiles?.[deps.profile] as Record<string, unknown> | undefined;
      const auth = prof?.['auth'] as Record<string, unknown> | undefined;
      const output = yaml['output'] as Record<string, unknown> | undefined;
      return {
        base_url: (prof?.['base_url'] as string | undefined) ?? '',
        strategy: (auth?.['strategy'] as string | undefined) ?? 'auto',
        mfa_strategy: ((auth?.['mfa'] as Record<string, unknown> | undefined)?.['strategy'] as string | undefined) ?? 'none',
        locale: (output?.['locale'] as string | undefined) ?? 'es-419',
        format: (output?.['format'] as string | undefined) ?? 'markdown',
      };
    } catch { return {}; }
  }

  function handleExternalEdit() {
    const result = openInEditor(deps.configPath);
    if (result.ok) {
      setMessage({ text: '✓ Config válido — reinicia el TUI para aplicar los cambios.', ok: true });
    } else {
      setMessage({ text: `✗ YAML inválido: ${result.error}`, ok: false });
    }
    setMode('message');
  }

  useInput((_input, key) => {
    if (mode === 'message') {
      if (key.return || key.escape) setMode('summary');
    }
  });

  if (mode === 'form') {
    return (
      <Box padding={1}>
        <ConfigForm
          currentValues={readCurrentValues()}
          onSave={() => {
            setMessage({ text: '✓ Guardado — reinicia el TUI para aplicar los cambios.', ok: true });
            setMode('message');
          }}
          onCancel={() => setMode('summary')}
        />
      </Box>
    );
  }

  if (mode === 'message' && message) {
    return (
      <Box padding={1} flexDirection="column">
        <Text color={message.ok ? 'green' : 'red'}>{message.text}</Text>
        <Text color="gray">Enter para volver</Text>
      </Box>
    );
  }

  return (
    <Box padding={1}>
      <ConfigSummary
        configPath={deps.configPath}
        profile={deps.profile}
        onEditForm={() => setMode('form')}
        onEditExternal={handleExternalEdit}
      />
    </Box>
  );
}
