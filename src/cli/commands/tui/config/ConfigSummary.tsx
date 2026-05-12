import React, { useState } from 'react';
import { Box, Text, useInput } from 'ink';
import { existsSync, readFileSync } from 'node:fs';
import { parse as parseYaml } from 'yaml';
import type { Translator } from '@/shared-kernel/output/i18n/translator.js';

interface Props {
  configPath: string;
  profile: string;
  onEditForm: () => void;
  onEditExternal: () => void;
  t: Translator;
}

export function ConfigSummary({ configPath, profile, onEditForm, onEditExternal, t }: Props) {
  type Action = 'form' | 'editor';
  const actions: Action[] = ['form', 'editor'];
  const actionLabels: Record<Action, string> = {
    form: t('tui.config.edit_form'),
    editor: t('tui.config.edit_editor'),
  };
  const [cursor, setCursor] = useState(0);

  let baseUrl = '—';
  let strategy = '—';
  let locale = '—';
  try {
    if (existsSync(configPath)) {
      const yaml = parseYaml(readFileSync(configPath, 'utf8')) as Record<string, unknown>;
      const profiles = yaml['profiles'] as Record<string, unknown> | undefined;
      const prof = profiles?.[profile] as Record<string, unknown> | undefined;
      baseUrl = (prof?.['base_url'] as string | undefined) ?? '—';
      const auth = prof?.['auth'] as Record<string, unknown> | undefined;
      strategy = (auth?.['strategy'] as string | undefined) ?? '—';
      const output = yaml['output'] as Record<string, unknown> | undefined;
      locale = (output?.['locale'] as string | undefined) ?? '—';
    }
  } catch { /* display defaults */ }

  useInput((input, key) => {
    if (input === 'e') { onEditForm(); return; }
    if (input === 'E') { onEditExternal(); return; }
    if (key.upArrow) setCursor((c) => Math.max(0, c - 1));
    if (key.downArrow) setCursor((c) => Math.min(actions.length - 1, c + 1));
    if (key.return) {
      const action = actions[cursor];
      if (action === 'form') onEditForm();
      else if (action === 'editor') onEditExternal();
    }
  });

  return (
    <Box flexDirection="column">
      <Box flexDirection="column" marginBottom={1} borderStyle="round" paddingX={1}>
        <Text><Text color="gray">perfil:   </Text>{profile}</Text>
        <Text><Text color="gray">base_url: </Text>{baseUrl}</Text>
        <Text><Text color="gray">strategy: </Text>{strategy}</Text>
        <Text><Text color="gray">locale:   </Text>{locale}</Text>
      </Box>
      {actions.map((a, i) => (
        <Text key={a} color={i === cursor ? 'blueBright' : 'gray'}>
          {i === cursor ? '❯ ' : '  '}{actionLabels[a]}
        </Text>
      ))}
    </Box>
  );
}
