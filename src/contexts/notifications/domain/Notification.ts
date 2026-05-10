export interface NotificationProps {
  id: string;
  /** Course org unit (null for tenant-wide notifications). */
  orgUnitId: number | null;
  orgUnitName: string | null;
  /** Notification kind: assignment due, new announcement, grade released, etc. */
  type: string;
  title: string;
  body: string | null;
  postedAt: Date;
  isRead: boolean;
  /** Deep link into Brightspace, when provided by the API. */
  url: string | null;
}

export class Notification {
  constructor(private readonly props: NotificationProps) {}
  get id(): string { return this.props.id; }
  get orgUnitId(): number | null { return this.props.orgUnitId; }
  get orgUnitName(): string | null { return this.props.orgUnitName; }
  get type(): string { return this.props.type; }
  get title(): string { return this.props.title; }
  get body(): string | null { return this.props.body; }
  get postedAt(): Date { return this.props.postedAt; }
  get isRead(): boolean { return this.props.isRead; }
  get url(): string | null { return this.props.url; }
}

export interface NotificationRepository {
  findRecent(opts?: { unreadOnly?: boolean; limit?: number }): Promise<Notification[]>;
}
