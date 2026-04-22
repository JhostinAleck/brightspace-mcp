export interface TimeWindow {
  readonly from: Date;
  readonly to: Date;
}

export const TimeWindow = {
  of(from: Date, to: Date): TimeWindow {
    if (from.getTime() > to.getTime()) throw new Error('TimeWindow: from must be <= to');
    return { from, to };
  },
};
