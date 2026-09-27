import type { OutputContext } from '@/shared-kernel/output/index.js';
import { Rubric } from '@/contexts/assignments/domain/Rubric.js';

function pts(n: number, ctx: OutputContext): string {
  return ctx.t('rubric.points_short', { points: ctx.formatDecimal(n) });
}

function rubricToText(rubric: Rubric, ctx: OutputContext): string {
  const summary = [
    ctx.t('rubric.groups_count', { count: rubric.groups.length }),
    ctx.t('rubric.criteria_count', { count: rubric.criterionCount }),
  ];
  const max = rubric.maxPoints;
  if (max !== null) summary.push(ctx.t('rubric.max_points', { points: pts(max, ctx) }));
  const parts = [ctx.md.h3(ctx.t('rubric.header', { name: rubric.name })), ctx.md.italic(summary.join(' · '))];
  if (rubric.description) parts.push(rubric.description);
  if (rubric.overallLevels.length > 0) {
    const levels = rubric.overallLevels
      .map((l) => (l.rangeStart === null ? l.name : `${l.name} ≥ ${ctx.formatDecimal(l.rangeStart)}`))
      .join(' · ');
    parts.push(`${ctx.md.bold(ctx.t('rubric.overall_levels'))}: ${levels}`);
  }
  // One table per criteria group: criteria are rows, the group's levels are columns.
  for (const group of rubric.groups) {
    const headers = [
      ctx.t('rubric.criterion'),
      ...group.levels.map((l) => (l.points === null ? l.name : `${l.name} (${pts(l.points, ctx)})`)),
    ];
    const rows = group.criteria.map((criterion) => [
      criterion.name,
      ...group.levels.map((level) => {
        const cell = criterion.cells.find((c) => c.levelId === level.id);
        if (!cell) return '';
        const p = Rubric.cellPoints(group, cell);
        const head = p === null ? '' : ctx.md.bold(pts(p, ctx));
        return [head, cell.description].filter(Boolean).join(' — ');
      }),
    ]);
    parts.push(ctx.md.h4(group.name), ctx.md.table(headers, rows));
  }
  return parts.join('\n\n');
}

export function rubricsToText(rubrics: readonly Rubric[], ctx: OutputContext): string {
  if (rubrics.length === 0) return ctx.t('rubric.none');
  return rubrics.map((r) => rubricToText(r, ctx)).join('\n\n');
}
