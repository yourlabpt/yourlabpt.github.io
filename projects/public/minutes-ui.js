(function () {
  const minUiState = {
    activeView: 'atas',
    drawerMinuteId: null,
    propagationPlan: null,
  };

  function $(id) {
    return document.getElementById(id);
  }

  function meetingImpactedStages(minute) {
    const fn = window.PhaseContent?.meetingImpactedStageIds;
    if (fn) return fn(minute) || [];
    const single = minute?.targetStageId || minute?.impactScope || 'requirements';
    return Array.isArray(minute?.impactedStageIds) && minute.impactedStageIds.length
      ? minute.impactedStageIds
      : [single];
  }

  function friendlyDate(value) {
    if (!value) return '';
    const d = new Date(value);
    if (Number.isNaN(d.getTime())) return String(value);
    return d.toLocaleDateString('pt-PT', { day: '2-digit', month: 'short', year: 'numeric' });
  }

  function syncSelectedMinutesFromList() {
    const feed = $('minutesCardFeed');
    const checkboxes = feed
      ? Array.from(feed.querySelectorAll('input[type="checkbox"][data-minute-id]'))
      : [];
    const selected = checkboxes.filter((n) => n.checked).map((n) => n.getAttribute('data-minute-id')).filter(Boolean);
    state.selectedMinuteIds = selected;
    return selected;
  }

  function renderMinutesHeader(project) {
    const el = $('minutesShellHeader');
    if (!el || !project) return;
    const minutes = project.meetingMinutes || [];
    const classified = minutes.filter((m) => m.classificationStatus === 'classified').length;
    el.innerHTML = `
      <div class="pdos-header-grid pdos-header-compact">
        <div class="pdos-header-main">
          <p class="pdos-header-eyebrow">Gestão de reuniões</p>
          <h2>Atas do projecto</h2>
          <p class="content-shell-desc">Registe atas, classifique impacto com IA e propague alterações na linha de entrega.</p>
        </div>
        <div class="pdos-header-side">
          <div class="pdos-header-meta">
            <span class="chip">${minutes.length} atas</span>
            <span class="chip accent">${classified} classificadas</span>
          </div>
          <div class="pdos-header-actions" role="group">
            <button type="button" class="btn pdos-header-btn" id="minutesGoDeliveryBtn">Linha de Entrega</button>
            <button type="button" class="btn primary pdos-header-btn" id="minutesNewAtaBtn">Nova ata</button>
          </div>
        </div>
      </div>
    `;
    $('minutesGoDeliveryBtn')?.addEventListener('click', () => switchToTab?.('deliveryos'));
    $('minutesNewAtaBtn')?.addEventListener('click', () => {
      minUiState.activeView = 'atas';
      renderMinutesPage(project);
      $('meetingMinuteRaw')?.focus();
      $('minutesComposerCard')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
    });
  }

  function renderMinutesViewTabs() {
    const el = $('minutesViewTabs');
    if (!el) return;
    const views = [
      { id: 'atas', label: 'Atas', icon: '📋' },
      { id: 'propagation', label: 'Propagação', icon: '⟷' },
      { id: 'requirements', label: 'Actualizar requisitos', icon: '✎' },
    ];
    el.innerHTML = views.map((v) => `
      <button type="button" class="content-view-tab ${minUiState.activeView === v.id ? 'is-active' : ''}"
        data-minutes-view="${escapeHtml(v.id)}" role="tab" aria-selected="${minUiState.activeView === v.id}">
        <span class="content-view-tab-icon" aria-hidden="true">${v.icon}</span>
        <span>${escapeHtml(v.label)}</span>
      </button>
    `).join('');
    el.querySelectorAll('[data-minutes-view]').forEach((btn) => {
      btn.addEventListener('click', () => {
        minUiState.activeView = btn.dataset.minutesView;
        renderMinutesPage(state.selectedProject);
      });
    });
  }

  function renderMinutesStatTiles(project) {
    const el = $('minutesStatTiles');
    if (!el) return;
    const minutes = project.meetingMinutes || [];
    const pending = minutes.filter((m) => m.classificationStatus !== 'classified').length;
    const selected = (state.selectedMinuteIds || []).length;
    el.innerHTML = `
      <div class="content-stat-tile"><strong>${minutes.length}</strong><span>Total</span></div>
      <div class="content-stat-tile ${pending ? 'is-warn' : ''}"><strong>${pending}</strong><span>Por classificar</span></div>
      <div class="content-stat-tile"><strong>${selected}</strong><span>Seleccionadas</span></div>
      <div class="content-stat-tile"><strong>${(project.minutesPromptHistory || []).length}</strong><span>Prompts gerados</span></div>
    `;
  }

  function renderMinuteCard(entry, selectedSet) {
    const meetingDateLabel = entry.meetingDate || new Date(entry.createdAt).toISOString().slice(0, 10);
    const impactedStages = meetingImpactedStages(entry);
    const classified = entry.classificationStatus === 'classified';
    const checked = selectedSet.has(entry.id) ? 'checked' : '';
    const phaseBadges = impactedStages
      .map((sid) => `<span class="module-badge">${escapeHtml(stageLabel(sid))}</span>`)
      .join('');
    const reqChips = (entry.impactedRequirementIds || [])
      .slice(0, 6)
      .map((id) => `<button type="button" class="req-link-chip" data-goto-requirement="${escapeHtml(id)}">${escapeHtml(id)}</button>`)
      .join('');
    const decisions = (entry.decisions || []).filter((d) => d && d.text);
    const summary = shortText(entry.summaryMarkdown || entry.rawText, 160);

    return `
      <article class="pdos-card pdos-card-minute ${selectedSet.has(entry.id) ? 'is-selected' : ''}" data-minute-card="${escapeHtml(entry.id)}">
        <div class="pdos-card-top">
          <span class="delivery-card-kind">Ata</span>
          <label class="minute-select-check checkline">
            <input type="checkbox" data-minute-id="${escapeHtml(entry.id)}" ${checked} />
            Seleccionar
          </label>
        </div>
        <h4>${escapeHtml(entry.title || `Ata ${meetingDateLabel}`)}</h4>
        <div class="pdos-card-meta">
          <span>${escapeHtml(friendlyDate(meetingDateLabel))}</span>
          ${classified
            ? '<span class="minute-status is-classified">Classificada</span>'
            : '<span class="minute-status is-pending">Por classificar</span>'}
        </div>
        <p class="pdos-card-summary-text">${escapeHtml(summary || 'Sem resumo.')}</p>
        ${phaseBadges ? `<div class="pdos-module-badges">${phaseBadges}</div>` : ''}
        ${reqChips ? `<div class="minute-reqs">${reqChips}</div>` : ''}
        ${decisions.length ? `<ul class="minute-decisions compact">${decisions.slice(0, 3).map((d, idx) => `<li>${escapeHtml(d.text)} <button type="button" class="btn-link tiny" data-promote-inline="${escapeHtml(entry.id)}" data-decision-index="${idx}">+ decisão</button></li>`).join('')}</ul>` : ''}
        <div class="pdos-card-actions">
          <button type="button" class="btn tiny primary" data-open-minute="${escapeHtml(entry.id)}">Abrir</button>
          <button type="button" class="btn tiny" data-classify-minute="${escapeHtml(entry.id)}">
            ${classified ? 'Reclassificar' : 'Classificar IA'}
          </button>
        </div>
        <div class="minute-classify-panel hidden" data-classify-panel="${escapeHtml(entry.id)}"></div>
      </article>
    `;
  }

  function renderAtasFeed(project) {
    const feed = $('minutesCardFeed');
    if (!feed) return;
    const minutes = Array.isArray(project.meetingMinutes) ? project.meetingMinutes : [];
    const validIds = new Set(minutes.map((e) => e.id));
    const selectedSet = new Set((state.selectedMinuteIds || []).filter((id) => validIds.has(id)));
    if (!selectedSet.size && minutes[0]) selectedSet.add(minutes[0].id);
    state.selectedMinuteIds = Array.from(selectedSet);

    const composer = `
      <article class="pdos-card pdos-card-composer grid-span-all" id="minutesComposerCard">
        <span class="pdos-section-label">Registar nova ata</span>
        <form id="addMeetingMinuteForm" class="form-grid compact">
          <label>Data<input id="meetingMinuteDate" type="date" /></label>
          <label>Título (opcional)<input id="meetingMinuteTitle" placeholder="Ex: Alinhamento MVP" /></label>
          <label>Fase principal
            <select id="meetingMinuteImpactScope">
              <option value="discovery">Descoberta</option>
              <option value="idea">Ideia / visão</option>
              <option value="requirements" selected>Requisitos</option>
              <option value="architecture">Arquitectura</option>
              <option value="delivery">Entrega</option>
            </select>
          </label>
          <label class="full">Texto da ata
            <textarea id="meetingMinuteRaw" rows="6" placeholder="Cole aqui a ata da reunião..."></textarea>
          </label>
          <div class="pdos-card-actions">
            <button class="btn primary" type="submit">Guardar ata</button>
          </div>
        </form>
      </article>
    `;

    if (!minutes.length) {
      feed.innerHTML = `${composer}<article class="pdos-card pdos-card-empty grid-span-all"><p>Sem atas registadas. Use o formulário acima para a primeira.</p></article>`;
    } else {
      feed.innerHTML = composer + minutes.slice(0, 80).map((e) => renderMinuteCard(e, selectedSet)).join('');
    }

    if ($('meetingMinuteDate') && !$('meetingMinuteDate').value) {
      $('meetingMinuteDate').value = new Date().toISOString().slice(0, 10);
    }

    wireMinuteCardEvents(project);
  }

  function renderPropagationFeed(project) {
    const feed = $('minutesCardFeed');
    if (!feed) return;
    const minuteIds = syncSelectedMinutesFromList();
    const plan = minUiState.propagationPlan;

    feed.innerHTML = `
      <article class="pdos-card grid-span-all">
        <span class="pdos-section-label">Propagação na linha de entrega</span>
        <p class="pdos-card-summary-text">${minuteIds.length
          ? `${minuteIds.length} ata(s) seleccionada(s). Analise o impacto nas fases douradas.`
          : 'Seleccione atas na vista «Atas» (checkbox) para analisar propagação.'}</p>
        <div class="pdos-card-actions">
          <button type="button" class="btn tiny primary" id="analyzeMinutePropagationBtn">Analisar impacto</button>
          <button type="button" class="btn tiny" id="generateMinutePropagationPromptBtn">Gerar prompt IA</button>
          ${minuteIds.length ? `<button type="button" class="btn tiny ghost" data-minutes-view-jump="atas">Seleccionar atas</button>` : ''}
        </div>
      </article>
      <article class="pdos-card grid-span-all" id="minutePropagationPanel">
        ${renderPropagationPanelHtml(plan, minuteIds)}
      </article>
    `;

    $('analyzeMinutePropagationBtn')?.addEventListener('click', handleAnalyzeMinutePropagation);
    $('generateMinutePropagationPromptBtn')?.addEventListener('click', handleGenerateMinutePropagationPrompt);
    feed.querySelector('[data-minutes-view-jump="atas"]')?.addEventListener('click', () => {
      minUiState.activeView = 'atas';
      renderMinutesPage(project);
    });
    wirePropagationStageButtons(feed);
  }

  function renderPropagationPanelHtml(plan, minuteIds) {
    if (!minuteIds.length) {
      return '<p class="muted-text">Seleccione atas para ver o plano.</p>';
    }
    if (!plan) {
      return '<p class="muted-text">Clique em «Analisar impacto» para calcular fases afectadas.</p>';
    }
    const block = (title, ids) => {
      if (!ids?.length) return `<div class="propagation-block"><h5>${escapeHtml(title)}</h5><p class="muted-text">Nenhuma</p></div>`;
      return `
        <div class="propagation-block">
          <h5>${escapeHtml(title)}</h5>
          <ul class="propagation-stages">${ids.map((id) => `
            <li>
              <strong>${escapeHtml(stageLabel(id))}</strong>
              <button type="button" class="btn tiny ghost" data-set-stage="${escapeHtml(id)}" data-goto-tab="deliveryos">Ver fase</button>
            </li>
          `).join('')}</ul>
        </div>
      `;
    };
    return `
      <h4>Plano (${minuteIds.length} ata(s))</h4>
      ${plan.hints?.length ? `<p class="muted-text">${escapeHtml(plan.hints.join(' '))}</p>` : ''}
      <div class="propagation-grid">
        ${block('Fase principal', plan.primaryStageIds)}
        ${block('Rever para trás', plan.upstreamStageIds)}
        ${block('Actualizar para a frente', plan.downstreamStageIds)}
      </div>
    `;
  }

  function renderRequirementsFeed(project) {
    const feed = $('minutesCardFeed');
    if (!feed) return;
    const promptHistory = project.minutesPromptHistory || [];

    feed.innerHTML = `
      <article class="pdos-card grid-span-all">
        <span class="pdos-section-label">Actualizar requisitos a partir de atas</span>
        <p class="pdos-card-summary-text">Gera um prompt com as atas seleccionadas, corre no seu modelo e aplique o JSON de alterações.</p>
        <div class="form-grid compact">
          <label>Objectivo
            <select id="minutesPromptObjective">
              <option value="requirements_update">Actualizar requisitos</option>
              <option value="scope_change">Alteração de escopo</option>
              <option value="app_description_update">Actualizar descrição/visão</option>
              <option value="full_alignment">Alinhamento completo</option>
            </select>
          </label>
          <label class="full">Instruções extra
            <textarea id="minutesPromptExtraInstructions" rows="2" placeholder="Opcional"></textarea>
          </label>
        </div>
        <div class="pdos-card-actions">
          <button type="button" class="btn tiny primary" id="buildMinutesPromptBtn">Gerar pre-prompt</button>
        </div>
        <label class="full mt-8">Prompt gerado<textarea id="minutesPromptOutput" rows="8" readonly></textarea></label>
        <label class="full">JSON da IA<textarea id="requirementsChangeJson" rows="8" placeholder="addRequirements, updateRequirements..."></textarea></label>
        <div class="pdos-card-actions">
          <button type="button" class="btn tiny primary" id="importRequirementChangesBtn">Aplicar alterações</button>
        </div>
      </article>
      <article class="pdos-card grid-span-all">
        <span class="pdos-section-label">Histórico de prompts</span>
        <div id="minutesPromptHistoryList" class="content-mini-list">
          ${promptHistory.length
            ? promptHistory.slice(0, 12).map((entry) => `
              <div class="content-mini-item">
                <strong>${escapeHtml(entry.objective || 'prompt')}</strong>
                <small>${new Date(entry.createdAt).toLocaleString('pt-PT')} · ${(entry.minuteIds || []).length} ata(s)</small>
              </div>
            `).join('')
            : '<p class="muted-text">Sem histórico.</p>'}
        </div>
      </article>
    `;

    $('buildMinutesPromptBtn')?.addEventListener('click', handleBuildMinutesPrompt);
    $('importRequirementChangesBtn')?.addEventListener('click', handleImportRequirementChanges);
  }

  function wireMinuteCardEvents(project) {
    const feed = $('minutesCardFeed');
    if (!feed) return;

    feed.querySelectorAll('[data-open-minute]').forEach((btn) => {
      btn.addEventListener('click', () => openMinuteDrawer(btn.dataset.openMinute, project));
    });
    feed.querySelectorAll('[data-classify-minute]').forEach((btn) => {
      btn.addEventListener('click', () => openMinuteClassifyPanel(btn.dataset.classifyMinute));
    });
    feed.querySelectorAll('input[data-minute-id]').forEach((cb) => {
      cb.addEventListener('change', () => {
        syncSelectedMinutesFromList();
        renderMinutesStatTiles(project);
        if (minUiState.activeView === 'propagation') {
          renderPropagationFeed(project);
        }
      });
    });
    feed.querySelectorAll('[data-goto-requirement]').forEach((btn) => {
      btn.addEventListener('click', () => navigateToRequirement?.(btn.dataset.gotoRequirement));
    });
    feed.querySelectorAll('[data-promote-inline]').forEach((btn) => {
      btn.addEventListener('click', async () => {
        try {
          await apiRequest(`/projects/${encodeURIComponent(project.id)}/decisions/promote`, {
            method: 'POST',
            body: {
              minuteId: btn.dataset.promoteInline,
              decisionIndex: Number(btn.dataset.decisionIndex),
            },
          });
          showToast('Decisão promovida.', 'ok');
          await loadProjectById(project.id, { switchTab: false });
        } catch (err) {
          showToast(err.message, 'error');
        }
      });
    });
  }

  function wirePropagationStageButtons(root) {
    root?.querySelectorAll('[data-set-stage]').forEach((btn) => {
      btn.addEventListener('click', () => {
        state.deliverySelectedStageId = btn.dataset.setStage;
        navigateToFilteredTab?.(btn.dataset.gotoTab || 'deliveryos', { deliveryStageId: btn.dataset.setStage });
      });
    });
  }

  function openMinuteDrawer(minuteId, project) {
    const minute = (project.meetingMinutes || []).find((m) => m.id === minuteId);
    const drawer = $('minutesDetailDrawer');
    const content = $('minutesDrawerContent');
    if (!minute || !drawer || !content) return;

    minUiState.drawerMinuteId = minuteId;
    const impactedStages = meetingImpactedStages(minute);
    content.innerHTML = `
      <div class="pdos-drawer-head">
        <div>
          <span class="pdos-section-label">Ata de reunião</span>
          <h3>${escapeHtml(minute.title || minute.id)}</h3>
          <p class="muted-text">${escapeHtml(friendlyDate(minute.meetingDate || minute.createdAt))}</p>
        </div>
        <button type="button" class="btn tiny ghost" id="minutesDrawerClose">Fechar</button>
      </div>
      <div class="pdos-module-badges mb-8">${impactedStages.map((s) => `<span class="module-badge">${escapeHtml(stageLabel(s))}</span>`).join('')}</div>
      ${minute.summaryMarkdown ? `<div class="read-card mb-8"><h4>Resumo</h4><p>${escapeHtml(minute.summaryMarkdown)}</p></div>` : ''}
      ${(minute.decisions || []).filter((d) => d?.text).length ? `
        <div class="read-card mb-8">
          <h4>Decisões detectadas</h4>
          <ul class="minute-decisions">
            ${(minute.decisions || []).filter((d) => d?.text).map((d, idx) => `
              <li>
                ${escapeHtml(d.text)}
                <button type="button" class="btn tiny" data-promote-decision="${escapeHtml(minuteId)}" data-decision-index="${idx}">Promover a decisão</button>
              </li>
            `).join('')}
          </ul>
        </div>
      ` : ''}
      <div class="read-card">
        <h4>Texto original</h4>
        <pre class="minute-raw drawer-raw">${escapeHtml(minute.rawText || '')}</pre>
      </div>
      <div class="pdos-card-actions mt-12">
        <button type="button" class="btn tiny primary" data-classify-minute="${escapeHtml(minuteId)}">Classificar impacto</button>
      </div>
    `;
    $('minutesDrawerClose')?.addEventListener('click', closeMinuteDrawer);
    content.querySelectorAll('[data-promote-decision]').forEach((btn) => {
      btn.addEventListener('click', async () => {
        try {
          await apiRequest(`/projects/${encodeURIComponent(project.id)}/decisions/promote`, {
            method: 'POST',
            body: {
              minuteId: btn.dataset.promoteDecision,
              decisionIndex: Number(btn.dataset.decisionIndex),
            },
          });
          showToast('Decisão promovida com sucesso.', 'ok');
          await loadProjectById(project.id, { switchTab: false });
        } catch (err) {
          showToast(err.message, 'error');
        }
      });
    });
    content.querySelector('[data-classify-minute]')?.addEventListener('click', () => {
      closeMinuteDrawer();
      minUiState.activeView = 'atas';
      renderMinutesPage(project);
      openMinuteClassifyPanel(minuteId);
    });
    drawer.classList.remove('hidden');
  }

  function closeMinuteDrawer() {
    $('minutesDetailDrawer')?.classList.add('hidden');
    minUiState.drawerMinuteId = null;
  }

  function openMinuteClassifyPanel(minuteId) {
    const panel = $('minutesCardFeed')?.querySelector(`[data-classify-panel="${minuteId}"]`);
    if (!panel) return;
    if (!panel.classList.contains('hidden')) {
      panel.classList.add('hidden');
      panel.innerHTML = '';
      return;
    }
    panel.classList.remove('hidden');
    panel.innerHTML = `
      <div class="minute-classify-body">
        <p class="muted-text">1. Gerar prompt → 2. Correr no modelo → 3. Colar JSON → 4. Aplicar</p>
        <div class="actions-row">
          <button type="button" class="btn tiny primary" data-minute-gen-prompt="${escapeHtml(minuteId)}">Gerar prompt</button>
          <button type="button" class="btn tiny" data-minute-copy-prompt="${escapeHtml(minuteId)}" disabled>Copiar</button>
        </div>
        <textarea class="minute-classify-prompt" data-minute-prompt="${escapeHtml(minuteId)}" rows="5" readonly></textarea>
        <textarea class="minute-classify-output" data-minute-output="${escapeHtml(minuteId)}" rows="5" placeholder="JSON da IA"></textarea>
        <button type="button" class="btn tiny primary" data-minute-apply="${escapeHtml(minuteId)}">Aplicar classificação</button>
      </div>
    `;
    panel.querySelector('[data-minute-gen-prompt]')?.addEventListener('click', () => generateMinuteClassifyPrompt(minuteId));
    panel.querySelector('[data-minute-copy-prompt]')?.addEventListener('click', () => {
      const ta = panel.querySelector('[data-minute-prompt]');
      if (ta?.value) navigator.clipboard?.writeText(ta.value).then(() => showToast('Copiado.', 'ok'));
    });
    panel.querySelector('[data-minute-apply]')?.addEventListener('click', () => applyMinuteClassification(minuteId));
  }

  async function generateMinuteClassifyPrompt(minuteId) {
    if (!state.selectedProject) return;
    try {
      const payload = await apiRequest(`/projects/${encodeURIComponent(state.selectedProject.id)}/meeting-minutes/${encodeURIComponent(minuteId)}/classify-prompt`, { method: 'POST', body: {} });
      const panel = $('minutesCardFeed')?.querySelector(`[data-classify-panel="${minuteId}"]`);
      const ta = panel?.querySelector('[data-minute-prompt]');
      if (ta) ta.value = payload.prompt || '';
      panel?.querySelector('[data-minute-copy-prompt]')?.removeAttribute('disabled');
      showToast('Prompt gerado.', 'ok');
    } catch (error) {
      showToast(error.message, 'error');
    }
  }

  async function applyMinuteClassification(minuteId) {
    if (!state.selectedProject) return;
    const panel = $('minutesCardFeed')?.querySelector(`[data-classify-panel="${minuteId}"]`);
    const rawOutput = panel?.querySelector('[data-minute-output]')?.value || '';
    if (!rawOutput.trim()) {
      showToast('Cole o JSON da IA.', 'error');
      return;
    }
    try {
      const payload = await apiRequest(`/projects/${encodeURIComponent(state.selectedProject.id)}/meeting-minutes/${encodeURIComponent(minuteId)}/classify`, {
        method: 'POST',
        body: { rawOutput },
      });
      if (payload.project) {
        state.selectedProject = payload.project;
        renderProjectDetails?.();
      }
      showToast('Classificação aplicada.', 'ok');
    } catch (error) {
      showToast(error.message, 'error');
    }
  }

  async function handleAnalyzeMinutePropagation() {
    if (!state.selectedProject) return;
    const minuteIds = syncSelectedMinutesFromList();
    if (!minuteIds.length) {
      showToast('Seleccione pelo menos uma ata.', 'error');
      return;
    }
    try {
      const payload = await apiRequest(`/projects/${encodeURIComponent(state.selectedProject.id)}/meeting-minutes/propagation-plan`, {
        method: 'POST',
        body: { minuteIds },
      });
      minUiState.propagationPlan = payload.plan;
      renderPropagationFeed(state.selectedProject);
      showToast('Plano calculado.', 'ok');
    } catch (error) {
      showToast(error.message, 'error');
    }
  }

  async function handleGenerateMinutePropagationPrompt() {
    if (!state.selectedProject) return;
    const minuteIds = syncSelectedMinutesFromList();
    if (!minuteIds.length) {
      showToast('Seleccione atas.', 'error');
      return;
    }
    try {
      const payload = await apiRequest(`/projects/${encodeURIComponent(state.selectedProject.id)}/execution-plans`, {
        method: 'POST',
        body: { agentType: 'impact_regeneration', minuteIds },
      });
      if (payload.plan) {
        minUiState.propagationPlan = payload.plan.config?.propagationPlan || minUiState.propagationPlan;
        await window.PdosUI?.openExecutionWorkbench?.(payload.plan, state.selectedProject);
      }
      await loadProjectById(state.selectedProject.id);
      showToast('Plano de propagação aberto no Execution Workbench.', 'ok');
    } catch (error) {
      showToast(error.message, 'error');
    }
  }

  async function handleAddMeetingMinute(event) {
    event.preventDefault();
    if (!state.selectedProject) return;
    try {
      await apiRequest(`/projects/${encodeURIComponent(state.selectedProject.id)}/meeting-minutes`, {
        method: 'POST',
        body: {
          meetingDate: $('meetingMinuteDate')?.value,
          title: $('meetingMinuteTitle')?.value,
          rawText: $('meetingMinuteRaw')?.value,
          impactScope: $('meetingMinuteImpactScope')?.value || 'requirements',
        },
      });
      showToast('Ata guardada.', 'ok');
      if ($('meetingMinuteTitle')) $('meetingMinuteTitle').value = '';
      if ($('meetingMinuteRaw')) $('meetingMinuteRaw').value = '';
      await loadProjectById(state.selectedProject.id);
    } catch (error) {
      showToast(error.message, 'error');
    }
  }

  async function handleBuildMinutesPrompt() {
    if (!state.selectedProject) return;
    try {
      const payload = await apiRequest(`/projects/${encodeURIComponent(state.selectedProject.id)}/build-minutes-prompt`, {
        method: 'POST',
        body: {
          minuteIds: syncSelectedMinutesFromList(),
          objective: $('minutesPromptObjective')?.value,
          extraInstructions: $('minutesPromptExtraInstructions')?.value,
        },
      });
      if ($('minutesPromptOutput')) $('minutesPromptOutput').value = payload.prompt || '';
      showToast('Pre-prompt gerado.', 'ok');
      if (payload.project) {
        state.selectedProject = payload.project;
        renderProjectDetails?.();
      }
    } catch (error) {
      showToast(error.message, 'error');
    }
  }

  async function handleImportRequirementChanges() {
    if (!state.selectedProject) return;
    try {
      const payload = await apiRequest(`/projects/${encodeURIComponent(state.selectedProject.id)}/import-requirement-changes`, {
        method: 'POST',
        body: { changeJson: $('requirementsChangeJson')?.value },
      });
      const result = payload.result || {};
      showToast(`Alterações: +${result.added || 0}, ~${result.updated || 0}, -${result.excluded || 0}.`, 'ok');
      if ($('requirementsChangeJson')) $('requirementsChangeJson').value = '';
      await loadProjectById(state.selectedProject.id);
    } catch (error) {
      showToast(error.message, 'error');
    }
  }

  function renderMinutesPage(project) {
    if (!project) return;
    renderMinutesHeader(project);
    renderMinutesViewTabs();
    renderMinutesStatTiles(project);

    if (minUiState.activeView === 'propagation') renderPropagationFeed(project);
    else if (minUiState.activeView === 'requirements') renderRequirementsFeed(project);
    else renderAtasFeed(project);
    if (typeof setReadonlyByRole === 'function') setReadonlyByRole();
  }

  function initMinutesUi() {
    $('minutesDrawerOverlay')?.addEventListener('click', closeMinuteDrawer);
    $('minutesCardFeed')?.addEventListener('submit', (e) => {
      if (e.target?.id === 'addMeetingMinuteForm') handleAddMeetingMinute(e);
    });
    document.addEventListener('keydown', (e) => {
      if (e.key === 'Escape') closeMinuteDrawer();
    });
  }

  window.MinutesUI = {
    renderMinutesPage,
    syncSelectedMinutesFromList,
    renderMinutePropagationPanel: (plan) => {
      minUiState.propagationPlan = plan;
      if (state.selectedProject && minUiState.activeView === 'propagation') {
        renderPropagationFeed(state.selectedProject);
      }
    },
    initMinutesUi,
  };

  document.addEventListener('DOMContentLoaded', initMinutesUi);
})();
