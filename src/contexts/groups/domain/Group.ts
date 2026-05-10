import type { OrgUnitId } from '@/shared-kernel/types/OrgUnitId.js';

export interface GroupMember {
  userId: number;
  displayName: string;
  username?: string;
}

export interface GroupProps {
  id: number;
  categoryId: number;
  categoryName: string;
  name: string;
  members: GroupMember[];
}

export class Group {
  constructor(private readonly props: GroupProps) {}
  get id(): number { return this.props.id; }
  get categoryId(): number { return this.props.categoryId; }
  get categoryName(): string { return this.props.categoryName; }
  get name(): string { return this.props.name; }
  get members(): readonly GroupMember[] { return this.props.members; }
}

export interface GroupRepository {
  /** Returns ONLY groups in which the current user is enrolled. */
  findMyGroups(courseId: OrgUnitId): Promise<Group[]>;
}
