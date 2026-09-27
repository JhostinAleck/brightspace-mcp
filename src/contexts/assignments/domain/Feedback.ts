import type { RubricAssessment } from './RubricAssessment.js';

export interface FeedbackProps {
  score: number | null;
  outOf: number | null;
  text: string | null;
  releasedAt: Date | null;
  /** Grade as displayed by D2L (may be a letter or scheme symbol). */
  displayedGrade?: string | null;
  rubricAssessments?: RubricAssessment[];
}

export class Feedback {
  constructor(private readonly props: FeedbackProps) {}
  get score(): number | null {
    return this.props.score;
  }
  get outOf(): number | null {
    return this.props.outOf;
  }
  get text(): string | null {
    return this.props.text;
  }
  get releasedAt(): Date | null {
    return this.props.releasedAt;
  }
  get displayedGrade(): string | null {
    return this.props.displayedGrade ?? null;
  }
  get rubricAssessments(): readonly RubricAssessment[] {
    return this.props.rubricAssessments ?? [];
  }

  get percent(): number | null {
    if (this.props.score === null || this.props.outOf === null || this.props.outOf === 0) return null;
    return (this.props.score / this.props.outOf) * 100;
  }
}
