import type { D2lApiClient } from '@/contexts/http-api/D2lApiClient.js';
import { Quiz } from '@/contexts/quizzes/domain/Quiz.js';
import { QuizAttempt } from '@/contexts/quizzes/domain/QuizAttempt.js';
import type { QuizRepository } from '@/contexts/quizzes/domain/QuizRepository.js';
import { OrgUnitId } from '@/shared-kernel/types/OrgUnitId.js';

interface QuizDto {
  QuizId?: number;
  Name?: string;
  Description?: { Html?: string | null; Text?: string | null } | null;
  StartDate?: string | null;
  EndDate?: string | null;
  AttemptsAllowed?: { Type?: { Id?: number }; NumberOfAttemptsAllowed?: number | null } | null;
  Submissions?: number | null;
  TimeLimit?: { IsEnforced?: boolean; TimeLimitValue?: number | null } | null;
  AutoSetGraded?: boolean;
}

interface QuizListResponse {
  Objects?: QuizDto[];
  Next?: string | null;
}

interface AttemptDto {
  AttemptId?: number;
  QuizId?: number;
  AttemptNumber?: number;
  TimeStarted?: string | null;
  TimeCompleted?: string | null;
  Score?: { Score?: number | null; OutOf?: number | null } | null;
  IsSubmitted?: boolean;
}

interface AttemptsListResponse {
  Objects?: AttemptDto[];
}

export interface D2lQuizRepositoryOptions {
  le: string;
}

/**
 * D2L Quizzes API adapter.
 *
 * Endpoints used (read-only):
 *   - GET /d2l/api/le/{ver}/{ou}/quizzes/        — list of quizzes for a course
 *   - GET /d2l/api/le/{ver}/{ou}/quizzes/{id}/attempts/ — student's attempts
 *
 * The Quizzes API exposes more (questions, answer keys, etc.) but those are
 * intentionally NOT surfaced — quiz integrity matters and we don't want to
 * accidentally enable a "have the LLM solve the quiz" workflow. The adapter
 * is read-only and limited to metadata + scores.
 */
export class D2lQuizRepository implements QuizRepository {
  constructor(
    private readonly client: D2lApiClient,
    private readonly versions: D2lQuizRepositoryOptions,
  ) {}

  async findByCourse(courseId: OrgUnitId): Promise<Quiz[]> {
    const orgUnit = OrgUnitId.toNumber(courseId);
    const response = await this.client.get<QuizListResponse>(
      `/d2l/api/le/${this.versions.le}/${orgUnit}/quizzes/`,
    );
    const dtos = response.Objects ?? [];
    return dtos
      .filter((dto): dto is QuizDto & { QuizId: number; Name: string } =>
        typeof dto.QuizId === 'number' && typeof dto.Name === 'string',
      )
      .map((dto) => this.toQuiz(dto, orgUnit));
  }

  async findAttempts(courseId: OrgUnitId, quizId: number): Promise<QuizAttempt[]> {
    const orgUnit = OrgUnitId.toNumber(courseId);
    const response = await this.client.get<AttemptsListResponse>(
      `/d2l/api/le/${this.versions.le}/${orgUnit}/quizzes/${quizId}/attempts/`,
    );
    const dtos = response.Objects ?? [];
    return dtos
      .filter((dto): dto is AttemptDto & { AttemptId: number; TimeStarted: string } =>
        typeof dto.AttemptId === 'number' && typeof dto.TimeStarted === 'string',
      )
      .map((dto) => this.toAttempt(dto, quizId));
  }

  private toQuiz(dto: QuizDto & { QuizId: number; Name: string }, orgUnit: number): Quiz {
    // AttemptsAllowed.Type.Id: 0=Unlimited, 1=Limited (with NumberOfAttemptsAllowed)
    const allowed = dto.AttemptsAllowed?.Type?.Id === 1
      ? dto.AttemptsAllowed.NumberOfAttemptsAllowed ?? null
      : null;
    return new Quiz({
      id: dto.QuizId,
      courseOrgUnitId: orgUnit,
      name: dto.Name,
      instructions: dto.Description?.Html ?? dto.Description?.Text ?? null,
      startDate: dto.StartDate ? new Date(dto.StartDate) : null,
      endDate: dto.EndDate ? new Date(dto.EndDate) : null,
      attemptsTaken: dto.Submissions ?? 0,
      attemptsAllowed: allowed,
      timeLimitMinutes: dto.TimeLimit?.IsEnforced ? dto.TimeLimit.TimeLimitValue ?? null : null,
      autoGrade: dto.AutoSetGraded ?? false,
    });
  }

  private toAttempt(
    dto: AttemptDto & { AttemptId: number; TimeStarted: string },
    quizId: number,
  ): QuizAttempt {
    return new QuizAttempt({
      id: dto.AttemptId,
      quizId,
      attemptNumber: dto.AttemptNumber ?? 0,
      startedAt: new Date(dto.TimeStarted),
      completedAt: dto.TimeCompleted ? new Date(dto.TimeCompleted) : null,
      score: dto.Score?.Score ?? null,
      outOf: dto.Score?.OutOf ?? null,
      isSubmitted: dto.IsSubmitted ?? false,
    });
  }
}
