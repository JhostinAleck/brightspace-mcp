import type {
  AssignmentRepository,
  AssignmentFilesResult,
  SubmitInput,
  SubmitResult,
} from '@/contexts/assignments/domain/AssignmentRepository.js';
import {
  Assignment,
  type AllowedFileTypes,
  type AssignmentKind,
  type LinkAttachment,
  type SubmissionMode,
} from '@/contexts/assignments/domain/Assignment.js';
import { Rubric, type RubricProps } from '@/contexts/assignments/domain/Rubric.js';
import { AssignmentId } from '@/contexts/assignments/domain/AssignmentId.js';
import { DueDate } from '@/contexts/assignments/domain/DueDate.js';
import { Submission } from '@/contexts/assignments/domain/Submission.js';
import { Feedback } from '@/contexts/assignments/domain/Feedback.js';
import type { RubricAssessment } from '@/contexts/assignments/domain/RubricAssessment.js';
import { OrgUnitId } from '@/shared-kernel/types/OrgUnitId.js';
import { UserId } from '@/shared-kernel/types/UserId.js';
import { parseValidDate } from '@/shared-kernel/date/parseValidDate.js';
import type { Cache } from '@/shared-kernel/cache/Cache.js';
import type { MySubmission } from '@/contexts/assignments/domain/MySubmission.js';

export interface CachedAssignmentRepositoryTtls {
  listTtlMs: number;
  feedbackTtlMs: number;
}

const PREFIX = 'assignments:';

interface SubmissionPlain {
  submittedAtIso: string;
  submittedByUserId: number;
  comments: string | null;
}

interface AssignmentPlain {
  id: number;
  courseOrgUnitId: number;
  name: string;
  instructions: string | null;
  dueIso: string | null;
  submissions: SubmissionPlain[];
  // Optional so entries cached by older versions still deserialize.
  submissionMode?: SubmissionMode;
  submissionsKnown?: boolean;
  kind?: AssignmentKind;
  points?: number | null;
  startIso?: string | null;
  endIso?: string | null;
  linkAttachments?: LinkAttachment[];
  allowedFileTypes?: AllowedFileTypes;
  rubrics?: RubricProps[];
}

interface FeedbackPlain {
  score: number | null;
  outOf: number | null;
  text: string | null;
  releasedAtIso: string | null;
  displayedGrade?: string | null;
  rubricAssessments?: RubricAssessment[];
}

function assignmentToPlain(a: Assignment): AssignmentPlain {
  return {
    id: AssignmentId.toNumber(a.id),
    courseOrgUnitId: a.courseOrgUnitId,
    name: a.name,
    instructions: a.instructions,
    dueIso: a.dueDate.toDate()?.toISOString() ?? null,
    submissions: a.submissions.map((s) => ({
      submittedAtIso: s.submittedAt.toISOString(),
      submittedByUserId: UserId.toNumber(s.submittedBy),
      comments: s.comments,
    })),
    submissionMode: a.submissionMode,
    submissionsKnown: a.submissionStatus !== 'unknown',
    kind: a.kind,
    points: a.points,
    startIso: a.startDate?.toISOString() ?? null,
    endIso: a.endDate?.toISOString() ?? null,
    linkAttachments: [...a.linkAttachments],
    allowedFileTypes: a.allowedFileTypes,
    rubrics: a.rubrics.map((r) => r.toProps()),
  };
}

function assignmentFromPlain(p: AssignmentPlain): Assignment {
  const due = p.dueIso ? DueDate.at(new Date(p.dueIso)) : DueDate.unspecified();
  const submissions = p.submissions.map((sp) => new Submission({
    submittedAt: new Date(sp.submittedAtIso),
    submittedBy: UserId.of(sp.submittedByUserId),
    comments: sp.comments,
  }));
  return new Assignment({
    id: AssignmentId.of(p.id),
    courseOrgUnitId: p.courseOrgUnitId,
    name: p.name,
    instructions: p.instructions,
    dueDate: due,
    submissions,
    ...(p.submissionMode !== undefined ? { submissionMode: p.submissionMode } : {}),
    ...(p.submissionsKnown !== undefined ? { submissionsKnown: p.submissionsKnown } : {}),
    ...(p.kind !== undefined ? { kind: p.kind } : {}),
    ...(p.allowedFileTypes !== undefined ? { allowedFileTypes: p.allowedFileTypes } : {}),
    points: p.points ?? null,
    startDate: parseValidDate(p.startIso),
    endDate: parseValidDate(p.endIso),
    linkAttachments: p.linkAttachments ?? [],
    rubrics: (p.rubrics ?? []).map((r) => new Rubric(r)),
  });
}

function feedbackToPlain(f: Feedback): FeedbackPlain {
  return {
    score: f.score,
    outOf: f.outOf,
    text: f.text,
    releasedAtIso: f.releasedAt ? f.releasedAt.toISOString() : null,
    displayedGrade: f.displayedGrade,
    rubricAssessments: [...f.rubricAssessments],
  };
}

function feedbackFromPlain(p: FeedbackPlain): Feedback {
  return new Feedback({
    score: p.score,
    outOf: p.outOf,
    text: p.text,
    releasedAt: p.releasedAtIso ? new Date(p.releasedAtIso) : null,
    displayedGrade: p.displayedGrade ?? null,
    rubricAssessments: p.rubricAssessments ?? [],
  });
}

type CachedFeedback = { kind: 'value'; value: FeedbackPlain } | { kind: 'none' };

export class CachedAssignmentRepository implements AssignmentRepository {
  constructor(
    private readonly inner: AssignmentRepository,
    private readonly cache: Cache,
    private readonly ttls: CachedAssignmentRepositoryTtls,
  ) {}

  async findByCourse(courseId: OrgUnitId): Promise<Assignment[]> {
    const key = `${PREFIX}list:${OrgUnitId.toNumber(courseId)}`;
    const cached = await this.cache.get<AssignmentPlain[]>(key);
    if (cached) return cached.map(assignmentFromPlain);
    const fresh = await this.inner.findByCourse(courseId);
    await this.cache.set(key, fresh.map(assignmentToPlain), this.ttls.listTtlMs);
    return fresh;
  }

  async findRubrics(courseId: OrgUnitId, assignmentId: AssignmentId): Promise<Rubric[]> {
    const key = `${PREFIX}rubrics:${OrgUnitId.toNumber(courseId)}:${AssignmentId.toNumber(assignmentId)}`;
    const cached = await this.cache.get<RubricProps[]>(key);
    if (cached) return cached.map((r) => new Rubric(r));
    const fresh = await this.inner.findRubrics(courseId, assignmentId);
    await this.cache.set(key, fresh.map((r) => r.toProps()), this.ttls.listTtlMs);
    return fresh;
  }

  async findFiles(courseId: OrgUnitId, assignmentId: AssignmentId): Promise<AssignmentFilesResult> {
    // Files are not cached — always fetch fresh to get latest attachments.
    return this.inner.findFiles(courseId, assignmentId);
  }

  async findFileBinary(courseId: OrgUnitId, file: { name: string; url: string }): Promise<Buffer> {
    // Binaries can be tens of MB — caching them in the domain cache backend
    // (Redis especially) is expensive. The HTTP client already has its own
    // cache layer for upstream responses.
    return this.inner.findFileBinary(courseId, file);
  }

  /** Never cached: callers need to see a submission they just made. */
  async findMySubmissions(courseId: OrgUnitId, assignmentId: AssignmentId): Promise<MySubmission[]> {
    return this.inner.findMySubmissions(courseId, assignmentId);
  }

  async submit(input: SubmitInput): Promise<SubmitResult> {
    // Writes bypass the cache — delegate directly to the inner repo.
    return this.inner.submit(input);
  }

  async findFeedback(courseId: OrgUnitId, assignmentId: AssignmentId): Promise<Feedback | null> {
    const key = `${PREFIX}feedback:${OrgUnitId.toNumber(courseId)}:${AssignmentId.toNumber(assignmentId)}`;
    const cached = await this.cache.get<CachedFeedback>(key);
    if (cached) return cached.kind === 'value' ? feedbackFromPlain(cached.value) : null;
    const fresh = await this.inner.findFeedback(courseId, assignmentId);
    const toStore: CachedFeedback = fresh ? { kind: 'value', value: feedbackToPlain(fresh) } : { kind: 'none' };
    await this.cache.set(key, toStore, this.ttls.feedbackTtlMs);
    return fresh;
  }
}
