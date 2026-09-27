import { getQuizAttempts } from '@/contexts/quizzes/application/getQuizAttempts.js';
import type { QuizAttempt } from '@/contexts/quizzes/domain/QuizAttempt.js';
import { QuizAttemptsNotAccessibleError } from '@/contexts/quizzes/domain/QuizAttemptsNotAccessibleError.js';
import type { QuizRepository } from '@/contexts/quizzes/domain/QuizRepository.js';
import { getQuizAttemptsSchema } from '@/mcp/schemas.js';
import type { OutputContext } from '@/shared-kernel/output/index.js';

export interface GetQuizAttemptsDeps {
  quizRepo: QuizRepository;
  output: OutputContext;
}

export async function handleGetQuizAttempts(deps: GetQuizAttemptsDeps, rawInput: unknown) {
  const input = getQuizAttemptsSchema.parse(rawInput);
  let attempts: QuizAttempt[];
  try {
    attempts = await getQuizAttempts({
      repo: deps.quizRepo,
      courseId: String(input.course_id),
      quizId: input.quiz_id,
    });
  } catch (err) {
    if (err instanceof QuizAttemptsNotAccessibleError) {
      return { content: [{ type: 'text' as const, text: err.userMessage }] };
    }
    throw err;
  }

  if (attempts.length === 0) {
    return { content: [{ type: 'text' as const, text: 'No attempts on this quiz yet.' }] };
  }

  const fmt = (d: Date) => deps.output.formatDate(d, 'datetime');
  const lines = attempts.map((a) => {
    let score: string;
    if (a.score !== null && a.outOf !== null) score = `${a.score}/${a.outOf} (${a.percent}%)`;
    else if (a.score !== null) score = `score ${a.score}`;
    else score = 'ungraded';
    const status = a.isSubmitted ? 'submitted' : 'in progress';
    const completed = a.completedAt ? fmt(a.completedAt) : 'not completed';
    return ` • Attempt ${a.attemptNumber} (id=${a.id}) — ${score}, ${status}\n   Started: ${fmt(a.startedAt)}\n   Completed: ${completed}`;
  });

  const text = `${attempts.length} attempt(s):\n${lines.join('\n')}`;
  const footer = deps.output.metaFooter();
  const body = footer ? `${text}\n\n${footer}` : text;
  return {
    content: [{
      type: 'text' as const,
      text: body,
    }],
  };
}
