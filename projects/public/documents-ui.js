(function () {
  const docUiState = {
    activeView: 'uploads',
    modalItem: null,
    modalDirty: false,
    searchQuery: '',
  };

  const KIND_LABELS = {
    artifact: 'Artefacto técnico',
    prompt_run: 'Resposta IA',
    information_entry: 'Nota de fase',
    document: 'Documento gerado',
  };

  const AGENT_FRIENDLY = {
    requirement_grouping: 'Organização de requisitos',
    reverse_idea: 'Resumo da ideia',
    idea_augment: 'Expandir visão da ideia',
    diagram_to_requirements: 'Requisitos a partir de diagrama',
    requirements_to_architecture: 'Pacote de arquitectura',
    capability_requirements: 'Requisitos da funcionalidade',
    stage_transition: 'Transição de fase',
    impact_regeneration: 'Propagação de impacto',
    meeting_classification: 'Classificação de ata',
    prompt_builder: 'Agente',
    agent_output: 'Resposta IA',
  };

  const STAGE_SEQUENCE = ['idea', 'discovery', 'requirements', 'architecture', 'roadmap', 'implementation', 'validation', 'delivery', 'operations'];

  function $(id) {
    return document.getElementById(id);
  }

  function getStageId() {
    return state.tabFilters?.deliveryStageId || state.deliverySelectedStageId || '';
  }

  function friendlyLabel(item) {
    if (item.kind === 'prompt_run') {
      const slug = String(item.raw?.agentType || item.typeLabel || '').trim();
      return AGENT_FRIENDLY[slug] || KIND_LABELS.prompt_run;
    }
    return KIND_LABELS[item.kind] || item.typeLabel;
  }

  function friendlyDate(value) {
    if (!value) return '';
    const d = new Date(value);
    if (Number.isNaN(d.getTime())) return '';
    return d.toLocaleDateString('pt-PT', { day: '2-digit', month: 'short', year: 'numeric' });
  }

  function stageOrderList() {
    return window.state?.config?.stageOrder || STAGE_SEQUENCE;
  }

  function getAiArtifacts(project) {
    const collect = window.PhaseContent?.collectAiArtifacts;
    if (!collect) return [];
    const stageFilter = getStageId();
    if (stageFilter) return collect(project, stageFilter);

    const seen = new Set();
    const all = [];
    for (const sid of stageOrderList()) {
      for (const item of collect(project, sid)) {
        const key = `${item.kind}:${item.id}`;
        if (seen.has(key)) continue;
        seen.add(key);
        all.push({ ...item, stageId: item.stageId || sid });
      }
    }
    return all.sort((a, b) => new Date(b.updatedAt || 0).getTime() - new Date(a.updatedAt || 0).getTime());
  }

  function getUploadDocuments(project) {
    let docs = Array.isArray(project?.documents) ? project.documents : [];
    const isAiDocument = (d) => {
      const docType = String(d?.docType || 'attachment');
      const origin = String(d?.origin || '');
      return origin === 'ai' || ['diagram', 'ai_response', 'architecture'].includes(docType);
    };
    docs = docs.filter((d) => !isAiDocument(d));
    const stageFilter = String(state.tabFilters?.deliveryStageId || '').trim();
    if (stageFilter) {
      const resolve = window.PhaseContent?.resolveDocumentStageId || ((d) => d.deliveryStageId || 'discovery');
      docs = docs.filter((d) => resolve(d) === stageFilter);
    }
    const q = docUiState.searchQuery.trim().toLowerCase();
    if (q) {
      docs = docs.filter((d) => {
        const name = String(d.title || d.originalName || '').toLowerCase();
        return name.includes(q);
      });
    }
    return docs;
  }

  function filterAiItems(items) {
    const q = docUiState.searchQuery.trim().toLowerCase();
    if (!q) return items;
    return items.filter((item) => {
      const hay = `${item.title} ${item.preview} ${friendlyLabel(item)}`.toLowerCase();
      return hay.includes(q);
    });
  }

  function renderDocsHeader(project) {
    const el = $('docsShellHeader');
    if (!el || !project) return;
    const uploads = getUploadDocuments(project);
    const ai = getAiArtifacts(project);
    el.innerHTML = `
      <div class="pdos-header-grid pdos-header-compact">
        <div class="pdos-header-main">
          <p class="pdos-header-eyebrow">${escapeHtml(project.clientName || 'Cliente')}</p>
          <h2>Documentos</h2>
          <p class="content-shell-desc">Anexos do cliente, artefactos gerados pela IA e ferramentas de importação.</p>
        </div>
        <div class="pdos-header-side">
          <div class="pdos-header-meta">
            <span class="chip">${uploads.length} anexos</span>
            <span class="chip accent">${ai.length} IA</span>
          </div>
          <div class="pdos-header-actions" role="group">
            <button type="button" class="btn pdos-header-btn" id="docsGoDeliveryBtn">Linha de Entrega</button>
            <button type="button" class="btn primary pdos-header-btn" id="docsUploadJumpBtn">Carregar ficheiro</button>
          </div>
        </div>
      </div>
    `;
    $('docsGoDeliveryBtn')?.addEventListener('click', () => switchToTab?.('deliveryos'));
    $('docsUploadJumpBtn')?.addEventListener('click', () => {
      docUiState.activeView = 'uploads';
      renderDocumentsPage(project);
      $('docFile')?.click();
    });
  }

  function renderViewTabs() {
    const el = $('documentsViewTabs');
    if (!el) return;
    const views = [
      { id: 'uploads', label: 'Anexos', icon: '📎' },
      { id: 'aiArtifacts', label: 'Artefactos IA', icon: '✦' },
      { id: 'tools', label: 'Ferramentas', icon: '⚙' },
    ];
    el.innerHTML = views.map((v) => `
      <button type="button" class="content-view-tab ${docUiState.activeView === v.id ? 'is-active' : ''}"
        data-docs-view="${escapeHtml(v.id)}" role="tab">
        <span class="content-view-tab-icon" aria-hidden="true">${v.icon}</span>
        <span>${escapeHtml(v.label)}</span>
      </button>
    `).join('');
    el.querySelectorAll('[data-docs-view]').forEach((btn) => {
      btn.addEventListener('click', () => {
        docUiState.activeView = btn.dataset.docsView;
        state.tabFilters = state.tabFilters || {};
        state.tabFilters.contentView = btn.dataset.docsView === 'aiArtifacts' ? 'aiArtifacts' : '';
        renderDocumentsPage(state.selectedProject);
      });
    });
  }

  function renderFilterStrip(project) {
    const el = $('documentsFilterStrip');
    if (!el) return;
    const stageId = getStageId();
    const stageName = stageId ? stageLabel(stageId) : '';

    el.classList.remove('hidden');
    el.innerHTML = `
      <div class="content-filter-bar">
        <label class="content-search">
          <span class="sr-only">Pesquisar</span>
          <input type="search" id="docsSearchInput" placeholder="Pesquisar documentos..." value="${escapeHtml(docUiState.searchQuery)}" />
        </label>
        ${stageName ? `
          <span class="phase-context-pill is-small">${escapeHtml(stageName)}</span>
          <button type="button" class="btn tiny ghost" id="docsClearStageFilter">Limpar fase</button>
        ` : ''}
      </div>
    `;
    $('docsSearchInput')?.addEventListener('input', (e) => {
      docUiState.searchQuery = e.target.value;
      renderDocumentsPage(project);
    });
    $('docsClearStageFilter')?.addEventListener('click', () => {
      state.tabFilters.deliveryStageId = '';
      renderDocumentsPage(state.selectedProject);
      renderPhaseContextBar?.();
    });
  }

  function renderStatTiles(project) {
    const el = $('docsStatTiles');
    if (!el) return;
    const uploads = getUploadDocuments(project);
    const ai = filterAiItems(getAiArtifacts(project));
    const withText = uploads.filter((d) => d.hasExtractedText || d.contentMarkdown).length;
    el.innerHTML = `
      <div class="content-stat-tile"><strong>${uploads.length}</strong><span>Anexos visíveis</span></div>
      <div class="content-stat-tile"><strong>${ai.length}</strong><span>Artefactos IA</span></div>
      <div class="content-stat-tile"><strong>${withText}</strong><span>Com texto</span></div>
      <div class="content-stat-tile"><strong>${getStageId() ? stageLabel(getStageId()) : 'Todas'}</strong><span>Fase activa</span></div>
    `;
  }

  function renderUploadCard(doc, project) {
    const name = doc.title || doc.originalName;
    const stage = doc.deliveryStageId ? stageLabel(doc.deliveryStageId) : '';
    const hasText = doc.hasExtractedText || doc.contentMarkdown;
    return `
      <article class="pdos-card pdos-card-doc">
        <div class="pdos-card-top">
          <span class="delivery-card-kind">Anexo</span>
          ${hasText ? '<span class="chip tiny">texto</span>' : ''}
        </div>
        <h4>${escapeHtml(name)}</h4>
        <div class="pdos-card-meta">
          <span>${friendlyDate(doc.uploadedAt || doc.createdAt)}</span>
          ${stage ? `<span class="module-badge">${escapeHtml(stage)}</span>` : ''}
        </div>
        <div class="pdos-card-actions">
          <button type="button" class="btn tiny primary" data-open-doc="${escapeHtml(doc.id)}">Abrir</button>
          <a class="btn tiny ghost" href="/api/projects/projects/${encodeURIComponent(project.id)}/documents/${encodeURIComponent(doc.id)}/download" target="_blank" rel="noopener">Download</a>
        </div>
      </article>
    `;
  }

  function renderAiCard(item) {
    return `
      <article class="pdos-card pdos-card-ai" data-ai-kind="${escapeHtml(item.kind)}" data-ai-id="${escapeHtml(item.id)}">
        <div class="pdos-card-top">
          <span class="delivery-card-kind">${escapeHtml(friendlyLabel(item))}</span>
          ${friendlyDate(item.updatedAt) ? `<span>${escapeHtml(friendlyDate(item.updatedAt))}</span>` : ''}
        </div>
        <h4>${escapeHtml(item.title)}</h4>
        <p class="pdos-card-summary-text">${escapeHtml(item.preview || 'Sem resumo.')}</p>
        ${item.stageId ? `<div class="pdos-module-badges"><span class="module-badge">${escapeHtml(stageLabel(item.stageId))}</span></div>` : ''}
        <div class="pdos-card-actions">
          <button type="button" class="btn tiny primary" data-open-ai-artifact="${escapeHtml(item.kind)}:${escapeHtml(item.id)}">Ler</button>
        </div>
      </article>
    `;
  }

  function renderUploadsFeed(project) {
    const feed = $('docsCardFeed');
    if (!feed) return;
    const docs = getUploadDocuments(project);

    const composer = `
      <article class="pdos-card pdos-card-composer grid-span-all" id="docsUploadComposer">
        <span class="pdos-section-label">Carregar anexo</span>
        <form id="uploadDocForm" class="inline-form content-upload-form" enctype="multipart/form-data">
          <input id="docFile" type="file" />
          <button class="btn primary" type="submit">Carregar ficheiro</button>
        </form>
        <p class="muted-text">PDF, Word, imagens — associados ao projecto e filtráveis por fase.</p>
      </article>
    `;

    if (!docs.length) {
      feed.innerHTML = `${composer}<article class="pdos-card pdos-card-empty grid-span-all"><p>${getStageId() ? 'Sem anexos nesta fase.' : 'Sem anexos. Carregue o primeiro documento acima.'}</p></article>`;
    } else {
      feed.innerHTML = composer + docs.map((d) => renderUploadCard(d, project)).join('');
    }

    feed.querySelectorAll('[data-open-doc]').forEach((btn) => {
      btn.addEventListener('click', () => {
        const doc = docs.find((d) => d.id === btn.dataset.openDoc);
        if (doc) window.RequirementsUI?.openDocumentViewer?.(doc, project);
      });
    });
  }

  function renderAiFeed(project) {
    const feed = $('docsCardFeed');
    const meta = $('documentsAiMeta');
    if (!feed) return;

    const items = filterAiItems(getAiArtifacts(project));
    const scoped = Boolean(getStageId());
    if (meta) {
      meta.textContent = items.length
        ? `${items.length} artefacto(s) — clique em «Ler» para conteúdo completo.`
        : 'Sem artefactos IA. Corra agentes na Linha de Entrega.';
    }

    if (!items.length) {
      feed.innerHTML = `
        <article class="pdos-card pdos-card-empty grid-span-all">
          <p>Sem resultados da IA${scoped ? ' nesta fase' : ''}.</p>
          <div class="pdos-card-actions">
            <button type="button" class="btn tiny primary" id="docsEmptyGoDelivery">Ir para Entrega</button>
          </div>
        </article>
      `;
      $('docsEmptyGoDelivery')?.addEventListener('click', () => switchToTab?.('deliveryos'));
      return;
    }

    if (scoped) {
      feed.innerHTML = items.map((item) => renderAiCard(item)).join('');
    } else {
      const byStage = new Map();
      for (const item of items) {
        const sid = item.stageId || 'requirements';
        if (!byStage.has(sid)) byStage.set(sid, []);
        byStage.get(sid).push(item);
      }
      feed.innerHTML = stageOrderList().filter((sid) => byStage.has(sid)).map((sid) => `
        <article class="pdos-card grid-span-all pdos-card-stage-group">
          <span class="pdos-section-label">${escapeHtml(stageLabel(sid))}</span>
          <div class="content-nested-grid">${byStage.get(sid).map(renderAiCard).join('')}</div>
        </article>
      `).join('');
    }

    feed.querySelectorAll('[data-open-ai-artifact]').forEach((btn) => {
      btn.addEventListener('click', () => {
        const [kind, id] = btn.dataset.openAiArtifact.split(':');
        const item = getAiArtifacts(project).find((e) => e.kind === kind && e.id === id);
        if (item) openAiArtifactModal(item, project);
      });
    });
  }

  function renderToolsFeed(project) {
    const feed = $('docsCardFeed');
    if (!feed) return;
    feed.innerHTML = `
      <article class="pdos-card grid-span-all">
        <span class="pdos-section-label">Texto base de requisitos</span>
        <p class="pdos-card-summary-text">Cole o conteúdo extraído do documento do cliente para alimentar prompts e importação.</p>
        <textarea id="sourceText" rows="8" placeholder="Texto base...">${escapeHtml(project.sourceText || '')}</textarea>
        <div class="pdos-card-actions">
          <button class="btn" id="saveSourceTextBtn" type="button">Guardar texto base</button>
          <button class="btn primary" id="buildPromptBtn" type="button">Gerar pre-prompt IA</button>
        </div>
      </article>
      <article class="pdos-card grid-span-all">
        <span class="pdos-section-label">Importação estruturada</span>
        <label class="full">Pre-prompt gerado<textarea id="aiPrompt" rows="8" readonly>${escapeHtml(project.aiPrompt || '')}</textarea></label>
        <label class="full">Resposta JSON da IA<textarea id="aiJson" rows="10" placeholder="Cole o JSON..."></textarea></label>
        <div class="pdos-card-actions">
          <button class="btn primary" id="importAiBtn" type="button">Importar requisitos</button>
        </div>
      </article>
    `;
  }

  function renderDocumentsPage(project) {
    if (!project) return;

    const forcedView = state.tabFilters?.contentView;
    if (forcedView === 'aiArtifacts') docUiState.activeView = 'aiArtifacts';
    else if (forcedView === 'uploads') docUiState.activeView = 'uploads';

    renderDocsHeader(project);
    renderViewTabs();
    renderFilterStrip(project);
    renderStatTiles(project);

    $('documentsAiSection')?.classList.add('hidden');
    $('documentsUploadSection')?.classList.add('hidden');

    if (docUiState.activeView === 'aiArtifacts') {
      $('documentsAiMeta')?.classList.remove('hidden');
      $('documentsAiSection')?.classList.remove('hidden');
      renderAiFeed(project);
    } else if (docUiState.activeView === 'tools') {
      $('documentsAiMeta')?.classList.add('hidden');
      renderToolsFeed(project);
    } else {
      $('documentsAiMeta')?.classList.add('hidden');
      $('documentsUploadSection')?.classList.remove('hidden');
      renderUploadsFeed(project);
    }
    if (typeof setReadonlyByRole === 'function') setReadonlyByRole();
  }

  function initDocumentsUi() {
    $('docsCardFeed')?.addEventListener('submit', (e) => {
      if (e.target?.id === 'uploadDocForm') window.handleUploadDocument?.(e);
    });
    $('docsCardFeed')?.addEventListener('click', (e) => {
      if (e.target.closest('#saveSourceTextBtn')) window.handleSaveSourceText?.();
      if (e.target.closest('#buildPromptBtn')) window.handleBuildPrompt?.();
      if (e.target.closest('#importAiBtn')) window.handleImportAi?.();
    });
    $('aiArtifactModalClose')?.addEventListener('click', closeAiArtifactModal);
    $('aiArtifactModalCancel')?.addEventListener('click', () => setAiModalMode('read'));
    $('aiArtifactModalSave')?.addEventListener('click', saveAiArtifactModal);
    $('aiArtifactEditToggle')?.addEventListener('click', () => setAiModalMode('edit'));
    $('aiArtifactModalCopy')?.addEventListener('click', () => {
      const text = $('aiArtifactContentInput')?.value || docUiState.modalItem?.contentMarkdown || '';
      navigator.clipboard?.writeText(text).then(() => showToast('Copiado.', 'ok'));
    });
  }

  async function renderReadPane(markdown) {
    const pane = $('aiArtifactReadPane');
    if (!pane) return;
    const md = String(markdown || '').trim();
    if (!md) {
      pane.innerHTML = '<p class="muted-text">Sem conteúdo.</p>';
      return;
    }
    try {
      const res = await apiRequest('/markdown/render', { method: 'POST', body: { markdown: md } });
      pane.innerHTML = res.html || escapeHtml(md);
    } catch {
      pane.textContent = md;
    }
  }

  function setAiModalMode(mode) {
    const editing = mode === 'edit';
    $('aiArtifactReadPane')?.classList.toggle('hidden', editing);
    $('aiArtifactEditForm')?.classList.toggle('hidden', !editing);
    $('aiArtifactEditToggle')?.classList.toggle('hidden', editing);
    $('aiArtifactModalSave')?.classList.toggle('hidden', !editing);
    $('aiArtifactModalCancel')?.classList.toggle('hidden', !editing);
  }

  async function openAiArtifactModal(item, project) {
    const modal = $('aiArtifactModal');
    if (!modal || !item) return;

    docUiState.modalItem = item;
    docUiState.modalDirty = false;
    $('aiArtifactModalDirty')?.classList.add('hidden');
    $('aiArtifactModalTitle').textContent = item.title;
    $('aiArtifactModalKind').textContent = friendlyLabel(item);

    const readonly = !canEdit();
    const showTitle = item.kind === 'artifact' || item.kind === 'document';
    $('aiArtifactTitleField')?.classList.toggle('hidden', !showTitle);
    if ($('aiArtifactTitleInput')) {
      $('aiArtifactTitleInput').value = item.title;
      $('aiArtifactTitleInput').disabled = readonly;
    }

    let contentMarkdown = item.contentMarkdown || '';
    if (item.kind === 'document' && !contentMarkdown && (item.hasContent || item.hasExtractedText)) {
      try {
        const res = await apiRequest(
          `/projects/${encodeURIComponent(project.id)}/documents/${encodeURIComponent(item.id)}`
        );
        contentMarkdown = res.document?.contentMarkdown || res.document?.extractedText || '';
        item.contentMarkdown = contentMarkdown;
      } catch (err) {
        showToast(err.message, 'error');
      }
    }

    $('aiArtifactContentInput').value = contentMarkdown;
    $('aiArtifactContentInput').disabled = readonly;

    const promptBlock = $('aiArtifactPromptBlock');
    if (promptBlock) {
      if (item.kind === 'prompt_run' && item.fullPrompt) {
        promptBlock.classList.remove('hidden');
        $('aiArtifactPromptInput').value = item.fullPrompt;
        $('aiArtifactPromptInput').disabled = true;
      } else {
        promptBlock.classList.add('hidden');
      }
    }

    $('aiArtifactModalMeta').innerHTML = `
      ${item.stageId ? `<span>Fase: <strong>${escapeHtml(stageLabel(item.stageId))}</strong></span>` : ''}
      <span>Tipo: <strong>${escapeHtml(friendlyLabel(item))}</strong></span>
    `;

    renderReadPane(contentMarkdown);
    setAiModalMode('read');
    $('aiArtifactEditToggle')?.classList.toggle('hidden', readonly || !item.editable);
    $('aiArtifactModalSave').disabled = readonly || !item.editable;
    modal.classList.remove('hidden');

    $('aiArtifactContentInput').oninput = markAiModalDirty;
    $('aiArtifactTitleInput') && ($('aiArtifactTitleInput').oninput = markAiModalDirty);
  }

  function markAiModalDirty() {
    docUiState.modalDirty = true;
    $('aiArtifactModalDirty')?.classList.remove('hidden');
  }

  function closeAiArtifactModal() {
    if (docUiState.modalDirty && !confirm('Alterações não guardadas. Fechar?')) return;
    $('aiArtifactModal')?.classList.add('hidden');
    docUiState.modalItem = null;
    docUiState.modalDirty = false;
  }

  async function saveAiArtifactModal() {
    const project = state.selectedProject;
    const item = docUiState.modalItem;
    if (!project || !item) return;

    const title = $('aiArtifactTitleInput')?.value?.trim();
    const contentMarkdown = $('aiArtifactContentInput')?.value ?? '';

    try {
      let res;
      if (item.kind === 'artifact') {
        res = await apiRequest(`/projects/${encodeURIComponent(project.id)}/artifacts`, {
          method: 'POST',
          body: {
            id: item.id,
            type: item.raw?.type || item.typeLabel,
            name: title || item.title,
            bodyMarkdown: contentMarkdown,
            description: contentMarkdown.slice(0, 280),
            stageId: item.stageId,
            status: item.status,
            metadata: item.raw?.metadata,
          },
        });
      } else if (item.kind === 'document') {
        res = await apiRequest(`/projects/${encodeURIComponent(project.id)}/documents/${encodeURIComponent(item.id)}`, {
          method: 'PATCH',
          body: { title: title || item.title, contentMarkdown },
        });
      } else if (item.kind === 'prompt_run') {
        res = await apiRequest(`/projects/${encodeURIComponent(project.id)}/prompt-runs/${encodeURIComponent(item.id)}`, {
          method: 'PATCH',
          body: { summaryMarkdown: contentMarkdown },
        });
      } else if (item.kind === 'information_entry') {
        res = await apiRequest(`/projects/${encodeURIComponent(project.id)}/information-entries/${encodeURIComponent(item.id)}`, {
          method: 'PATCH',
          body: { bodyMarkdown: contentMarkdown },
        });
      }

      if (res?.project) {
        state.selectedProject = res.project;
        docUiState.modalDirty = false;
        $('aiArtifactModalDirty')?.classList.add('hidden');
        if (docUiState.modalItem) docUiState.modalItem.contentMarkdown = contentMarkdown;
        renderReadPane(contentMarkdown);
        setAiModalMode('read');
        renderDocumentsPage(state.selectedProject);
        renderProjectDetails?.();
        showToast('Guardado.', 'ok');
      }
    } catch (error) {
      showToast(error.message, 'error');
    }
  }


  window.DocumentsUI = {
    renderDocumentsPage,
    openAiArtifactModal,
    initDocumentsUi,
  };

  document.addEventListener('DOMContentLoaded', initDocumentsUi);
})();
