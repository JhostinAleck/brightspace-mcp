import type { OrgUnitId } from '@/shared-kernel/types/OrgUnitId.js';

import type { Quiz } from './Quiz.js';
import type { QuizAttempt } from './QuizAttempt.js';

export interface QuizRepository {
  findByCourse(courseId: OrgUnitId): Promise<Quiz[]>;
  findAttempts(courseId: OrgUnitId, quizId: number): Promise<QuizAttempt[]>;
}
