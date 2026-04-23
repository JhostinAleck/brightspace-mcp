import type { DiagnosticsSnapshot, DurationStats } from './DiagnosticsSnapshot.js';

export class MetricsRegistry {
  private readonly counters = new Map<string, number>();
  private readonly observations = new Map<string, number[]>();

  inc(name: string, delta = 1): void {
    this.counters.set(name, (this.counters.get(name) ?? 0) + delta);
  }

  observe(name: string, value: number): void {
    const bucket = this.observations.get(name) ?? [];
    bucket.push(value);
    this.observations.set(name, bucket);
  }

  snapshot(): DiagnosticsSnapshot {
    const counters: Record<string, number> = {};
    for (const [k, v] of this.counters) counters[k] = v;
    const durations: Record<string, DurationStats> = {};
    for (const [k, values] of this.observations) {
      if (values.length === 0) continue;
      durations[k] = computeStats([...values]);
    }
    return { counters, durations };
  }
}

function computeStats(values: number[]): DurationStats {
  const sorted = values.slice().sort((a, b) => a - b);
  const count = sorted.length;
  const min = sorted[0]!;
  const max = sorted[count - 1]!;
  const avg = sorted.reduce((s, v) => s + v, 0) / count;
  const p95Index = Math.min(count - 1, Math.ceil(count * 0.95) - 1);
  const p95 = sorted[p95Index]!;
  return { count, min, max, avg, p95 };
}
