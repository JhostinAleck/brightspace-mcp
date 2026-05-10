import { existsSync, readFileSync } from 'node:fs';

import { getAuditLogSchema } from '@/mcp/schemas.js';

export interface GetAuditLogDeps {
  /** Absolute path to the NDJSON audit file written by AuditLogger. */
  auditLogPath: string;
}

interface AuditEntry {
  audit_ts?: string;
  event?: string;
  cid?: string;
  tool?: string;
  args?: Record<string, unknown>;
}

export async function handleGetAuditLog(deps: GetAuditLogDeps, rawInput: unknown) {
  const input = getAuditLogSchema.parse(rawInput ?? {});

  if (!existsSync(deps.auditLogPath)) {
    return {
      content: [{ type: 'text' as const, text: 'No audit log yet — write tools have not been invoked.' }],
    };
  }

  const since = input.since ? new Date(input.since) : null;
  if (since && Number.isNaN(since.getTime())) {
    throw new Error(`Invalid \`since\` timestamp: ${input.since}`);
  }

  // Read whole file and parse line-by-line. Audit logs cap themselves naturally
  // — write operations are infrequent — so we don't bother with streaming.
  const raw = readFileSync(deps.auditLogPath, 'utf8');
  const lines = raw.split('\n').filter((l) => l.trim().length > 0);

  const matches: AuditEntry[] = [];
  // Walk newest-first by reversing; stop once we hit `limit`.
  for (let i = lines.length - 1; i >= 0; i--) {
    let entry: AuditEntry;
    try {
      entry = JSON.parse(lines[i]!) as AuditEntry;
    } catch {
      continue; // Corrupt line — skip rather than fail the whole tool.
    }
    if (input.tool && entry.tool !== input.tool) continue;
    if (since && entry.audit_ts) {
      const ts = new Date(entry.audit_ts);
      if (Number.isNaN(ts.getTime()) || ts < since) continue;
    }
    matches.push(entry);
    if (matches.length >= input.limit) break;
  }

  if (matches.length === 0) {
    return {
      content: [{ type: 'text' as const, text: 'No audit entries match the filters.' }],
    };
  }

  const header = `Last ${matches.length} write attempt${matches.length === 1 ? '' : 's'}` +
    (input.tool ? ` (tool=${input.tool})` : '') +
    (input.since ? ` since ${input.since}` : '') + ':';
  const formatted = matches.map((e) => {
    const argsStr = e.args ? ` ${JSON.stringify(e.args)}` : '';
    return ` • ${e.audit_ts} — ${e.tool} (cid=${e.cid})${argsStr}`;
  });
  return { content: [{ type: 'text' as const, text: `${header}\n${formatted.join('\n')}` }] };
}
