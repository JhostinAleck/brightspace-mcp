export interface CalendarEventProps {
  id: number;
  courseOrgUnitId: number;
  title: string;
  description: string | null;
  startAt: Date;
  endAt: Date | null;
  location: string | null;
}

export class CalendarEvent {
  constructor(private readonly props: CalendarEventProps) {}
  get id(): number { return this.props.id; }
  get courseOrgUnitId(): number { return this.props.courseOrgUnitId; }
  get title(): string { return this.props.title; }
  get description(): string | null { return this.props.description; }
  get startAt(): Date { return this.props.startAt; }
  get endAt(): Date | null { return this.props.endAt; }
  get location(): string | null { return this.props.location; }
}
