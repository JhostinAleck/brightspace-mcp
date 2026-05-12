import React from 'react';
import { Box, Text } from 'ink';

export type Tab = 'inicio' | 'cursos' | 'calendario' | 'config' | 'cache' | 'logs';

export const TABS: Tab[] = ['inicio', 'cursos', 'calendario', 'config', 'cache', 'logs'];

export const TAB_LABELS: Record<Tab, string> = {
  inicio: 'Inicio',
  cursos: 'Cursos',
  calendario: 'Calendario',
  config: 'Config',
  cache: 'Caché',
  logs: 'Logs',
};

export function TabBar({ active }: { active: Tab }) {
  return (
    <Box borderStyle="single" borderBottom paddingX={1} flexShrink={0}>
      {TABS.map((tab, i) => (
        <Box key={tab} marginRight={i < TABS.length - 1 ? 2 : 0}>
          <Text
            color={active === tab ? 'blueBright' : 'gray'}
            bold={active === tab}
            underline={active === tab}
          >
            {TAB_LABELS[tab]}
          </Text>
        </Box>
      ))}
    </Box>
  );
}
