import React from 'react';
import { Box, Text } from 'ink';
import type { Translator } from '@/shared-kernel/output/i18n/translator.js';

export type Tab = 'inicio' | 'cursos' | 'calendario' | 'config' | 'cache' | 'logs';

export const TABS: Tab[] = ['inicio', 'cursos', 'calendario', 'config', 'cache', 'logs'];

export function TabBar({ active, t }: { active: Tab; t: Translator }) {
  return (
    <Box borderStyle="single" borderBottom paddingX={1} flexShrink={0}>
      {TABS.map((tab, i) => (
        <Box key={tab} marginRight={i < TABS.length - 1 ? 2 : 0}>
          <Text
            color={active === tab ? 'blueBright' : 'gray'}
            bold={active === tab}
            underline={active === tab}
          >
            {t(`tui.tabs.${tab}`)}
          </Text>
        </Box>
      ))}
    </Box>
  );
}
