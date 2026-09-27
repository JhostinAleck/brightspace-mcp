import { DomainError } from '@/shared-kernel/errors/DomainError.js';

/**
 * The tenant does not let the caller list quiz attempts. D2L gates
 * `GET /quizzes/{id}/attempts/` behind the `Quizzing.GradeAttempts`
 * permission, which students normally do not have — so a 403 here is the
 * expected outcome for a student account, not an auth failure.
 */
export class QuizAttemptsNotAccessibleError extends DomainError {
  readonly code = 'QUIZ_ATTEMPTS_NOT_ACCESSIBLE';
  readonly userMessage =
    'Brightspace does not let this account list quiz attempts through the API ' +
    '(the endpoint requires the Quizzing.GradeAttempts permission, which students usually lack). ' +
    'Check the quiz score with get_my_grades, or open the quiz in Brightspace to see your attempts.';

  constructor(readonly quizId: number, cause?: Error) {
    super(`Quiz attempts for quiz ${quizId} are not accessible (403)`, cause);
  }
}
