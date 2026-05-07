import type { UserId } from '@/shared-kernel/types/UserId.js';

export interface ClassmateProps {
  userId: UserId;
  displayName: string;
  uniqueName: string;
  email: string | null;
  role: 'student' | 'instructor' | 'ta' | 'other';
}

export class Classmate {
  constructor(private readonly props: ClassmateProps) {}
  get userId(): UserId {
    return this.props.userId;
  }
  get displayName(): string {
    return this.props.displayName;
  }
  get uniqueName(): string {
    return this.props.uniqueName;
  }
  get email(): string | null {
    return this.props.email;
  }
  get role(): ClassmateProps['role'] {
    return this.props.role;
  }
}
