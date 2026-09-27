import type { AssignmentId } from './AssignmentId.js';
import type { DueDate } from './DueDate.js';
import type { Rubric } from './Rubric.js';
import type { Submission } from './Submission.js';

/**
 * Mirrors D2L's SubmissionType enum for file-based dropbox folders.
 *   - replace_previous: each new submission overwrites the prior one (D2L type 0)
 *   - append:           history is kept; resubmit is non-destructive (D2L type 1)
 *   - only_one:         cannot resubmit at all (D2L type 2)
 *   - unknown:          D2L returned no SubmissionType, or a non-file mode (3/4)
 */
export type SubmissionMode = 'replace_previous' | 'append' | 'only_one' | 'unknown';

/** D2L DropboxType: 1 = group, 2 = individual. */
export type AssignmentKind = 'individual' | 'group';

/**
 * - submitted / not_submitted: D2L disclosed the submission history
 * - unknown: D2L refused to disclose it (403/404 on mysubmissions — typical for
 *   group folders and closed folders), so "no submissions" would be a lie
 */
export type SubmissionStatus = 'submitted' | 'not_submitted' | 'unknown';

export interface LinkAttachment {
  name: string;
  url: string;
}

/**
 * D2L AllowableFileType. Only "custom" carries an explicit extension list;
 * other non-zero codes are tenant presets we surface as a raw code.
 */
export type AllowedFileTypes =
  | { mode: 'any' }
  | { mode: 'custom'; extensions: string[] }
  | { mode: 'restricted'; code: number };

export interface AssignmentProps {
  id: AssignmentId;
  courseOrgUnitId: number;
  name: string;
  instructions: string | null;
  dueDate: DueDate;
  submissions: Submission[];
  submissionMode?: SubmissionMode;
  /** False when D2L refused to disclose submissions. Defaults to true. */
  submissionsKnown?: boolean;
  kind?: AssignmentKind;
  /** Assessment.ScoreDenominator — max points of the folder. */
  points?: number | null;
  /** Availability.StartDate — folder opens. */
  startDate?: Date | null;
  /** Availability.EndDate — folder closes (may exist without a DueDate). */
  endDate?: Date | null;
  linkAttachments?: LinkAttachment[];
  allowedFileTypes?: AllowedFileTypes;
  rubrics?: Rubric[];
}

export class Assignment {
  constructor(private readonly props: AssignmentProps) {}
  get id(): AssignmentId {
    return this.props.id;
  }
  get courseOrgUnitId(): number {
    return this.props.courseOrgUnitId;
  }
  get name(): string {
    return this.props.name;
  }
  get instructions(): string | null {
    return this.props.instructions;
  }
  get dueDate(): DueDate {
    return this.props.dueDate;
  }
  get submissions(): readonly Submission[] {
    return this.props.submissions;
  }
  get hasSubmission(): boolean {
    return this.props.submissions.length > 0;
  }
  get submissionMode(): SubmissionMode {
    return this.props.submissionMode ?? 'unknown';
  }
  get submissionStatus(): SubmissionStatus {
    if (this.hasSubmission) return 'submitted';
    return this.props.submissionsKnown === false ? 'unknown' : 'not_submitted';
  }
  get kind(): AssignmentKind {
    return this.props.kind ?? 'individual';
  }
  get points(): number | null {
    return this.props.points ?? null;
  }
  get startDate(): Date | null {
    return this.props.startDate ?? null;
  }
  get endDate(): Date | null {
    return this.props.endDate ?? null;
  }
  get linkAttachments(): readonly LinkAttachment[] {
    return this.props.linkAttachments ?? [];
  }
  get allowedFileTypes(): AllowedFileTypes {
    return this.props.allowedFileTypes ?? { mode: 'any' };
  }
  get rubrics(): readonly Rubric[] {
    return this.props.rubrics ?? [];
  }
}
