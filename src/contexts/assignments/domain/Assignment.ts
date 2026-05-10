import type { AssignmentId } from './AssignmentId.js';
import type { DueDate } from './DueDate.js';
import type { Submission } from './Submission.js';

/**
 * Mirrors D2L's SubmissionType enum for file-based dropbox folders.
 *   - replace_previous: each new submission overwrites the prior one (D2L type 0)
 *   - append:           history is kept; resubmit is non-destructive (D2L type 1)
 *   - only_one:         cannot resubmit at all (D2L type 2)
 *   - unknown:          D2L returned no SubmissionType, or a non-file mode (3/4)
 */
export type SubmissionMode = 'replace_previous' | 'append' | 'only_one' | 'unknown';

export interface AssignmentProps {
  id: AssignmentId;
  courseOrgUnitId: number;
  name: string;
  instructions: string | null;
  dueDate: DueDate;
  submissions: Submission[];
  submissionMode?: SubmissionMode;
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
}
