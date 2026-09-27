import type { Quiz } from '@/contexts/quizzes/domain/Quiz.js';
import type { QuizRepository } from '@/contexts/quizzes/domain/QuizRepository.js';
import type { OrgUnitId } from '@/shared-kernel/types/OrgUnitId.js';

export interface GetUpcomingQuizzesInput {
  repo: QuizRepository;
  courseIds: OrgUnitId[];
  from: Date;
  to: Date;
}

export interface UpcomingQuiz {
  quiz: Quiz;
  /** DueDate when set, otherwise EndDate. */
  deadline: Date;
}

/**
 * Active quizzes whose deadline (DueDate, else EndDate) falls in [from, to],
 * across courses, sorted by deadline. A course whose quiz lookup fails is
 * skipped rather than failing the whole overview.
 */
export async function getUpcomingQuizzes(input: GetUpcomingQuizzesInput): Promise<UpcomingQuiz[]> {
  const results = await Promise.allSettled(input.courseIds.map((id) => input.repo.findByCourse(id)));
  const fromMs = input.from.getTime();
  const toMs = input.to.getTime();
  const upcoming: UpcomingQuiz[] = [];
  for (const r of results) {
    if (r.status !== 'fulfilled') continue;
    for (const quiz of r.value) {
      const deadline = quiz.dueDate ?? quiz.endDate;
      if (!quiz.isActive || !deadline) continue;
      const t = deadline.getTime();
      if (t >= fromMs && t <= toMs) upcoming.push({ quiz, deadline });
    }
  }
  return upcoming.sort((a, b) => a.deadline.getTime() - b.deadline.getTime());
}
