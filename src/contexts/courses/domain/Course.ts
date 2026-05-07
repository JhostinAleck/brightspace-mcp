import type { CourseId } from './CourseId.js';

export interface CourseProps {
  id: CourseId;
  name: string;
  code: string;
  active: boolean;
  startDate?: Date;
  endDate?: Date;
}

export class Course {
  constructor(private readonly props: CourseProps) {}
  get id(): CourseId {
    return this.props.id;
  }
  get name(): string {
    return this.props.name;
  }
  get code(): string {
    return this.props.code;
  }
  get active(): boolean {
    return this.props.active;
  }
  get startDate(): Date | undefined {
    return this.props.startDate;
  }
  get endDate(): Date | undefined {
    return this.props.endDate;
  }
}
