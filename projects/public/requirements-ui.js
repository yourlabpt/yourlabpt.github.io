(function () {
  const reqUiState = {
    collapsedModules: new Set(),
    collapsedPhases: new Set(),
    modalDirty: false,
    modalReqId: null,
    dragReqId: null,
    groupMode: 'module',
    groupingIndex: new Map(),
    selectedReqIds: new Set(),
  };

  const RENUMBERABLE_TYPES = new Set(['stakeholder', 'functional', 'non_functional', 'test_case']);

  function parseReqIdParts(id) {
    const m = String(id || '').match(/^(STK|SR|FR|RNF|TC)-(\d+)$/i);
    if (!m) return null;
    const prefix = m[1].toUpperCase() === 'SR' ? 'STK' : m[1].toUpperCase();
    return { prefix, serial: Number(m[2]), fullPrefix: `${prefix}-` };
  }

  async function applyRequirementRenumber(project, reqId, target, inputEl) {
    const parts = parseReqIdParts(reqId);
    if (!parts || !Number.isFinite(target) || target < 1 || parts.serial === target) return null;
    if (inputEl) inputEl.disabled = true;
    try {
      const res = await apiRequest(
        `/projects/${encodeURIComponent(project.id)}/requirements/${encodeURIComponent(reqId)}/renumber`,
        { method: 'POST', body: { number: target } }
      );
      state.selectedProject = res.project;
      const changedId = res.changedId || reqId;
      if (reqUiState.modalReqId === reqId) reqUiState.modalReqId = changedId;
      if (state.selectedRequirementId === reqId) state.selectedRequirementId = changedId;
      renderGroupedRequirements(state.selectedProject);
      if (window.RequirementsMapUI?.renderRequirementsMap && reqUiState.groupMode === 'vmap') {
        await window.RequirementsMapUI.renderRequirementsMap(state.selectedProject, 'vmap');
      }
      if (typeof refreshHierarchyKpis === 'function') refreshHierarchyKpis(state.selectedProject);
      if (typeof renderImplementationPlan === 'function') renderImplementationPlan(state.selectedProject);
      const serialInput = $('modalReqSerial');
      if (serialInput && reqUiState.modalReqId) {
        const newParts = parseReqIdParts(changedId);
        if (newParts) {
          serialInput.dataset.renumberReq = changedId;
          serialInput.value = newParts.serial;
        }
      }
      return res;
    } catch (error) {
      if (inputEl) inputEl.value = parts.serial;
      showToast(error.message || 'Erro ao renumerar.', 'error');
      return null;
    } finally {
      if (inputEl) inputEl.disabled = false;
    }
  }

  function wireModalRenumberInput(form, project) {
    if (!canEdit() || !form) return;
    form.querySelectorAll('.req-modal-serial-input').forEach((input) => {
      const apply = async () => {
        const reqId = input.dataset.renumberReq;
        const target = Number(input.value);
        if (!reqId) return;
        await applyRequirementRenumber(state.selectedProject || project, reqId, target, input);
        if (reqUiState.modalReqId && $('reqModalTitle')) {
          const req = (state.selectedProject?.requirements || []).find((r) => r.id === reqUiState.modalReqId);
          if (req) $('reqModalTitle').textContent = `${req.id} — Editar requisito`;
        }
      };
      input.addEventListener('click', (e) => e.stopPropagation());
      input.addEventListener('mousedown', (e) => e.stopPropagation());
      input.addEventListener('keydown', (e) => {
        e.stopPropagation();
        if (e.key === 'Enter') {
          e.preventDefault();
          input.blur();
        }
      });
      input.addEventListener('change', (e) => {
        e.stopPropagation();
        apply();
      });
    });
  }

  // Liga cada requisito a funcionalidade/grupo a partir de project.capabilities
  // e project.requirementClusters (o resultado do agrupamento com IA).
  function buildGroupingIndex(project) {
    const index = new Map();
    const caps = Array.isArray(project?.capabilities) ? project.capabilities : [];
    const clusters = Array.isArray(project?.requirementClusters) ? project.requirementClusters : [];
    for (const cap of caps) {
      for (const rid of (cap.requirementIds || [])) {
        const key = String(rid);
        if (!index.has(key)) index.set(key, { capabilityId: cap.id, capabilityName: cap.name, clusterId: '', clusterName: '' });
      }
    }
    for (const cl of clusters) {
      for (const rid of (cl.requirementIds || [])) {
        const key = String(rid);
        const entry = index.get(key) || { capabilityId: '', capabilityName: '', clusterId: '', clusterName: '' };
        entry.clusterId = cl.id;
        entry.clusterName = cl.name;
        if (!entry.capabilityName && cl.capabilityId) {
          const cap = caps.find((c) => c.id === cl.capabilityId);
          if (cap) { entry.capabilityId = cap.id; entry.capabilityName = cap.name; }
        }
        index.set(key, entry);
      }
    }
    return index;
  }

  // Agrupa por funcionalidade -> grupo (espelha a estrutura módulo -> fase).
  function groupRequirementsByCapability(items) {
    const index = reqUiState.groupingIndex;
    const tree = new Map();
    for (const req of items) {
      const g = index.get(String(req.id));
      const capName = (g && g.capabilityName) || 'Sem funcionalidade';
      const clName = (g && g.clusterName) || 'Sem grupo';
      if (!tree.has(capName)) tree.set(capName, new Map());
      const cls = tree.get(capName);
      if (!cls.has(clName)) cls.set(clName, []);
      cls.get(clName).push(req);
    }
    const sortNames = (a, b, sentinel) => {
      if (a === sentinel) return 1;
      if (b === sentinel) return -1;
      return a.localeCompare(b, 'pt');
    };
    return [...tree.keys()]
      .sort((a, b) => sortNames(a, b, 'Sem funcionalidade'))
      .map((cap) => ({
        module: cap,
        phases: [...tree.get(cap).keys()]
          .sort((a, b) => sortNames(a, b, 'Sem grupo'))
          .map((cl) => ({ phase: cl, requirements: tree.get(cap).get(cl) })),
      }));
  }

  const FIELD_HELP = {
    id: 'Identificador único do requisito no projecto.',
    type: 'Classificação do requisito (stakeholder, funcional, etc.).',
    title: 'Título curto e descritivo do requisito.',
    shall: 'Enunciado «shall» — o que o sistema deve fazer.',
    need: 'Necessidade do stakeholder (formato «As a… I need…»).',
    module: 'Área principal da arquitetura responsável por implementar este requisito.',
    phase: 'Momento da Linha de Entrega em que este requisito será tratado.',
    status: 'Estado actual de validação ou implementação do requisito.',
    priority: 'Prioridade relativa para planeamento e implementação.',
    submodule: 'Sub-área ou componente dentro do módulo.',
    measure: 'Condições objetivas para considerar o requisito concluído (critérios de aceitação).',
    related: 'IDs de requisitos relacionados ou dependentes.',
    notes: 'Observações internas, decisões ou contexto adicional.',
  };

  function $(id) {
    return document.getElementById(id);
  }

  // Módulos canónicos partilhados com a linha de entrega (moduleTags). A
  // pagina de requisitos passa a usar moduleTags como fonte única, em vez do
  // antigo campo único req.module, para manter tudo coerente.
  const MODULE_PRIORITY = ['Database', 'Backend', 'Frontend'];
  function moduleTagsOf(req) {
    const tags = Array.isArray(req?.moduleTags) ? req.moduleTags.filter(Boolean) : [];
    if (tags.length) return tags;
    const m = normalizeModuleName(req?.module);
    return m ? [m] : [];
  }
  function primaryModuleOf(req) {
    const tags = moduleTagsOf(req);
    if (!tags.length) return 'Outro';
    return MODULE_PRIORITY.find((m) => tags.includes(m)) || tags[0];
  }

  function collectPhases(project) {
    if (window.PhaseSync?.planPhaseNames) return window.PhaseSync.planPhaseNames(project);
    const phases = Array.isArray(project?.phases) ? project.phases : [];
    const names = phases.map((p) => String(p?.name || '').trim()).filter(Boolean);
    return names.length ? names : ['Backlog'];
  }

  function effectiveReqPhase(req, project) {
    if (window.PhaseSync?.effectiveRequirementPhase) {
      return window.PhaseSync.effectiveRequirementPhase(req, project);
    }
    return String(req?.phase || 'Backlog').trim() || 'Backlog';
  }

  function phaseOrderMap(project) {
    const map = new Map();
    collectPhases(project).forEach((name, index) => map.set(normalizeForCompare(name), index));
    return map;
  }

  function sortPhaseNames(names, project) {
    const order = phaseOrderMap(project);
    return [...names].sort((a, b) => {
      const ai = order.get(normalizeForCompare(a));
      const bi = order.get(normalizeForCompare(b));
      if (ai !== undefined && bi !== undefined) return ai - bi;
      if (ai !== undefined) return -1;
      if (bi !== undefined) return 1;
      return a.localeCompare(b, 'pt');
    });
  }

  function buildPhaseSelectHtml(project, currentValue, { id = '', includeCustom = false } = {}) {
    const phases = collectPhases(project);
    const resolved = window.PhaseSync?.resolveRequirementPhase?.(
      { phase: currentValue },
      project?.phases
    );
    const current = String(resolved || currentValue || phases[0] || 'Backlog').trim() || 'Backlog';
    const hasCurrent = phases.some((p) => normalizeForCompare(p) === normalizeForCompare(current));
    const idAttr = id ? ` id="${escapeHtml(id)}"` : '';
    let html = `<select${idAttr} class="req-phase-select">`;
    for (const phase of phases) {
      html += `<option value="${escapeHtml(phase)}" ${normalizeForCompare(phase) === normalizeForCompare(current) ? 'selected' : ''}>${escapeHtml(phase)}</option>`;
    }
    if (includeCustom && !hasCurrent && current) {
      html += `<option value="${escapeHtml(current)}" selected>${escapeHtml(current)} (actual)</option>`;
    }
    if (includeCustom) {
      html += `<option value="__custom__" ${!hasCurrent && current ? '' : ''}>Outra fase…</option>`;
    }
    html += '</select>';
    return html;
  }

  function readPhaseSelectValue(selectEl) {
    if (!selectEl) return 'Backlog';
    if (selectEl.value === '__custom__') {
      const custom = selectEl.parentElement?.querySelector('.req-phase-custom');
      return String(custom?.value || '').trim() || 'Backlog';
    }
    return selectEl.value || 'Backlog';
  }

  function wirePhaseSelect(selectEl) {
    if (!selectEl || selectEl.dataset.phaseSelectWired) return;
    selectEl.dataset.phaseSelectWired = '1';
    const syncCustom = () => {
      let custom = selectEl.parentElement?.querySelector('.req-phase-custom');
      if (selectEl.value === '__custom__') {
        if (!custom) {
          custom = document.createElement('input');
          custom.type = 'text';
          custom.className = 'req-phase-custom';
          custom.placeholder = 'Nome da fase';
          selectEl.insertAdjacentElement('afterend', custom);
          custom.addEventListener('input', () => selectEl.dispatchEvent(new Event('change', { bubbles: true })));
        }
        custom.classList.remove('hidden');
      } else if (custom) {
        custom.classList.add('hidden');
      }
    };
    selectEl.addEventListener('change', syncCustom);
    syncCustom();
  }

  function groupRequirements(items, project) {
    const tree = new Map();
    for (const req of items) {
      const mod = primaryModuleOf(req);
      const phase = effectiveReqPhase(req, project);
      if (!tree.has(mod)) tree.set(mod, new Map());
      const phases = tree.get(mod);
      if (!phases.has(phase)) phases.set(phase, []);
      phases.get(phase).push(req);
    }
    const modules = [...tree.keys()].sort((a, b) => a.localeCompare(b, 'pt'));
    return modules.map((mod) => ({
      module: mod,
      phases: sortPhaseNames([...tree.get(mod).keys()], project).map((phase) => ({
        phase,
        requirements: tree.get(mod).get(phase),
      })),
    }));
  }

  function getFilteredForUi(project) {
    const items = Array.isArray(project?.requirements) ? project.requirements : [];
    let filtered = getFilteredRequirements(items);

    const phaseFilter = String(state.filters.phase || '').trim();
    if (phaseFilter) {
      filtered = filtered.filter((r) => effectiveReqPhase(r, project) === phaseFilter);
    }

    const priorityFilter = String(state.filters.priority || '').trim();
    if (priorityFilter) {
      filtered = filtered.filter((r) => (r.priority || 'medium') === priorityFilter);
    }

    const stageFilter = String(state.tabFilters?.deliveryStageId || '').trim();
    if (stageFilter && state.activeTab === 'requisitos') {
      const resolve = window.PhaseContent?.resolveRequirementStageId || ((r) => r.deliveryStageId || 'requirements');
      filtered = filtered.filter((r) => resolve(r) === stageFilter);
    }

    return filtered;
  }

  function renderFilterBanner() {
    const el = $('reqTabFilterBanner');
    if (!el) return;
    const parts = [];
    const stageId = state.tabFilters?.deliveryStageId;
    if (stageId && state.activeTab === 'requisitos') {
      parts.push(stageLabel(stageId));
    }
    if (state.filters.module) parts.push(state.filters.module);
    if (state.filters.phase) parts.push(state.filters.phase);
    if (!parts.length) {
      el.classList.add('hidden');
      el.innerHTML = '';
      return;
    }
    el.classList.remove('hidden');
    el.innerHTML = `
      <div class="phase-context-strip is-compact">
        <div class="phase-context-strip-left">
          <span class="phase-context-tag">filtro</span>
          <span class="phase-context-pill is-small">${escapeHtml(parts.join(' · '))}</span>
        </div>
        <button type="button" class="phase-context-go is-ghost" id="reqClearTabFilters">Limpar</button>
      </div>
    `;
    el.querySelector('#reqClearTabFilters')?.addEventListener('click', () => {
      state.tabFilters = state.tabFilters || {};
      state.tabFilters.deliveryStageId = '';
      state.filters.phase = '';
      if (!state.tabFilters.keepModule) state.filters.module = '';
      state.tabFilters.keepModule = false;
      renderRequirements(state.selectedProject);
    });
  }

  function stkRootForReq(req, project) {
    if (!req || req.type === 'stakeholder') return '';
    if (req.stakeholderRequirementLink) return req.stakeholderRequirementLink;
    const reqs = project?.requirements || [];
    if (req.parentId) {
      const parent = reqs.find((r) => r.id === req.parentId);
      if (parent?.type === 'stakeholder') return parent.id;
    }
    if (req.type === 'test_case' && req.linkedFunctionalRequirement) {
      const fr = reqs.find((r) => r.id === req.linkedFunctionalRequirement);
      if (fr?.stakeholderRequirementLink) return fr.stakeholderRequirementLink;
    }
    return '';
  }

  function syncReqViewTabs() {
    const mode = reqUiState.groupMode || 'module';
    document.querySelectorAll('#reqViewSwitcher .req-view-btn').forEach((btn) => {
      const active = btn.dataset.reqView === mode;
      btn.classList.toggle('is-active', active);
      btn.setAttribute('aria-selected', active ? 'true' : 'false');
    });
  }

  function renderGroupedRequirements(project) {
    const container = $('requirementsGroupedView');
    const legacyTable = $('requirementsTable')?.closest('.requirements-list-col');
    if (!container) return;

    renderFilterBanner();
    reqUiState.groupingIndex = buildGroupingIndex(project);
    const groupBySel = $('reqGroupBy');
    if (groupBySel) groupBySel.value = reqUiState.groupMode;
    syncReqViewTabs();
    const filtered = getFilteredForUi(project);
    const listChunk = window.state?.listLimits?.requirements || 50;
    const displayFiltered = filtered.length > listChunk ? filtered.slice(0, listChunk) : filtered;
    const hasMoreReqs = filtered.length > displayFiltered.length;

    if (reqUiState.groupMode === 'vmap' || reqUiState.groupMode === 'implmap') {
      if (legacyTable) legacyTable.classList.add('hidden');
      $('requirementDetailPanel')?.classList.add('hidden');
      if (window.RequirementsMapUI?.renderRequirementsMap) {
        window.RequirementsMapUI.renderRequirementsMap(project, reqUiState.groupMode);
      } else {
        container.innerHTML = '<p class="muted-text">Mapa indisponível.</p>';
      }
      return;
    }

    container.classList.remove('req-map-container');

    renderBatchToolbar(project, filtered);

    if (legacyTable) legacyTable.classList.add('hidden');
    $('requirementDetailPanel')?.classList.add('hidden');

    if (!displayFiltered.length) {
      const total = (project.requirements || []).length;
      container.innerHTML = `<p class="muted-text">${total ? 'Nenhum requisito corresponde ao filtro.' : 'Sem requisitos ainda.'}</p>`;
      updateMeta(project, filtered);
      return;
    }

    const grouped = reqUiState.groupMode === 'capability'
      ? groupRequirementsByCapability(displayFiltered)
      : groupRequirements(displayFiltered, project);

    container.innerHTML = grouped.map(({ module, phases }) => {
      const modCollapsed = reqUiState.collapsedModules.has(module);
      const modCount = phases.reduce((n, p) => n + p.requirements.length, 0);
      return `
        <details class="req-module-group" data-module="${escapeHtml(module)}" ${modCollapsed ? '' : 'open'}>
          <summary class="req-module-summary">
            <span class="req-module-name">${escapeHtml(module)}</span>
            <span class="req-count-badge">${modCount}</span>
          </summary>
          <div class="req-module-body">
            ${phases.map(({ phase, requirements }) => {
              const phaseKey = `${module}::${phase}`;
              const phaseCollapsed = reqUiState.collapsedPhases.has(phaseKey);
              return `
                <details class="req-phase-group" data-phase-key="${escapeHtml(phaseKey)}" ${phaseCollapsed ? '' : 'open'}>
                  <summary class="req-phase-summary">
                    <span>${escapeHtml(phase)}</span>
                    <span class="req-count-badge">${requirements.length}</span>
                    ${canEdit() && reqUiState.groupMode === 'module' ? `
                      <button type="button" class="btn tiny ghost req-phase-move-all" data-move-phase-all="${escapeHtml(phase)}" title="Mover todos desta fase">Mover fase</button>
                    ` : ''}
                  </summary>
                  <div class="req-phase-dropzone" data-module="${escapeHtml(module)}" data-phase="${escapeHtml(phase)}">
                    ${requirements.map((req) => renderReqCard(req, project)).join('')}
                  </div>
                </details>
              `;
            }).join('')}
          </div>
        </details>
      `;
    }).join('');

    if (hasMoreReqs) {
      container.innerHTML += `
        <div class="list-chunk-actions">
          <button type="button" class="btn tiny ghost" data-req-load-more>
            Mostrar mais (${filtered.length - displayFiltered.length})
          </button>
        </div>`;
      container.querySelector('[data-req-load-more]')?.addEventListener('click', () => {
        if (window.state?.listLimits) window.state.listLimits.requirements += 50;
        renderGroupedRequirements(project);
      });
    }

    wireGroupedEvents(project);
    wireBatchToolbarEvents(project, filtered);
    updateMeta(project, filtered);
    populatePhaseFilter(project);
    populateAddRequirementPhase(project);
  }

  function renderReqCard(req, project) {
    const summary = shortText(req.shall || req.need || req.description || req.title, 100);
    const status = escapeHtml(req.status || 'draft');
    const priority = escapeHtml(req.priority || 'medium');
    const locked = !canEdit();
    const draggable = !locked && !['capability', 'vmap', 'implmap'].includes(reqUiState.groupMode);
    const diagramCount = window.DiagramsUI?.diagramsForRequirement?.(project, req.id)?.length
      || (req.linkedDiagramIds || []).length
      || 0;
    const grp = reqUiState.groupingIndex?.get(String(req.id));
    let capBadge = '';
    if (grp && grp.capabilityName) {
      const label = grp.clusterName ? `${grp.capabilityName} · ${grp.clusterName}` : grp.capabilityName;
      capBadge = `<span class="req-card-cap" title="Funcionalidade · grupo (agrupamento com IA)">${escapeHtml(label)}</span>`;
    }
    const modTags = moduleTagsOf(req);
    const modBadges = modTags.length
      ? `<span class="req-card-modules">${modTags.map((t) => `<span class="req-mod-badge">${escapeHtml(t)}</span>`).join('')}</span>`
      : '';
    const stkRoot = stkRootForReq(req, project);
    const stkBadge = stkRoot
      ? `<span class="req-card-stk" title="Stakeholder raiz (V-cycle)">↑ ${escapeHtml(stkRoot)}</span>`
      : (req.type !== 'stakeholder' && req.type !== 'out_of_scope'
        ? '<span class="req-card-stk is-missing" title="Sem stakeholder ligado">Sem STK</span>'
        : '');
    const showSelect = canEdit() && reqUiState.groupMode === 'module';
    const checked = reqUiState.selectedReqIds.has(req.id);
    const chrome = (showSelect || draggable)
      ? `<div class="req-card-controls">
          ${showSelect ? `<input type="checkbox" class="req-select-cb" data-select-req="${escapeHtml(req.id)}" aria-label="Seleccionar ${escapeHtml(req.id)}" ${checked ? 'checked' : ''} />` : ''}
          ${draggable ? '<span class="req-drag-handle" title="Arrastar para outro módulo/fase" aria-hidden="true">⠿</span>' : ''}
        </div>`
      : '';
    return `
      <article class="req-card ${locked ? 'req-card-locked' : ''} ${checked ? 'req-card-selected' : ''}" draggable="${draggable ? 'true' : 'false'}" data-req-id="${escapeHtml(req.id)}">
        ${chrome}
        <button type="button" class="req-card-main" data-open-req="${escapeHtml(req.id)}">
          <span class="req-card-id">${escapeHtml(req.id)}</span>
          <span class="req-card-type">${escapeHtml(req.type)}</span>
          <strong class="req-card-title">${escapeHtml(req.title || summary)}</strong>
          ${modBadges}
          ${stkBadge}
          ${capBadge}
          <small class="req-card-meta">${status} · ${priority}${diagramCount ? ` · <span class="req-diagram-badge" title="${diagramCount} diagrama(s) ligado(s)">${diagramCount} diag</span>` : ''}</small>
        </button>
      </article>
    `;
  }

  function updateMeta(project, filtered) {
    const el = $('requirementsMeta');
    if (!el) return;
    const items = project.requirements || [];
    const functional = items.filter((e) => e.type === 'functional');
    const smartMissing = functional.filter((e) => !e.smartIsValid).length;
    const moduleCount = new Set(items.map((e) => normalizeModuleName(e.module))).size;
    el.textContent = `${filtered.length} requisitos no filtro (${items.length} totais) · ${moduleCount} módulos · Lacunas SMART: ${smartMissing}`;
  }

  function renderBatchToolbar(project, filtered) {
    const bar = $('reqBatchBar');
    if (!bar) return;
    const canBatch = canEdit() && reqUiState.groupMode === 'module';
    if (!canBatch) {
      bar.classList.add('hidden');
      bar.innerHTML = '';
      return;
    }
    const count = reqUiState.selectedReqIds.size;
    bar.classList.remove('hidden');
    bar.innerHTML = `
      <div class="req-batch-inner">
        <span class="req-batch-count"><strong>${count}</strong> seleccionado(s)</span>
        <div class="req-batch-field">
          <span class="req-batch-label">Fase</span>
          ${buildPhaseSelectHtml(project, collectPhases(project)[0] || 'Backlog', { id: 'reqBatchPhase' })}
        </div>
        <div class="req-batch-field">
          <span class="req-batch-label">Módulo</span>
          <select id="reqBatchModule">
            <option value="">— manter —</option>
            <option value="Frontend">Frontend</option>
            <option value="Backend">Backend</option>
            <option value="Database">Database</option>
          </select>
        </div>
        <div class="req-batch-actions">
          <button type="button" class="btn small" id="reqBatchApply" ${count ? '' : 'disabled'}>Aplicar a seleccionados</button>
          <button type="button" class="btn small ghost" id="reqBatchSelectVisible">Seleccionar visíveis (${filtered.length})</button>
          <button type="button" class="btn small ghost" id="reqBatchClear" ${count ? '' : 'disabled'}>Limpar</button>
        </div>
      </div>
    `;
    wirePhaseSelect($('reqBatchPhase'));
  }

  function updateBatchToolbarState() {
    const count = reqUiState.selectedReqIds.size;
    const applyBtn = $('reqBatchApply');
    const clearBtn = $('reqBatchClear');
    const countEl = document.querySelector('.req-batch-count strong');
    if (countEl) countEl.textContent = String(count);
    if (applyBtn) applyBtn.disabled = !count;
    if (clearBtn) clearBtn.disabled = !count;
    document.querySelectorAll('.req-card').forEach((card) => {
      const id = card.dataset.reqId;
      card.classList.toggle('req-card-selected', reqUiState.selectedReqIds.has(id));
      const cb = card.querySelector('.req-select-cb');
      if (cb) cb.checked = reqUiState.selectedReqIds.has(id);
    });
  }

  function populatePhaseFilter(project) {
    const sel = $('reqFilterPhase');
    if (!sel) return;
    const current = state.filters.phase || '';
    const phases = collectPhases(project);
    sel.innerHTML = `<option value="">Todas as fases</option>${phases.map((p) =>
      `<option value="${escapeHtml(p)}" ${p === current ? 'selected' : ''}>${escapeHtml(p)}</option>`
    ).join('')}`;
  }

  function populateAddRequirementPhase(project) {
    const wrap = $('reqPhaseWrap');
    if (!wrap || !project) return;
    const current = collectPhases(project)[0] || 'Backlog';
    wrap.innerHTML = buildPhaseSelectHtml(project, current, { id: 'reqPhase' });
    wirePhaseSelect($('reqPhase'));
  }

  async function batchUpdateRequirements(project, requirementIds, changes) {
    const ids = [...new Set(requirementIds)].filter(Boolean);
    if (!ids.length) return;
    const res = await apiRequest(
      `/projects/${encodeURIComponent(project.id)}/requirements/batch`,
      { method: 'PATCH', body: { requirementIds: ids, changes } }
    );
    state.selectedProject = res.project;
    reqUiState.selectedReqIds.clear();
    renderGroupedRequirements(state.selectedProject);
    if (typeof renderImplementationPlan === 'function') renderImplementationPlan(state.selectedProject);
    showToast(`${res.updated || ids.length} requisito(s) actualizado(s).`, 'ok');
  }

  function wireBatchToolbarEvents(project, filtered) {
    $('reqBatchApply')?.addEventListener('click', async () => {
      const ids = [...reqUiState.selectedReqIds];
      if (!ids.length) return;
      const phase = readPhaseSelectValue($('reqBatchPhase'));
      const module = $('reqBatchModule')?.value || '';
      const changes = { phase };
      if (module) {
        changes.module = module;
        changes.moduleTags = [module];
      }
      try {
        await batchUpdateRequirements(project, ids, changes);
      } catch (error) {
        showToast(error.message || 'Erro na actualização em lote.', 'error');
      }
    });
    $('reqBatchSelectVisible')?.addEventListener('click', () => {
      filtered.forEach((r) => reqUiState.selectedReqIds.add(r.id));
      updateBatchToolbarState();
    });
    $('reqBatchClear')?.addEventListener('click', () => {
      reqUiState.selectedReqIds.clear();
      updateBatchToolbarState();
    });
  }

  function wireGroupedEvents(project) {
    const container = $('requirementsGroupedView');
    if (!container) return;

    container.querySelectorAll('.req-module-group').forEach((node) => {
      node.addEventListener('toggle', () => {
        const mod = node.dataset.module;
        if (node.open) reqUiState.collapsedModules.delete(mod);
        else reqUiState.collapsedModules.add(mod);
      });
    });

    container.querySelectorAll('.req-phase-group').forEach((node) => {
      node.addEventListener('toggle', () => {
        const key = node.dataset.phaseKey;
        if (node.open) reqUiState.collapsedPhases.delete(key);
        else reqUiState.collapsedPhases.add(key);
      });
    });

    container.querySelectorAll('[data-open-req]').forEach((btn) => {
      btn.addEventListener('click', (e) => {
        e.preventDefault();
        openRequirementModal(btn.dataset.openReq, project);
      });
    });

    container.querySelectorAll('.req-select-cb').forEach((cb) => {
      cb.addEventListener('click', (e) => e.stopPropagation());
      cb.addEventListener('change', () => {
        const id = cb.dataset.selectReq;
        if (cb.checked) reqUiState.selectedReqIds.add(id);
        else reqUiState.selectedReqIds.delete(id);
        updateBatchToolbarState();
      });
    });

    container.querySelectorAll('.req-phase-move-all').forEach((btn) => {
      btn.addEventListener('click', (e) => {
        e.preventDefault();
        e.stopPropagation();
        const fromPhase = btn.dataset.movePhaseAll || '';
        reqUiState.selectedReqIds.clear();
        (project.requirements || []).forEach((r) => {
          const phase = String(r.phase || 'Backlog').trim() || 'Backlog';
          if (phase === fromPhase) reqUiState.selectedReqIds.add(r.id);
        });
        renderBatchToolbar(project, getFilteredForUi(project));
        wireBatchToolbarEvents(project, getFilteredForUi(project));
        updateBatchToolbarState();
        $('reqBatchBar')?.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
        showToast(`${reqUiState.selectedReqIds.size} requisito(s) de «${fromPhase}» seleccionados. Escolha destino e aplique.`, 'ok');
      });
    });

    // Em modo "por funcionalidade" o arrastar (que reatribui módulo/fase) não se
    // aplica — a associação vem do agrupamento, não da posição.
    if (!canEdit() || reqUiState.groupMode === 'capability') return;

    container.querySelectorAll('.req-card[draggable="true"]').forEach((card) => {
      card.addEventListener('dragstart', (e) => {
        reqUiState.dragReqId = card.dataset.reqId;
        card.classList.add('req-dragging');
        e.dataTransfer.effectAllowed = 'move';
        e.dataTransfer.setData('text/plain', card.dataset.reqId);
      });
      card.addEventListener('dragend', () => {
        card.classList.remove('req-dragging');
        reqUiState.dragReqId = null;
        container.querySelectorAll('.req-phase-dropzone').forEach((z) => z.classList.remove('req-drop-target'));
      });
    });

    container.querySelectorAll('.req-phase-dropzone').forEach((zone) => {
      zone.addEventListener('dragover', (e) => {
        e.preventDefault();
        zone.classList.add('req-drop-target');
      });
      zone.addEventListener('dragleave', () => zone.classList.remove('req-drop-target'));
      zone.addEventListener('drop', (e) => {
        e.preventDefault();
        zone.classList.remove('req-drop-target');
        const reqId = e.dataTransfer.getData('text/plain') || reqUiState.dragReqId;
        if (!reqId) return;
        moveRequirement(reqId, zone.dataset.module, zone.dataset.phase, project);
      });
    });
  }

  async function moveRequirement(reqId, newModule, newPhase, project) {
    const req = (project.requirements || []).find((r) => r.id === reqId);
    if (!req) return;
    const backup = { module: req.module, phase: req.phase, moduleTags: req.moduleTags };
    if (primaryModuleOf(req) === newModule && (backup.phase || 'Backlog') === newPhase) return;

    // Mover entre módulos reescreve moduleTags (fonte única partilhada com a
    // linha de entrega), mantendo as duas vistas coerentes.
    req.module = newModule;
    req.moduleTags = [newModule];
    req.phase = newPhase;
    renderGroupedRequirements(project);

    try {
      const res = await apiRequest(
        `/projects/${encodeURIComponent(project.id)}/requirements/${encodeURIComponent(reqId)}`,
        { method: 'PATCH', body: { module: newModule, phase: newPhase, moduleTags: [newModule] } }
      );
      state.selectedProject = res.project;
      renderGroupedRequirements(state.selectedProject);
      if (typeof renderImplementationPlan === 'function') renderImplementationPlan(state.selectedProject);
      showToast('Requisito movido com sucesso.', 'ok');
    } catch (error) {
      req.module = backup.module;
      req.phase = backup.phase;
      req.moduleTags = backup.moduleTags;
      renderGroupedRequirements(project);
      showToast(error.message || 'Erro ao mover requisito.', 'error');
    }
  }

  function helperLabel(text, helpKey) {
    const help = FIELD_HELP[helpKey] || '';
    return `<span class="field-label">${escapeHtml(text)}${help ? `<small class="field-help">${escapeHtml(help)}</small>` : ''}</span>`;
  }

  function openRequirementModal(reqId, project) {
    const modal = $('requirementEditModal');
    const req = (project?.requirements || []).find((r) => r.id === reqId);
    if (!modal || !req) return;

    reqUiState.modalReqId = reqId;
    reqUiState.modalDirty = false;
    state.selectedRequirementId = reqId;

    $('reqModalDirty')?.classList.add('hidden');
    $('reqModalTitle').textContent = `${req.id} — Editar requisito`;

    const readonly = !canEdit();
    const parts = parseReqIdParts(req.id);
    const canRenumberId = !readonly && RENUMBERABLE_TYPES.has(req.type) && parts;
    const idField = canRenumberId
      ? `<label>${helperLabel('ID', 'id')}
          <span class="req-id-inline">
            <span class="req-id-prefix">${escapeHtml(parts.fullPrefix)}</span>
            <input id="modalReqSerial" type="number" min="1" class="req-modal-serial-input"
              data-renumber-req="${escapeHtml(req.id)}" value="${parts.serial}" />
          </span>
        </label>`
      : `<label>${helperLabel('ID', 'id')}<input id="modalReqId" readonly value="${escapeHtml(req.id)}" /></label>`;

    const form = $('requirementModalForm');
    form.innerHTML = `
      ${idField}
      <label>${helperLabel('Tipo', 'type')}<input id="modalReqType" readonly value="${escapeHtml(req.type)}" /></label>
      <label>${helperLabel('Status', 'status')}<select id="modalReqStatus">${statusOptions()}</select></label>
      <label>${helperLabel('Prioridade', 'priority')}
        <select id="modalReqPriority">
          <option value="high">Alta</option><option value="medium">Média</option><option value="low">Baixa</option>
        </select>
      </label>
      <label>${helperLabel('Módulo', 'module')}
        <select id="modalReqModule">
          <option value="Frontend">Frontend</option><option value="Backend">Backend</option><option value="Database">Database</option>
        </select>
      </label>
      <label>${helperLabel('Fase de implementação', 'phase')}
        <span class="req-phase-field">${buildPhaseSelectHtml(project, req.phase || 'Backlog', { id: 'modalReqPhase' })}</span>
      </label>
      <label>${helperLabel('Submódulo', 'submodule')}<input id="modalReqSubmodule" list="submoduleSuggestions" /></label>
      <label class="full">${helperLabel('Título', 'title')}<input id="modalReqTitle" /></label>
      <label class="full">${helperLabel('Need', 'need')}<textarea id="modalReqNeed" rows="2"></textarea></label>
      <label class="full">${helperLabel('Shall / Descrição', 'shall')}<textarea id="modalReqShall" rows="3"></textarea></label>
      <label class="full">${helperLabel('Critérios de aceitação (Measure)', 'measure')}<textarea id="modalReqMeasure" rows="2"></textarea></label>
      <label class="full">${helperLabel('Dependências / IDs relacionados', 'related')}<textarea id="modalReqRelatedIds" rows="2"></textarea></label>
      <label class="full">${helperLabel('Notas', 'notes')}<textarea id="modalReqNotes" rows="2"></textarea></label>
      ${window.DiagramsUI?.renderRequirementDiagramLinks?.(project, reqId) || ''}
    `;

    $('modalReqStatus').value = req.status || 'draft';
    $('modalReqPriority').value = req.priority || 'medium';
    $('modalReqModule').value = normalizeModuleName(req.module);
    wirePhaseSelect($('modalReqPhase'));
    $('modalReqSubmodule').value = normalizeSubmoduleName(req.submodule);
    $('modalReqTitle').value = req.title || '';
    $('modalReqNeed').value = req.need || '';
    $('modalReqShall').value = req.shall || req.description || '';
    $('modalReqMeasure').value = req.measure || '';
    $('modalReqRelatedIds').value = joinRequirementIds(req.relatedRequirementIds);
    $('modalReqNotes').value = req.notes || '';

    form.querySelectorAll('input, textarea, select').forEach((node) => {
      if (node.id === 'modalReqId' || node.id === 'modalReqType') return;
      node.disabled = readonly;
      if (node.id === 'modalReqSerial') return;
      node.addEventListener('input', markModalDirty);
      node.addEventListener('change', markModalDirty);
    });
    wireModalRenumberInput(form, project);
    $('reqModalSave').disabled = readonly;
    $('reqModalDelete').classList.toggle('hidden', readonly);

    modal.classList.remove('hidden');
  }

  function markModalDirty() {
    reqUiState.modalDirty = true;
    $('reqModalDirty')?.classList.remove('hidden');
  }

  function closeRequirementModal() {
    if (reqUiState.modalDirty && !confirm('Existem alterações não guardadas. Fechar mesmo assim?')) return;
    $('requirementEditModal')?.classList.add('hidden');
    reqUiState.modalDirty = false;
    reqUiState.modalReqId = null;
  }

  async function saveRequirementModal() {
    const project = state.selectedProject;
    const reqId = reqUiState.modalReqId;
    if (!project || !reqId) return;

    const req = (project.requirements || []).find((r) => r.id === reqId);
    const newModule = $('modalReqModule')?.value;
    const body = {
      status: $('modalReqStatus')?.value,
      priority: $('modalReqPriority')?.value,
      module: newModule,
      phase: readPhaseSelectValue($('modalReqPhase')),
      submodule: $('modalReqSubmodule')?.value,
      title: $('modalReqTitle')?.value,
      need: $('modalReqNeed')?.value,
      shall: $('modalReqShall')?.value,
      measure: $('modalReqMeasure')?.value,
      relatedRequirementIds: splitRequirementIds($('modalReqRelatedIds')?.value),
      notes: $('modalReqNotes')?.value,
    };

    // Só reescreve moduleTags quando o módulo é alterado manualmente, para não
    // apagar a classificação multi-módulo vinda do agrupamento.
    if (req && normalizeModuleName(req.module) !== normalizeModuleName(newModule)) {
      body.moduleTags = [newModule];
    }

    if (!String(body.title || '').trim()) {
      showToast('O título é obrigatório.', 'error');
      return;
    }

    try {
      const res = await apiRequest(
        `/projects/${encodeURIComponent(project.id)}/requirements/${encodeURIComponent(reqId)}`,
        { method: 'PATCH', body }
      );
      state.selectedProject = res.project;
      reqUiState.modalDirty = false;
      $('reqModalDirty')?.classList.add('hidden');
      closeRequirementModal();
      renderGroupedRequirements(state.selectedProject);
      if (typeof renderImplementationPlan === 'function') renderImplementationPlan(state.selectedProject);
      showToast('Requisito guardado.', 'ok');
    } catch (error) {
      showToast(error.message, 'error');
    }
  }

  async function deleteRequirementModal() {
    const project = state.selectedProject;
    const reqId = reqUiState.modalReqId;
    if (!project || !reqId || !confirm('Apagar este requisito? Esta acção não pode ser desfeita.')) return;
    try {
      const res = await apiRequest(
        `/projects/${encodeURIComponent(project.id)}/requirements/${encodeURIComponent(reqId)}`,
        { method: 'DELETE' }
      );
      state.selectedProject = res.project;
      reqUiState.modalDirty = false;
      reqUiState.modalReqId = null;
      $('requirementEditModal')?.classList.add('hidden');
      renderGroupedRequirements(state.selectedProject);
      if (typeof renderImplementationPlan === 'function') renderImplementationPlan(state.selectedProject);
      showToast('Requisito apagado.', 'ok');
    } catch (error) {
      showToast(error.message, 'error');
    }
  }

  function exportRequirementsMarkdown(project) {
    const grouped = groupRequirements(project.requirements || [], project);
    let md = '# Requisitos do Projeto\n\n';
    for (const { module, phases } of grouped) {
      md += `## ${module}\n\n`;
      for (const { phase, requirements } of phases) {
        md += `### ${phase}\n\n`;
        for (const req of requirements) {
          md += `#### ${req.id} — ${req.title || 'Sem título'}\n\n`;
          md += `- **Tipo:** ${req.type || 'n/d'}\n`;
          md += `- **Status:** ${req.status || 'draft'}\n`;
          md += `- **Prioridade:** ${req.priority || 'medium'}\n`;
          md += `- **Módulo:** ${formatModuleLabel(req)}\n`;
          if (req.shall || req.description) md += `- **Descrição:** ${req.shall || req.description}\n`;
          if (req.measure) md += `- **Critérios de aceitação:** ${req.measure}\n`;
          if (req.notes) md += `- **Notas:** ${req.notes}\n`;
          md += '\n';
        }
      }
    }
    return md;
  }

  function exportRequirementsJson(project) {
    const grouped = groupRequirements(project.requirements || [], project);
    return {
      modules: grouped.map(({ module, phases }) => ({
        name: module,
        phases: phases.map(({ phase, requirements }) => ({
          name: phase,
          requirements: requirements.map((r) => ({ ...r })),
        })),
      })),
    };
  }

  function downloadText(content, filename, mime) {
    const blob = new Blob([content], { type: mime });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    a.click();
    URL.revokeObjectURL(url);
  }

  function handleExport(format) {
    const project = state.selectedProject;
    if (!project) return;
    const slug = (project.name || 'projecto').replace(/\s+/g, '_').slice(0, 40);
    if (format === 'md') {
      downloadText(exportRequirementsMarkdown(project), `${slug}_requisitos.md`, 'text/markdown');
    } else {
      downloadText(JSON.stringify(exportRequirementsJson(project), null, 2), `${slug}_requisitos.json`, 'application/json');
    }
    showToast(`Exportação ${format.toUpperCase()} concluída.`, 'ok');
  }

  async function fetchDocumentContent(doc, project) {
    if (doc.contentMarkdown || doc.extractedText) return doc;
    if (!doc.hasContent && !doc.hasExtractedText) return doc;
    const res = await apiRequest(
      `/projects/${encodeURIComponent(project.id)}/documents/${encodeURIComponent(doc.id)}`
    );
    const full = res.document || doc;
    const list = Array.isArray(project.documents) ? project.documents : [];
    const idx = list.findIndex((d) => d.id === doc.id);
    if (idx >= 0) {
      list[idx] = { ...list[idx], ...full };
    }
    return full;
  }

  async function openDocumentViewer(doc, project) {
    const modal = $('documentViewerModal');
    const body = $('documentViewerBody');
    const title = $('documentViewerTitle');
    if (!modal || !body) return;

    body.innerHTML = '<p class="muted-text">A carregar documento…</p>';
    modal.classList.remove('hidden');

    let fullDoc = doc;
    try {
      fullDoc = await fetchDocumentContent(doc, project);
    } catch (err) {
      body.innerHTML = `<p class="muted-text">Erro ao carregar: ${escapeHtml(err.message)}</p>`;
      return;
    }

    const name = fullDoc.title || fullDoc.originalName || 'Documento';
    title.textContent = name;
    const content = fullDoc.contentMarkdown || fullDoc.extractedText || '';
    const format = fullDoc.diagramFormat || (fullDoc.docType === 'diagram' ? 'mermaid' : '');

    if (format === 'mermaid' && content) {
      try {
        await window.ensureMermaidLoaded?.();
      } catch {
        body.innerHTML = `<pre class="minute-raw">${escapeHtml(content)}</pre>`;
        return;
      }
    }

    if (format === 'mermaid' && content && window.mermaid) {
      body.innerHTML = `<div class="doc-mermaid-wrap" id="docMermaidPreview"></div><pre class="minute-raw doc-source-copy">${escapeHtml(content)}</pre>`;
      const wrap = $('docMermaidPreview');
      const id = `doc_mmd_${Date.now()}`;
      window.mermaid.render(id, content).then(({ svg }) => {
        wrap.innerHTML = svg;
      }).catch(() => {
        wrap.innerHTML = `<p class="muted-text">Pré-visualização indisponível. Copie o código Mermaid abaixo.</p>`;
      });
    } else if (format === 'json' || fullDoc.contentType?.includes('json')) {
      try {
        body.innerHTML = `<pre class="minute-raw">${escapeHtml(JSON.stringify(JSON.parse(content), null, 2))}</pre>`;
      } catch {
        body.innerHTML = `<pre class="minute-raw">${escapeHtml(content)}</pre>`;
      }
    } else if (content) {
      body.innerHTML = `<pre class="minute-raw">${escapeHtml(content)}</pre>`;
    } else {
      body.innerHTML = `<p class="muted-text">Sem conteúdo inline. <a href="/api/projects/projects/${encodeURIComponent(project.id)}/documents/${encodeURIComponent(fullDoc.id)}/download" target="_blank" rel="noopener">Descarregar ficheiro</a></p>`;
    }

    $('documentViewerCopy')?.replaceWith($('documentViewerCopy').cloneNode(true));
    $('documentViewerCopy')?.addEventListener('click', () => {
      navigator.clipboard?.writeText(content).then(() => showToast('Copiado.', 'ok'));
    });

    modal.classList.remove('hidden');
  }

  function initRequirementsUi() {
    syncReqViewTabs();
    $('reqExportMd')?.addEventListener('click', () => handleExport('md'));
    $('reqExportJson')?.addEventListener('click', () => handleExport('json'));
    $('reqModalClose')?.addEventListener('click', closeRequirementModal);
    $('reqModalCancel')?.addEventListener('click', closeRequirementModal);
    $('reqModalSave')?.addEventListener('click', saveRequirementModal);
    $('reqModalDelete')?.addEventListener('click', deleteRequirementModal);
    $('documentViewerClose')?.addEventListener('click', () => $('documentViewerModal')?.classList.add('hidden'));
    $('reqFilterPhase')?.addEventListener('change', (e) => {
      state.filters.phase = e.target.value;
      if (state.selectedProject) renderGroupedRequirements(state.selectedProject);
    });
    $('reqFilterPriority')?.addEventListener('change', (e) => {
      state.filters.priority = e.target.value;
      if (state.selectedProject) renderGroupedRequirements(state.selectedProject);
    });
    $('reqGroupBy')?.addEventListener('change', (e) => {
      reqUiState.groupMode = e.target.value || 'module';
      reqUiState.selectedReqIds.clear();
      syncReqViewTabs();
      if (state.selectedProject) renderGroupedRequirements(state.selectedProject);
    });
    $('reqViewSwitcher')?.addEventListener('click', (e) => {
      const btn = e.target.closest('[data-req-view]');
      if (!btn) return;
      reqUiState.groupMode = btn.dataset.reqView || 'module';
      reqUiState.selectedReqIds.clear();
      const sel = $('reqGroupBy');
      if (sel) sel.value = reqUiState.groupMode;
      syncReqViewTabs();
      if (state.selectedProject) renderGroupedRequirements(state.selectedProject);
    });
  }

  function setGroupMode(mode) {
    reqUiState.groupMode = mode || 'module';
    const sel = $('reqGroupBy');
    if (sel) sel.value = reqUiState.groupMode;
    syncReqViewTabs();
  }

  function openRequirementsMap(mode, options = {}) {
    setGroupMode(mode || 'vmap');
    if (window.RequirementsMapUI?.setMapFocus) {
      window.RequirementsMapUI.setMapFocus(options.focusStakeholderId, options.focusRequirementId);
    }
    if (typeof switchToTab === 'function') switchToTab('requisitos');
    else if (state.selectedProject) renderGroupedRequirements(state.selectedProject);
  }

  window.RequirementsUI = {
    renderGroupedRequirements,
    openRequirementModal,
    openDocumentViewer,
    initRequirementsUi,
    groupRequirements,
    collectPhases,
    populateAddRequirementPhase,
    readPhaseSelectValue,
    exportRequirementsMarkdown,
    exportRequirementsJson,
    getFilteredForUi,
    updateMeta,
    setGroupMode,
    openRequirementsMap,
  };

  window.openRequirementsMap = openRequirementsMap;

  document.addEventListener('DOMContentLoaded', initRequirementsUi);
})();
