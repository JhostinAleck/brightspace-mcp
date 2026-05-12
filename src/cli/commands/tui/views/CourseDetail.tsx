import React, { useState } from 'react';
import { Box, Text, useInput } from 'ink';
import type { TuiDeps } from '../types.js';
import type { CourseId } from '@/contexts/courses/domain/CourseId.js';
import { CourseId as CourseIdUtil } from '@/contexts/courses/domain/CourseId.js';
import { OrgUnitId } from '@/shared-kernel/types/OrgUnitId.js';
import { useSubNavLevel } from '../NavContext.js';
import { TareasView } from './TareasView.js';
import { NotasView } from './NotasView.js';
import { AnunciosCursoView } from './AnunciosCursoView.js';

type SubTab = 'tareas' | 'notas' | 'anuncios';
const SUB_TABS: SubTab[] = ['tareas', 'notas', 'anuncios'];

interface Props {
  courseId: CourseId;
  courseName: string;
  deps: TuiDeps;
  onBack: () => void;
}

export function CourseDetail({ courseId, courseName, deps, onBack }: Props) {
  const t = deps.output.t;
  const [subTab, setSubTab] = useState<SubTab>('tareas');
  const orgUnitId = OrgUnitId.of(CourseIdUtil.toNumber(courseId));
  useSubNavLevel(); // disables top-level Tab navigation while this is mounted

  useInput((input, key) => {
    if (key.backspace || key.escape || input === 'b') { onBack(); return; }
    if (key.tab || key.rightArrow) {
      setSubTab((tab) => SUB_TABS[(SUB_TABS.indexOf(tab) + 1) % SUB_TABS.length] as SubTab);
      return;
    }
    if (key.leftArrow) {
      setSubTab((tab) => SUB_TABS[(SUB_TABS.indexOf(tab) - 1 + SUB_TABS.length) % SUB_TABS.length] as SubTab);
      return;
    }
  });

  return (
    <Box flexDirection="column" padding={1}>
      {/* Course header */}
      <Box marginBottom={1}>
        <Text color="blueBright" bold>📚 {courseName}</Text>
        <Text color="gray"> · {t('tui.common.back')}</Text>
      </Box>

      {/* Sub-tab bar */}
      <Box marginBottom={1} borderStyle="single" borderBottom paddingX={1}>
        {SUB_TABS.map((tab, i) => (
          <Box key={tab} marginRight={i < SUB_TABS.length - 1 ? 2 : 0}>
            <Text
              color={subTab === tab ? 'greenBright' : 'gray'}
              bold={subTab === tab}
              underline={subTab === tab}
            >
              {t(`tui.subtabs.${tab}`)}
            </Text>
          </Box>
        ))}
      </Box>

      {/* Sub-view */}
      <Box flexGrow={1}>
        {subTab === 'tareas' && <TareasView orgUnitId={orgUnitId} deps={deps} />}
        {subTab === 'notas' && <NotasView orgUnitId={orgUnitId} deps={deps} />}
        {subTab === 'anuncios' && <AnunciosCursoView orgUnitId={orgUnitId} deps={deps} />}
      </Box>
    </Box>
  );
}
