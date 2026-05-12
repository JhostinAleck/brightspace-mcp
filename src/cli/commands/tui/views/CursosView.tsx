import React, { useState, useCallback } from 'react';
import { Box, Text, useInput } from 'ink';
import type { TuiDeps } from '../types.js';
import { useAsyncData } from '../shared/useAsyncData.js';
import { Spinner } from '../shared/Spinner.js';
import type { CourseId } from '@/contexts/courses/domain/CourseId.js';
import { CourseDetail } from './CourseDetail.js';

export function CursosView({ deps }: { deps: TuiDeps }) {
  const [query, setQuery] = useState('');
  const [cursor, setCursor] = useState(0);
  const [selected, setSelected] = useState<CourseId | null>(null);

  const fetcher = useCallback(() => deps.courseRepo.findMyCourses(), [deps]);
  const { data: courses, loading, error, reload } = useAsyncData(fetcher);

  const filtered = [...(courses ?? [])]
    .sort((a, b) => {
      const ta = a.startDate?.getTime() ?? 0;
      const tb = b.startDate?.getTime() ?? 0;
      return tb - ta; // más reciente primero
    })
    .filter((c) => {
      const q = query.toLowerCase();
      return !q || c.name.toLowerCase().includes(q) || c.code.toLowerCase().includes(q);
    });

  useInput((input, key) => {
    if (selected !== null) return; // delegate to CourseDetail
    if (key.ctrl && input === 'r') { reload(); return; }
    if (key.upArrow) { setCursor((c) => Math.max(0, c - 1)); return; }
    if (key.downArrow) { setCursor((c) => Math.min(filtered.length - 1, c + 1)); return; }
    if (key.return) {
      const course = filtered[cursor];
      if (course) setSelected(course.id);
      return;
    }
    if (key.backspace || key.delete) {
      if (query.length > 0) { setQuery((q) => q.slice(0, -1)); setCursor(0); }
      return;
    }
    if (key.escape) { setQuery(''); setCursor(0); return; }
    if (input && !key.ctrl && !key.meta && input.length === 1) {
      setQuery((q) => q + input);
      setCursor(0);
    }
  });

  if (selected !== null) {
    return (
      <CourseDetail
        courseId={selected}
        courseName={courses?.find((c) => c.id === selected)?.name ?? String(selected)}
        deps={deps}
        onBack={() => setSelected(null)}
      />
    );
  }

  if (loading) return <Box padding={1}><Spinner label="Cargando cursos…" /></Box>;
  if (error) return <Box padding={1}><Text color="red">✗ {error}</Text><Text color="gray"> (r para reintentar)</Text></Box>;

  return (
    <Box flexDirection="column" padding={1}>
      {/* Search bar */}
      <Box marginBottom={1}>
        <Text color="gray">🔍 </Text>
        <Text>{query || ' '}</Text>
        <Text backgroundColor="blue"> </Text>
        <Text color="gray"> ({filtered.length} cursos)</Text>
      </Box>

      {/* Course list */}
      {filtered.slice(0, 20).map((course, i) => {
        const isActive = i === cursor;
        return (
          <Box key={String(course.id)}>
            <Text color={isActive ? 'blueBright' : 'white'} bold={isActive}>
              {isActive ? '▶ ' : '  '}
              {course.name}
            </Text>
            <Text color="gray"> {course.code}</Text>
            {!course.active && <Text color="gray"> (inactivo)</Text>}
          </Box>
        );
      })}
      {filtered.length > 20 && (
        <Text color="gray">  … y {filtered.length - 20} más</Text>
      )}

      <Box marginTop={1}>
        <Text color="gray" dimColor>↑↓ navegar · Enter abrir · Esc limpiar · Ctrl+R refrescar</Text>
      </Box>
    </Box>
  );
}
