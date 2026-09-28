import type {
  AssignmentRepository,
  AssignmentFilesResult,
  SubmitInput,
  SubmitResult,
} from '@/contexts/assignments/domain/AssignmentRepository.js';
import {
  Assignment,
  type AllowedFileTypes,
  type LinkAttachment,
  type SubmissionMode,
} from '@/contexts/assignments/domain/Assignment.js';
import { Rubric, type RubricCriteriaGroup } from '@/contexts/assignments/domain/Rubric.js';

function mapSubmissionType(id: number | undefined): SubmissionMode {
  // D2L Valence enum: see https://docs.valence.desire2learn.com/res/dropbox.html#term-SUBMISSION_T
  if (id === 0) return 'replace_previous';
  if (id === 1) return 'append';
  if (id === 2) return 'only_one';
  return 'unknown';
}

import { AssignmentId } from '@/contexts/assignments/domain/AssignmentId.js';
import { DueDate } from '@/contexts/assignments/domain/DueDate.js';
import { Submission } from '@/contexts/assignments/domain/Submission.js';
import { Feedback } from '@/contexts/assignments/domain/Feedback.js';
import { sortNewestFirst, type MySubmission } from '@/contexts/assignments/domain/MySubmission.js';
import type { RubricAssessment } from '@/contexts/assignments/domain/RubricAssessment.js';
import type { D2lApiClient } from '@/contexts/http-api/D2lApiClient.js';
import { D2lApiError } from '@/contexts/http-api/errors.js';
import { OrgUnitId } from '@/shared-kernel/types/OrgUnitId.js';
import { UserId } from '@/shared-kernel/types/UserId.js';
import { extractFileContent, extractedToText } from '@/shared-kernel/extract/extractFileContent.js';
import { parseValidDate } from '@/shared-kernel/date/parseValidDate.js';
import type { D2lUiSubmitter } from './D2lUiSubmitter.js';
import { findHistoryGroupId, parseSubmissionHistory } from './parseSubmissionHistory.js';

interface SubmissionDto {
  Submitter?: { Identifier?: string | null } | null;
  SubmissionDate?: string | null;
  Comments?: { Text?: string | null } | null;
}

/**
 * Shape returned by `/dropbox/folders/{id}/submissions/`. Each entry is one
 * submitter (user OR group) with its history of submissions.
 */
interface SubmissionsByEntityDto {
  Entity: { Name?: string; EntityId?: number; EntityType?: 'User' | 'Group' };
  Submissions: Array<{
    Id?: number;
    SubmittedBy?: { Identifier?: string | null; DisplayName?: string | null };
    SubmissionDate?: string | null;
    Comment?: { Text?: string | null };
    Files?: Array<{ FileId?: number; FileName?: string; Size?: number; IsDeleted?: boolean }>;
  }>;
}

interface AttachmentDto {
  FileId: string;
  FileName: string;
  Size?: number | null;
}

interface RichTextDto {
  Text?: string | null;
  Html?: string | null;
}

interface RubricDto {
  RubricId: number;
  Name?: string | null;
  Description?: RichTextDto | null;
  OverallLevels?: Array<{ Id: number; Name?: string | null; RangeStart?: number | null }> | null;
  CriteriaGroups?: Array<{
    Name?: string | null;
    Levels?: Array<{ Id: number; Name?: string | null; Points?: number | null }> | null;
    Criteria?: Array<{
      Id: number;
      Name?: string | null;
      Cells?: Array<{ LevelId: number; Description?: RichTextDto | null; Points?: number | null }> | null;
    }> | null;
  }> | null;
}

interface FolderDto {
  Id: number;
  Name: string;
  CustomInstructions?: { Html?: string | null } | null;
  DueDate?: string | null;
  Submissions?: SubmissionDto[] | null;
  Attachments?: AttachmentDto[] | null;
  /**
   * D2L SubmissionType enum:
   *   0 OnFileSubmissionPerUser  → only one submission, new replaces old
   *   1 AllSubmissionsKept       → each submission appended to history
   *   2 OnlyOneSubmissionAllowed → cannot resubmit at all
   *   3 ObservedInPerson, 4 TextSubmission (not file-based)
   * LE 1.99 sends a bare number; older docs show `{ Id }`. Accept both.
   */
  SubmissionType?: number | { Id?: number } | null;
  Availability?: { StartDate?: string | null; EndDate?: string | null } | null;
  Assessment?: { ScoreDenominator?: number | null; Rubrics?: RubricDto[] | null } | null;
  /** D2L DropboxType: 1 = Group, 2 = Individual. */
  DropboxType?: number | null;
  GroupTypeId?: number | null;
  LinkAttachments?: Array<{ LinkId?: number; LinkName?: string | null; Href?: string | null }> | null;
  /** D2L AllowableFileType: 0 = any; custom lists come in CustomAllowableFileTypes. */
  AllowableFileType?: number | null;
  CustomAllowableFileTypes?: Array<string | { Extension?: string | null }> | null;
  GradeItemId?: number | null;
}

function richText(dto: RichTextDto | null | undefined): string {
  const text = dto?.Text?.trim();
  if (text) return text;
  return (dto?.Html ?? '').replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').replace(/\s+([.,;:!?])/g, '$1').trim();
}

function toRubric(dto: RubricDto): Rubric {
  const groups: RubricCriteriaGroup[] = (dto.CriteriaGroups ?? []).map((g) => ({
    name: g.Name ?? '',
    levels: (g.Levels ?? []).map((l) => ({ id: l.Id, name: l.Name ?? '', points: l.Points ?? null })),
    criteria: (g.Criteria ?? []).map((c) => ({
      id: c.Id,
      name: c.Name ?? '',
      cells: (c.Cells ?? []).map((cell) => ({
        levelId: cell.LevelId,
        description: richText(cell.Description),
        points: cell.Points ?? null,
      })),
    })),
  }));
  return new Rubric({
    id: dto.RubricId,
    name: dto.Name ?? String(dto.RubricId),
    description: richText(dto.Description) || null,
    groups,
    overallLevels: (dto.OverallLevels ?? []).map((l) => ({
      id: l.Id,
      name: l.Name ?? '',
      rangeStart: l.RangeStart ?? null,
    })),
  });
}

function mapAllowedFileTypes(folder: FolderDto): AllowedFileTypes {
  const code = folder.AllowableFileType ?? 0;
  if (code === 0) return { mode: 'any' };
  const extensions = (folder.CustomAllowableFileTypes ?? [])
    .map((e) => (typeof e === 'string' ? e : e.Extension ?? ''))
    .map((e) => e.trim())
    .filter(Boolean);
  // Custom without a readable extension list degrades to a raw code.
  if (extensions.length > 0) return { mode: 'custom', extensions };
  return { mode: 'restricted', code };
}

function mapLinkAttachments(folder: FolderDto): LinkAttachment[] {
  return (folder.LinkAttachments ?? [])
    .filter((l) => l.Href)
    .map((l) => ({ name: l.LinkName?.trim() || (l.Href ?? ''), url: l.Href ?? '' }));
}

/** Null when the rubric has not been assessed yet (no overall score, no criteria). */
function toRubricAssessment(rubric: Rubric, dto: RubricAssessmentDto): RubricAssessment | null {
  const overall = dto.OverallOutcome ?? null;
  const outcomes = dto.CriteriaOutcome ?? [];
  const overallScore = overall?.Score ?? null;
  if (overallScore === null && (overall?.LevelId ?? null) === null && outcomes.length === 0) return null;
  return {
    rubricId: rubric.id,
    rubricName: rubric.name,
    score: overallScore,
    maxPoints: rubric.maxPoints,
    levelName: rubric.levelName(overall?.LevelId ?? null),
    feedback: richText(overall?.Feedback) || null,
    criteria: outcomes.map((o) => {
      const hit = rubric.findCriterion(o.CriterionId);
      return {
        groupName: hit?.group.name ?? null,
        criterionName: hit?.criterion.name ?? String(o.CriterionId),
        levelName: rubric.levelName(o.LevelId ?? null),
        score: o.Score ?? null,
        maxPoints: hit?.maxPoints ?? null,
        feedback: richText(o.Feedback) || null,
      };
    }),
  };
}

/** `/grades/{gradeItemId}/values/myGradeValue` — 404 until the grade is released. */
interface GradeValueDto {
  PointsNumerator?: number | null;
  PointsDenominator?: number | null;
  DisplayedGrade?: string | null;
  Comments?: RichTextDto | null;
  ReleasedDate?: string | null;
}

interface OutcomeDto {
  LevelId?: number | null;
  Score?: number | null;
  Feedback?: RichTextDto | null;
}

/**
 * `/le/unstable/{ou}/assessment?assessmentType=Rubric&...&userId={me}` — the
 * only student-accessible route exposing per-criterion rubric results.
 */
interface RubricAssessmentDto {
  OverallOutcome?: OutcomeDto | null;
  CriteriaOutcome?: Array<OutcomeDto & { CriterionId: number }> | null;
}

export interface D2lAssignmentRepositoryOptions {
  le: string;
  /** LP version — needed for `/users/whoami` (rubric assessments are per user). */
  lp?: string;
}

export class D2lAssignmentRepository implements AssignmentRepository {
  /** Memoized whoami Identifier (rubric assessments are fetched per user). */
  private myUserId: Promise<number | null> | undefined;

  constructor(
    private readonly client: D2lApiClient,
    private readonly versions: D2lAssignmentRepositoryOptions,
    /**
     * Optional UI fallback. When the Valence dropbox-submission API returns
     * 403/404 (tenant restricted student writes), we re-attempt via the web
     * UI flow. Without it, those failures bubble up to the user.
     */
    private readonly uiSubmitter?: D2lUiSubmitter,
  ) {}

  async findByCourse(courseId: OrgUnitId): Promise<Assignment[]> {
    const orgUnit = OrgUnitId.toNumber(courseId);
    const folders = await this.client.get<FolderDto[]>(
      `/d2l/api/le/${this.versions.le}/${orgUnit}/dropbox/folders/`,
    );
    // The folders list endpoint omits `Submissions` for student users (admins
    // see them inline). Fetch each folder's submissions in parallel from the
    // dedicated endpoint so `assignment.hasSubmission` reflects reality.
    // Use allSettled so one failing folder doesn't discard all others.
    const results = await Promise.allSettled(
      folders.map(async (folder) => {
        try {
          const subs = await this.client.get<SubmissionsByEntityDto[]>(
            `/d2l/api/le/${this.versions.le}/${orgUnit}/dropbox/folders/${folder.Id}/submissions/mysubmissions/`,
          );
          return this.toAssignment(folder, orgUnit, subs);
        } catch (err) {
          // Only swallow 403 (tenant-restricted) and 404 (locked/future folder
          // or group assignments — D2L returns "not found" for mysubmissions on
          // group folders; there is no student-accessible API for group status).
          // Mark the status as unknown rather than "no submissions".
          if (err instanceof D2lApiError && (err.status === 403 || err.status === 404)) {
            return this.toAssignment(folder, orgUnit, undefined, false);
          }
          // Circuit breaker, network errors, etc. — re-throw so the caller
          // surfaces the real error instead of silently showing 0 submissions.
          throw err;
        }
      }),
    );

    // Collect fulfilled assignments; re-throw the first infrastructure error
    // if ALL folders failed (keeps partial results when only some folders fail).
    const assignments: Assignment[] = [];
    let firstError: unknown = null;
    for (const r of results) {
      if (r.status === 'fulfilled') {
        assignments.push(r.value);
      } else {
        firstError ??= r.reason;
      }
    }
    if (assignments.length === 0 && firstError) throw firstError;
    return assignments;
  }

  async submit(input: SubmitInput): Promise<SubmitResult> {
    try {
      return await this.submitViaApi(input);
    } catch (err) {
      // 403 (tenant disabled student API) or 404 (group submissions return
      // "Assignment not found" via mysubmissions/) → try the UI flow if the
      // submitter is wired.
      const apiBlocked =
        err instanceof D2lApiError && (err.status === 403 || err.status === 404);
      if (apiBlocked && this.uiSubmitter) {
        return this.uiSubmitter.submit(input);
      }
      throw err;
    }
  }

  private async submitViaApi(input: SubmitInput): Promise<SubmitResult> {
    const orgUnit = OrgUnitId.toNumber(input.courseId);
    const path = `/d2l/api/le/${this.versions.le}/${orgUnit}/dropbox/folders/${input.folderId}/submissions/mysubmissions/`;

    // D2L Valence docs require multipart/MIXED (not form-data):
    //   Part 1: JSON SubmissionData (no Content-Disposition, just Content-Type)
    //   Part 2: file with Content-Disposition: form-data; name="file"; filename="..."
    // Reference: https://docs.valence.desire2learn.com/res/dropbox.html
    const boundary = `----brightspaceMcp${Date.now()}${Math.random().toString(36).slice(2, 10)}`;
    const mimeType = input.draft.mimeType ?? 'application/octet-stream';
    const filename = input.draft.filename;
    const fileContent = input.draft.content;

    const body = Buffer.concat([
      Buffer.from(`--${boundary}\r\n`),
      Buffer.from(`Content-Type: application/json\r\n\r\n`),
      Buffer.from(JSON.stringify({ Text: '', Html: '' })),
      Buffer.from(`\r\n--${boundary}\r\n`),
      Buffer.from(`Content-Type: ${mimeType}\r\n`),
      Buffer.from(`Content-Disposition: form-data; name="file"; filename="${filename}"\r\n\r\n`),
      Buffer.from(fileContent),
      Buffer.from(`\r\n--${boundary}--\r\n`),
    ]);

    const response = await this.client.postRawMultipart<{
      SubmissionId: string;
      SubmittedOn: string;
    }>(path, body, `multipart/mixed; boundary=${boundary}`);

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
        const buf = await this.client.getRaw(file.url);
        fileContents[file.name] = extractedToText(await extractFileContent(buf, { filename: file.name }));
      } catch {
        fileContents[file.name] = '[download failed]';
      }
    }

    return { assignmentId: String(folderId), assignmentName, instructions, files, fileContents };
  }

  async findFileBinary(_courseId: OrgUnitId, file: { url: string }): Promise<Buffer> {
    return this.client.getRaw(file.url);
  }

  /**
   * `mysubmissions` works while a folder is open but answers 403 once it
   * closes (and for some group folders), so fall back to the web UI history
   * page, which students can always see.
   */
  async findMySubmissions(courseId: OrgUnitId, assignmentId: AssignmentId): Promise<MySubmission[]> {
    const orgUnit = OrgUnitId.toNumber(courseId);
    const folderId = AssignmentId.toNumber(assignmentId);
    let fromApi: MySubmission[];
    try {
      fromApi = await this.findMySubmissionsViaApi(orgUnit, folderId);
    } catch (err) {
      if (!(err instanceof D2lApiError && (err.status === 403 || err.status === 404))) throw err;
      return this.findMySubmissionsViaHistory(orgUnit, folderId);
    }
    if (fromApi.length > 0) return fromApi;
    // An empty API answer is cross-checked once against the UI history.
    try {
      return await this.findMySubmissionsViaHistory(orgUnit, folderId);
    } catch {
      return [];
    }
  }

  private async findMySubmissionsViaApi(orgUnit: number, folderId: number): Promise<MySubmission[]> {
    const base = `/d2l/api/le/${this.versions.le}/${orgUnit}/dropbox/folders/${folderId}/submissions`;
    const entities = await this.client.get<SubmissionsByEntityDto[]>(`${base}/mysubmissions/`);
    const subs: MySubmission[] = [];
    for (const entity of Array.isArray(entities) ? entities : []) {
      for (const s of entity.Submissions ?? []) {
        if (s.Id === undefined) continue;
        subs.push({
          id: String(s.Id),
          submittedAt: parseValidDate(s.SubmissionDate),
          submittedAtLabel: null,
          submittedBy: s.SubmittedBy?.DisplayName?.trim() || null,
          comment: s.Comment?.Text?.trim() || null,
          files: (s.Files ?? [])
            .filter((f) => f.FileId !== undefined && !f.IsDeleted)
            .map((f) => ({
              name: f.FileName ?? String(f.FileId),
              sizeBytes: f.Size ?? null,
              sizeLabel: null,
              url: `${base}/${s.Id}/files/${f.FileId}`,
            })),
        });
      }
    }
    return sortNewestFirst(subs);
  }

  private async findMySubmissionsViaHistory(orgUnit: number, folderId: number): Promise<MySubmission[]> {
    const list = (await this.client.getRaw(`/d2l/lms/dropbox/user/folders_list.d2l?ou=${orgUnit}`)).toString('utf8');
    const groupId = findHistoryGroupId(list, folderId);
    // No history link = nothing submitted yet.
    if (groupId === null) return [];
    const history = await this.client.getRaw(
      `/d2l/lms/dropbox/user/folders_history.d2l?db=${folderId}&grpid=${groupId}&isprv=0&bp=0&ou=${orgUnit}`,
    );
    return sortNewestFirst(parseSubmissionHistory(history.toString('utf8')));
  }

  /**
   * There is no Valence "my feedback" route for dropbox folders (the old
   * `/feedback/me` path is always 404). Feedback is reassembled from:
   *   - the folder's grade item value (score + overall comments), and
   *   - the rubric assessment of each attached rubric (per-criterion outcomes).
   * Returns null when neither has anything yet (= not graded).
   */
  async findFeedback(courseId: OrgUnitId, assignmentId: AssignmentId): Promise<Feedback | null> {
    const orgUnit = OrgUnitId.toNumber(courseId);
    const fid = AssignmentId.toNumber(assignmentId);
    const folder = await this.getFolder(orgUnit, fid);
    if (!folder) return null;

    const rubrics = (folder.Assessment?.Rubrics ?? []).map(toRubric);
    const [grade, assessments] = await Promise.all([
      this.getMyGradeValue(orgUnit, folder.GradeItemId ?? null),
      this.getRubricAssessments(orgUnit, fid, rubrics),
    ]);
    if (!grade && assessments.length === 0) return null;

    return new Feedback({
      score: grade?.PointsNumerator ?? null,
      outOf: grade?.PointsDenominator ?? folder.Assessment?.ScoreDenominator ?? null,
      text: richText(grade?.Comments) || null,
      releasedAt: parseValidDate(grade?.ReleasedDate ?? null),
      displayedGrade: grade?.DisplayedGrade ?? null,
      rubricAssessments: assessments,
    });
  }

  private async getMyGradeValue(orgUnit: number, gradeItemId: number | null): Promise<GradeValueDto | null> {
    if (!gradeItemId) return null;
    try {
      return await this.client.get<GradeValueDto>(
        `/d2l/api/le/${this.versions.le}/${orgUnit}/grades/${gradeItemId}/values/myGradeValue`,
      );
    } catch (err) {
      // 404 = not graded / not released yet; 403 = grade hidden from students.
      if (err instanceof D2lApiError && (err.status === 403 || err.status === 404)) return null;
      throw err;
    }
  }

  private async getRubricAssessments(
    orgUnit: number,
    fid: number,
    rubrics: Rubric[],
  ): Promise<RubricAssessment[]> {
    if (rubrics.length === 0 || !this.versions.lp) return [];
    const me = await this.getMyUserId();
    if (me === null) return [];
    const results = await Promise.all(
      rubrics.map(async (rubric) => {
        try {
          const dto = await this.client.get<RubricAssessmentDto>(
            `/d2l/api/le/unstable/${orgUnit}/assessment?assessmentType=Rubric&objectType=Dropbox&objectId=${fid}&rubricId=${rubric.id}&userId=${me}`,
          );
          return toRubricAssessment(rubric, dto);
        } catch (err) {
          // `unstable` route: treat any API refusal as "no rubric detail"
          // rather than failing the whole feedback lookup.
          if (err instanceof D2lApiError) return null;
          throw err;
        }
      }),
    );
    return results.filter((r): r is RubricAssessment => r !== null);
  }

  private getMyUserId(): Promise<number | null> {
    this.myUserId ??= this.client
      .get<{ Identifier?: string | null }>(`/d2l/api/lp/${this.versions.lp}/users/whoami`)
      .then((me) => {
        const id = Number.parseInt(me.Identifier ?? '', 10);
        return Number.isInteger(id) && id > 0 ? id : null;
      })
      .catch((err: unknown) => {
        this.myUserId = undefined;
        throw err;
      });
    return this.myUserId;
  }

  async findRubrics(courseId: OrgUnitId, assignmentId: AssignmentId): Promise<Rubric[]> {
    const orgUnit = OrgUnitId.toNumber(courseId);
    const fid = AssignmentId.toNumber(assignmentId);
    const folder = await this.getFolder(orgUnit, fid);
    const embedded = folder?.Assessment?.Rubrics;
    if (embedded && embedded.length > 0) return embedded.map(toRubric);
    // Some tenants/versions omit Rubrics from the folder payload — ask the
    // rubrics endpoint directly.
    try {
      const list = await this.client.get<RubricDto[]>(
        `/d2l/api/le/${this.versions.le}/${orgUnit}/rubrics?objectType=Dropbox&objectId=${fid}`,
      );
      return Array.isArray(list) ? list.map(toRubric) : [];
    } catch (err) {
      if (err instanceof D2lApiError && (err.status === 403 || err.status === 404)) return [];
      throw err;
    }
  }

  private async getFolder(orgUnit: number, fid: number): Promise<FolderDto | null> {
    try {
      return await this.client.get<FolderDto>(
        `/d2l/api/le/${this.versions.le}/${orgUnit}/dropbox/folders/${fid}`,
      );
    } catch (err) {
      if (err instanceof D2lApiError && (err.status === 403 || err.status === 404)) return null;
      throw err;
    }
  }

  private toAssignment(
    folder: FolderDto,
    orgUnit: number,
    enrichedSubs?: SubmissionsByEntityDto[],
    submissionsKnown = true,
  ): Assignment {
    const due = folder.DueDate ? DueDate.at(new Date(folder.DueDate)) : DueDate.unspecified();
    let submissions: Submission[];
    if (enrichedSubs && enrichedSubs.length > 0) {
      // Flatten the entity-grouped submissions. Works for both individual
      // (Entity = User) and group (Entity = Group) assignments.
      submissions = enrichedSubs
        .flatMap((entry) => entry.Submissions ?? [])
        .map((s) => this.toEnrichedSubmission(s))
        .filter((s): s is Submission => s !== null);
    } else {
      submissions = (folder.Submissions ?? [])
        .map((s) => this.toSubmission(s))
        .filter((s): s is Submission => s !== null);
    }
    return new Assignment({
      id: AssignmentId.of(folder.Id),
      courseOrgUnitId: orgUnit,
      name: folder.Name,
      instructions: folder.CustomInstructions?.Html ?? null,
      dueDate: due,
      submissions,
      submissionMode: mapSubmissionType(
        typeof folder.SubmissionType === 'number' ? folder.SubmissionType : folder.SubmissionType?.Id,
      ),
      submissionsKnown,
      kind: folder.DropboxType === 1 ? 'group' : 'individual',
      points: folder.Assessment?.ScoreDenominator ?? null,
      startDate: parseValidDate(folder.Availability?.StartDate ?? null),
      endDate: parseValidDate(folder.Availability?.EndDate ?? null),
      linkAttachments: mapLinkAttachments(folder),
      allowedFileTypes: mapAllowedFileTypes(folder),
      rubrics: (folder.Assessment?.Rubrics ?? []).map(toRubric),
    });
  }

  private toEnrichedSubmission(
    dto: SubmissionsByEntityDto['Submissions'][number],
  ): Submission | null {
    const rawUser = dto.SubmittedBy?.Identifier;
    if (!rawUser || !dto.SubmissionDate) return null;
    const parsed = Number.parseInt(rawUser, 10);
    if (!Number.isInteger(parsed) || parsed <= 0) return null;
    const submittedAt = parseValidDate(dto.SubmissionDate);
    if (!submittedAt) return null;
    return new Submission({
      submittedAt,
      submittedBy: UserId.of(parsed),
      comments: dto.Comment?.Text ?? null,
    });
  }

  private toSubmission(dto: SubmissionDto): Submission | null {
    const rawUser = dto.Submitter?.Identifier;
    if (!rawUser || !dto.SubmissionDate) return null;
    const parsed = Number.parseInt(rawUser, 10);
    if (!Number.isInteger(parsed) || parsed <= 0) return null;
    const submittedAt = parseValidDate(dto.SubmissionDate);
    if (!submittedAt) return null;
    return new Submission({
      submittedAt,
      submittedBy: UserId.of(parsed),
      comments: dto.Comments?.Text ?? null,
    });
  }
}
