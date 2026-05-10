export interface QuizAttemptProps {
  id: number;
  quizId: number;
  attemptNumber: number;
  startedAt: Date;
  completedAt: Date | null;
  /** Score on the attempt; null when ungraded or in-progress. */
  score: number | null;
  /** Total points possible. */
  outOf: number | null;
  /** Whether the student has officially submitted (vs. saved-progress). */
  isSubmitted: boolean;
}

export class QuizAttempt {
  constructor(private readonly props: QuizAttemptProps) {}
  get id(): number { return this.props.id; }
  get quizId(): number { return this.props.quizId; }
  get attemptNumber(): number { return this.props.attemptNumber; }
  get startedAt(): Date { return this.props.startedAt; }
  get completedAt(): Date | null { return this.props.completedAt; }
  get score(): number | null { return this.props.score; }
  get outOf(): number | null { return this.props.outOf; }
  get isSubmitted(): boolean { return this.props.isSubmitted; }
  get percent(): number | null {
    if (this.score === null || this.outOf === null || this.outOf === 0) return null;
    return Number(((this.score / this.outOf) * 100).toFixed(2));
  }
}
