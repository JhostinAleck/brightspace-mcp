import type { Quiz } from '@/contexts/quizzes/domain/Quiz.js';
import type { QuizRepository } from '@/contexts/quizzes/domain/QuizRepository.js';
import { createOrgUnitId } from '@/shared-kernel/types/OrgUnitId.js';

export interface ListQuizzesInput {
  repo: QuizRepository;
  courseId: string;
}

export async function listQuizzes(input: ListQuizzesInput): Promise<Quiz[]> {
  return input.repo.findByCourse(createOrgUnitId(input.courseId));
}
