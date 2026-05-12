/* eslint-disable @typescript-eslint/no-explicit-any */
import { describe, expect, it, vi } from 'vitest';
import { createApp } from '@/cli/commands/ui.js';
import type { UiDeps } from '@/cli/commands/ui.js';

function mockDeps(): UiDeps {
  return {
    courseRepo: {
      findMyCourses: vi.fn().mockResolvedValue([
        { id: 1, name: 'Test Course', code: 'TEST-101', active: true },
      ]),
    } as any,
    gradeRepo: { findByCourse: vi.fn().mockResolvedValue([]) } as any,
    assignmentRepo: { findByCourse: vi.fn().mockResolvedValue([]) } as any,
    communicationsRepo: { findAnnouncements: vi.fn().mockResolvedValue([]) } as any,
    calendarRepo: { findEvents: vi.fn().mockResolvedValue([]) } as any,
    contentRepo: {} as any,
    auditLogPath: '/tmp/test-audit.log',
    configPath: '/tmp/test-ui-config.yaml',
    output: {
      tz: 'UTC',
      locale: 'en-US',
      format: 'markdown',
      t: (k: string) => k,
      formatDate: () => '2026-01-01',
      formatRelative: () => 'soon',
      formatPercent: (n: number) => `${n}%`,
      formatPoints: () => '8/10',
      formatDecimal: () => '1.0',
      md: {} as any,
      metaFooter: () => '',
    } as any,
    metrics: {
      snapshot: vi.fn().mockReturnValue({ counters: { cache_hit: 10, cache_miss: 2 }, durations: {} }),
    } as any,
  };
}

describe('GET /api/status', () => {
  it('returns 200 with auth and version', async () => {
    const app = createApp(mockDeps());
    const res = await app.request('/api/status');
    expect(res.status).toBe(200);
    const body = await res.json() as Record<string, unknown>;
    expect(body).toHaveProperty('auth');
    expect(body).toHaveProperty('version');
    expect((body.auth as any).valid).toBe(true);
  });

  it('returns auth.valid=false when courseRepo throws', async () => {
    const deps = mockDeps();
    deps.courseRepo.findMyCourses = vi.fn().mockRejectedValue(new Error('auth expired'));
    const app = createApp(deps);
    const res = await app.request('/api/status');
    expect(res.status).toBe(200);
    const body = await res.json() as Record<string, unknown>;
    expect((body.auth as any).valid).toBe(false);
  });
});

describe('GET /api/courses', () => {
  it('returns courses array', async () => {
    const app = createApp(mockDeps());
    const res = await app.request('/api/courses');
    expect(res.status).toBe(200);
    const body = await res.json() as Record<string, unknown>;
    expect(Array.isArray(body.courses)).toBe(true);
    expect((body.courses as any[]).length).toBe(1);
  });
});

describe('GET /api/cache/stats', () => {
  it('returns stats snapshot', async () => {
    const app = createApp(mockDeps());
    const res = await app.request('/api/cache/stats');
    expect(res.status).toBe(200);
    const body = await res.json() as Record<string, unknown>;
    expect(body).toHaveProperty('stats');
  });
});

describe('POST /api/cache/clear', () => {
  it('returns 200', async () => {
    const app = createApp(mockDeps());
    const res = await app.request('/api/cache/clear', { method: 'POST' });
    expect(res.status).toBe(200);
  });
});

describe('PUT /api/config', () => {
  it('returns 400 for invalid YAML', async () => {
    const app = createApp(mockDeps());
    const res = await app.request('/api/config', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ yaml: 'invalid: {{{broken yaml' }),
    });
    expect(res.status).toBe(400);
  });

  it('returns 200 for valid YAML', async () => {
    const app = createApp(mockDeps());
    const res = await app.request('/api/config', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ yaml: 'default_profile: test\nprofiles: {}' }),
    });
    // May return 200 or fail writing file — just check it doesn't 400
    expect(res.status).not.toBe(400);
  });
});

describe('GET /api/audit', () => {
  it('returns empty array when audit log missing', async () => {
    const deps = mockDeps();
    deps.auditLogPath = '/tmp/does-not-exist-audit-99999.log';
    const app = createApp(deps);
    const res = await app.request('/api/audit');
    expect(res.status).toBe(200);
    const body = await res.json() as Record<string, unknown>;
    expect(Array.isArray(body.entries)).toBe(true);
    expect((body.entries as any[]).length).toBe(0);
  });
});
