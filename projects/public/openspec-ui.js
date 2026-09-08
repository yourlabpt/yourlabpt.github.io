/**
 * OpenSpec panel: run the spec layer against the project's repository, in either
 * direction — platform to repository (idea to development) or repository to platform
 * (code to requirement).
 */
(function initOpenspecUi() {
  const API = '/api/projects';
  const state = { projectId: '', status: null, plan: null, busy: false };

  function $(id) { return document.getElementById(id); }

  function escapeHtml(value) {
    return String(value ?? '')
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  }

  async function apiRequest(path, options = {}) {
    if (typeof window.apiRequest === 'function') return window.apiRequest(path, options);
    const headers = { ...(options.headers || {}) };
    if (options.body && !headers['Content-Type']) headers['Content-Type'] = 'application/json';
    const token = window.state?.token || localStorage.getItem('requirements_platform_token');
    if (token) headers.Authorization = `Bearer ${token}`;
    const response = await fetch(`${API}${path}`, {
      ...options,
      headers,
      body: options.body ? JSON.stringify(options.body) : undefined,
    });
    const payload = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(payload.message || `HTTP ${response.status}`);
    return payload;
  }

  function isSuperAdmin() {
    return typeof window.isSuperAdmin === 'function' ? window.isSuperAdmin() : false;
  }

  function renderDiff(diff) {
    if (!diff) return '';
    if (diff.inSync) return '<p class="muted-text"><span class="section-badge badge-green">Sincronizado</span> A plataforma e o repositório dizem o mesmo.</p>';
    const rows = diff.changes.slice(0, 12).map((change) => {
      const label = {
        only_in_platform: 'só na plataforma',
        only_in_repository: 'só no repositório',
        differs: 'diferente',
      }[change.operation] || change.operation;
      return `<li><code>${escapeHtml(change.capability)}</code> ${escapeHtml(change.requirementId || '')} ${escapeHtml(change.title || '')} <span class="muted-text">— ${label}</span></li>`;
    }).join('');
    return `
      <p class="muted-text">
        <span class="section-badge badge-amber">Divergente</span>
        ${diff.summary.onlyInPlatform} só na plataforma · ${diff.summary.onlyInRepository} só no repositório · ${diff.summary.differs} diferentes
      </p>
      <ul>${rows}</ul>`;
  }

  function renderPlan(plan) {
    if (!plan) return '';
    const caps = (plan.capabilities || []).map((entry) => `<li><code>${escapeHtml(entry.capability)}</code> — ${entry.requirements} requisito(s), ${entry.scenarios} cenário(s)</li>`).join('');
    return `
      <article class="read-card mt-12">
        <strong>Pré-visualização da importação</strong>
        <p class="muted-text">${plan.requirementCount} registo(s) entram no projecto. Nada é apagado: requisitos que só existem na plataforma mantêm-se.</p>
        <ul>${caps}</ul>
        <div class="ado-action-bar mt-8">
          <button type="button" class="btn primary" id="openspecApplyBtn">Aplicar ao projecto</button>
          <button type="button" class="btn ghost" id="openspecCancelBtn">Cancelar</button>
        </div>
      </article>`;
  }

  function paint() {
    const host = $('projectOpenspecPanel');
    if (!host) return;
    if (state.busy) { host.innerHTML = '<p class="muted-text">A falar com o repositório…</p>'; return; }
    if (!state.status) { host.innerHTML = ''; return; }

    const status = state.status;
    if (status.error) {
      host.innerHTML = `<h4>OpenSpec</h4><p class="muted-text">${escapeHtml(status.error)}</p>`;
      return;
    }

    const admin = isSuperAdmin();
    const actions = status.initialized
      ? `
        <button type="button" class="btn tiny ghost" id="openspecRefreshBtn">Verificar</button>
        ${admin ? '<button type="button" class="btn tiny" id="openspecPushBtn">Enviar para o repositório</button>' : ''}
        ${admin ? '<button type="button" class="btn tiny" id="openspecPullBtn">Importar do repositório</button>' : ''}`
      : (admin ? '<button type="button" class="btn primary" id="openspecInitBtn">Criar openspec/ no repositório</button>' : '');

    host.innerHTML = `
      <div class="panel-title-row">
        <div>
          <h4>OpenSpec</h4>
          <p class="muted-text">A especificação vive no repositório. Pode partir da ideia para o código, ou do código para os requisitos.</p>
        </div>
        <div class="ado-action-bar">${actions}</div>
      </div>
      ${status.initialized
        ? `<p class="muted-text">Repositório: ${status.repositoryRequirementCount} requisito(s) em ${status.repositoryCapabilities.length} capacidade(s) · Plataforma: ${status.platformRequirementCount} em ${status.platformCapabilities.length}.</p>
           ${renderDiff(status.diff)}`
        : '<p class="muted-text"><span class="section-badge badge-gray">Sem openspec/</span> O repositório ainda não tem especificação. Crie a estrutura para começar.</p>'}
      ${renderPlan(state.plan)}`;
  }

  async function load(projectId) {
    if (!projectId) return;
    state.projectId = projectId;
    state.plan = null;
    try {
      state.status = await apiRequest(`/${encodeURIComponent(projectId)}/openspec`);
    } catch (error) {
      // No repository linked is the normal case for a new project, not an error worth shouting about.
      state.status = /repositorio ligado/i.test(error.message) ? null : { error: error.message };
    }
    paint();
  }

  async function run(label, fn) {
    state.busy = true;
    paint();
    try {
      const result = await fn();
      window.showToast?.(label(result), 'ok');
    } catch (error) {
      window.showToast?.(error.message, 'error');
    } finally {
      state.busy = false;
      await load(state.projectId);
    }
  }

  document.addEventListener('click', (event) => {
    const id = event.target?.id;
    if (id === 'openspecRefreshBtn') load(state.projectId);
    else if (id === 'openspecInitBtn') {
      run(
        (r) => `openspec/ criado no ramo ${r.branch}. Reveja o pedido #${r.changeRequest?.number}.`,
        () => apiRequest(`/${encodeURIComponent(state.projectId)}/openspec/initialize`, { method: 'POST', body: {} })
      );
    } else if (id === 'openspecPushBtn') {
      run(
        (r) => (r.skipped ? r.reason : `Enviado no ramo ${r.branch}. Reveja o pedido #${r.changeRequest?.number}.`),
        () => apiRequest(`/${encodeURIComponent(state.projectId)}/openspec/push`, { method: 'POST', body: {} })
      );
    } else if (id === 'openspecPullBtn') {
      // Show the plan first — importing must never overwrite silently.
      (async () => {
        state.busy = true;
        paint();
        try {
          state.plan = await apiRequest(`/${encodeURIComponent(state.projectId)}/openspec/pull`, { method: 'POST', body: { apply: false } });
        } catch (error) {
          window.showToast?.(error.message, 'error');
        } finally {
          state.busy = false;
          paint();
        }
      })();
    } else if (id === 'openspecApplyBtn') {
      run(
        (r) => `Importado: ${r.added} novo(s), ${r.updated} actualizado(s).`,
        () => apiRequest(`/${encodeURIComponent(state.projectId)}/openspec/pull`, { method: 'POST', body: { apply: true } })
      );
    } else if (id === 'openspecCancelBtn') {
      state.plan = null;
      paint();
    }
  });

  window.OpenspecUI = {
    render(project) {
      if (!project?.id) return;
      load(project.id);
    },
  };
})();
