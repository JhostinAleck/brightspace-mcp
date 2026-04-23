import type { UserId } from '@/shared-kernel/types/UserId.js';

export interface SubmissionProps {
  submittedAt: Date;
  submittedBy: UserId;
  comments: string | null;
}

export class Submission {
  constructor(private readonly props: SubmissionProps) {}
  get submittedAt(): Date {
    return this.props.submittedAt;
  }
  get submittedBy(): UserId {
    return this.props.submittedBy;
  }
  get comments(): string | null {
    return this.props.comments;
  }
}
