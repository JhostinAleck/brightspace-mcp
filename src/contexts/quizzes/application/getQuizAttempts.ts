import type { QuizAttempt } from '@/contexts/quizzes/domain/QuizAttempt.js';
import type { QuizRepository } from '@/contexts/quizzes/domain/QuizRepository.js';
import { createOrgUnitId } from '@/shared-kernel/types/OrgUnitId.js';

export interface GetQuizAttemptsInput {
  repo: QuizRepository;
  courseId: string;
  quizId: number;
}

export async function getQuizAttempts(input: GetQuizAttemptsInput): Promise<QuizAttempt[]> {
  return input.repo.findAttempts(createOrgUnitId(input.courseId), input.quizId);
}
