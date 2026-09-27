import { listQuizzes } from '@/contexts/quizzes/application/listQuizzes.js';
import type { Quiz } from '@/contexts/quizzes/domain/Quiz.js';
import type { QuizRepository } from '@/contexts/quizzes/domain/QuizRepository.js';
import { listQuizzesSchema } from '@/mcp/schemas.js';
import type { OutputContext } from '@/shared-kernel/output/index.js';
import { stripHtmlPreservingLinks } from '@/shared-kernel/text/stripHtml.js';

export interface ListQuizzesDeps {
  quizRepo: QuizRepository;
  output: OutputContext;
}

function attemptsLabel(q: Quiz): string {
  if (q.attemptsTaken === null) {
    // D2L does not expose the student's attempt count on the quiz list.
    if (q.attemptsAllowed === null) return 'unlimited attempts';
    return `${q.attemptsAllowed} attempt${q.attemptsAllowed === 1 ? '' : 's'} allowed`;
  }
  if (q.attemptsAllowed === null) return `${q.attemptsTaken} taken (unlimited)`;
  const remaining = q.attemptsRemaining;
  return `${q.attemptsTaken}/${q.attemptsAllowed} taken${remaining !== null ? ` (${remaining} remaining)` : ''}`;
}

function instructionsSnippet(raw: unknown): string | null {
  if (typeof raw !== 'string' || raw.trim() === '') return null;
  const text = stripHtmlPreservingLinks(raw);
  if (!text) return null;
  return text.length > 200 ? `${text.slice(0, 197)}...` : text;
}

export async function handleListQuizzes(deps: ListQuizzesDeps, rawInput: unknown) {
  const input = listQuizzesSchema.parse(rawInput);
  const quizzes = await listQuizzes({ repo: deps.quizRepo, courseId: String(input.course_id) });

  if (quizzes.length === 0) {
    return { content: [{ type: 'text' as const, text: 'No quizzes in this course.' }] };
  }

  const fmt = (d: Date | null) => deps.output.formatDate(d, 'datetime');
  const lines = quizzes.map((q) => {
    const attempts = attemptsLabel(q);
    const inactive = q.isActive ? '' : ' [inactive]';
    if (input.format === 'detailed') {
      const opens = q.startDate ? `\n  Opens: ${fmt(q.startDate)}` : '';
      const due = q.dueDate ? `\n  Due: ${fmt(q.dueDate)}` : '';
      const closes = `\n  Closes: ${q.endDate ? fmt(q.endDate) : 'no close date'}`;
      const tl = q.timeLimitMinutes !== null ? `\n  Time limit: ${q.timeLimitMinutes} min` : '';
      const snippet = instructionsSnippet(q.instructions);
      const desc = snippet ? `\n  Instructions: ${snippet}` : '';
      return `• ${q.name}${inactive} (id=${q.id})${opens}${due}${closes}\n  Attempts: ${attempts}${tl}${desc}`;
    }
    const deadline = q.dueDate ?? q.endDate;
    const when = q.dueDate ? `due ${fmt(q.dueDate)}` : deadline ? `closes ${fmt(deadline)}` : 'no close date';
    return ` • ${q.name}${inactive} — ${when}, ${attempts} (id=${q.id})`;
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
