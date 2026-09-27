import type { MetricsRegistry } from '@/shared-kernel/observability/MetricsRegistry.js';
import type { UpdateStatus } from '@/shared-kernel/updates/UpdateChecker.js';

export interface DiagnosticsStaticInfo {
  profile: string;
  baseUrl: string;
  versions: { lp: string; le: string };
}

export interface GetDiagnosticsDeps {
  metrics: MetricsRegistry;
  staticInfo: DiagnosticsStaticInfo;
  updateChecker?: { readonly status: UpdateStatus | null };
}

export async function handleGetDiagnostics(deps: GetDiagnosticsDeps, _rawInput: unknown) {
  const snap = deps.metrics.snapshot();
  const report = {
    profile: deps.staticInfo.profile,
    baseUrl: deps.staticInfo.baseUrl,
    versions: deps.staticInfo.versions,
    update: deps.updateChecker?.status ?? null,
    counters: snap.counters,
    durations: snap.durations,
  };
  return { content: [{ type: 'text' as const, text: JSON.stringify(report, null, 2) }] };
}
