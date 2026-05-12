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

    async init() {
      await this.loadStatus();
      await this.loadPendingCount();
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
        if (!r.ok) return;
        const d = await r.json();
        this.pendingCount = (d.upcoming || []).filter((u) => !u.hasSubmission).length;
      } catch { /* ignore */ }
    },

    navigate(name) {
      const prev = this.page;
      this.page = name;
      // Re-initialize the page component when navigating to it (even if same page).
      // We dispatch a custom event that each page's x-init can listen to,
      // OR we use Alpine's $dispatch. The simplest approach: after setting page,
      // find the page's Alpine component and call init() on it.
      if (prev !== name) {
        // Use nextTick so Alpine has rendered the new page before we call init
        this.$nextTick(() => {
          const pageEl = document.querySelector(`[data-page="${name}"]`);
          if (pageEl && pageEl._x_dataStack) {
            const data = pageEl._x_dataStack[0];
            if (data && typeof data.init === 'function') {
              data.init();
            }
          }
        });
      }
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
