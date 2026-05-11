import { listQuizzes } from '@/contexts/quizzes/application/listQuizzes.js';
import type { QuizRepository } from '@/contexts/quizzes/domain/QuizRepository.js';
import { listQuizzesSchema } from '@/mcp/schemas.js';
import type { OutputContext } from '@/shared-kernel/output/index.js';

export interface ListQuizzesDeps {
  quizRepo: QuizRepository;
  output: OutputContext;
}

export async function handleListQuizzes(deps: ListQuizzesDeps, rawInput: unknown) {
  const input = listQuizzesSchema.parse(rawInput);
  const quizzes = await listQuizzes({ repo: deps.quizRepo, courseId: String(input.course_id) });

  if (quizzes.length === 0) {
    return { content: [{ type: 'text' as const, text: 'No quizzes in this course.' }] };
  }

  const lines = quizzes.map((q) => {
    const due = q.endDate ? q.endDate.toISOString() : 'no close date';
    const remaining = q.attemptsRemaining;
    const attempts = q.attemptsAllowed === null
      ? `${q.attemptsTaken} taken (unlimited)`
      : `${q.attemptsTaken}/${q.attemptsAllowed} taken${remaining !== null ? ` (${remaining} remaining)` : ''}`;
    if (input.format === 'detailed') {
      const tl = q.timeLimitMinutes !== null ? `\n  Time limit: ${q.timeLimitMinutes} min` : '';
      const desc = q.instructions ? `\n  Instructions: ${q.instructions.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 200)}` : '';
      return `• ${q.name} (id=${q.id})\n  Closes: ${due}\n  Attempts: ${attempts}${tl}${desc}`;
    }
    return ` • ${q.name} — closes ${due}, ${attempts} (id=${q.id})`;
  });

  const header = `Quizzes (${quizzes.length}):`;
  const text = `${header}\n${lines.join('\n')}`;
  const footer = deps.output.metaFooter();
  const body = footer ? `${text}\n\n${footer}` : text;
  return {
    content: [{
      type: 'text' as const,
      text: body,
    }],
  };
}
