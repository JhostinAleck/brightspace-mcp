import React from 'react';
import { Box, Text } from 'ink';
import type { TuiDeps } from './types.js';

export function StatusBar({ deps }: { deps: TuiDeps }) {
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
        Tab/→← navegar  r refrescar  ? ayuda  q salir
      </Text>
    </Box>
  );
}
