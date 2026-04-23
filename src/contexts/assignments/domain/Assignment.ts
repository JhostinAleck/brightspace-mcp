import type { AssignmentId } from './AssignmentId.js';
import type { DueDate } from './DueDate.js';
import type { Submission } from './Submission.js';

export interface AssignmentProps {
  id: AssignmentId;
  courseOrgUnitId: number;
  name: string;
  instructions: string | null;
  dueDate: DueDate;
  submissions: Submission[];
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
}
