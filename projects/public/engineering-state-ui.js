/* Engineering State V1 — feature-gated, incremental project view. */
(function () {
  const $ = (id) => document.getElementById(id);
  const escapeHtml = (value) => String(value ?? '')
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;').replace(/'/g, '&#039;');
  const state = { projectId: '', loading: false, graph: null, changeSets: [], diagnostics: null };

  function enabled(project) {
    return Boolean(project?.featureFlags?.engineering_state_v1)
      && ['standard', 'complete'].includes(project?.deliveryLevel || 'standard');
  }

  function sectionStatusLabel(status) {
    return ({ pending: 'Por rever', approved: 'Aprovada', rejected: 'Rejeitada', changes_requested: 'Correções pedidas' })[status] || status;
  }

  function render(project) {
    const panel = $('engineeringStatePanel');
    if (!panel) return;
    panel.classList.toggle('hidden', !enabled(project));
    if (!enabled(project)) return;
    if (state.projectId !== project.id) {
      state.projectId = project.id;
      state.graph = null;
      state.changeSets = [];
      state.diagnostics = null;
    }
    if (!state.graph && !state.loading) load(project.id);
    renderData();
  }

  function renderData() {
    if (!state.projectId) return;
    const diagnostics = state.diagnostics;
    const graph = state.graph;
    if ($('engineeringStateBadge')) $('engineeringStateBadge').textContent = graph ? `v${graph.revision}` : 'shadow';
    if ($('engineeringStateSummary')) {
      $('engineeringStateSummary').textContent = state.loading
        ? 'A sincronizar a projeção estruturada…'
        : `${graph?.entities?.length || 0} entidades · ${graph?.relationships?.length || 0} relações · revisão ${graph?.revision || 0}`;
    }
    if ($('engineeringStateDiagnostics')) {
      const dangling = diagnostics?.danglingRelationships?.length || 0;
      const duplicates = diagnostics?.duplicateFingerprints?.length || 0;
      $('engineeringStateDiagnostics').innerHTML = `
        <span class="engineering-health ${dangling ? 'has-error' : 'is-ok'}">${dangling ? `${dangling} ligações inválidas` : 'Relações válidas'}</span>
        <span class="engineering-health ${duplicates ? 'has-warning' : 'is-ok'}">${duplicates ? `${duplicates} possíveis duplicados` : 'Sem duplicados exactos'}</span>`;
    }
    if ($('engineeringEntityList')) {
      const entities = graph?.entities || [];
      $('engineeringEntityList').innerHTML = entities.length ? entities.slice(0, 80).map((entity) => `
        <details class="simple-item engineering-entity" data-engineering-entity="${escapeHtml(entity.id)}">
          <summary><strong>${escapeHtml(entity.title)}</strong> <span class="badge badge-gray">${escapeHtml(entity.type)}</span>${entity.virtual ? ' <small>projecção</small>' : ''}</summary>
          <div class="engineering-entity-meta">ID: ${escapeHtml(entity.id)} · versão ${escapeHtml(entity.version)}</div>
          <pre>${escapeHtml(JSON.stringify(entity.attributes || {}, null, 2))}</pre>
        </details>`).join('') : '<div class="simple-item"><small>Sem entidades estruturadas.</small></div>';
    }
    if ($('engineeringChangeSetList')) {
      $('engineeringChangeSetList').innerHTML = state.changeSets.length ? state.changeSets.map((changeSet) => `
        <article class="simple-item engineering-change-set" data-change-set-id="${escapeHtml(changeSet.id)}">
          <div class="engineering-change-set-head"><strong>${escapeHtml(changeSet.summary || changeSet.id)}</strong><span class="badge badge-gray">${escapeHtml(changeSet.status)}</span></div>
          <small>Impacto ${escapeHtml(changeSet.impactAssessment?.level || 'local')} · confiança ${Math.round((changeSet.confidence || 0) * 100)}%</small>
          <div class="engineering-sections">${(changeSet.sections || []).map((section) => `
            <div class="engineering-section" data-section-id="${escapeHtml(section.id)}">
              <div><strong>${escapeHtml(section.title)}</strong><small>${escapeHtml(sectionStatusLabel(section.decision))} · ${(section.operations || []).length} operações</small></div>
              ${changeSet.status !== 'applied' ? `<div class="actions-row">
                <button class="btn tiny" data-engineering-decision="approved">Aceitar</button>
                <button class="btn tiny ghost" data-engineering-decision="changes_requested">Pedir correções</button>
                <button class="btn tiny danger" data-engineering-decision="rejected">Rejeitar</button>
              </div>` : ''}
            </div>`).join('')}</div>
          ${(changeSet.recommendedTasks || []).length ? `<details><summary>Sugestões de tarefas (${changeSet.recommendedTasks.length})</summary><small>Estas sugestões não entram em Tasks até serem aceites explicitamente.</small></details>` : ''}
          ${changeSet.status !== 'applied' ? '<button class="btn primary tiny" data-engineering-apply>Aplicar secções aprovadas</button>' : ''}
        </article>`).join('') : '<div class="simple-item"><small>Sem alterações estruturadas propostas.</small></div>';
    }
  }

  async function load(projectId) {
    if (!projectId || state.loading) return;
    state.loading = true;
    renderData();
    try {
      const [graph, changeSets, diagnostics] = await Promise.all([
        apiRequest(`/${encodeURIComponent(projectId)}/engineering/graph`),
        apiRequest(`/${encodeURIComponent(projectId)}/engineering/change-sets`),
        apiRequest(`/${encodeURIComponent(projectId)}/engineering/diagnostics`),
      ]);
      if (state.projectId !== projectId) return;
      state.graph = graph;
      state.changeSets = changeSets.changeSets || [];
      state.diagnostics = diagnostics;
    } catch (error) {
      if (typeof showToast === 'function') showToast(error.message, 'error');
    } finally {
      state.loading = false;
      renderData();
    }
  }

  async function decide(changeSetId, sectionId, decision) {
    await apiRequest(`/${encodeURIComponent(state.projectId)}/engineering/change-sets/${encodeURIComponent(changeSetId)}/review`, {
      method: 'POST', body: { sections: [{ id: sectionId, decision }] },
    });
    await loadFresh();
    document.dispatchEvent(new CustomEvent('engineering:changed', { detail: { projectId: state.projectId, changeSetId } }));
  }

  async function applyChangeSet(changeSetId) {
    await apiRequest(`/${encodeURIComponent(state.projectId)}/engineering/change-sets/${encodeURIComponent(changeSetId)}/apply`, { method: 'POST', body: {} });
    if (typeof showToast === 'function') showToast('Alterações estruturadas aplicadas com snapshot e auditoria.', 'ok');
    await loadFresh();
    if (typeof window.refreshSelectedProject === 'function') await window.refreshSelectedProject();
    document.dispatchEvent(new CustomEvent('engineering:changed', { detail: { projectId: state.projectId, changeSetId } }));
  }

  async function loadFresh() {
    state.graph = null;
    state.changeSets = [];
    state.diagnostics = null;
    await load(state.projectId);
  }

  document.addEventListener('click', (event) => {
    const refresh = event.target.closest('#engineeringStateRefresh');
    if (refresh) { loadFresh(); return; }
    const decisionButton = event.target.closest('[data-engineering-decision]');
    if (decisionButton) {
      const changeSet = decisionButton.closest('[data-change-set-id]');
      const section = decisionButton.closest('[data-section-id]');
      decisionButton.disabled = true;
      decide(changeSet?.dataset.changeSetId, section?.dataset.sectionId, decisionButton.dataset.engineeringDecision)
        .catch((error) => typeof showToast === 'function' && showToast(error.message, 'error'))
        .finally(() => { decisionButton.disabled = false; });
      return;
    }
    const applyButton = event.target.closest('[data-engineering-apply]');
    if (applyButton) {
      const changeSet = applyButton.closest('[data-change-set-id]');
      applyButton.disabled = true;
      applyChangeSet(changeSet?.dataset.changeSetId)
        .catch((error) => typeof showToast === 'function' && showToast(error.message, 'error'))
        .finally(() => { applyButton.disabled = false; });
    }
  });

  function install() {
    if (!window.PdosUI?.renderAll || window.PdosUI.__engineeringWrapped) return false;
    const original = window.PdosUI.renderAll.bind(window.PdosUI);
    window.PdosUI.renderAll = async function renderAllWithEngineering(project) {
      const result = await original(project);
      render(project);
      return result;
    };
    window.PdosUI.__engineeringWrapped = true;
    if (window.state?.selectedProject) render(window.state.selectedProject);
    return true;
  }
  if (!install()) document.addEventListener('DOMContentLoaded', install, { once: true });
  window.EngineeringStateUI = { render, refresh: loadFresh };
})();
