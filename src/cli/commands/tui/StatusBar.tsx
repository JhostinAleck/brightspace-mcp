import React from 'react';
import { Box, Text } from 'ink';
import type { TuiDeps } from './types.js';
import type { Tab } from './TabBar.js';

export function StatusBar({ deps, activeTab }: { deps: TuiDeps; activeTab: Tab }) {
  const reloadHint = activeTab === 'cursos' ? 'Ctrl+R refrescar' : 'r refrescar';
  return (
    <Box
      borderStyle="single"
      borderTop
      paddingX={1}
      flexShrink={0}
      justifyContent="space-between"
    >
      <Text color="gray">
        perfil: <Text color="white">{deps.profile}</Text>
      </Text>
      <Text color="gray">
        Tab/→← navegar  {reloadHint}  Ctrl+C salir
      </Text>
    </Box>
  );
}
