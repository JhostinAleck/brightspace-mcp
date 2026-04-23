export interface DurationStats {
  count: number;
  min: number;
  max: number;
  avg: number;
  p95: number;
}

export interface DiagnosticsSnapshot {
  counters: Record<string, number>;
  durations: Record<string, DurationStats>;
}
