/**
 * The student's graded outcome on one rubric: overall result plus one entry
 * per evaluated criterion, with names already resolved against the rubric.
 * Plain JSON so the cache layer can store it verbatim.
 */
export interface CriterionOutcome {
  readonly groupName: string | null;
  readonly criterionName: string;
  readonly levelName: string | null;
  readonly score: number | null;
  readonly maxPoints: number | null;
  readonly feedback: string | null;
}

export interface RubricAssessment {
  readonly rubricId: number;
  readonly rubricName: string;
  readonly score: number | null;
  readonly maxPoints: number | null;
  readonly levelName: string | null;
  readonly feedback: string | null;
  readonly criteria: readonly CriterionOutcome[];
}
