// Page component functions for Alpine.js
// All page logic lives here so Alpine can find them during x-data initialization.

function homePage() {
  return {
    upcoming: [], anns: [], grades: [], authValid: false,
    hitRate: 0, pending: 0, totalCalls: 0, avgMs: 0, tz: '',
    async init() {
      const [s, u, an, gr, cs] = await Promise.allSettled([
        fetch('/api/status').then(r => r.json()),
        fetch('/api/upcoming?days=7').then(r => r.json()),
        fetch('/api/announcements').then(r => r.json()),
        fetch('/api/grades').then(r => r.json()),
        fetch('/api/cache/stats').then(r => r.json()),
      ]);
      if (s.status === 'fulfilled') {
        this.authValid = s.value.auth?.valid ?? false;
        this.tz = s.value.tz || '';
      }
      if (u.status === 'fulfilled') {
        this.upcoming = (u.value.upcoming || []).filter(x => !x.hasSubmission);
        this.pending = this.upcoming.length;
      }
      if (an.status === 'fulfilled') {
        this.anns = (an.value.announcements || []).flatMap(c => c.items || []).slice(0, 5);
      }
      if (gr.status === 'fulfilled') {
        this.grades = (gr.value.grades || []).map(c => {
          const items = c.items || [];
          const graded = items.filter(g => g.percent !== null);
          const avg = graded.length ? graded.reduce((s, g) => s + g.percent, 0) / graded.length : 0;
          return { courseId: c.courseId, name: items[0]?.courseName || `Curso ${c.courseId}`, avg };
        }).filter(g => g.avg > 0).slice(0, 5);
      }
      if (cs.status === 'fulfilled') {
        const cnt = cs.value.stats?.counters || {};
        const h = cnt.cache_hit || 0, m = cnt.cache_miss || 0, t = h + m;
        this.hitRate = t > 0 ? Math.round(h / t * 100) : 0;
        this.totalCalls = t;
      }
    },
  };
}

function authPage() {
  return {
    valid: false, info: '', loading: false, err: null, msg: null,
    tz: '', locale: '', version: '',
    async init() {
      const r = await fetch('/api/status');
      const d = await r.json();
      this.valid = d.auth?.valid ?? false;
      this.info = d.auth?.error || '';
      this.tz = d.tz || '';
      this.locale = d.locale || '';
      this.version = d.version || '';
    },
    async reauth() {
      this.loading = true; this.err = null; this.msg = null;
      try {
        const r = await fetch('/api/auth/refresh', { method: 'POST' });
        const d = await r.json();
        if (d.ok) { this.msg = 'Re-autenticación exitosa'; await this.init(); }
        else this.err = d.error || 'Error desconocido';
      } catch (e) { this.err = e.message; }
      finally { this.loading = false; }
    },
  };
}

function coursesPage() {
  return {
    courses: [], loading: true, activeOnly: true,
    async init() {
      this.loading = true;
      const r = await fetch('/api/courses');
      const d = await r.json();
      this.courses = this.activeOnly
        ? (d.courses || []).filter(c => c.active)
        : (d.courses || []);
      this.loading = false;
    },
  };
}

function assignmentsPage() {
  return {
    all: [], filter: 'pending', loading: true,
    get filtered() {
      if (this.filter === 'pending') return this.all.filter(a => !a.hasSubmission);
      if (this.filter === 'submitted') return this.all.filter(a => a.hasSubmission);
      return this.all;
    },
    async init() {
      this.loading = true;
      const r = await fetch('/api/assignments');
      const d = await r.json();
      this.all = (d.assignments || []).flatMap(c =>
        (c.items || []).map(a => ({ ...a, dueDateStr: a.dueDate?.iso || '—' }))
      );
      this.loading = false;
    },
  };
}

function gradesPage() {
  return {
    courses: [], loading: true,
    async init() {
      this.loading = true;
      const r = await fetch('/api/grades');
      const d = await r.json();
      this.courses = (d.grades || []).map(c => {
        const items = c.items || [];
        const graded = items.filter(g => g.percent !== null);
        const avg = graded.length ? graded.reduce((s, g) => s + g.percent, 0) / graded.length : 0;
        return { courseId: c.courseId, name: items[0]?.courseName || `Curso ${c.courseId}`, items, avg, open: false };
      });
      this.loading = false;
    },
  };
}

function annPage() {
  return {
    items: [], loading: true,
    async init() {
      this.loading = true;
      const r = await fetch('/api/announcements');
      const d = await r.json();
      this.items = (d.announcements || []).flatMap(c => c.items || [])
        .sort((a, b) => new Date(b.postedAt) - new Date(a.postedAt));
      this.loading = false;
    },
  };
}

function configPage() {
  return {
    yaml: '', showYaml: false, saving: false, saveMsg: null, saveErr: false,
    form: { base_url: '', strategy: 'browser', preset: 'microsoft', tz: '', locale: 'es-419', format: 'markdown', writes: false },
    async init() {
      const r = await fetch('/api/config');
      const d = await r.json();
      this.yaml = d.yaml || '';
      try {
        const m = this.yaml.match(/base_url:\s*(.+)/); if (m) this.form.base_url = m[1].trim();
        const t = this.yaml.match(/tz:\s*(.+)/); if (t) this.form.tz = t[1].trim();
        const l = this.yaml.match(/locale:\s*(.+)/); if (l) this.form.locale = l[1].trim();
        const f = this.yaml.match(/format:\s*(.+)/); if (f) this.form.format = f[1].trim();
      } catch {}
    },
    async save() {
      this.saving = true; this.saveMsg = null;
      const y = this.showYaml ? this.yaml : this.yaml;
      try {
        const r = await fetch('/api/config', {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ yaml: y }),
        });
        const d = await r.json();
        if (d.error) { this.saveErr = true; this.saveMsg = d.error; }
        else { this.saveErr = false; this.saveMsg = 'Guardado correctamente.'; }
      } catch (e) { this.saveErr = true; this.saveMsg = e.message; }
      this.saving = false;
    },
  };
}

function cachePage() {
  return {
    hitRate: 0, totalOps: 0, misses: 0, clearMsg: null,
    async init() {
      const r = await fetch('/api/cache/stats');
      const d = await r.json();
      const c = d.stats?.counters || {};
      const h = c.cache_hit || 0, m = c.cache_miss || 0;
      this.totalOps = h + m;
      this.misses = m;
      this.hitRate = this.totalOps > 0 ? Math.round(h / this.totalOps * 100) : 0;
    },
    async clearAll() {
      await fetch('/api/cache/clear', { method: 'POST' });
      this.clearMsg = `Caché limpiado · ${new Date().toLocaleTimeString('es-419')}`;
      await this.init();
    },
  };
}

function logsPage() {
  return {
    entries: [], filter: '',
    get filtered() {
      if (!this.filter) return this.entries;
      const f = this.filter.toLowerCase();
      return this.entries.filter(e => e.tool?.toLowerCase().includes(f));
    },
    async init() {
      const r = await fetch('/api/audit?limit=50');
      const d = await r.json();
      this.entries = d.entries || [];
    },
  };
}

function diagPage() {
  return {
    diag: {}, pingResult: null, pinging: false,
    async init() {
      const [s, d] = await Promise.allSettled([
        fetch('/api/status').then(r => r.json()),
        fetch('/api/diagnostics').then(r => r.json()),
      ]);
      if (s.status === 'fulfilled') this.diag = { ...this.diag, ...s.value };
      if (d.status === 'fulfilled') this.diag = { ...this.diag, ...d.value };
    },
    async ping() {
      this.pinging = true;
      const t = Date.now();
      try {
        await fetch('/api/courses');
        this.pingResult = `✓ ${Date.now() - t}ms — API de Brightspace accesible`;
      } catch (e) {
        this.pingResult = `✗ Error: ${e.message}`;
      }
      this.pinging = false;
    },
  };
}
