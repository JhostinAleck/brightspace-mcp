import type {
  AssignmentRepository,
  SubmitInput,
  SubmitResult,
} from '@/contexts/assignments/domain/AssignmentRepository.js';
import { Assignment } from '@/contexts/assignments/domain/Assignment.js';
import { AssignmentId } from '@/contexts/assignments/domain/AssignmentId.js';
import { DueDate } from '@/contexts/assignments/domain/DueDate.js';
import { Submission } from '@/contexts/assignments/domain/Submission.js';
import { Feedback } from '@/contexts/assignments/domain/Feedback.js';
import type { D2lApiClient } from '@/contexts/http-api/D2lApiClient.js';
import { D2lApiError } from '@/contexts/http-api/errors.js';
import { OrgUnitId } from '@/shared-kernel/types/OrgUnitId.js';
import { UserId } from '@/shared-kernel/types/UserId.js';

interface SubmissionDto {
  Submitter?: { Identifier?: string | null } | null;
  SubmissionDate?: string | null;
  Comments?: { Text?: string | null } | null;
}

interface FolderDto {
  Id: number;
  Name: string;
  CustomInstructions?: { Html?: string | null } | null;
  DueDate?: string | null;
  Submissions?: SubmissionDto[] | null;
}

interface FeedbackDto {
  Score?: number | null;
  OutOf?: number | null;
  Feedback?: { Text?: string | null } | null;
  ReleasedDate?: string | null;
}

export interface D2lAssignmentRepositoryOptions {
  le: string;
}

export class D2lAssignmentRepository implements AssignmentRepository {
  constructor(
    private readonly client: D2lApiClient,
    private readonly versions: D2lAssignmentRepositoryOptions,
  ) {}

  async findByCourse(courseId: OrgUnitId): Promise<Assignment[]> {
    const orgUnit = OrgUnitId.toNumber(courseId);
    const folders = await this.client.get<FolderDto[]>(
      `/d2l/api/le/${this.versions.le}/${orgUnit}/dropbox/folders/`,
    );
    return folders.map((folder) => this.toAssignment(folder, orgUnit));
  }

  async submit(input: SubmitInput): Promise<SubmitResult> {
    const orgUnit = String(input.courseId);
    const path = `/d2l/api/le/${this.versions.le}/${orgUnit}/dropbox/folders/${input.folderId}/submissions/mysubmissions/`;

    const formData = new FormData();
    formData.append(
      'file',
      new Blob([input.draft.content as BlobPart], {
        type: input.draft.mimeType ?? 'application/octet-stream',
      }),
      input.draft.filename,
    );

    const response = await this.client.postMultipart<{
      SubmissionId: string;
      SubmittedOn: string;
    }>(path, formData);

    return {
      submissionId: response.SubmissionId,
      submittedAt: new Date(response.SubmittedOn),
    };
  }

  async findFeedback(courseId: OrgUnitId, assignmentId: AssignmentId): Promise<Feedback | null> {
    const orgUnit = OrgUnitId.toNumber(courseId);
    const fid = AssignmentId.toNumber(assignmentId);
    try {
      const dto = await this.client.get<FeedbackDto>(
        `/d2l/api/le/${this.versions.le}/${orgUnit}/dropbox/folders/${fid}/feedback/me`,
      );
      return new Feedback({
        score: dto.Score ?? null,
        outOf: dto.OutOf ?? null,
        text: dto.Feedback?.Text ?? null,
        releasedAt: dto.ReleasedDate ? new Date(dto.ReleasedDate) : null,
      });
    } catch (err) {
      if (err instanceof D2lApiError && err.status === 404) return null;
      throw err;
    }
  }

  private toAssignment(folder: FolderDto, orgUnit: number): Assignment {
    const due = folder.DueDate ? DueDate.at(new Date(folder.DueDate)) : DueDate.unspecified();
    const submissions: Submission[] = (folder.Submissions ?? [])
      .map((s) => this.toSubmission(s))
      .filter((s): s is Submission => s !== null);
    return new Assignment({
      id: AssignmentId.of(folder.Id),
      courseOrgUnitId: orgUnit,
      name: folder.Name,
      instructions: folder.CustomInstructions?.Html ?? null,
      dueDate: due,
      submissions,
    });
  }

  private toSubmission(dto: SubmissionDto): Submission | null {
    const rawUser = dto.Submitter?.Identifier;
    if (!rawUser || !dto.SubmissionDate) return null;
    const parsed = Number.parseInt(rawUser, 10);
    if (!Number.isInteger(parsed) || parsed <= 0) return null;
    return new Submission({
      submittedAt: new Date(dto.SubmissionDate),
      submittedBy: UserId.of(parsed),
      comments: dto.Comments?.Text ?? null,
    });
  }
}
