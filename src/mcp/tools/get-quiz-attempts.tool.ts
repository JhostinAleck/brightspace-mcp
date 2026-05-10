import { getQuizAttempts } from '@/contexts/quizzes/application/getQuizAttempts.js';
import type { QuizRepository } from '@/contexts/quizzes/domain/QuizRepository.js';
import { getQuizAttemptsSchema } from '@/mcp/schemas.js';
import { UTC_WARNING } from '@/mcp/tool-helpers.js';

export interface GetQuizAttemptsDeps {
  quizRepo: QuizRepository;
}

export async function handleGetQuizAttempts(deps: GetQuizAttemptsDeps, rawInput: unknown) {
  const input = getQuizAttemptsSchema.parse(rawInput);
  const attempts = await getQuizAttempts({
    repo: deps.quizRepo,
    courseId: String(input.course_id),
    quizId: input.quiz_id,
  });

  if (attempts.length === 0) {
    return { content: [{ type: 'text' as const, text: 'No attempts on this quiz yet.' }] };
  }

  const lines = attempts.map((a) => {
    const score = a.score !== null && a.outOf !== null
      ? `${a.score}/${a.outOf} (${a.percent}%)`
      : 'ungraded';
    const status = a.isSubmitted ? 'submitted' : 'in progress';
    const completed = a.completedAt ? a.completedAt.toISOString() : 'not completed';
    return ` • Attempt ${a.attemptNumber} (id=${a.id}) — ${score}, ${status}\n   Started: ${a.startedAt.toISOString()}\n   Completed: ${completed}`;
  });

  return {
    content: [{
      type: 'text' as const,
      text: `${attempts.length} attempt(s):\n${lines.join('\n')}\n\n${UTC_WARNING}`,
    }],
  };
}
