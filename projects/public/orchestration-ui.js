/**
 * The persona chain: start it, watch it, answer its question, raise the cap.
 *
 * The chain advances itself on the server — this panel only observes it and answers
 * the two questions it can raise.
 */
(function initOrchestrationUi() {
  const API = '/api/projects';
  const state = { projectId: '', data: null, busy: false };

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
      ...options, headers, body: options.body ? JSON.stringify(options.body) : undefined,
    });
    const payload = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(payload.message || `HTTP ${response.status}`);
    return payload;
  }

  function isSuperAdmin() {
    return typeof window.isSuperAdmin === 'function' ? window.isSuperAdmin() : false;
  }

  const STATUS_LABEL = {
    idle: ['badge-gray', 'Parada'],
    running: ['badge-green', 'A correr'],
    waiting_human: ['badge-amber', 'À sua espera'],
    paused_budget: ['badge-amber', 'Orçamento esgotado'],
    halted: ['badge-red', 'Parada por decisão'],
    completed: ['badge-green', 'Concluída'],
  };

  function money(value) {
    return `$${(Number(value) || 0).toFixed(2)}`;
  }

  function renderBudget(budget) {
    const cost = budget.maxCostUsd > 0
      ? `${money(budget.spentUsd)} de ${money(budget.maxCostUsd)}`
      : `${money(budget.spentUsd)} (sem limite)`;
    const time = budget.maxHours > 0
      ? `${budget.hours.toFixed(2)}h de ${budget.maxHours}h`
      : `${budget.hours.toFixed(2)}h (sem limite)`;
    return `<p class="muted-text">Gasto: <strong>${escapeHtml(cost)}</strong> · Tempo: <strong>${escapeHtml(time)}</strong>${budget.running ? '' : ' <span class="muted-text">(relógio parado)</span>'}</p>`;
  }

  function renderHistory(history) {
    if (!history.length) return '';
    const rows = history.slice(-8).map((entry) => `
      <li>
        <code>${escapeHtml(entry.personaId)}</code>
        ${entry.outcome === 'failed' ? '<span class="section-badge badge-red">falhou</span>' : ''}
        ${entry.costUsd ? `<span class="muted-text">— ${escapeHtml(money(entry.costUsd))}</span>` : ''}
        ${entry.summary ? `<span class="muted-text">— ${escapeHtml(entry.summary.slice(0, 80))}</span>` : ''}
      </li>`).join('');
    return `<ul class="mt-8">${rows}</ul>`;
  }

  function paint() {
    const host = $('projectOrchestrationPanel');
    if (!host) return;
    if (state.busy) { host.innerHTML = '<p class="muted-text">A avançar a cadeia…</p>'; return; }
    if (!state.data) { host.innerHTML = ''; return; }

    const data = state.data;
    const [badgeClass, label] = STATUS_LABEL[data.status] || ['badge-gray', data.status];
    const admin = isSuperAdmin();

    let actions = '';
    if (admin) {
      if (data.status === 'idle' || data.status === 'completed') {
        actions = '<button type="button" class="btn primary" id="orchStartBtn">Iniciar cadeia</button>';
      } else if (data.status === 'waiting_human') {
        actions = `
          <button type="button" class="btn primary" id="orchAcceptBtn">Aceitar e continuar</button>
          <button type="button" class="btn ghost" id="orchRejectBtn">Pedir outra versão</button>`;
      } else if (data.status === 'paused_budget' || data.status === 'halted') {
        actions = '<button type="button" class="btn" id="orchRaiseBtn">Aumentar limite e continuar</button>';
      } else {
        actions = `
          <button type="button" class="btn tiny ghost" id="orchRefreshBtn">Actualizar</button>
          <button type="button" class="btn tiny ghost" id="orchStopBtn">Parar</button>`;
      }
    }

    const question = data.question
      ? `<article class="read-card mt-8">
           <strong>Pergunta de <code>${escapeHtml(data.question.personaId)}</code></strong>
           <p>${escapeHtml(data.question.text)}</p>
         </article>`
      : '';

    const blocked = ['halted', 'paused_budget'].includes(data.status) && (data.haltReason || data.next?.reason)
      ? `<p class="muted-text"><span class="section-badge badge-red">Parou</span> ${escapeHtml(data.haltReason || data.next.reason)}</p>`
      : '';

    host.innerHTML = `
      <div class="panel-title-row">
        <div>
          <h4>Cadeia de personas</h4>
          <p class="muted-text">As personas correm sozinhas, uma após a outra. Só param para uma pergunta, para o orçamento, ou quando a mesma falha se repete — não é preciso acompanhar.</p>
        </div>
        <div class="ado-action-bar">
          <span class="section-badge ${badgeClass}">${escapeHtml(label)}</span>
          ${actions}
        </div>
      </div>
      ${renderBudget(data.budget)}
      ${blocked}
      ${question}
      ${data.next && data.status === 'running' ? `<p class="muted-text">Próximo: <code>${escapeHtml(data.next.personaId || data.next.action)}</code>${data.next.remainingUnits ? ` (${data.next.remainingUnits} unidade(s) pendentes)` : ''}</p>` : ''}
      ${renderHistory(data.history || [])}`;
  }

  async function load(projectId) {
    if (!projectId) return;
    state.projectId = projectId;
    try {
      state.data = await apiRequest(`/${encodeURIComponent(projectId)}/orchestration`);
    } catch (error) {
      state.data = null;
      const host = $('projectOrchestrationPanel');
      if (host) host.innerHTML = `<p class="muted-text">${escapeHtml(error.message)}</p>`;
      return;
    }
    paint();
  }

  async function run(fn) {
    state.busy = true;
    paint();
    try {
      await fn();
    } catch (error) {
      window.showToast?.(error.message, 'error');
    } finally {
      state.busy = false;
      await load(state.projectId);
    }
  }

  document.addEventListener('click', (event) => {
    const id = event.target?.id;
    if (id === 'orchStartBtn') {
      const cost = window.prompt('Limite de custo para este projecto, em USD (0 = sem limite):', '20');
      if (cost === null) return;
      const hours = window.prompt('Limite de horas de execução (0 = sem limite):', '4');
      if (hours === null) return;
      run(() => apiRequest(`/${encodeURIComponent(state.projectId)}/orchestration/start`, {
        method: 'POST', body: { maxCostUsd: Number(cost) || 0, maxHours: Number(hours) || 0 },
      }));
    } else if (id === 'orchRefreshBtn') {
      load(state.projectId);
    } else if (id === 'orchAcceptBtn') {
      run(() => apiRequest(`/${encodeURIComponent(state.projectId)}/orchestration/answer`, {
        method: 'POST', body: { accepted: true },
      }));
    } else if (id === 'orchRejectBtn') {
      run(() => apiRequest(`/${encodeURIComponent(state.projectId)}/orchestration/answer`, {
        method: 'POST', body: { accepted: false },
      }));
    } else if (id === 'orchRaiseBtn') {
      const cost = window.prompt('Novo limite de custo em USD:', String((state.data?.budget?.maxCostUsd || 20) * 2));
      if (cost === null) return;
      run(() => apiRequest(`/${encodeURIComponent(state.projectId)}/orchestration/start`, {
        method: 'POST', body: { maxCostUsd: Number(cost) || 0 },
      }));
    } else if (id === 'orchStopBtn') {
      run(() => apiRequest(`/${encodeURIComponent(state.projectId)}/orchestration/stop`, { method: 'POST', body: {} }));
    }
  });

  window.OrchestrationUI = {
    render(project) {
      if (!project?.id) return;
      load(project.id);
    },
  };
})();
