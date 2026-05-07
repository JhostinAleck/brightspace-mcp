import type {
  AssignmentRepository,
  AssignmentFilesResult,
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
import { extractDocxText } from '@/shared-kernel/zip/extractZipEntry.js';

interface SubmissionDto {
  Submitter?: { Identifier?: string | null } | null;
  SubmissionDate?: string | null;
  Comments?: { Text?: string | null } | null;
}

interface AttachmentDto {
  FileId: string;
  FileName: string;
  Size?: number | null;
}

interface FolderDto {
  Id: number;
  Name: string;
  CustomInstructions?: { Html?: string | null } | null;
  DueDate?: string | null;
  Submissions?: SubmissionDto[] | null;
  Attachments?: AttachmentDto[] | null;
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
    const orgUnit = OrgUnitId.toNumber(input.courseId);
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

  async findFiles(courseId: OrgUnitId, assignmentId: AssignmentId): Promise<AssignmentFilesResult> {
    const orgUnit = OrgUnitId.toNumber(courseId);
    const folderId = AssignmentId.toNumber(assignmentId);

    // Fetch all folders — list endpoint is student-accessible and includes CustomInstructions + Attachments
    const allFolders = await this.client.get<FolderDto[]>(
      `/d2l/api/le/${this.versions.le}/${orgUnit}/dropbox/folders/`,
    );
    const folder = allFolders.find((f) => f.Id === folderId);
    const assignmentName = folder?.Name ?? String(folderId);
    const instructions = folder?.CustomInstructions?.Html
      ? folder.CustomInstructions.Html.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim()
      : '';

    let files: Array<{ name: string; url: string }> = [];

    // Strategy A: Attachments embedded in the list-endpoint folder object
    if (folder?.Attachments && folder.Attachments.length > 0) {
      files = folder.Attachments.map((a) => ({
        name: a.FileName,
        url: `/d2l/api/le/${this.versions.le}/${orgUnit}/dropbox/folders/${folderId}/attachments/${a.FileId}`,
      }));
    }

    // Strategy B: Dedicated attachments endpoint (may work even when list doesn't embed them)
    if (files.length === 0) {
      try {
        const attachments = await this.client.get<AttachmentDto[]>(
          `/d2l/api/le/${this.versions.le}/${orgUnit}/dropbox/folders/${folderId}/attachments/`,
        );
        if (Array.isArray(attachments) && attachments.length > 0) {
          files = attachments.map((a) => ({
            name: a.FileName,
            url: `/d2l/api/le/${this.versions.le}/${orgUnit}/dropbox/folders/${folderId}/attachments/${a.FileId}`,
          }));
        }
      } catch (err) {
        if (!(err instanceof D2lApiError && err.status === 404)) throw err;
      }
    }

    // Strategy C: scrape the submit page — uses Playwright renderer if available (handles JS components)
    if (files.length === 0) {
      const pageUrl = `/d2l/lms/dropbox/user/folder_submit_files.d2l?db=${folderId}&grpid=0&isprv=0&bp=0&ou=${orgUnit}`;
      const html = await this.client.getRenderedHtml(pageUrl);

      const seen = new Set<string>();
      const addFile = (url: string, name: string) => {
        const clean = url.replace(/&amp;/g, '&');
        if (name && !seen.has(clean)) { seen.add(clean); files.push({ name, url: clean }); }
      };

      // title + href (covers truncated link text where title has full filename)
      const pat1 = /href="([^"]*\/(?:viewFile|file|d2lfile)[^"]*)"[^>]*title="([^"]+\.(?:pdf|docx?|xlsx?|pptx?|zip)[^"]*)"/gi;
      const pat2 = /title="([^"]+\.(?:pdf|docx?|xlsx?|pptx?|zip))"[^>]*href="([^"]*\/(?:viewFile|file|d2lfile)[^"]*)"/gi;
      // extension directly in URL
      const pat3 = /href="(\/d2l\/[^"]+\.(?:pdf|docx?|xlsx?|pptx?|zip)[^"]*)"/gi;
      // any d2l link with a download attribute
      const pat4 = /href="(\/d2l\/[^"]+)"[^>]*download(?:="([^"]*)")?\s/gi;

      let m: RegExpExecArray | null;
      while ((m = pat1.exec(html)) !== null) addFile(m[1] ?? '', (m[2] ?? '').trim());
      while ((m = pat2.exec(html)) !== null) addFile(m[2] ?? '', (m[1] ?? '').trim());
      while ((m = pat3.exec(html)) !== null) {
        const url = m[1] ?? '';
        addFile(url, decodeURIComponent(url.split('/').pop()?.split('?')[0] ?? ''));
      }
      while ((m = pat4.exec(html)) !== null) {
        const url = m[1] ?? '';
        const name = (m[2] ?? '').trim() || decodeURIComponent(url.split('/').pop()?.split('?')[0] ?? '');
        if (name) addFile(url, name);
      }
    }

    const fileContents: Record<string, string> = {};
    for (const file of files) {
      try {
        const ext = file.name.split('.').pop()?.toLowerCase() ?? '';
        const buf = await this.client.getRaw(file.url);
        if (ext === 'docx' || ext === 'doc') {
          fileContents[file.name] = extractDocxText(buf);
        } else if (ext === 'pdf') {
          fileContents[file.name] = `[PDF — ${buf.length} bytes]`;
        } else if (ext === 'xlsx' || ext === 'xls') {
          fileContents[file.name] = `[Excel — ${buf.length} bytes]`;
        } else {
          fileContents[file.name] = `[${ext.toUpperCase() || 'file'} — ${buf.length} bytes]`;
        }
      } catch {
        fileContents[file.name] = '[download failed]';
      }
    }

    return { assignmentId: String(folderId), assignmentName, instructions, files, fileContents };
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
