(function () {
  function $(id) {
    return document.getElementById(id);
  }

  function escapeHtml(value) {
    return String(value ?? '')
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  }

  function apiRequest(path, options) {
    return window.apiRequest(path, options);
  }

  function showToast(msg, type) {
    window.showToast?.(msg, type);
  }

  function getViewerRole() {
    return window.state?.user?.role || 'partner';
  }

  function isClientRole() {
    return window.isClientUser?.() === true;
  }

  function syncUrlDeepLink(stageId, tabId) {
    if (!window.history?.replaceState) return;
    const params = new URLSearchParams(window.location.search);
    if (tabId) params.set('tab', tabId);
    if (stageId) params.set('stage', stageId);
    const qs = params.toString();
    const url = `${window.location.pathname}${qs ? `?${qs}` : ''}`;
    window.history.replaceState({}, '', url);
  }

  function readUrlDeepLink() {
    const params = new URLSearchParams(window.location.search);
    return {
      tab: params.get('tab'),
      stage: params.get('stage'),
    };
  }

  function applyDeepLinkFromUrl() {
    const { tab, stage } = readUrlDeepLink();
    if (stage && window.state) {
      window.state.deliverySelectedStageId = stage;
    }
    if (tab && window.switchToTab) {
      window.switchToTab(tab);
    }
  }

  async function loadProjectActions(projectId) {
    try {
      const res = await apiRequest(`/projects/${projectId}/project-actions`);
      return res.actions || [];
    } catch {
      return [];
    }
  }

  async function loadSinceLastVisit(projectId) {
    try {
      const res = await apiRequest(`/projects/${projectId}/since-last-visit`);
      return res;
    } catch {
      return { changesSince: [], totalChanges: 0 };
    }
  }

  async function recordVisit(projectId) {
    try {
      await apiRequest(`/projects/${projectId}/record-visit`, { method: 'POST', body: {} });
    } catch { /* non-blocking */ }
  }

  function renderNextActionBar(project, actions, sinceVisit) {
    const el = $('pdosNextActionBar');
    if (!el || !project) return;

    const top = (actions || []).slice(0, 3);
    const changes = sinceVisit?.changesSince || [];

    el.innerHTML = `
      <div class="pdos-next-action-inner">
        <div class="pdos-next-action-head">
          <span class="pdos-section-label">Próximas acções</span>
          ${sinceVisit?.totalChanges ? `<span class="pdos-since-visit">${sinceVisit.totalChanges} alteração(ões) desde a última visita</span>` : ''}
        </div>
        <div class="pdos-next-action-list">
          ${top.length
    ? top.map((a) => `
              <button type="button" class="pdos-next-action-chip" data-action-tab="${escapeHtml(a.tab)}" data-action-stage="${escapeHtml(a.stageId || '')}">
                <span class="pdos-next-action-count">${a.count || ''}</span>
                ${escapeHtml(a.label)}
              </button>
            `).join('')
    : '<span class="muted-text">Sem acções urgentes — bom progresso.</span>'}
        </div>
        ${changes.length ? `
          <details class="pdos-since-visit-details">
            <summary>Desde a última visita</summary>
            <ul class="pdos-since-visit-list">
              ${changes.slice(0, 5).map((c) => `<li><small>${escapeHtml(c.at?.slice(0, 10) || '')}</small> ${escapeHtml(c.label || c.type)}</li>`).join('')}
            </ul>
          </details>
        ` : ''}
      </div>
    `;

    el.querySelectorAll('.pdos-next-action-chip').forEach((btn) => {
      btn.addEventListener('click', () => {
        const tab = btn.dataset.actionTab;
        const stage = btn.dataset.actionStage;
        if (stage) window.state.deliverySelectedStageId = stage;
        syncUrlDeepLink(stage || window.state.deliverySelectedStageId, tab);
        window.switchToTab?.(tab);
        window.PdosUI?.renderAll?.(project);
      });
    });
  }

  function renderPhaseWorkspacePanel(project) {
    const el = $('pdosPhaseWorkspace');
    if (!el || !project) return;

    const stageId = window.state?.deliverySelectedStageId || 'requirements';
    const decisions = (project.decisions || []).filter((d) => d.phaseId === stageId);
    const stageReviews = (project.humanReviews || []).filter((r) => r.status === 'pending');
    const changeRequests = (project.changeRequests || []).filter((cr) =>
      ensureArray(cr.affectedPhaseIds).includes(stageId) || cr.status === 'submitted'
    );

    const stagePanels = {
      idea: renderIdeaPanel(project),
      discovery: renderDiscoveryPanel(project, decisions),
      requirements: renderRequirementsPanel(project),
      architecture: renderArchitecturePanel(project),
      roadmap: renderRoadmapPanel(project, changeRequests),
      implementation: renderImplementationPanel(project),
      validation: renderValidationPanel(project),
      delivery: renderDeliveryPanel(project),
      operations: renderOperationsPanel(project),
    };

    el.innerHTML = `
      <div class="pdos-workspace-grid">
        <div class="pdos-workspace-context">
          <div class="pdos-workspace-head">
            <h4>Painel da fase</h4>
            <span class="chip">${escapeHtml(stageId)}</span>
          </div>
          ${stagePanels[stageId] || '<p class="muted-text">Conteúdo contextual desta fase.</p>'}
        </div>
        <aside class="pdos-workspace-aside">
          <section class="pdos-workspace-aside-block">
            <span class="rm-label">Revisões pendentes</span>
            <strong>${stageReviews.length}</strong>
            ${stageReviews.length ? `<button type="button" class="btn tiny" data-scroll-reviews>Ver revisões</button>` : ''}
          </section>
          <section class="pdos-workspace-aside-block">
            <span class="rm-label">Decisões nesta fase</span>
            <strong>${decisions.length}</strong>
          </section>
          ${!isClientRole() ? `
            <section class="pdos-workspace-aside-block">
              <span class="rm-label">Gate check</span>
              <button type="button" class="btn tiny" id="pdosRunGateCheckBtn">Verificar consistência</button>
              <div id="pdosGateCheckResult" class="pdos-gate-result"></div>
            </section>
          ` : ''}
        </aside>
      </div>
    `;

    el.querySelector('[data-scroll-reviews]')?.addEventListener('click', () => {
      $('pdosHumanReviews')?.scrollIntoView({ behavior: 'smooth' });
    });

    $('pdosRunGateCheckBtn')?.addEventListener('click', () => runGateCheck(project, stageId));
    $('pdosSyncIntegrationsBtn')?.addEventListener('click', async () => {
      try {
        const res = await apiRequest(`/projects/${project.id}/integrations/sync`, { method: 'POST', body: {} });
        showToast(`Sync: ${res.mode} (${(res.mappings || []).length} mappings)`);
      } catch (err) {
        showToast(err.message, 'error');
      }
    });
    wireDecisionsList(project, el);
  }

  function ensureArray(v) {
    return Array.isArray(v) ? v : [];
  }

  function renderIdeaPanel(project) {
    const brief = project.ideaBriefMarkdown || '';
    return `
      <p class="muted-text">Brief da ideia e visão inicial.</p>
      ${brief ? `<div class="pdos-workspace-snippet">${escapeHtml(brief.slice(0, 400))}${brief.length > 400 ? '…' : ''}</div>` : '<p class="muted-text">Sem brief registado.</p>'}
    `;
  }

  function renderDiscoveryPanel(project, decisions) {
    return `
      <p class="muted-text">Decisões e descoberta estruturada.</p>
      ${renderDecisionsList(decisions)}
      <button type="button" class="btn tiny" data-goto-tab="atas">Ver atas</button>
    `;
  }

  function renderRequirementsPanel(project) {
    const reqs = (project.requirements || []).length;
    const openQ = (project.clarificationQuestions || []).filter((q) => !q.answer).length;
    return `
      <p>${reqs} requisito(s) · ${openQ} pergunta(s) em aberto</p>
      <button type="button" class="btn tiny" data-goto-tab="requisitos">Abrir V-map</button>
      <button type="button" class="btn tiny ghost" data-goto-tab="perguntas">Perguntas</button>
    `;
  }

  function renderArchitecturePanel(project) {
    const diagrams = (project.diagramArtifacts || []).length;
    return `<p>${diagrams} diagrama(s) · pacotes de arquitectura por módulo</p>`;
  }

  function renderRoadmapPanel(project, changeRequests) {
    return `
      <p>Pedidos de alteração: ${changeRequests.length}</p>
      ${changeRequests.length ? `<ul class="pdos-cr-list">${changeRequests.slice(0, 3).map((cr) => `<li>${escapeHtml(cr.title)} <span class="chip">${escapeHtml(cr.status)}</span></li>`).join('')}</ul>` : ''}
      ${!isClientRole() ? '<button type="button" class="btn tiny" id="pdosNewChangeRequestBtn">Novo pedido de alteração</button>' : ''}
    `;
  }

  function renderImplementationPanel(project) {
    const tasks = project.implementation?.tasks || [];
    const blocked = tasks.filter((t) => String(t.status).toLowerCase() === 'blocked').length;
    const mappings = (project.integrationMappings || []).length;
    return `
      <p>${tasks.length} tarefa(s) · ${blocked} bloqueada(s) · ${mappings} ligação(ões) Jira/DevOps</p>
      ${!isClientRole() ? '<button type="button" class="btn tiny" id="pdosSyncIntegrationsBtn">Sync integrações</button>' : ''}
    `;
  }

  function renderValidationPanel(project) {
    const tcs = (project.requirements || []).filter((r) => String(r.type).toLowerCase() === 'test_case').length;
    return `<p>${tcs} caso(s) de teste registado(s)</p>`;
  }

  function renderDeliveryPanel(project) {
    const deliverables = (project.artifacts || []).filter((a) => a.stageId === 'delivery').length;
    return `<p>${deliverables} entregável(is) na fase de entrega</p>`;
  }

  function renderOperationsPanel(project) {
    return `<p class="muted-text">Monitorização e operação contínua.</p>`;
  }

  function renderDecisionsList(decisions) {
    if (!decisions.length) return '<p class="muted-text">Sem decisões nesta fase.</p>';
    return `<ul class="pdos-decisions-list">${decisions.slice(0, 5).map((d) => `
      <li data-decision-id="${escapeHtml(d.id)}">
        <span class="chip status-${escapeHtml(d.status)}">${escapeHtml(d.status)}</span>
        ${escapeHtml(d.text)}
      </li>
    `).join('')}</ul>`;
  }

  function wireDecisionsList(project, container) {
    container.querySelector('#pdosNewChangeRequestBtn')?.addEventListener('click', async () => {
      const title = prompt('Título do pedido de alteração:');
      if (!title) return;
      try {
        await apiRequest(`/projects/${project.id}/change-requests`, {
          method: 'POST',
          body: { title, submit: true, affectedPhaseIds: [window.state.deliverySelectedStageId] },
        });
        showToast('Pedido de alteração criado');
        await window.PdosUI?.reloadProject?.(project.id);
      } catch (err) {
        showToast(err.message, 'error');
      }
    });
  }

  async function runGateCheck(project, stageId) {
    const resultEl = $('pdosGateCheckResult');
    if (!resultEl) return;
    resultEl.textContent = 'A verificar…';
    try {
      const res = await apiRequest(`/projects/${project.id}/gate-check`, {
        method: 'POST',
        body: { stageId, agentType: 'consistency_checker' },
      });
      const check = res.check || {};
      const findings = check.findings || [];
      resultEl.innerHTML = findings.length
        ? `<ul class="pdos-gate-findings">${findings.map((f) => `<li class="severity-${f.severity}">${escapeHtml(f.message)}</li>`).join('')}</ul>`
        : `<span class="ok-text">${check.passed ? 'Gate OK' : 'Sem findings'}</span>`;
    } catch (err) {
      resultEl.textContent = err.message;
    }
  }

  async function loadFlowHealth(projectId) {
    try {
      const res = await apiRequest(`/projects/${projectId}/flow-health`);
      return res.health;
    } catch {
      return null;
    }
  }

  function renderFlowHealthDashboard(project, health) {
    const el = $('pdosFlowHealth');
    if (!el) return;
    if (!health) {
      el.innerHTML = '<p class="muted-text">Métricas indisponíveis.</p>';
      return;
    }

    el.innerHTML = `
      <div class="pdos-flow-health-grid">
        <article class="pdos-flow-card pdos-flow-confidence">
          <span class="rm-label">Confiança de entrega</span>
          <strong class="pdos-confidence-score">${health.deliveryConfidence}%</strong>
        </article>
        <article class="pdos-flow-card">
          <span class="rm-label">Revisões pendentes</span>
          <strong>${health.pendingReviews}</strong>
          <small>Ciclo médio: ${health.avgReviewCycleHours}h</small>
        </article>
        <article class="pdos-flow-card">
          <span class="rm-label">Ambiguidades</span>
          <strong>${health.openAmbiguities}</strong>
        </article>
        <article class="pdos-flow-card">
          <span class="rm-label">Rastreabilidade</span>
          <strong>${health.traceabilityCompletenessPct}%</strong>
          <small>${health.orphanFrCount} FR(s) órfão(s)</small>
        </article>
        <article class="pdos-flow-card">
          <span class="rm-label">Tarefas bloqueadas</span>
          <strong>${health.blockedTasks}</strong>
        </article>
        <article class="pdos-flow-card">
          <span class="rm-label">Taxa aceitação IA</span>
          <strong>${health.aiAcceptanceRate != null ? `${health.aiAcceptanceRate}%` : '—'}</strong>
        </article>
      </div>
    `;
  }

  function renderProvenanceBadge(artifact) {
    const prov = artifact?.provenance;
    if (!prov?.source) return '';
    const labels = { ai: 'IA', human: 'Humano', mixed: 'IA+Humano' };
    return `<span class="provenance-badge provenance-${escapeHtml(prov.source)}" title="Origem: ${labels[prov.source] || prov.source}">${labels[prov.source] || prov.source}</span>`;
  }

  function hideAgentUiForClient() {
    if (!isClientRole()) return;
    ['pdosAgentRuntimeBar', 'pdosAdvancedTrace', 'pdosModuleNav'].forEach((id) => {
      const el = $(id);
      if (el) el.classList.add('hidden');
    });
    $('pdosClientPortal')?.classList.remove('hidden');
  }

  async function refreshPlatformUi(project) {
    if (!project?.id) return;
    hideAgentUiForClient();
    const [actions, sinceVisit, health] = await Promise.all([
      loadProjectActions(project.id),
      loadSinceLastVisit(project.id),
      isClientRole() ? null : loadFlowHealth(project.id),
    ]);
    renderNextActionBar(project, actions, sinceVisit);
    renderPhaseWorkspacePanel(project);
    renderFlowHealthDashboard(project, health);
    recordVisit(project.id);
  }

  function wireStageUrlSync() {
    const originalRender = window.PdosUI?.renderGoldenTimeline;
    if (!originalRender || window._platformStageSyncWired) return;
    window._platformStageSyncWired = true;

    document.addEventListener('click', (e) => {
      const stageBtn = e.target.closest('[data-delivery-stage]');
      if (stageBtn) {
        syncUrlDeepLink(stageBtn.dataset.deliveryStage, 'deliveryos');
      }
    });
  }

  function init() {
    applyDeepLinkFromUrl();
    wireStageUrlSync();
  }

  window.DeliveryOsPlatform = {
    init,
    refreshPlatformUi,
    renderProvenanceBadge,
    syncUrlDeepLink,
    readUrlDeepLink,
    applyDeepLinkFromUrl,
    isClientRole,
    loadFlowHealth,
    renderFlowHealthDashboard,
  };

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
