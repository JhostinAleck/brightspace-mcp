import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { Hono } from 'hono';
import { parse as parseYaml } from 'yaml';
import { serve } from '@hono/node-server';
import { serveStatic } from '@hono/node-server/serve-static';
import type { CourseRepository } from '@/contexts/courses/domain/CourseRepository.js';
import type { GradeRepository } from '@/contexts/grades/domain/GradeRepository.js';
import type { AssignmentRepository } from '@/contexts/assignments/domain/AssignmentRepository.js';
import type { CommunicationsRepository } from '@/contexts/communications/domain/CommunicationsRepository.js';
import type { CalendarRepository } from '@/contexts/calendar/domain/CalendarRepository.js';
import type { ContentRepository } from '@/contexts/content/domain/ContentRepository.js';
import type { OutputContext } from '@/shared-kernel/output/index.js';
import type { MetricsRegistry } from '@/shared-kernel/observability/MetricsRegistry.js';
import { OrgUnitId } from '@/shared-kernel/types/OrgUnitId.js';


export interface UiDeps {
  courseRepo: CourseRepository;
  gradeRepo: GradeRepository;
  assignmentRepo: AssignmentRepository;
  communicationsRepo: CommunicationsRepository;
  calendarRepo: CalendarRepository;
  contentRepo: ContentRepository;
  auditLogPath: string;
  configPath: string;
  output: OutputContext;
  metrics: MetricsRegistry;
}

export interface UiOptions {
  port?: number;
  open?: boolean;
}

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

export function createApp(deps: UiDeps): Hono {
  const app = new Hono();

  // ── Static files (served from build/ui/ at runtime) ─────────────────────
  // During tests `__dirname` is `src/cli/commands` or `build/cli/commands`
  // The UI files live relative to the build root. We compute a path that works
  // in both compiled and test contexts.
  const uiRoot = join(__dirname, '..', '..', 'ui');
  // Only register serveStatic when the ui directory exists (not in unit tests)
  if (existsSync(uiRoot)) {
    app.use('/*', serveStatic({ root: uiRoot }));
  }

  // ── GET /api/status ─────────────────────────────────────────────────────
  app.get('/api/status', async (c) => {
    let authValid = false;
    let authError: string | null = null;
    try {
      await deps.courseRepo.findMyCourses();
      authValid = true;
    } catch (e) {
      authError = e instanceof Error ? e.message : String(e);
    }
    let version = '0.0.0';
    try {
      const candidates = [
        join(__dirname, '..', '..', '..', 'package.json'),
        join(__dirname, '..', '..', 'package.json'),
      ];
      for (const p of candidates) {
        if (existsSync(p)) {
          version = (JSON.parse(readFileSync(p, 'utf8')) as { version: string }).version;
          break;
        }
      }
    } catch { /* ignore */ }
    return c.json({ version, auth: { valid: authValid, error: authError }, tz: deps.output.tz, locale: deps.output.locale });
  });

  // ── GET /api/courses ────────────────────────────────────────────────────
  app.get('/api/courses', async (c) => {
    const courses = await deps.courseRepo.findMyCourses();
    return c.json({ courses: courses.map((co) => ({ id: co.id, name: co.name, code: co.code, active: co.active })) });
  });

  // ── GET /api/upcoming ───────────────────────────────────────────────────
  app.get('/api/upcoming', async (c) => {
    const days = parseInt(c.req.query('days') ?? '7', 10);
    const courses = await deps.courseRepo.findMyCourses({ activeOnly: true });
    const cutoff = new Date(Date.now() + days * 86_400_000);
    const results: Array<{ courseId: number; courseName: string; assignmentId: number; name: string; dueDate: string; hasSubmission: boolean }> = [];
    for (const course of courses) {
      const assignments = await deps.assignmentRepo.findByCourse(OrgUnitId.of(Number(course.id)));
      for (const a of assignments) {
        const due = a.dueDate.toDate();
        if (due && due <= cutoff) {
          results.push({ courseId: Number(course.id), courseName: course.name, assignmentId: Number(a.id), name: a.name, dueDate: deps.output.formatDate(due, 'datetime'), hasSubmission: a.hasSubmission });
        }
      }
    }
    results.sort((a, b) => a.dueDate.localeCompare(b.dueDate));
    return c.json({ upcoming: results });
  });

  // ── GET /api/grades?courseId=N ──────────────────────────────────────────
  app.get('/api/grades', async (c) => {
    const courseIdParam = c.req.query('courseId');
    const ids: OrgUnitId[] = courseIdParam
      ? [OrgUnitId.of(parseInt(courseIdParam, 10))]
      : (await deps.courseRepo.findMyCourses({ activeOnly: true })).map((co) => OrgUnitId.of(Number(co.id)));
    const result: Array<{ courseId: number; items: unknown[] }> = [];
    for (const id of ids) {
      const grades = await deps.gradeRepo.findByCourse(id);
      result.push({
        courseId: Number(id),
        items: grades.map((g) => ({
          itemId: g.itemId,
          itemName: g.itemName,
          pointsEarned: g.pointsEarned,
          pointsMax: g.pointsMax,
          percent: g.percent,
          displayedGrade: g.displayedGrade,
        })),
      });
    }
    return c.json({ grades: result });
  });

  // ── GET /api/assignments?courseId=N ─────────────────────────────────────
  app.get('/api/assignments', async (c) => {
    const courseIdParam = c.req.query('courseId');
    const ids: OrgUnitId[] = courseIdParam
      ? [OrgUnitId.of(parseInt(courseIdParam, 10))]
      : (await deps.courseRepo.findMyCourses({ activeOnly: true })).map((co) => OrgUnitId.of(Number(co.id)));
    const result: Array<{ courseId: number; items: unknown[] }> = [];
    for (const id of ids) {
      const items = await deps.assignmentRepo.findByCourse(id);
      result.push({
        courseId: Number(id),
        items: items.map((a) => ({
          id: Number(a.id),
          name: a.name,
          instructions: a.instructions,
          dueDate: a.dueDate.toDate() ? deps.output.formatDate(a.dueDate.toDate()!, 'datetime') : null,
          hasSubmission: a.hasSubmission,
          submissionMode: a.submissionMode,
        })),
      });
    }
    return c.json({ assignments: result });
  });

  // ── GET /api/announcements?courseId=N ────────────────────────────────────
  app.get('/api/announcements', async (c) => {
    const courseIdParam = c.req.query('courseId');
    const ids: OrgUnitId[] = courseIdParam
      ? [OrgUnitId.of(parseInt(courseIdParam, 10))]
      : (await deps.courseRepo.findMyCourses({ activeOnly: true })).map((co) => OrgUnitId.of(Number(co.id)));
    const result: Array<{ courseId: number; items: unknown[] }> = [];
    for (const id of ids) {
      const items = await deps.communicationsRepo.findAnnouncements(id);
      result.push({
        courseId: Number(id),
        items: items.map((ann) => ({
          id: ann.id,
          title: ann.title,
          html: ann.html,
          authorName: ann.authorName,
          postedAt: ann.postedAt,
        })),
      });
    }
    return c.json({ announcements: result });
  });

  // ── GET /api/cache/stats ────────────────────────────────────────────────
  app.get('/api/cache/stats', (c) => {
    return c.json({ stats: deps.metrics.snapshot() });
  });

  // ── GET /api/audit?limit=N&tool=X ───────────────────────────────────────
  app.get('/api/audit', (c) => {
    const limit = parseInt(c.req.query('limit') ?? '50', 10);
    const toolFilter = c.req.query('tool');
    if (!existsSync(deps.auditLogPath)) return c.json({ entries: [] });
    const lines = readFileSync(deps.auditLogPath, 'utf8')
      .split('\n')
      .filter(Boolean)
      .map((l) => { try { return JSON.parse(l) as Record<string, unknown>; } catch { return null; } })
      .filter((x): x is Record<string, unknown> => x !== null);
    const filtered = toolFilter ? lines.filter((e) => e['tool'] === toolFilter) : lines;
    return c.json({ entries: filtered.slice(-limit).reverse() });
  });

  // ── GET /api/diagnostics ────────────────────────────────────────────────
  app.get('/api/diagnostics', (c) => {
    return c.json({ uptime: process.uptime(), tz: deps.output.tz, locale: deps.output.locale, format: deps.output.format, metrics: deps.metrics.snapshot() });
  });

  // ── GET /api/config ─────────────────────────────────────────────────────
  app.get('/api/config', (c) => {
    if (!existsSync(deps.configPath)) return c.json({ yaml: '', error: 'Config file not found' });
    return c.json({ yaml: readFileSync(deps.configPath, 'utf8') });
  });

  // ── POST /api/auth/refresh ───────────────────────────────────────────────
  app.post('/api/auth/refresh', async (c) => {
    // Re-auth by forcing a fresh course fetch (which triggers auto-reauth in D2lApiClient)
    try {
      await deps.courseRepo.findMyCourses();
      return c.json({ ok: true });
    } catch (e) {
      return c.json({ ok: false, error: e instanceof Error ? e.message : String(e) }, 500);
    }
  });

  // ── POST /api/cache/clear ────────────────────────────────────────────────
  app.post('/api/cache/clear', (c) => {
    // Signal noted; actual cache eviction requires CachedRepository access
    // This endpoint exists for UI feedback; deep cache clear is a future enhancement
    return c.json({ ok: true, message: 'Cache clear signalled' });
  });

  // ── PUT /api/config ─────────────────────────────────────────────────────
  app.put('/api/config', async (c) => {
    let body: { yaml: string };
    try {
      body = await c.req.json<{ yaml: string }>();
    } catch {
      return c.json({ error: 'Invalid JSON body' }, 400);
    }
    try {
      parseYaml(body.yaml);
    } catch (e) {
      return c.json({ error: `Invalid YAML: ${e instanceof Error ? e.message : String(e)}` }, 400);
    }
    try {
      writeFileSync(deps.configPath, body.yaml, { encoding: 'utf8', mode: 0o600 });
      return c.json({ ok: true });
    } catch (e) {
      return c.json({ error: `Write failed: ${e instanceof Error ? e.message : String(e)}` }, 500);
    }
  });

  // ── GET /api/events (SSE) ───────────────────────────────────────────────
  app.get('/api/events', (_c) => {
    const encoder = new TextEncoder();
    const stream = new ReadableStream({
      start(controller) {
        const send = (type: string, payload: unknown): void => {
          try {
            controller.enqueue(encoder.encode(`data: ${JSON.stringify({ type, payload })}\n\n`));
          } catch { /* connection closed */ }
        };

        // Initial push
        void deps.courseRepo.findMyCourses()
          .then(() => send('auth_status', { valid: true }))
          .catch(() => send('auth_status', { valid: false }));
        send('cache_stats', deps.metrics.snapshot());

        // Heartbeat every 30s
        const hb = setInterval(() => {
          try { controller.enqueue(encoder.encode(':heartbeat\n\n')); }
          catch { clearInterval(hb); }
        }, 30_000);
      },
    });

    return new Response(stream, {
      headers: {
        'Content-Type': 'text/event-stream',
        'Cache-Control': 'no-cache',
        Connection: 'keep-alive',
      },
    });
  });

  return app;
}

export async function runUi(opts: UiOptions & { deps: UiDeps }): Promise<void> {
  const port = opts.port ?? 9876;
  const app = createApp(opts.deps);
  const url = `http://localhost:${port}`;

  serve({ fetch: app.fetch, port }, () => {
    process.stdout.write(`\nBrightspace MCP UI running at ${url}\n`);
    process.stdout.write('Press Ctrl+C to stop.\n\n');
  });

  if (opts.open) {
    try {
      const { exec } = await import('node:child_process');
      exec(`${process.platform === 'darwin' ? 'open' : process.platform === 'win32' ? 'start' : 'xdg-open'} ${url}`);
    } catch { /* ignore if open fails */ }
  }
}
