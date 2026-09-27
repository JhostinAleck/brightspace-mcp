import type { D2lApiClient } from '@/contexts/http-api/D2lApiClient.js';
import { D2lApiError } from '@/contexts/http-api/errors.js';
import { fetchAllObjectListPages } from '@/contexts/http-api/pagination.js';
import { Quiz } from '@/contexts/quizzes/domain/Quiz.js';
import { QuizAttempt } from '@/contexts/quizzes/domain/QuizAttempt.js';
import { QuizAttemptsNotAccessibleError } from '@/contexts/quizzes/domain/QuizAttemptsNotAccessibleError.js';
import type { QuizRepository } from '@/contexts/quizzes/domain/QuizRepository.js';
import { parseValidDate } from '@/shared-kernel/date/parseValidDate.js';
import { OrgUnitId } from '@/shared-kernel/types/OrgUnitId.js';

/** D2L RichText: `{ Text, Html }`. */
interface RichTextDto {
  Text?: string | null;
  Html?: string | null;
}

/**
 * D2L `QuizReadData` wraps rich text one level deeper than usual:
 * `Description: { Text: { Text, Html }, IsDisplayed }`. Flat RichText and
 * plain strings are tolerated too.
 */
type QuizRichTextField =
  | { Text?: RichTextDto | string | null; Html?: string | null; IsDisplayed?: boolean }
  | string
  | null;

/** D2L `QuizReadData` (only the fields we read), verified against LE 1.99. */
interface QuizDto {
  QuizId?: number;
  Name?: string;
  IsActive?: boolean;
  Description?: QuizRichTextField;
  Instructions?: QuizRichTextField;
  StartDate?: string | null;
  EndDate?: string | null;
  DueDate?: string | null;
  AttemptsAllowed?: { IsUnlimited?: boolean; NumberOfAttemptsAllowed?: number | null } | null;
  SubmissionTimeLimit?: { IsEnforced?: boolean; ShowClock?: boolean; TimeLimitValue?: number | null } | null;
  IsAutoSetGraded?: boolean;
}

/**
 * D2L `QuizAttemptData`. `Score` is documented as a decimal; the
 * `{ Score, OutOf }` object form is accepted for robustness.
 */
interface AttemptDto {
  AttemptId?: number;
  AttemptNumber?: number;
  TimeStarted?: string | null;
  TimeCompleted?: string | null;
  Score?: number | { Score?: number | null; OutOf?: number | null } | null;
  IsSubmitted?: boolean;
}

function richTextToString(field: QuizRichTextField | undefined): string | null {
  if (field === null || field === undefined) return null;
  if (typeof field === 'string') return field.trim() || null;
  const inner = field.Text;
  let html: string | null | undefined;
  let text: string | null | undefined;
  if (inner !== null && typeof inner === 'object') {
    html = inner.Html;
    text = inner.Text;
  } else {
    html = field.Html;
    text = typeof inner === 'string' ? inner : null;
  }
  return html?.trim() || text?.trim() || null;
}

export interface D2lQuizRepositoryOptions {
  le: string;
}

/**
 * D2L Quizzes API adapter.
 *
 * Endpoints used (read-only):
 *   - GET /d2l/api/le/{ver}/{ou}/quizzes/                — quizzes for a course (paged)
 *   - GET /d2l/api/le/{ver}/{ou}/quizzes/{id}/attempts/  — attempts (paged; requires
 *     Quizzing.GradeAttempts, so student accounts normally get 403)
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
    const dtos = await fetchAllObjectListPages<QuizDto>(
      this.client,
      `/d2l/api/le/${this.versions.le}/${orgUnit}/quizzes/`,
    );
    return dtos
      .filter((dto): dto is QuizDto & { QuizId: number; Name: string } =>
        typeof dto.QuizId === 'number' && typeof dto.Name === 'string',
      )
      .map((dto) => this.toQuiz(dto, orgUnit));
  }

  async findAttempts(courseId: OrgUnitId, quizId: number): Promise<QuizAttempt[]> {
    const orgUnit = OrgUnitId.toNumber(courseId);
    let dtos: AttemptDto[];
    try {
      dtos = await fetchAllObjectListPages<AttemptDto>(
        this.client,
        `/d2l/api/le/${this.versions.le}/${orgUnit}/quizzes/${quizId}/attempts/`,
      );
    } catch (err) {
      if (err instanceof D2lApiError && err.status === 403) {
        throw new QuizAttemptsNotAccessibleError(quizId, err);
      }
      throw err;
    }
    return dtos
      .filter((dto): dto is AttemptDto & { AttemptId: number; TimeStarted: string } =>
        typeof dto.AttemptId === 'number' && parseValidDate(dto.TimeStarted) !== null,
      )
      .map((dto) => this.toAttempt(dto, quizId));
  }

  private toQuiz(dto: QuizDto & { QuizId: number; Name: string }, orgUnit: number): Quiz {
    const allowedDto = dto.AttemptsAllowed;
    const allowed =
      allowedDto?.IsUnlimited === false && typeof allowedDto.NumberOfAttemptsAllowed === 'number'
        ? allowedDto.NumberOfAttemptsAllowed
        : null;
    const tl = dto.SubmissionTimeLimit;
    return new Quiz({
      id: dto.QuizId,
      courseOrgUnitId: orgUnit,
      name: dto.Name,
      instructions: richTextToString(dto.Description) ?? richTextToString(dto.Instructions),
      startDate: parseValidDate(dto.StartDate),
      endDate: parseValidDate(dto.EndDate),
      dueDate: parseValidDate(dto.DueDate),
      isActive: dto.IsActive ?? true,
      // The quiz list carries no per-student attempt count — unknown, never 0.
      attemptsTaken: null,
      attemptsAllowed: allowed,
      timeLimitMinutes: tl?.IsEnforced ? tl.TimeLimitValue ?? null : null,
      autoGrade: dto.IsAutoSetGraded ?? false,
    });
  }

  private toAttempt(
    dto: AttemptDto & { AttemptId: number; TimeStarted: string },
    quizId: number,
  ): QuizAttempt {
    const completedAt = parseValidDate(dto.TimeCompleted);
    const rawScore = dto.Score;
    const score = typeof rawScore === 'number' ? rawScore : rawScore?.Score ?? null;
    const outOf = typeof rawScore === 'object' && rawScore !== null ? rawScore.OutOf ?? null : null;
    return new QuizAttempt({
      id: dto.AttemptId,
      quizId,
      attemptNumber: dto.AttemptNumber ?? 0,
      startedAt: new Date(dto.TimeStarted),
      completedAt,
      score,
      outOf,
      isSubmitted: dto.IsSubmitted ?? completedAt !== null,
    });
  }
}
