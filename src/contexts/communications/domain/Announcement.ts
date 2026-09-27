export interface AnnouncementAttachment {
  id: number;
  name: string;
  /** Size in bytes. */
  size: number;
}

export interface AnnouncementProps {
  id: number;
  courseOrgUnitId: number;
  title: string;
  html: string | null;
  authorName: string | null;
  postedAt: Date;
  pinned?: boolean;
  attachments?: AnnouncementAttachment[];
}

export class Announcement {
  constructor(private readonly props: AnnouncementProps) {}
  get id(): number { return this.props.id; }
  get courseOrgUnitId(): number { return this.props.courseOrgUnitId; }
  get title(): string { return this.props.title; }
  get html(): string | null { return this.props.html; }
  get authorName(): string | null { return this.props.authorName; }
  get postedAt(): Date { return this.props.postedAt; }
  get pinned(): boolean { return this.props.pinned ?? false; }
  get attachments(): readonly AnnouncementAttachment[] { return this.props.attachments ?? []; }
}
