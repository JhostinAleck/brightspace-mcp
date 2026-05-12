import React, { useState } from 'react';
import { Box, useInput, useApp } from 'ink';
import type { TuiDeps } from './types.js';
import { TabBar, TABS, type Tab } from './TabBar.js';
import { StatusBar } from './StatusBar.js';
import { NavigationProvider, useNavDepth } from './NavContext.js';
import { InicioView } from './views/InicioView.js';
import { CursosView } from './views/CursosView.js';
import { CalendarioView } from './views/CalendarioView.js';
import { ConfigView } from './views/ConfigView.js';
import { CacheView } from './views/CacheView.js';
import { LogsView } from './views/LogsView.js';

const VIEW_MAP: Record<Tab, (deps: TuiDeps) => React.ReactElement> = {
  inicio: (deps) => <InicioView deps={deps} />,
  cursos: (deps) => <CursosView deps={deps} />,
  calendario: (deps) => <CalendarioView deps={deps} />,
  config: (deps) => <ConfigView deps={deps} />,
  cache: (deps) => <CacheView deps={deps} />,
  logs: (deps) => <LogsView deps={deps} />,
};

function AppInner({ deps }: { deps: TuiDeps }) {
  const [activeTab, setActiveTab] = useState<Tab>('inicio');
  // Track which tabs have ever been visited so we only mount them once
  const [visited, setVisited] = useState<Set<Tab>>(new Set(['inicio']));
  const { exit } = useApp();
  const navDepth = useNavDepth();

  useInput((input, key) => {
    if (key.ctrl && input === 'c') { exit(); return; }
    if (navDepth > 0) return;
    if (key.tab || key.rightArrow) {
      setActiveTab((t) => {
        const next = TABS[(TABS.indexOf(t) + 1) % TABS.length] as Tab;
        setVisited((v) => new Set([...v, next]));
        return next;
      });
      return;
    }
    if (key.leftArrow) {
      setActiveTab((t) => {
        const prev = TABS[(TABS.indexOf(t) - 1 + TABS.length) % TABS.length] as Tab;
        setVisited((v) => new Set([...v, prev]));
        return prev;
      });
      return;
    }
  });

  return (
    <Box flexDirection="column" height="100%">
      <TabBar active={activeTab} />
      <Box flexGrow={1} overflow="hidden">
        {/* Keep visited views mounted with display:none to preserve state & avoid refetch */}
        {TABS.map((tab) => (
          <Box key={tab} display={activeTab === tab ? 'flex' : 'none'} flexGrow={1} overflow="hidden">
            {visited.has(tab) ? VIEW_MAP[tab](deps) : null}
          </Box>
        ))}
      </Box>
      <StatusBar deps={deps} activeTab={activeTab} />
    </Box>
  );
}

export function App({ deps }: { deps: TuiDeps }) {
  return (
    <NavigationProvider>
      <AppInner deps={deps} />
    </NavigationProvider>
  );
}
