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
const SUB_LABELS: Record<SubTab, string> = { tareas: 'Tareas', notas: 'Notas', anuncios: 'Anuncios' };

interface Props {
  courseId: CourseId;
  courseName: string;
  deps: TuiDeps;
  onBack: () => void;
}

export function CourseDetail({ courseId, courseName, deps, onBack }: Props) {
  const [subTab, setSubTab] = useState<SubTab>('tareas');
  const orgUnitId = OrgUnitId.of(CourseIdUtil.toNumber(courseId));
  useSubNavLevel(); // disables top-level Tab navigation while this is mounted

  useInput((input, key) => {
    if (key.backspace || key.escape || input === 'b') { onBack(); return; }
    if (key.tab || key.rightArrow) {
      setSubTab((t) => SUB_TABS[(SUB_TABS.indexOf(t) + 1) % SUB_TABS.length] as SubTab);
      return;
    }
    if (key.leftArrow) {
      setSubTab((t) => SUB_TABS[(SUB_TABS.indexOf(t) - 1 + SUB_TABS.length) % SUB_TABS.length] as SubTab);
      return;
    }
  });

  return (
    <Box flexDirection="column" padding={1}>
      {/* Course header */}
      <Box marginBottom={1}>
        <Text color="blueBright" bold>📚 {courseName}</Text>
        <Text color="gray"> · Backspace/b: volver</Text>
      </Box>

      {/* Sub-tab bar */}
      <Box marginBottom={1} borderStyle="single" borderBottom paddingX={1}>
        {SUB_TABS.map((t, i) => (
          <Box key={t} marginRight={i < SUB_TABS.length - 1 ? 2 : 0}>
            <Text
              color={subTab === t ? 'greenBright' : 'gray'}
              bold={subTab === t}
              underline={subTab === t}
            >
              {SUB_LABELS[t]}
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
