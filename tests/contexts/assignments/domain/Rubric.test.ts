import { describe, it, expect } from 'vitest';
import { Rubric, type RubricProps } from '@/contexts/assignments/domain/Rubric';

const props: RubricProps = {
  id: 8001,
  name: 'Lab 4 rubric',
  description: null,
  overallLevels: [
    { id: 8101, name: 'Excellent', rangeStart: 85 },
    { id: 8102, name: 'Poor', rangeStart: 0 },
  ],
  groups: [
    {
      name: 'Analysis',
      levels: [
        { id: 8201, name: 'Level 2', points: null },
        { id: 8202, name: 'Level 1', points: null },
      ],
      criteria: [
        {
          id: 8301,
          name: 'Identifies issues',
          cells: [
            { levelId: 8201, description: 'All', points: 5 },
            { levelId: 8202, description: 'Few', points: 0 },
          ],
        },
        {
          id: 8302,
          name: 'Justifies findings',
          cells: [
            { levelId: 8201, description: 'Clear', points: 3 },
            { levelId: 8202, description: 'None', points: 1 },
          ],
        },
      ],
    },
    {
      name: 'Report',
      levels: [
        { id: 8401, name: 'Complete', points: 2 },
        { id: 8402, name: 'Missing', points: 0 },
      ],
      criteria: [
        {
          id: 8501,
          name: 'Formatting',
          cells: [
            { levelId: 8401, description: 'Good', points: null },
            { levelId: 8402, description: 'Bad', points: null },
          ],
        },
      ],
    },
  ],
};

describe('Rubric', () => {
  it('exposes identity and counts', () => {
    const r = new Rubric(props);
    expect(r.id).toBe(8001);
    expect(r.name).toBe('Lab 4 rubric');
    expect(r.groups).toHaveLength(2);
    expect(r.criterionCount).toBe(3);
  });

  it('cellPoints falls back to the level points when the cell has none', () => {
    const r = new Rubric(props);
    const report = r.groups[1]!;
    expect(Rubric.cellPoints(report, report.criteria[0]!.cells[0]!)).toBe(2);
    const analysis = r.groups[0]!;
    expect(Rubric.cellPoints(analysis, analysis.criteria[0]!.cells[0]!)).toBe(5);
  });

  it('maxPoints sums the best cell of every criterion', () => {
    expect(new Rubric(props).maxPoints).toBe(5 + 3 + 2);
  });

  it('maxPoints is null when no cell or level carries points (text-only rubric)', () => {
    const textOnly = new Rubric({
      ...props,
      groups: [{
        name: 'G',
        levels: [{ id: 1, name: 'L', points: null }],
        criteria: [{ id: 2, name: 'C', cells: [{ levelId: 1, description: 'd', points: null }] }],
      }],
    });
    expect(textOnly.maxPoints).toBeNull();
  });

  it('findCriterion resolves a criterion with its group and max points', () => {
    const r = new Rubric(props);
    const hit = r.findCriterion(8302);
    expect(hit?.group.name).toBe('Analysis');
    expect(hit?.criterion.name).toBe('Justifies findings');
    expect(hit?.maxPoints).toBe(3);
    expect(r.findCriterion(1)).toBeNull();
  });

  it('levelName resolves criterion levels and overall levels', () => {
    const r = new Rubric(props);
    expect(r.levelName(8402)).toBe('Missing');
    expect(r.levelName(8101)).toBe('Excellent');
    expect(r.levelName(null)).toBeNull();
    expect(r.levelName(12345)).toBeNull();
  });

  it('toProps round-trips', () => {
    const r = new Rubric(props);
    expect(new Rubric(r.toProps()).toProps()).toEqual(props);
  });
});
