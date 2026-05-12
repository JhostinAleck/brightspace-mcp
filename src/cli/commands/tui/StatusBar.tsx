import React from 'react';
import { Box, Text } from 'ink';
import type { TuiDeps } from './types.js';

export function StatusBar({ deps }: { deps: TuiDeps }) {
  const t = deps.output.t;
  return (
    <Box
      borderStyle="single"
      borderTop
      paddingX={1}
      flexShrink={0}
      justifyContent="space-between"
    >
      <Text color="gray">
        {t('tui.status.profile')} <Text color="white">{deps.profile}</Text>
      </Text>
      <Text color="gray">
        {t('tui.status.hint')}
      </Text>
    </Box>
  );
}
