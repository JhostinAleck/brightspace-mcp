import type { D2lApiClient } from '@/contexts/http-api/D2lApiClient.js';
import { Quiz } from '@/contexts/quizzes/domain/Quiz.js';
import { QuizAttempt } from '@/contexts/quizzes/domain/QuizAttempt.js';
import type { QuizRepository } from '@/contexts/quizzes/domain/QuizRepository.js';
import { OrgUnitId } from '@/shared-kernel/types/OrgUnitId.js';

interface RichTextDto {
  Html?: string | null;
  Text?: string | null;
}

/**
 * Pull a plain string out of a D2L RichText field. The API returns this in two
 * shapes depending on tenant and endpoint: the RichText object inline, or
 * wrapped one level deeper under `Text`. Returning the object rather than a
 * string is what produced `q.instructions.replace is not a function` at the
 * render layer, so normalise here and never hand a non-string upward.
 */
function readRichText(field: unknown): string | null {
  if (field == null) return null;
  if (typeof field === 'string') return field;
  if (typeof field !== 'object') return null;
  const o = field as Record<string, unknown>;
  if (typeof o.Html === 'string') return o.Html;
  if (typeof o.Text === 'string') return o.Text;
  // Nested: { Text: { Html, Text } }
  if (o.Text != null && typeof o.Text === 'object') return readRichText(o.Text);
  return null;
}

interface QuizDto {
  QuizId?: number;
  Name?: string;
  // D2L is inconsistent here: some tenants/endpoints return the RichText
  // object inline ({Html, Text}), others nest it under `Text`
  // ({Text: {Html, Text}, IsDisplayed}). Model both and normalise on read.
  Description?: RichTextDto | { Text?: RichTextDto | string | null; IsDisplayed?: boolean } | null;
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
    // The quizzes list is paged: D2L returns 20 per page and hands back an
    // absolute `Next` URL. Ignoring it silently truncated courses with more
    // than 20 quizzes, which is common when homework is modelled as quizzes.
    const dtos: QuizDto[] = [];
    let next: string | null = `/d2l/api/le/${this.versions.le}/${orgUnit}/quizzes/`;
    const seen = new Set<string>();
    const MAX_PAGES = 200;
    for (let page = 0; next && page < MAX_PAGES; page++) {
      if (seen.has(next)) break;
      seen.add(next);
      const response: QuizListResponse = await this.client.get<QuizListResponse>(next);
      dtos.push(...(response.Objects ?? []));
      // `Next` comes back absolute; the client expects a tenant-relative path.
      const raw = response.Next ?? null;
      next = raw ? raw.replace(/^https?:\/\/[^/]+/i, '') : null;
    }
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
      instructions: readRichText(dto.Description),
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
