import React, { useState } from 'react';
import { Box, useInput, useApp } from 'ink';
import type { TuiDeps } from './types.js';
import { TabBar, TABS, type Tab } from './TabBar.js';
import { StatusBar } from './StatusBar.js';
import { InicioView } from './views/InicioView.js';
import { CursosView } from './views/CursosView.js';
import { CalendarioView } from './views/CalendarioView.js';
import { ConfigView } from './views/ConfigView.js';
import { CacheView } from './views/CacheView.js';
import { LogsView } from './views/LogsView.js';

export function App({ deps }: { deps: TuiDeps }) {
  const [activeTab, setActiveTab] = useState<Tab>('inicio');
  const { exit } = useApp();

  useInput((input, key) => {
    if (key.ctrl && input === 'c') { exit(); return; }
    if (key.tab || key.rightArrow) {
      setActiveTab((t) => TABS[(TABS.indexOf(t) + 1) % TABS.length] as Tab);
      return;
    }
    if (key.leftArrow) {
      setActiveTab((t) => TABS[(TABS.indexOf(t) - 1 + TABS.length) % TABS.length] as Tab);
      return;
    }
  });

  return (
    <Box flexDirection="column" height="100%">
      <TabBar active={activeTab} />
      <Box flexGrow={1} overflow="hidden">
        {activeTab === 'inicio' && <InicioView deps={deps} />}
        {activeTab === 'cursos' && <CursosView deps={deps} />}
        {activeTab === 'calendario' && <CalendarioView deps={deps} />}
        {activeTab === 'config' && <ConfigView deps={deps} />}
        {activeTab === 'cache' && <CacheView deps={deps} />}
        {activeTab === 'logs' && <LogsView deps={deps} />}
      </Box>
      <StatusBar deps={deps} />
    </Box>
  );
}
