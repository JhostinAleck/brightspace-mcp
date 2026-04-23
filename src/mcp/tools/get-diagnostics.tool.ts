import type { MetricsRegistry } from '@/shared-kernel/observability/MetricsRegistry.js';

export interface DiagnosticsStaticInfo {
  profile: string;
  baseUrl: string;
  versions: { lp: string; le: string };
}

export interface GetDiagnosticsDeps {
  metrics: MetricsRegistry;
  staticInfo: DiagnosticsStaticInfo;
}

export async function handleGetDiagnostics(deps: GetDiagnosticsDeps, _rawInput: unknown) {
  const snap = deps.metrics.snapshot();
  const report = {
    profile: deps.staticInfo.profile,
    baseUrl: deps.staticInfo.baseUrl,
    versions: deps.staticInfo.versions,
    counters: snap.counters,
    durations: snap.durations,
  };
  return { content: [{ type: 'text' as const, text: JSON.stringify(report, null, 2) }] };
}
