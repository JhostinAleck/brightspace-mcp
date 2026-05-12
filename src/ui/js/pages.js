// Page component functions for Alpine.js
// All page logic lives here so Alpine can find them during x-data initialization.

function homePage() {
  return {
    upcoming: [], anns: [], grades: [], authValid: false,
    hitRate: 0, pending: 0, totalCalls: 0, avgMs: 0, tz: '',
    loading: true, error: null,
    async init() {
      this.loading = true;
      this.error = null;
      const [s, u, an, gr, cs, diag] = await Promise.allSettled([
        fetch('/api/status').then(r => r.json()),
        fetch('/api/upcoming?days=7').then(r => { if (!r.ok) throw new Error(r.statusText); return r.json(); }),
        fetch('/api/announcements').then(r => { if (!r.ok) throw new Error(r.statusText); return r.json(); }),
        fetch('/api/grades').then(r => { if (!r.ok) throw new Error(r.statusText); return r.json(); }),
        fetch('/api/cache/stats').then(r => r.json()),
        fetch('/api/diagnostics').then(r => r.json()),
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
          const graded = items.filter(g => g.percent !== null && g.percent !== undefined);
          const avg = graded.length ? graded.reduce((s, g) => s + g.percent, 0) / graded.length : 0;
          // Use itemName from grade items (not courseName — grades have no courseName field)
          const label = items[0]?.itemName?.split(' — ')[0] || `Curso ${c.courseId}`;
          return { courseId: c.courseId, name: label, avg };
        }).filter(g => g.avg > 0).slice(0, 5);
      }
      if (cs.status === 'fulfilled') {
        const cnt = cs.value.stats?.counters || {};
        // Real counter keys: 'http.cache.hit' and 'http.cache.miss'
        const h = cnt['http.cache.hit'] || 0;
        const m = cnt['http.cache.miss'] || 0;
        const t = h + m;
        this.hitRate = t > 0 ? Math.round(h / t * 100) : 0;
      }
      if (diag.status === 'fulfilled') {
        const cnt = diag.value.metrics?.counters || {};
        const dur = diag.value.metrics?.durations?.['http.duration_ms'];
        // totalCalls = cache misses (actual HTTP calls to D2L) + cache hits
        const h = cnt['http.cache.hit'] || 0;
        const m = cnt['http.cache.miss'] || 0;
        this.totalCalls = h + m;
        this.avgMs = dur ? Math.round(dur.avg) : 0;
      }
      this.loading = false;
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
    _all: [],
    loading: true,
    search: '',
    activeOnly: false,
    sortDesc: true,   // most recent first (by startDate)
    page: 1,
    perPage: 15,

    get filtered() {
      let list = this._all;
      if (this.activeOnly) list = list.filter(c => c.active);
      if (this.search.trim()) {
        const q = this.search.toLowerCase();
        list = list.filter(c =>
          c.name.toLowerCase().includes(q) ||
          c.code.toLowerCase().includes(q) ||
          (c.startDate || '').toLowerCase().includes(q)
        );
      }
      list = [...list].sort((a, b) => {
        const ta = a.startDateIso ? new Date(a.startDateIso).getTime() : 0;
        const tb = b.startDateIso ? new Date(b.startDateIso).getTime() : 0;
        return this.sortDesc ? tb - ta : ta - tb;
      });
      return list;
    },

    get paginated() {
      const start = (this.page - 1) * this.perPage;
      return this.filtered.slice(start, start + this.perPage);
    },

    get totalPages() {
      return Math.max(1, Math.ceil(this.filtered.length / this.perPage));
    },

    get pageNumbers() {
      const total = this.totalPages;
      const cur = this.page;
      const pages = [];
      for (let i = Math.max(1, cur - 2); i <= Math.min(total, cur + 2); i++) pages.push(i);
      return pages;
    },

    prevPage() { if (this.page > 1) this.page--; },
    nextPage() { if (this.page < this.totalPages) this.page++; },
    goPage(n) { this.page = n; },

    async init() {
      this.loading = true;
      this.page = 1;
      try {
        const r = await fetch('/api/courses');
        const d = await r.json();
        this._all = d.courses || [];
      } catch { this._all = []; }
      this.loading = false;
    },
  };
}

function assignmentsPage() {
  return {
    all: [], filter: 'pending', loading: true, error: null,
    get filtered() {
      if (this.filter === 'pending') return this.all.filter(a => !a.hasSubmission);
      if (this.filter === 'submitted') return this.all.filter(a => a.hasSubmission);
      return this.all;
    },
    async init() {
      this.loading = true;
      this.error = null;
      try {
        const r = await fetch('/api/assignments');
        if (!r.ok) throw new Error(`Error ${r.status}: ${r.statusText}`);
        const d = await r.json();
        // Server now returns plain objects: { id, name, dueDate (formatted string|null), hasSubmission }
        this.all = (d.assignments || []).flatMap(c =>
          (c.items || []).map(a => ({ ...a, dueDateStr: a.dueDate || '—' }))
        );
      } catch (e) { this.error = e.message; this.all = []; }
      this.loading = false;
    },
  };
}

function gradesPage() {
  return {
    courses: [], loading: true, error: null,
    async init() {
      this.loading = true;
      this.error = null;
      try {
        const r = await fetch('/api/grades');
        if (!r.ok) throw new Error(`Error ${r.status}: ${r.statusText}`);
        const d = await r.json();
        this.courses = (d.grades || []).map(c => {
          const items = c.items || [];
          const graded = items.filter(g => g.percent !== null && g.percent !== undefined);
          const avg = graded.length ? graded.reduce((s, g) => s + g.percent, 0) / graded.length : 0;
          // Grade items have 'itemName'; use the first item's top-level prefix as a course label.
          const courseName = items[0]?.itemName?.split(' — ')[0] || `Curso ${c.courseId}`;
          return { courseId: c.courseId, name: courseName, items, avg, open: false };
        });
      } catch (e) { this.error = e.message; this.courses = []; }
      this.loading = false;
    },
  };
}

function annPage() {
  return {
    items: [], loading: true, error: null,
    async init() {
      this.loading = true;
      this.error = null;
      try {
        const r = await fetch('/api/announcements');
        if (!r.ok) throw new Error(`Error ${r.status}: ${r.statusText}`);
        const d = await r.json();
        this.items = (d.announcements || []).flatMap(c => c.items || [])
          .sort((a, b) => new Date(b.postedAt) - new Date(a.postedAt));
      } catch (e) { this.error = e.message; this.items = []; }
      this.loading = false;
    },
  };
}

function configPage() {
  return {
    yaml: '', showYaml: false, saving: false, saveMsg: null, saveErr: false,
    form: { base_url: '', strategy: 'browser', preset: 'microsoft', tz: '', locale: 'es-419', format: 'markdown', writes: false },
    async init() {
      try {
        const r = await fetch('/api/config');
        const d = await r.json();
        this.yaml = d.yaml || '';
        const m = this.yaml.match(/base_url:\s*(.+)/); if (m) this.form.base_url = m[1].trim();
        const t = this.yaml.match(/tz:\s*(.+)/); if (t) this.form.tz = t[1].trim();
        const l = this.yaml.match(/locale:\s*(.+)/); if (l) this.form.locale = l[1].trim();
        const f = this.yaml.match(/format:\s*(.+)/); if (f) this.form.format = f[1].trim();
        const s = this.yaml.match(/strategy:\s*(.+)/); if (s) this.form.strategy = s[1].trim();
      } catch { /* ignore */ }
    },
    buildYamlFromForm() {
      // Sync form values back into the YAML string by replacing matching keys
      let y = this.yaml;
      const replace = (key, val) => {
        const re = new RegExp(`(^${key}:\\s*)(.+)`, 'm');
        if (re.test(y)) { y = y.replace(re, `$1${val}`); }
        else { y += `\n${key}: ${val}`; }
      };
      replace('base_url', this.form.base_url);
      replace('tz', this.form.tz);
      replace('locale', this.form.locale);
      replace('format', this.form.format);
      replace('strategy', this.form.strategy);
      return y;
    },
    async save() {
      this.saving = true; this.saveMsg = null;
      // If in form view, sync form fields back to YAML before saving
      const y = this.showYaml ? this.yaml : this.buildYamlFromForm();
      try {
        const r = await fetch('/api/config', {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ yaml: y }),
        });
        const d = await r.json();
        if (d.error) { this.saveErr = true; this.saveMsg = d.error; }
        else { this.saveErr = false; this.saveMsg = 'Guardado correctamente.'; this.yaml = y; }
      } catch (e) { this.saveErr = true; this.saveMsg = e.message; }
      this.saving = false;
    },
  };
}

function cachePage() {
  return {
    hitRate: 0, totalOps: 0, misses: 0, clearMsg: null,
    async init() {
      try {
        const r = await fetch('/api/cache/stats');
        const d = await r.json();
        const c = d.stats?.counters || {};
        // Real counter keys: 'http.cache.hit' and 'http.cache.miss'
        const h = c['http.cache.hit'] || 0;
        const m = c['http.cache.miss'] || 0;
        this.totalOps = h + m;
        this.misses = m;
        this.hitRate = this.totalOps > 0 ? Math.round(h / this.totalOps * 100) : 0;
      } catch { /* ignore */ }
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
      try {
        const r = await fetch('/api/audit?limit=50');
        const d = await r.json();
        this.entries = d.entries || [];
      } catch { this.entries = []; }
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
