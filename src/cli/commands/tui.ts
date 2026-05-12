import type { CourseRepository } from '@/contexts/courses/domain/CourseRepository.js';
import type { GradeRepository } from '@/contexts/grades/domain/GradeRepository.js';
import type { AssignmentRepository } from '@/contexts/assignments/domain/AssignmentRepository.js';
import type { CommunicationsRepository } from '@/contexts/communications/domain/CommunicationsRepository.js';
import type { CalendarRepository } from '@/contexts/calendar/domain/CalendarRepository.js';
import type { OutputContext } from '@/shared-kernel/output/index.js';
import type { MetricsRegistry } from '@/shared-kernel/observability/MetricsRegistry.js';
import type { HttpResponseCache } from '@/contexts/http-api/cache/HttpResponseCache.js';

export interface TuiDeps {
  courseRepo: CourseRepository;
  gradeRepo: GradeRepository;
  assignmentRepo: AssignmentRepository;
  communicationsRepo: CommunicationsRepository;
  calendarRepo: CalendarRepository;
  httpCache?: HttpResponseCache;
  auditLogPath: string;
  configPath: string;
  profile: string;
  output: OutputContext;
  metrics: MetricsRegistry;
}

export async function runTui(deps: TuiDeps): Promise<void> {
  const { render } = await import('ink');
  const React = await import('react');
  const { App } = await import('./tui/App.js');
  const instance = render(React.createElement(App, { deps }));
  await instance.waitUntilExit();
}
