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
import { inflateRawSync } from 'node:zlib';
import type { D2lApiClient } from '@/contexts/http-api/D2lApiClient.js';
import { D2lApiError } from '@/contexts/http-api/errors.js';
import { OrgUnitId } from '@/shared-kernel/types/OrgUnitId.js';
import { UserId } from '@/shared-kernel/types/UserId.js';

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

async function extractDocxText(buf: Buffer): Promise<string> {
  try {
    const xml = extractZipEntry(buf, 'word/document.xml');
    if (!xml) return '[DOCX: could not read content]';
    // Strip XML tags, decode common entities
    return xml
      .replace(/<w:br[^>]*/g, '\n')
      .replace(/<w:p[ >][^>]*>/g, '\n')
      .replace(/<[^>]+>/g, '')
      .replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>')
      .replace(/&apos;/g, "'").replace(/&quot;/g, '"').replace(/&#xA;/g, '\n')
      .replace(/\n{3,}/g, '\n\n').trim();
  } catch {
    return '[DOCX: extraction failed]';
  }
}

function extractZipEntry(buf: Buffer, target: string): string | null {
  // Parse ZIP local file headers (PK\x03\x04) to find and decompress entries
  let offset = 0;
  while (offset < buf.length - 30) {
    if (buf[offset] !== 0x50 || buf[offset+1] !== 0x4B || buf[offset+2] !== 0x03 || buf[offset+3] !== 0x04) {
      offset++;
      continue;
    }
    const compression = buf.readUInt16LE(offset + 8);
    const compressedSize = buf.readUInt32LE(offset + 18);
    const filenameLen = buf.readUInt16LE(offset + 26);
    const extraLen = buf.readUInt16LE(offset + 28);
    const filename = buf.slice(offset + 30, offset + 30 + filenameLen).toString('utf8');
    const dataStart = offset + 30 + filenameLen + extraLen;
    if (filename === target) {
      const compressedData = buf.slice(dataStart, dataStart + compressedSize);
      if (compression === 0) return compressedData.toString('utf8');
      if (compression === 8) {
        return inflateRawSync(compressedData).toString('utf8');
      }
      return null;
    }
    offset = dataStart + compressedSize;
  }
  return null;
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

  async findFiles(courseId: OrgUnitId, assignmentId: AssignmentId): Promise<AssignmentFilesResult> {
    const orgUnit = OrgUnitId.toNumber(courseId);
    const folderId = AssignmentId.toNumber(assignmentId);

    // Fetch folder details via API — includes Attachments and CustomInstructions
    const folder = await this.client.get<FolderDto>(
      `/d2l/api/le/${this.versions.le}/${orgUnit}/dropbox/folders/${folderId}/`,
    );

    const assignmentName = folder.Name;
    const instructions = folder.CustomInstructions?.Html
      ? folder.CustomInstructions.Html.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim()
      : '';

    const attachments = folder.Attachments ?? [];
    const files: Array<{ name: string; url: string }> = attachments.map((a) => ({
      name: a.FileName,
      url: `/d2l/api/le/${this.versions.le}/${orgUnit}/dropbox/folders/${folderId}/attachments/${a.FileId}`,
    }));

    const fileContents: Record<string, string> = {};
    for (const file of files) {
      try {
        const ext = file.name.split('.').pop()?.toLowerCase() ?? '';
        const buf = await this.client.getRaw(file.url);
        if (ext === 'docx') {
          fileContents[file.name] = await extractDocxText(buf);
        } else if (ext === 'pdf') {
          fileContents[file.name] = `[PDF — ${buf.length} bytes — pide get_topic_file o abre Brightspace para leerlo]`;
        } else if (ext === 'xlsx' || ext === 'xls') {
          fileContents[file.name] = `[Excel — ${buf.length} bytes]`;
        } else {
          fileContents[file.name] = `[${ext.toUpperCase() || 'archivo'} — ${buf.length} bytes]`;
        }
      } catch {
        fileContents[file.name] = '[error al descargar]';
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
