import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname } from 'node:path';

const REGISTRY = 'https://registry.npmjs.org/brightspace-mcp';
const DEFAULT_TTL_MS = 24 * 60 * 60 * 1000;
const DEFAULT_TIMEOUT_MS = 3_000;

export interface UpdateStatus {
  current: string;
  latest: string | null;
  updateAvailable: boolean;
  /** npm deprecation message on the *installed* version — how maintainers flag security releases. */
  deprecated: string | null;
  checkedAt: number;
}

export interface UpdateCheckerOptions {
  currentVersion: string;
  /** Where the last result is cached so the registry is hit at most once per TTL. */
  cachePath: string;
  fetch?: (url: string, init?: { signal?: AbortSignal }) => Promise<Response>;
  now?: () => number;
  ttlMs?: number;
  timeoutMs?: number;
  disabled?: boolean;
}

export function isNewerVersion(remote: string, local: string): boolean {
  const parse = (v: string): [number, number, number] => {
    const parts = v.replace(/[^0-9.]/g, '').split('.').map(Number);
    return [parts[0] ?? 0, parts[1] ?? 0, parts[2] ?? 0];
  };
  const [rMaj, rMin, rPat] = parse(remote);
  const [lMaj, lMin, lPat] = parse(local);
  if (rMaj !== lMaj) return rMaj > lMaj;
  if (rMin !== lMin) return rMin > lMin;
  return rPat > lPat;
}

/**
 * Checks npm for a newer release and for a deprecation flag on the installed
 * version. Never throws: any network/cache failure yields `null` so update
 * checks can't break the server.
 */
export class UpdateChecker {
  private readonly fetchFn: NonNullable<UpdateCheckerOptions['fetch']>;
  private readonly now: () => number;
  private last: UpdateStatus | null = null;

  constructor(private readonly opts: UpdateCheckerOptions) {
    this.fetchFn = opts.fetch ?? ((url, init) => fetch(url, init));
    this.now = opts.now ?? Date.now;
  }

  /** Last known result, or null if no check has completed yet. */
  get status(): UpdateStatus | null {
    return this.last;
  }

  async check(): Promise<UpdateStatus | null> {
    if (this.opts.disabled) return null;
    try {
      this.last = this.readCache() ?? (await this.fetchStatus());
      return this.last;
    } catch {
      return null;
    }
  }

  private readCache(): UpdateStatus | null {
    try {
      const cached = JSON.parse(readFileSync(this.opts.cachePath, 'utf8')) as UpdateStatus;
      const fresh = this.now() - cached.checkedAt < (this.opts.ttlMs ?? DEFAULT_TTL_MS);
      return fresh && cached.current === this.opts.currentVersion ? cached : null;
    } catch {
      return null;
    }
  }

  private async fetchStatus(): Promise<UpdateStatus> {
    const current = this.opts.currentVersion;
    const [latest, installed] = await Promise.all([
      this.getManifest('latest'),
      this.getManifest(current),
    ]);
    const status: UpdateStatus = {
      current,
      latest: latest?.version ?? null,
      updateAvailable: latest?.version ? isNewerVersion(latest.version, current) : false,
      deprecated: typeof installed?.deprecated === 'string' ? installed.deprecated : null,
      checkedAt: this.now(),
    };
    try {
      mkdirSync(dirname(this.opts.cachePath), { recursive: true });
      writeFileSync(this.opts.cachePath, JSON.stringify(status));
    } catch {
      /* cache is best-effort */
    }
    return status;
  }

  private async getManifest(spec: string): Promise<{ version?: string; deprecated?: unknown } | null> {
    const res = await this.fetchFn(`${REGISTRY}/${spec}`, {
      signal: AbortSignal.timeout(this.opts.timeoutMs ?? DEFAULT_TIMEOUT_MS),
    });
    if (!res.ok) return null;
    return (await res.json()) as { version?: string; deprecated?: unknown };
  }
}

const HOW_TO_UPDATE =
  'If you run it via `npx brightspace-mcp@latest`, just restart your MCP client. ' +
  'Global install: run `brightspace-mcp upgrade`. Docker: `docker pull` the latest image.';

/** User-facing notice, or null when there is nothing to report. */
export function formatUpdateNotice(status: UpdateStatus): string | null {
  if (status.deprecated) {
    const target = status.latest ? ` to v${status.latest}` : '';
    return `⚠️ brightspace-mcp v${status.current} is deprecated: ${status.deprecated}\n` +
      `Please update${target}. ${HOW_TO_UPDATE}`;
  }
  if (status.updateAvailable && status.latest) {
    return `ℹ️ A new brightspace-mcp version is available: v${status.latest} (running v${status.current}). ${HOW_TO_UPDATE}`;
  }
  return null;
}
