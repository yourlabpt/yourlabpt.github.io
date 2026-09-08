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
    personas: [],
    modelProfiles: [],
    personaConnector: null,
  };

  const WRITE_SCOPE_LABELS = {
    spec: 'Especificação',
    design: 'Desenho',
    contracts: 'Contratos',
    module_code: 'Código do módulo',
    tests: 'Testes',
    none: 'Sem escrita',
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

  function personaBindingBadge(persona) {
    if (!state.personaConnector) {
      return '<span class="section-badge badge-gray">Sem runtime ligado</span>';
    }
    if (persona.pinnedAgentMissing) {
      return '<span class="section-badge badge-red">Agente fixado indisponível</span>';
    }
    if (!persona.satisfied) {
      const blocked = persona.candidates.find((candidate) => candidate.typeMatch);
      const detail = blocked?.missingTools?.length
        ? `Faltam ferramentas: ${blocked.missingTools.join(', ')}`
        : 'Nenhum agente declara este tipo de tarefa';
      return `<span class="section-badge badge-amber" title="${escapeHtml(detail)}">Sem agente compatível</span>`;
    }
    return `<span class="section-badge badge-green">${escapeHtml(persona.boundAgentName || persona.boundAgentId)}</span>`;
  }

  function renderPersonas() {
    const host = $('agentsPersonasList');
    if (!host) return;
    if (!state.personas.length) {
      host.innerHTML = '<p class="muted-text">Registo de personas indisponível.</p>';
      return;
    }
    host.innerHTML = state.personas.map((persona) => {
      const options = state.modelProfiles.map((profile) => `
        <option value="${escapeHtml(profile)}"${profile === persona.modelProfileId ? ' selected' : ''}>${escapeHtml(profile)}</option>
      `).join('');
      const agentOptions = ['<option value="">Automático</option>']
        .concat(persona.candidates.map((candidate) => `
          <option value="${escapeHtml(candidate.agentId)}"${candidate.agentId === persona.boundAgentId && persona.pinnedAgentMissing === false ? '' : ''}>
            ${escapeHtml(candidate.name)}${candidate.eligible ? '' : ' (incompatível)'}
          </option>
        `))
        .join('');
      return `
        <article class="agents-persona-row read-card" data-persona-id="${escapeHtml(persona.personaId)}">
          <div class="panel-title-row">
            <div>
              <strong>${persona.order}. ${escapeHtml(persona.label)}</strong>
              <p class="muted-text">${escapeHtml(persona.pipelineSteps.join(' · '))} — fases: ${escapeHtml(persona.deliveryStages.join(', '))}</p>
            </div>
            ${personaBindingBadge(persona)}
          </div>
          <div class="form-grid compact mt-8">
            <label>Perfil do modelo<select data-persona-field="modelProfileId">${options}</select></label>
            <label>Agente do runtime<select data-persona-field="agentId">${agentOptions}</select></label>
            <label>Limite tokens<input type="number" min="0" data-persona-field="maxTokens" value="${Number(persona.maxTokens) || 0}" /></label>
            <label>Tempo máximo (min)<input type="number" min="0" data-persona-field="maxWallClockMinutes" value="${Number(persona.maxWallClockMinutes) || 0}" /></label>
            <label class="checkline"><input type="checkbox" data-persona-field="enabled"${persona.enabled ? ' checked' : ''} /> Activa</label>
            <label class="checkline"><input type="checkbox" data-persona-field="requiresHumanApproval"${persona.requiresHumanApproval ? ' checked' : ''} /> Exige aprovação humana</label>
          </div>
          <p class="muted-text mt-8">
            Escreve: <strong>${escapeHtml(WRITE_SCOPE_LABELS[persona.writeScope] || persona.writeScope)}</strong>
            · Código: ${persona.canWriteCode ? 'sim' : 'não'}
            · Tier no runtime: <code>${escapeHtml(persona.runtimeTier)}</code>
          </p>
        </article>
      `;
    }).join('');
    // The pinned agent is a stored override, not the resolved binding — set it after
    // render so an unavailable pin still shows as "Automático" rather than vanishing.
    for (const persona of state.personas) {
      const row = host.querySelector(`[data-persona-id="${persona.personaId}"]`);
      const select = row?.querySelector('[data-persona-field="agentId"]');
      const pinned = state.settings?.personas?.[persona.personaId]?.agentId || '';
      if (select) select.value = pinned;
    }
  }

  function readPersonaForm() {
    const host = $('agentsPersonasList');
    if (!host) return {};
    const personas = {};
    host.querySelectorAll('[data-persona-id]').forEach((row) => {
      const personaId = row.dataset.personaId;
      const field = (name) => row.querySelector(`[data-persona-field="${name}"]`);
      personas[personaId] = {
        enabled: field('enabled')?.checked !== false,
        modelProfileId: field('modelProfileId')?.value || 'medium',
        agentId: field('agentId')?.value || '',
        maxTokens: Number(field('maxTokens')?.value) || 0,
        maxWallClockMinutes: Number(field('maxWallClockMinutes')?.value) || 0,
        requiresHumanApproval: field('requiresHumanApproval')?.checked === true,
      };
    });
    return personas;
  }

  function renderGitProvider() {
    const settings = state.git;
    const host = $('gitProviderStatus');
    if (!host || !settings) return;
    if ($('gitProvider')) $('gitProvider').value = settings.provider || 'github';
    if ($('gitAccount')) $('gitAccount').value = settings.account || '';
    if ($('gitDefaultOwner')) $('gitDefaultOwner').value = settings.defaultOwner || '';
    if ($('gitDefaultVisibility')) $('gitDefaultVisibility').value = settings.defaultVisibility || 'private';
    if ($('gitRepoPrefix')) $('gitRepoPrefix').value = settings.repositoryPrefix || '';
    if ($('gitApiBaseUrl')) $('gitApiBaseUrl').value = settings.apiBaseUrl || '';
    if ($('gitToken')) {
      $('gitToken').value = '';
      $('gitToken').placeholder = settings.hasToken
        ? 'Token guardado — escreva um novo para substituir'
        : 'Cole aqui o token de acesso';
    }

    const parts = [];
    if (!settings.hasToken) {
      parts.push('<span class="section-badge badge-gray">Sem token</span> Configure a conta para poder criar repositórios.');
    } else if (settings.verifiedAt) {
      parts.push(`<span class="section-badge badge-green">Ligado como ${escapeHtml(settings.verifiedAccount)}</span> Verificado em ${new Date(settings.verifiedAt).toLocaleString('pt-PT')}.`);
    } else {
      parts.push('<span class="section-badge badge-amber">Token por verificar</span> Use “Testar ligação”.');
    }
    if (settings.keySource === 'file') {
      parts.push('<br /><span class="muted-text">Chave de cifra guardada em <code>data/.secret-key</code> (fora do git). Defina <code>PLATFORM_SECRET_KEY</code> no ambiente para a gerir fora do disco.</span>');
    }
    host.innerHTML = `<p class="muted-text">${parts.join(' ')}</p>`;
  }

  async function saveGitProvider() {
    const body = {
      provider: $('gitProvider')?.value || 'github',
      account: $('gitAccount')?.value?.trim() || '',
      defaultOwner: $('gitDefaultOwner')?.value?.trim() || '',
      defaultVisibility: $('gitDefaultVisibility')?.value || 'private',
      repositoryPrefix: $('gitRepoPrefix')?.value?.trim() || '',
      apiBaseUrl: $('gitApiBaseUrl')?.value?.trim() || '',
    };
    // Only send the token when one was typed, so saving never clears a stored one.
    const typed = $('gitToken')?.value?.trim();
    if (typed) body.token = typed;
    const payload = await apiRequest('/git-provider/settings', { method: 'PATCH', body });
    state.git = payload.settings;
    renderGitProvider();
    window.showToast?.('Configuração Git guardada.', 'ok');
  }

  async function verifyGitProvider() {
    const payload = await apiRequest('/git-provider/verify', { method: 'POST', body: {} });
    state.git = payload.settings;
    renderGitProvider();
    const owners = (payload.owners || []).map((owner) => owner.label).join(', ');
    window.showToast?.(
      `Ligado como ${payload.identity.account}${owners ? ` · ${owners}` : ''}`,
      'ok'
    );
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
      const [healthPayload, settingsPayload, runsPayload, personasPayload, gitPayload] = await Promise.all([
        apiRequest('/agent-runs/health').catch(() => ({})),
        apiRequest('/agent-platform/settings'),
        apiRequest('/agent-runs/recent?limit=30'),
        apiRequest('/agent-platform/personas').catch(() => ({})),
        apiRequest('/git-provider/settings').catch(() => ({})),
      ]);
      state.git = gitPayload.settings || null;
      state.health = healthPayload;
      state.settings = settingsPayload.settings;
      state.runs = runsPayload.runs || [];
      state.personas = personasPayload.personas || [];
      state.modelProfiles = personasPayload.modelProfiles || [];
      state.personaConnector = personasPayload.connector || null;
      fillForm(state.settings);
      renderHealth();
      renderGitProvider();
      renderPersonas();
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

  async function savePersonas() {
    const payload = await apiRequest('/agent-platform/settings', {
      method: 'PATCH',
      body: { personas: readPersonaForm() },
    });
    state.settings = payload.settings;
    await refresh();
    window.showToast?.('Personas guardadas.', 'ok');
  }

  function wireEvents() {
    $('agentsSaveDefaultsBtn')?.addEventListener('click', () => {
      saveDefaults().catch((error) => window.showToast?.(error.message, 'error'));
    });
    $('agentsSavePersonasBtn')?.addEventListener('click', () => {
      savePersonas().catch((error) => window.showToast?.(error.message, 'error'));
    });
    $('gitSaveBtn')?.addEventListener('click', () => {
      saveGitProvider().catch((error) => window.showToast?.(error.message, 'error'));
    });
    $('gitVerifyBtn')?.addEventListener('click', () => {
      verifyGitProvider().catch((error) => window.showToast?.(error.message, 'error'));
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
