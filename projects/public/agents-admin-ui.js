/**
 * Central Agents admin — health, defaults, active runs.
 */
(function initAgentsAdminUi() {
  const API = '/api/projects';
  const state = {
    settings: null,
    runs: [],
    health: null,
    connectors: [],
  };

  function $(id) { return document.getElementById(id); }

  function escapeHtml(value) {
    return String(value ?? '')
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  }

  async function apiRequest(path, options = {}) {
    if (typeof window.apiRequest === 'function') {
      return window.apiRequest(path, options);
    }
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

  function readFormSettings() {
    const defaults = state.settings?.executionDefaults || {};
    return {
      agentId: $('agentsDefaultAgentId')?.value?.trim() || '',
      modelProfileId: $('agentsDefaultModel')?.value || defaults.modelProfileId || 'medium',
      maxTokens: Number($('agentsDefaultMaxTokens')?.value) || 0,
      externalMaxTokens: Number($('agentsDefaultExternalTokens')?.value) || 120000,
      maxCost: Number($('agentsDefaultMaxCost')?.value) || 0,
      maxWallClockMinutes: Number($('agentsDefaultMaxMinutes')?.value) || 0,
      planningWaveSize: Number($('agentsDefaultWaveSize')?.value) || 8,
      enableWebSearch: $('agentsDefaultWebSearch')?.checked !== false,
      pauseForSubtaskReview: $('agentsDefaultPauseReview')?.checked === true,
      allowedMcpTools: String($('agentsDefaultTools')?.value || '')
        .split(',')
        .map((entry) => entry.trim())
        .filter(Boolean),
    };
  }

  function fillForm(settings) {
    const defaults = settings?.executionDefaults || {};
    if ($('agentsDefaultAgentId')) $('agentsDefaultAgentId').value = defaults.agentId || '';
    if ($('agentsDefaultModel')) $('agentsDefaultModel').value = defaults.modelProfileId || 'medium';
    if ($('agentsDefaultMaxTokens')) $('agentsDefaultMaxTokens').value = defaults.maxTokens || 0;
    if ($('agentsDefaultExternalTokens')) $('agentsDefaultExternalTokens').value = defaults.externalMaxTokens || 120000;
    if ($('agentsDefaultMaxCost')) $('agentsDefaultMaxCost').value = defaults.costPolicy?.maxCost || defaults.maxCost || 0;
    if ($('agentsDefaultMaxMinutes')) $('agentsDefaultMaxMinutes').value = defaults.maxWallClockMinutes || 0;
    if ($('agentsDefaultWaveSize')) $('agentsDefaultWaveSize').value = defaults.planningWaveSize || 8;
    if ($('agentsDefaultWebSearch')) $('agentsDefaultWebSearch').checked = defaults.enableWebSearch !== false;
    if ($('agentsDefaultPauseReview')) $('agentsDefaultPauseReview').checked = defaults.pauseForSubtaskReview === true;
    if ($('agentsDefaultTools')) {
      $('agentsDefaultTools').value = (defaults.allowedMcpTools || []).join(', ');
    }
  }

  function renderHealth() {
    const host = $('agentsHealthPanel');
    if (!host) return;
    const health = state.health || {};
    const connector = health.connector || window.state?.config?.agentRuntime?.connector;
    const reachable = health.runtimeReachable ?? window.state?.config?.agentRuntime?.enabled;
    host.innerHTML = `
      <div class="agents-health-grid">
        <article class="read-card">
          <h4>Runtime</h4>
          <p><strong>${reachable ? 'Ligado' : 'Indisponível'}</strong></p>
          <p class="muted-text">Modo: ${escapeHtml(health.mode || window.state?.config?.agentRuntime?.mode || '—')}</p>
        </article>
        <article class="read-card">
          <h4>Dispositivo emparelhado</h4>
          <p><strong>${connector ? escapeHtml(connector.name || 'Runtime') : 'Nenhum'}</strong></p>
          <p class="muted-text">${connector ? (connector.online ? 'Online agora' : 'Offline') : 'Emparelhe em Definições → Agent Runtime'}</p>
        </article>
      </div>
    `;
  }

  function renderRuns() {
    const host = $('agentsRunsList');
    if (!host) return;
    if (!state.runs.length) {
      host.innerHTML = '<p class="muted-text">Sem execuções recentes.</p>';
      return;
    }
    host.innerHTML = state.runs.map((run) => `
      <article class="agents-run-row">
        <div>
          <strong>${escapeHtml(run.taskTitle || run.workItemId)}</strong>
          <p class="muted-text">${escapeHtml(run.projectName)} · ${escapeHtml(run.status)} · ${run.updatedAt ? new Date(run.updatedAt).toLocaleString('pt-PT') : '—'}</p>
        </div>
        <div class="ado-action-bar">
          <button type="button" class="btn tiny" data-agents-open-task data-project-id="${escapeHtml(run.projectId)}" data-task-id="${escapeHtml(run.workItemId)}">Abrir tarefa</button>
          ${run.runId ? `<button type="button" class="btn tiny ghost" data-agents-open-run data-project-id="${escapeHtml(run.projectId)}" data-task-id="${escapeHtml(run.workItemId)}">Ver execução</button>` : ''}
        </div>
      </article>
    `).join('');
  }

  async function refresh() {
    if (typeof window.isSuperAdmin === 'function' && !window.isSuperAdmin()) return;
    try {
      const [healthPayload, settingsPayload, runsPayload] = await Promise.all([
        apiRequest('/agent-runs/health').catch(() => ({})),
        apiRequest('/agent-platform/settings'),
        apiRequest('/agent-runs/recent?limit=30'),
      ]);
      state.health = healthPayload;
      state.settings = settingsPayload.settings;
      state.runs = runsPayload.runs || [];
      fillForm(state.settings);
      renderHealth();
      renderRuns();
    } catch (error) {
      const host = $('agentsAdminRoot');
      if (host) host.querySelector('.agents-error')?.remove();
      host?.insertAdjacentHTML('beforeend', `<p class="agents-error muted-text">${escapeHtml(error.message)}</p>`);
    }
  }

  async function saveDefaults() {
    const payload = await apiRequest('/agent-platform/settings', {
      method: 'PATCH',
      body: { executionDefaults: readFormSettings() },
    });
    state.settings = payload.settings;
    window.showToast?.('Definições de agentes guardadas.', 'ok');
  }

  function wireEvents() {
    $('agentsSaveDefaultsBtn')?.addEventListener('click', () => {
      saveDefaults().catch((error) => window.showToast?.(error.message, 'error'));
    });
    $('agentsRefreshBtn')?.addEventListener('click', () => {
      refresh().catch((error) => window.showToast?.(error.message, 'error'));
    });
    $('agentsRunsList')?.addEventListener('click', (event) => {
      const openTask = event.target.closest('[data-agents-open-task], [data-agents-open-run]');
      if (!openTask) return;
      const projectId = openTask.dataset.projectId;
      const taskId = openTask.dataset.taskId;
      if (!projectId || !taskId) return;
      if (window.loadProjectById) {
        window.loadProjectById(projectId, { switchTab: 'tarefas' }).then(() => {
          window.WorkItemsUI?.openTask?.(window.state?.selectedProject, taskId);
        });
      }
    });
  }

  function render() {
    const root = $('agentsAdminRoot');
    if (!root) return;
    if (typeof window.isSuperAdmin === 'function' && !window.isSuperAdmin()) {
      root.innerHTML = '<p class="muted-text">Apenas super-administradores podem gerir agentes.</p>';
      return;
    }
    refresh();
  }

  wireEvents();
  window.AgentsAdminUI = { render, refresh };
})();
