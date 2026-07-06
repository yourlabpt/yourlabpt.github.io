/**
 * Architecture diagrams — single, simple list of text files.
 * Each diagram is a text file: copy, download, or open in a free external viewer.
 * No in-app rendering. This is the ONLY place that counts/lists diagrams.
 */
(function () {
  const uiState = { registry: null };

  // Free external viewers per notation. Only shown when a match exists.
  const VIEWER_LINKS = {
    mermaid: { label: 'Abrir no Mermaid Live', url: 'https://mermaid.live/' },
    plantuml: { label: 'Abrir no PlantText', url: 'https://www.planttext.com/' },
    openapi: { label: 'Abrir no Swagger Editor', url: 'https://editor.swagger.io/' },
    asyncapi: { label: 'Abrir no AsyncAPI Studio', url: 'https://studio.asyncapi.com/' },
    json_schema: { label: 'Abrir editor JSON Schema', url: 'https://json-schema-editor.com/app.html' },
  };

  const FILE_EXT = {
    mermaid: 'mmd',
    plantuml: 'puml',
    openapi: 'yaml',
    asyncapi: 'yaml',
    json_schema: 'json',
  };

  function $(id) { return document.getElementById(id); }

  async function copyText(text) {
    const value = String(text || '');
    if (navigator.clipboard?.writeText) {
      return navigator.clipboard.writeText(value);
    }
    const ta = document.createElement('textarea');
    ta.value = value;
    ta.style.position = 'fixed';
    ta.style.opacity = '0';
    document.body.appendChild(ta);
    ta.select();
    document.execCommand('copy');
    ta.remove();
    return Promise.resolve();
  }

  function escapeHtml(value) {
    return String(value ?? '')
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  }

  function ensureArray(value) {
    return Array.isArray(value) ? value : [];
  }

  function shortText(value, max = 80) {
    const text = String(value || '').trim();
    return text.length <= max ? text : `${text.slice(0, max - 1)}…`;
  }

  function slugify(value) {
    return String(value || 'diagrama')
      .toLowerCase()
      .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-|-$/g, '')
      .slice(0, 48) || 'diagrama';
  }

  function isArchitectureStage() {
    return window.state?.deliverySelectedStageId === 'architecture';
  }

  function getDiagrams(project) {
    return ensureArray(project?.diagramArtifacts);
  }

  function getTemplate(type) {
    return uiState.registry?.types?.find((t) => t.type === type) || { label: type || 'Diagrama' };
  }

  async function loadRegistry() {
    if (uiState.registry) return uiState.registry;
    uiState.registry = await apiRequest('/diagrams/registry');
    return uiState.registry;
  }

  function fileExtension(diagram) {
    const notation = String(diagram.notation || 'mermaid').toLowerCase();
    if (FILE_EXT[notation]) return FILE_EXT[notation];
    if (notation === 'openapi' || diagram.type === 'openapi_spec') return 'yaml';
    return 'txt';
  }

  function downloadDiagramText(diagram) {
    const text = String(diagram.sourceText || '').trim();
    if (!text) {
      showToast('Diagrama sem texto para descarregar', 'error');
      return;
    }
    const filename = `${slugify(diagram.title || diagram.id)}.${fileExtension(diagram)}`;
    if (typeof downloadText === 'function') {
      downloadText(text, filename, 'text/plain;charset=utf-8');
    } else {
      const blob = new Blob([text], { type: 'text/plain;charset=utf-8' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = filename;
      a.click();
      URL.revokeObjectURL(url);
    }
    showToast('Ficheiro descarregado');
  }

  function viewerLink(diagram) {
    const notation = String(diagram.notation || '').toLowerCase();
    const viewer = VIEWER_LINKS[notation];
    if (!viewer) return '';
    return `<a class="btn tiny ghost" href="${escapeHtml(viewer.url)}" target="_blank" rel="noopener noreferrer" title="Copie o texto e cole no editor">${escapeHtml(viewer.label)} ↗</a>`;
  }

  function renderReqChips(project, diagram) {
    const ids = ensureArray(diagram.linkedRequirementIds);
    if (!ids.length) return '';
    const chips = ids.slice(0, 6).map((id) =>
      `<button type="button" class="req-link-chip" data-goto-requirement="${escapeHtml(id)}" title="Abrir requisito ${escapeHtml(id)}">${escapeHtml(id)}</button>`
    ).join('');
    const extra = ids.length > 6 ? `<span class="muted-text">+${ids.length - 6}</span>` : '';
    return `<div class="diagram-row-reqs"><span class="diagram-row-reqs-label">Requisitos:</span> ${chips}${extra}</div>`;
  }

  function renderDiagramRow(project, diagram) {
    const typeLabel = getTemplate(diagram.type).label || diagram.type;
    const moduleName = diagram.module || 'Geral';
    return `
      <li class="diagram-row" id="diagram-row-${escapeHtml(diagram.id)}" data-diagram-id="${escapeHtml(diagram.id)}">
        <div class="diagram-row-head">
          <div class="diagram-row-info">
            <div class="diagram-row-tags">
              <span class="diagram-row-module">${escapeHtml(moduleName)}</span>
              <span class="diagram-row-type">${escapeHtml(typeLabel)}</span>
              <span class="diagram-row-notation">${escapeHtml(diagram.notation || 'texto')}</span>
            </div>
            <strong class="diagram-row-name">${escapeHtml(diagram.title || 'Sem título')}</strong>
          </div>
          <div class="diagram-row-actions">
            <button type="button" class="btn tiny primary" data-diagram-copy="${escapeHtml(diagram.id)}">Copiar</button>
            <button type="button" class="btn tiny" data-diagram-download="${escapeHtml(diagram.id)}">Descarregar</button>
            ${viewerLink(diagram)}
            <button type="button" class="btn tiny ghost" data-diagram-recreate="${escapeHtml(diagram.id)}" title="Gerar um prompt para recriar este diagrama">Recriar</button>
            <button type="button" class="btn tiny ghost" data-diagram-to-req="${escapeHtml(diagram.id)}" title="Extrair requisitos deste diagrama">→ Requisitos</button>
          </div>
        </div>
        ${renderReqChips(project, diagram)}
        <details class="diagram-row-source">
          <summary>Ver / editar texto</summary>
          <textarea class="diagram-source-textarea" data-diagram-source="${escapeHtml(diagram.id)}" spellcheck="false" rows="12">${escapeHtml(diagram.sourceText || '')}</textarea>
          <div class="diagram-row-save">
            <button type="button" class="btn tiny" data-diagram-save="${escapeHtml(diagram.id)}">Guardar alterações</button>
          </div>
        </details>
      </li>
    `;
  }

  function renderGenControls(project) {
    const caps = project.capabilities || [];
    const modules = ['Frontend', 'Backend', 'Database', 'System', 'API', 'Integrations'];
    const selectedMod = window.PdosUI?.pdosState?.moduleFilter || 'Backend';
    return `
      <div class="diagrams-gen-controls form-grid compact">
        <label>Funcionalidade
          <select id="archGenCapability">
            <option value="">Todas / projecto</option>
            ${caps.map((c) => `<option value="${escapeHtml(c.id)}">${escapeHtml(c.name)}</option>`).join('')}
          </select>
        </label>
        <label>Módulo
          <select id="archGenModule">
            ${modules.map((m) => `<option value="${escapeHtml(m)}"${m === selectedMod ? ' selected' : ''}>${escapeHtml(m)}</option>`).join('')}
          </select>
        </label>
        <button type="button" class="btn primary" id="archGenPackBtn">Gerar com YourLab Agent</button>
      </div>
    `;
  }

  function renderShellContent(project) {
    const diagrams = getDiagrams(project);
    return `
      <div class="diagrams-panel">
        <div class="diagrams-panel-head">
          <div>
            <span class="pdos-section-label">Diagramas de arquitectura</span>
            <h3 class="diagrams-title">${diagrams.length} diagrama${diagrams.length === 1 ? '' : 's'}</h3>
            <p class="muted-text diagrams-hint">Ficheiros de texto. Copie num clique ou abra numa plataforma gratuita para visualizar.</p>
          </div>
        </div>

        ${diagrams.length
          ? `<ul class="diagram-row-list">${diagrams.map((d) => renderDiagramRow(project, d)).join('')}</ul>`
          : `<div class="diagrams-empty-state">
              <p>Ainda não há diagramas.</p>
              <p class="muted-text">Gere com IA ou crie manualmente nas opções abaixo.</p>
            </div>`}

        <div class="diagrams-secondary">
          <details class="diagrams-tool">
            <summary>Gerar diagramas com IA</summary>
            <p class="muted-text diagrams-hint">Escolha funcionalidade e módulo. Um prompt abre no Workbench; cole a resposta e aplique.</p>
            ${renderGenControls(project)}
          </details>
          <details class="diagrams-tool">
            <summary>Criar diagrama manualmente</summary>
            <p class="muted-text diagrams-hint">Cole texto de OpenAPI, Mermaid, PlantUML, AsyncAPI ou JSON Schema.</p>
            <button type="button" class="btn tiny primary" id="diagramCreateBtn">Colar novo diagrama</button>
          </details>
        </div>
      </div>
    `;
  }

  function renderCreateModal(project) {
    const types = uiState.registry?.types || [];
    const defaultType = types.find((t) => t.type === 'openapi_spec') || types.find((t) => t.type === 'sequence') || types[0];
    return `
      <div id="diagramCreateModal" class="modal-overlay" role="dialog">
        <div class="modal-card diagram-create-modal">
          <div class="modal-head">
            <h3>Colar diagrama em texto</h3>
            <button type="button" class="btn tiny ghost" id="diagramCreateClose">✕</button>
          </div>
          <p class="muted-text">OpenAPI/YAML, Mermaid, PlantUML, AsyncAPI ou JSON Schema.</p>
          <div class="form-grid compact">
            <label class="full">Título<input id="newDiagramTitle" placeholder="Ex: API Backend — autenticação" /></label>
            <label>Tipo<select id="newDiagramType">${types.map((t) =>
              `<option value="${escapeHtml(t.type)}"${t.type === defaultType?.type ? ' selected' : ''}>${escapeHtml(t.label)}</option>`
            ).join('')}</select></label>
            <label>Notação<select id="newDiagramNotation">${(uiState.registry?.notations || ['openapi', 'mermaid']).map((n) =>
              `<option value="${escapeHtml(n)}">${escapeHtml(uiState.registry?.notationLabels?.[n] || n)}</option>`
            ).join('')}</select></label>
            <label>Módulo<input id="newDiagramModule" value="${escapeHtml(window.PdosUI?.pdosState?.moduleFilter || 'Backend')}" /></label>
            <label class="full">Texto do diagrama<textarea id="newDiagramSource" rows="14" placeholder="Cole aqui o OpenAPI, Mermaid, PlantUML…"></textarea></label>
          </div>
          <div class="modal-actions">
            <button type="button" class="btn ghost" id="diagramCreateCancel">Cancelar</button>
            <button type="button" class="btn primary" id="diagramCreateConfirm">Guardar diagrama</button>
          </div>
        </div>
      </div>
    `;
  }

  function wireShellEvents(project) {
    $('archGenPackBtn')?.addEventListener('click', () => {
      window.PdosUI?.runArchitecturePackGeneration?.(project);
    });
    $('diagramCreateBtn')?.addEventListener('click', () => openCreateModal(project));

    document.querySelectorAll('[data-diagram-copy]').forEach((btn) => {
      btn.addEventListener('click', () => {
        const d = getDiagrams(project).find((x) => x.id === btn.dataset.diagramCopy);
        if (!d?.sourceText) {
          showToast('Diagrama sem texto', 'error');
          return;
        }
        copyText(d.sourceText)
          .then(() => showToast('Texto copiado — cole no editor externo'))
          .catch(() => showToast('Não foi possível copiar', 'error'));
      });
    });
    document.querySelectorAll('[data-diagram-download]').forEach((btn) => {
      btn.addEventListener('click', () => {
        const d = getDiagrams(project).find((x) => x.id === btn.dataset.diagramDownload);
        if (d) downloadDiagramText(d);
      });
    });
    document.querySelectorAll('[data-diagram-recreate]').forEach((btn) => {
      btn.addEventListener('click', () => {
        const d = getDiagrams(project).find((x) => x.id === btn.dataset.diagramRecreate);
        window.PdosUI?.runArchitecturePackGeneration?.(project, {
          moduleTag: d?.module || undefined,
          recreateDiagramId: d?.id,
        });
      });
    });
    document.querySelectorAll('[data-diagram-to-req]').forEach((btn) => {
      btn.addEventListener('click', () => {
        window.PdosUI?.runDiagramToRequirements?.(project, { diagramArtifactId: btn.dataset.diagramToReq });
      });
    });
    document.querySelectorAll('[data-diagram-save]').forEach((btn) => {
      btn.addEventListener('click', () => saveDiagramSource(project, btn.dataset.diagramSave));
    });
  }

  function openCreateModal(project) {
    $('diagramCreateModal')?.remove();
    document.body.insertAdjacentHTML('beforeend', renderCreateModal(project));
    const close = () => $('diagramCreateModal')?.remove();
    $('diagramCreateClose')?.addEventListener('click', close);
    $('diagramCreateCancel')?.addEventListener('click', close);
    $('diagramCreateModal')?.addEventListener('click', (e) => {
      if (e.target.id === 'diagramCreateModal') close();
    });
    $('diagramCreateConfirm')?.addEventListener('click', () => createDiagram(project));
    $('newDiagramTitle')?.focus();
  }

  async function createDiagram(project) {
    const title = ($('newDiagramTitle')?.value || '').trim() || 'Novo diagrama';
    const sourceText = ($('newDiagramSource')?.value || '').trim();
    if (!sourceText) {
      showToast('Cole o texto do diagrama', 'error');
      return;
    }
    const body = {
      title,
      type: $('newDiagramType')?.value || 'openapi_spec',
      notation: $('newDiagramNotation')?.value || 'openapi',
      module: ($('newDiagramModule')?.value || '').trim() || null,
      sourceText,
      phase: 'architecture',
    };
    try {
      const res = await apiRequest(`/projects/${project.id}/diagrams`, { method: 'POST', body });
      state.selectedProject = res.project;
      $('diagramCreateModal')?.remove();
      showToast('Diagrama guardado');
      renderShell(state.selectedProject);
      window.PdosUI?.renderPdosShell?.(state.selectedProject);
    } catch (error) {
      showToast(error.message || 'Erro ao guardar', 'error');
    }
  }

  async function saveDiagramSource(project, diagramId) {
    const ta = document.querySelector(`[data-diagram-source="${diagramId}"]`);
    const sourceText = ta?.value ?? '';
    if (!sourceText.trim()) {
      showToast('Texto vazio', 'error');
      return;
    }
    try {
      const res = await apiRequest(`/projects/${project.id}/diagrams/${diagramId}`, {
        method: 'PATCH',
        body: { sourceText, createVersion: true, changeSummary: 'Edição de texto' },
      });
      mergeDiagram(res.diagram);
      showToast('Diagrama actualizado');
    } catch (error) {
      showToast(error.message, 'error');
    }
  }

  function mergeDiagram(diagram) {
    if (!state.selectedProject || !diagram) return;
    const list = getDiagrams(state.selectedProject);
    const idx = list.findIndex((d) => d.id === diagram.id);
    if (idx >= 0) list[idx] = diagram;
    else list.unshift(diagram);
    state.selectedProject.diagramArtifacts = list;
  }

  async function renderShell(project) {
    const shell = $('pdosDiagramsShell');
    if (!shell) return;
    if (!isArchitectureStage() || !project) {
      shell.classList.add('hidden');
      shell.innerHTML = '';
      return;
    }
    shell.classList.remove('hidden');
    await loadRegistry();
    shell.innerHTML = renderShellContent(project);
    wireShellEvents(project);
  }

  function diagramsForRequirement(project, reqId) {
    return getDiagrams(project).filter((d) => ensureArray(d.linkedRequirementIds).includes(reqId));
  }

  function renderRequirementDiagramLinks(project, reqId) {
    const linked = diagramsForRequirement(project, reqId);
    if (!linked.length) return '';
    return `
      <div class="diagram-req-links full">
        <p class="diagram-meta-label">Diagramas (${linked.length})</p>
        ${linked.map((d) => `
          <button type="button" class="btn tiny ghost diagram-req-link" data-open-diagram="${escapeHtml(d.id)}">
            ${escapeHtml(d.title)} · ${escapeHtml(d.notation || 'texto')}
          </button>
        `).join('')}
      </div>
    `;
  }

  function openDiagramFromRequirement(diagramId) {
    state.deliverySelectedStageId = 'architecture';
    switchToTab?.('deliveryos');
    if (state.selectedProject && window.PdosUI?.renderAll) {
      window.PdosUI.renderAll(state.selectedProject);
    }
    requestAnimationFrame(() => {
      const row = document.getElementById(`diagram-row-${diagramId}`);
      row?.scrollIntoView({ behavior: 'smooth', block: 'center' });
      row?.classList.add('diagram-row-highlight');
      setTimeout(() => row?.classList.remove('diagram-row-highlight'), 2000);
    });
  }

  document.addEventListener('click', (event) => {
    const btn = event.target.closest('[data-open-diagram]');
    if (btn) {
      event.preventDefault();
      openDiagramFromRequirement(btn.dataset.openDiagram);
    }
  });

  window.DiagramsUI = {
    renderShell,
    renderRequirementDiagramLinks,
    diagramsForRequirement,
    openDiagramFromRequirement,
    isArchitectureStage,
    getDiagramCount(project) {
      return getDiagrams(project).length;
    },
  };
})();
