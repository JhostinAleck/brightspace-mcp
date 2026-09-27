/**
 * Analytic rubric attached to a dropbox folder (D2L `Assessment.Rubrics[]`).
 *
 * Shape mirrors D2L: a rubric has criteria groups; each group defines its own
 * levels (columns) and criteria (rows); each criterion has one cell per level
 * with a description and, for point-based rubrics, a score. Props are plain
 * JSON so the cache layer can store them verbatim.
 */
export interface RubricLevel {
  readonly id: number;
  readonly name: string;
  /** Level-wide points. D2L leaves this null when points are set per cell. */
  readonly points: number | null;
}

export interface RubricCell {
  readonly levelId: number;
  readonly description: string;
  readonly points: number | null;
}

export interface RubricCriterion {
  readonly id: number;
  readonly name: string;
  readonly cells: readonly RubricCell[];
}

export interface RubricCriteriaGroup {
  readonly name: string;
  readonly levels: readonly RubricLevel[];
  readonly criteria: readonly RubricCriterion[];
}

/** Overall achievement level; `rangeStart` is the lower bound (percent or points, per scoring method). */
export interface RubricOverallLevel {
  readonly id: number;
  readonly name: string;
  readonly rangeStart: number | null;
}

export interface RubricProps {
  id: number;
  name: string;
  description: string | null;
  groups: RubricCriteriaGroup[];
  overallLevels: RubricOverallLevel[];
}

export interface RubricCriterionHit {
  group: RubricCriteriaGroup;
  criterion: RubricCriterion;
  maxPoints: number | null;
}

export class Rubric {
  constructor(private readonly props: RubricProps) {}

  get id(): number {
    return this.props.id;
  }
  get name(): string {
    return this.props.name;
  }
  get description(): string | null {
    return this.props.description;
  }
  get groups(): readonly RubricCriteriaGroup[] {
    return this.props.groups;
  }
  get overallLevels(): readonly RubricOverallLevel[] {
    return this.props.overallLevels;
  }

  get criterionCount(): number {
    return this.props.groups.reduce((n, g) => n + g.criteria.length, 0);
  }

  /** Sum of the best achievable cell per criterion, or null for text-only rubrics. */
  get maxPoints(): number | null {
    let total: number | null = null;
    for (const g of this.props.groups) {
      for (const c of g.criteria) {
        const max = Rubric.criterionMax(g, c);
        if (max !== null) total = (total ?? 0) + max;
      }
    }
    return total;
  }

  /** Points of a cell, falling back to its level's points (D2L stores either). */
  static cellPoints(group: RubricCriteriaGroup, cell: RubricCell): number | null {
    if (cell.points !== null) return cell.points;
    return group.levels.find((l) => l.id === cell.levelId)?.points ?? null;
  }

  static criterionMax(group: RubricCriteriaGroup, criterion: RubricCriterion): number | null {
    let max: number | null = null;
    for (const cell of criterion.cells) {
      const p = Rubric.cellPoints(group, cell);
      if (p !== null && (max === null || p > max)) max = p;
    }
    return max;
  }

  findCriterion(criterionId: number): RubricCriterionHit | null {
    for (const group of this.props.groups) {
      const criterion = group.criteria.find((c) => c.id === criterionId);
      if (criterion) return { group, criterion, maxPoints: Rubric.criterionMax(group, criterion) };
    }
    return null;
  }

  /** Name of a criterion level or overall level by id. */
  levelName(levelId: number | null): string | null {
    if (levelId === null) return null;
    for (const g of this.props.groups) {
      const hit = g.levels.find((l) => l.id === levelId);
      if (hit) return hit.name;
    }
    return this.props.overallLevels.find((l) => l.id === levelId)?.name ?? null;
  }

  toProps(): RubricProps {
    return this.props;
  }
}
