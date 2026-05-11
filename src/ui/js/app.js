function app() {
  return {
    page: 'home',
    pageTitle: {
      home: 'Inicio', auth: 'Autenticación', courses: 'Cursos',
      assignments: 'Tareas', grades: 'Calificaciones', announcements: 'Anuncios',
      config: 'Configuración', cache: 'Caché', logs: 'Logs', diagnostics: 'Diagnósticos',
    },
    dark: localStorage.getItem('dark') === 'true'
      || (!localStorage.getItem('dark') && window.matchMedia('(prefers-color-scheme: dark)').matches),
    status: {},
    pendingCount: 0,
    toast: null,
    pages: { home:'', auth:'', courses:'', assignments:'', grades:'', announcements:'', config:'', cache:'', logs:'', diagnostics:'' },

    async init() {
      await this.loadStatus();
      await this.loadPendingCount();
      await this.loadPage('home');
      this.connectSSE();
    },

    async loadStatus() {
      try {
        const r = await fetch('/api/status');
        this.status = await r.json();
      } catch { /* ignore */ }
    },

    async loadPendingCount() {
      try {
        const r = await fetch('/api/upcoming?days=7');
        const d = await r.json();
        this.pendingCount = (d.upcoming || []).filter((u) => !u.hasSubmission).length;
      } catch { /* ignore */ }
    },

    async loadPage(name) {
      if (this.pages[name]) return;
      try {
        const r = await fetch(`/pages/${name}.html`);
        if (!r.ok) throw new Error(`${r.status}`);
        this.pages[name] = await r.text();
      } catch (e) {
        this.pages[name] = `<div class="p-6 text-red-400 text-sm">Error cargando página ${name}: ${e.message}</div>`;
      }
    },

    async navigate(name) {
      this.page = name;
      await this.loadPage(name);
    },

    async reauth() {
      try {
        const r = await fetch('/api/auth/refresh', { method: 'POST' });
        const d = await r.json();
        if (d.ok) { this.showToast('Re-autenticación exitosa'); await this.loadStatus(); }
        else this.showToast('Error: ' + (d.error || 'desconocido'), true);
      } catch (e) { this.showToast('Error: ' + e.message, true); }
    },

    showToast(msg, isError = false) {
      this.toast = { msg, error: isError };
      setTimeout(() => { this.toast = null; }, 3000);
    },

    connectSSE() {
      const es = new EventSource('/api/events');
      es.onmessage = (e) => {
        try {
          const { type, payload } = JSON.parse(e.data);
          if (type === 'auth_status') { this.status.auth = payload; }
        } catch { /* ignore */ }
      };
      es.onerror = () => { es.close(); setTimeout(() => this.connectSSE(), 3000); };
    },
  };
}
