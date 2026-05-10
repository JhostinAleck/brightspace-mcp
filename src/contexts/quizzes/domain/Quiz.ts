export interface QuizProps {
  id: number;
  courseOrgUnitId: number;
  name: string;
  /** Quiz becomes accessible at this date (ISO). */
  startDate: Date | null;
  /** Quiz closes at this date (ISO). */
  endDate: Date | null;
  /** Number of attempts the student has used. */
  attemptsTaken: number;
  /** Maximum attempts the student is allowed; null = unlimited. */
  attemptsAllowed: number | null;
  /** Time limit per attempt in minutes; null = no limit. */
  timeLimitMinutes: number | null;
  /** Whether grading is automatic on submission. */
  autoGrade: boolean;
  /** Description / instructions HTML, if any. */
  instructions: string | null;
}

export class Quiz {
  constructor(private readonly props: QuizProps) {}
  get id(): number { return this.props.id; }
  get courseOrgUnitId(): number { return this.props.courseOrgUnitId; }
  get name(): string { return this.props.name; }
  get startDate(): Date | null { return this.props.startDate; }
  get endDate(): Date | null { return this.props.endDate; }
  get attemptsTaken(): number { return this.props.attemptsTaken; }
  get attemptsAllowed(): number | null { return this.props.attemptsAllowed; }
  get timeLimitMinutes(): number | null { return this.props.timeLimitMinutes; }
  get autoGrade(): boolean { return this.props.autoGrade; }
  get instructions(): string | null { return this.props.instructions; }
  get attemptsRemaining(): number | null {
    if (this.attemptsAllowed === null) return null;
    return Math.max(0, this.attemptsAllowed - this.attemptsTaken);
  }
}
