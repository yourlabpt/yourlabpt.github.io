/**
 * Work items — full-screen editor for create/edit; board is browse-only.
 */
(function initWorkItemsUi() {
  const API = '/api/projects';

  const BOARD_STATUSES = [
    { id: 'new', label: 'Novo' },
    { id: 'active', label: 'Em curso' },
    { id: 'closed', label: 'Fechado' },
    { id: 'resolved', label: 'Resolvido' },
  ];

  const ALL_STATUSES = [
    ...BOARD_STATUSES,
    { id: 'blocked', label: 'Bloqueado' },
  ];

  const state = {
    projectId: null,
    items: [],
    meta: null,
    detail: null,
    selectedId: null,
    mode: 'browse',
    view: 'board',
    filtersOpen: false,
    filters: { origin: '', status: '', stage: '', complexity: '', q: '' },
    loaded: false,
    canManage: false,
    canPostUpdate: false,
    canEditUpdate: false,
    editingUpdateId: null,
    saveState: 'idle',
    lastSaveSnapshot: '',
  };

  let saveTimer = null;
  let draftTimer = null;
  let searchTimer = null;

  function $(id) {
    return document.getElementById(id);
  }

  function draftKey(projectId) {
    return `workItemDraft:${projectId}`;
  }

  function loadDraft(projectId) {
    try {
      const raw = sessionStorage.getItem(draftKey(projectId));
      return raw ? JSON.parse(raw) : null;
    } catch {
      return null;
    }
  }

  function saveDraft(projectId, data) {
    sessionStorage.setItem(draftKey(projectId), JSON.stringify(data));
  }

  function clearDraft(projectId) {
    sessionStorage.removeItem(draftKey(projectId));
  }

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
    const headers = { 'Content-Type': 'application/json' };
    const token = window.state?.token || localStorage.getItem('requirements_platform_token');
    if (token) headers.Authorization = `Bearer ${token}`;
    const res = await fetch(`${API}${path}`, {
      method: options.method || 'GET',
      headers,
      body: options.body ? JSON.stringify(options.body) : undefined,
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(data.message || 'Pedido falhou.');
    return data;
  }

  function showToast(message, type) {
    window.showToast?.(message, type);
  }

  function userLabel(userId) {
    if (!userId) return 'Sem responsável';
    const users = window.state?.users || [];
    const hit = users.find((u) => u.id === userId);
    if (hit) return hit.name || hit.email || userId;
    return 'Membro';
  }

  function statusLabel(statusId) {
    return ALL_STATUSES.find((s) => s.id === statusId)?.label || statusId;
  }

  function complexityLabel(c) {
    return ({ low: 'Simples', medium: 'Média', high: 'Complexa' })[c] || '—';
  }

  function originClassLabel(origin) {
    return origin === 'agent' ? 'Agente' : 'Humana';
  }

  function syncModeLayout() {
    const workspace = $('workItemsWorkspace');
    const browse = $('workItemsBrowse');
    const editor = $('workItemEditor');
    const toolbar = $('workItemsToolbar');
    if (!workspace || !browse || !editor) return;
    const editing = state.mode === 'editor' && state.selectedId;
    workspace.classList.toggle('ado-workspace-editing', Boolean(editing));
    browse.classList.toggle('hidden', Boolean(editing));
    editor.classList.toggle('hidden', !editing);
    toolbar?.classList.toggle('ado-toolbar-browse', !editing);
    toolbar?.classList.toggle('ado-toolbar-editor', Boolean(editing));
  }

  function setSaveIndicator(next) {
    state.saveState = next;
    const el = $('workItemEditor')?.querySelector('[data-ado-save-indicator]');
    if (!el) return;
    const labels = {
      idle: '',
      dirty: 'Alterações por guardar…',
      saving: 'A guardar…',
      saved: 'Guardado',
      error: 'Erro ao guardar',
    };
    el.textContent = labels[next] || '';
    el.dataset.state = next;
  }

  function formSnapshot(form) {
    if (!form) return '';
    return JSON.stringify(Object.fromEntries(new FormData(form).entries()));
  }

  function formatWhen(iso) {
    if (!iso) return '';
    try {
      return new Date(iso).toLocaleString('pt-PT', { dateStyle: 'short', timeStyle: 'short' });
    } catch {
      return iso;
    }
  }

  function getMdValue(form, selector) {
    const root = form?.querySelector(selector);
    return root && window.WorkItemsMarkdown ? window.WorkItemsMarkdown.getValue(root) : '';
  }

  function readFormIntoDetail(form) {
    if (!form || !state.detail) return;
    const fd = new FormData(form);
    state.detail = {
      ...state.detail,
      title: fd.get('title') || '',
      descriptionMarkdown: getMdValue(form, '[data-ado-md-mount="description"]') || fd.get('descriptionMarkdown') || '',
      acceptanceCriteriaMarkdown: getMdValue(form, '[data-ado-md-mount="acceptance"]') || fd.get('acceptanceCriteriaMarkdown') || '',
      status: fd.get('status') || state.detail.status,
      assigneeUserId: fd.get('assigneeUserId') || '',
      complexity: fd.get('complexity') || state.detail.complexity,
      deliveryStageId: fd.get('deliveryStageId') || '',
      scheduledStart: fd.get('scheduledStart') || '',
      scheduledEnd: fd.get('scheduledEnd') || '',
    };
  }

  async function fetchMeta(projectId) {
    try {
      const payload = await apiRequest(`/projects/${encodeURIComponent(projectId)}/work-items/meta`);
      state.meta = payload;
      window.workItemsTabMeta = { projectId, ...payload };
      window.renderNavRail?.();
      return payload;
    } catch {
      return null;
    }
  }

  async function fetchList(projectId) {
    const params = new URLSearchParams();
    Object.entries(state.filters).forEach(([key, value]) => {
      if (value) params.set(key, value);
    });
    const qs = params.toString();
    const payload = await apiRequest(
      `/projects/${encodeURIComponent(projectId)}/work-items${qs ? `?${qs}` : ''}`,
    );
    state.items = payload.workItems || [];
    state.canManage = Boolean(payload.canManage);
    state.loaded = true;
    return state.items;
  }

  async function fetchDetail(projectId, workItemId) {
    const payload = await apiRequest(
      `/projects/${encodeURIComponent(projectId)}/work-items/${encodeURIComponent(workItemId)}`,
    );
    state.detail = payload.workItem;
    state.canManage = Boolean(payload.canManage);
    state.canPostUpdate = Boolean(payload.canPostUpdate);
    state.canEditUpdate = Boolean(payload.canEditUpdate);
    return state.detail;
  }

  function renderCard(item) {
    const assignee = item.origin === 'agent'
      ? 'YourLab Agent'
      : userLabel(item.assigneeUserId);
    return `
      <article class="ado-card"
        data-work-item-id="${escapeHtml(item.id)}"
        draggable="${state.canManage ? 'true' : 'false'}">
        <div class="ado-card-type">${escapeHtml(originClassLabel(item.origin))} · ${escapeHtml(statusLabel(item.status))}</div>
        <h4 class="ado-card-title">${escapeHtml(item.title)}</h4>
        <div class="ado-card-foot">
          <span class="ado-card-assignee">${escapeHtml(assignee)}</span>
          <span class="ado-card-cx ado-cx-${escapeHtml(item.complexity)}">${escapeHtml(complexityLabel(item.complexity))}</span>
        </div>
      </article>
    `;
  }

  function renderBoard() {
    const board = $('workItemsBoard');
    if (!board) return;
    board.className = 'ado-board';
    const byStatus = Object.fromEntries(BOARD_STATUSES.map((s) => [s.id, []]));
    state.items.forEach((item) => {
      let bucket = item.status;
      if (bucket === 'blocked') bucket = 'active';
      if (!byStatus[bucket]) bucket = 'new';
      byStatus[bucket].push(item);
    });

    board.innerHTML = BOARD_STATUSES.map((col) => `
      <section class="ado-column" data-status-column="${col.id}">
        <header class="ado-column-head">
          <h3>${escapeHtml(col.label)}</h3>
          <span class="ado-column-count">${byStatus[col.id].length}</span>
        </header>
        <div class="ado-column-body" data-drop-status="${col.id}">
          ${byStatus[col.id].map(renderCard).join('') || '<p class="ado-column-empty">—</p>'}
        </div>
      </section>
    `).join('');
  }

  function renderList() {
    const board = $('workItemsBoard');
    if (!board) return;
    board.className = 'ado-list';
    board.innerHTML = `
      <div class="ado-list-head">
        <span>Tarefa</span>
        <span>Estado</span>
        <span>Responsável</span>
        <span>Tipo</span>
      </div>
      ${state.items.map((item) => `
        <button type="button" class="ado-list-row" data-work-item-id="${escapeHtml(item.id)}">
          <span class="ado-list-title">${escapeHtml(item.title)}</span>
          <span class="ado-list-status">${escapeHtml(statusLabel(item.status))}</span>
          <span class="ado-list-assignee">${item.origin === 'agent' ? 'Agent' : escapeHtml(userLabel(item.assigneeUserId))}</span>
          <span class="ado-list-type">${escapeHtml(originClassLabel(item.origin))}</span>
        </button>
      `).join('') || '<p class="ado-empty">Sem tarefas neste projecto.</p>'}
    `;
  }

  function renderToolbar() {
    const toolbar = $('workItemsToolbar');
    if (!toolbar) return;

    if (state.mode === 'editor' && state.selectedId) {
      const isNew = state.selectedId === '__new__';
      toolbar.innerHTML = `
        <div class="ado-editor-bar">
          <button type="button" class="ado-back-btn" data-ado-close-editor>← Voltar às tarefas</button>
          <div class="ado-editor-bar-right">
            <span class="ado-save-indicator" data-ado-save-indicator data-state="${state.saveState}"></span>
            ${state.canManage && !isNew ? '<button type="button" class="ado-btn-remove-inline" data-ado-delete>Remover</button>' : ''}
            ${state.canManage ? `<button type="button" class="ado-btn-save-inline" data-ado-save-now>${isNew ? 'Criar tarefa' : 'Guardar agora'}</button>` : ''}
          </div>
        </div>
      `;
      setSaveIndicator(state.saveState);
      return;
    }

    const stages = window.state?.config?.deliveryStageFlow || [];
    const activeFilters = Object.values(state.filters).filter(Boolean).length;

    toolbar.innerHTML = `
      <div class="ado-toolbar-main">
        <div class="ado-view-switch" role="tablist">
          <button type="button" class="ado-view-btn ${state.view === 'board' ? 'is-active' : ''}" data-ado-view="board">Board</button>
          <button type="button" class="ado-view-btn ${state.view === 'list' ? 'is-active' : ''}" data-ado-view="list">Lista</button>
        </div>
        <div class="ado-toolbar-search">
          <input type="search" data-ado-filter="q" placeholder="Pesquisar tarefas…" value="${escapeHtml(state.filters.q)}" />
        </div>
        <button type="button" class="ado-filter-toggle ${state.filtersOpen ? 'is-open' : ''}" data-ado-toggle-filters>
          Filtros${activeFilters ? ` (${activeFilters})` : ''}
        </button>
        ${state.canManage ? '<button type="button" class="ado-btn-new" data-ado-new>+ Nova tarefa</button>' : ''}
      </div>
      <div class="ado-toolbar-filters ${state.filtersOpen ? '' : 'hidden'}">
        <select class="ado-field-inline" data-ado-filter="origin">
          <option value="">Tipo: todos</option>
          <option value="human" ${state.filters.origin === 'human' ? 'selected' : ''}>Humana</option>
          <option value="agent" ${state.filters.origin === 'agent' ? 'selected' : ''}>Agente</option>
        </select>
        <select class="ado-field-inline" data-ado-filter="status">
          <option value="">Estado: todos</option>
          ${ALL_STATUSES.map((s) => `<option value="${s.id}" ${state.filters.status === s.id ? 'selected' : ''}>${s.label}</option>`).join('')}
        </select>
        <select class="ado-field-inline" data-ado-filter="stage">
          <option value="">Etapa: todas</option>
          ${stages.map((s) => `<option value="${s.id}" ${state.filters.stage === s.id ? 'selected' : ''}>${escapeHtml(s.label)}</option>`).join('')}
        </select>
        <select class="ado-field-inline" data-ado-filter="complexity">
          <option value="">Complexidade</option>
          <option value="low" ${state.filters.complexity === 'low' ? 'selected' : ''}>Simples</option>
          <option value="medium" ${state.filters.complexity === 'medium' ? 'selected' : ''}>Média</option>
          <option value="high" ${state.filters.complexity === 'high' ? 'selected' : ''}>Complexa</option>
        </select>
      </div>
    `;
  }

  function renderStatusPills(item, editable) {
    const options = item.origin === 'agent'
      ? BOARD_STATUSES
      : [...BOARD_STATUSES, { id: 'blocked', label: 'Bloqueado' }];
    return `
      <div class="ado-status-pills" role="group" aria-label="Estado">
        ${options.map((s) => `
          <button type="button"
            class="ado-status-pill ${item.status === s.id ? 'is-active' : ''}"
            data-ado-status-pick="${s.id}"
            ${editable ? '' : 'disabled'}>
            ${escapeHtml(s.label)}
          </button>
        `).join('')}
      </div>
    `;
  }

  function enterEditorMode() {
    state.mode = 'editor';
    syncModeLayout();
    renderToolbar();
  }

  function leaveEditorMode() {
    state.mode = 'browse';
    state.selectedId = null;
    state.detail = null;
    state.saveState = 'idle';
    state.lastSaveSnapshot = '';
    state.editingUpdateId = null;
    clearTimeout(saveTimer);
    syncModeLayout();
    renderToolbar();
    const editor = $('workItemEditor');
    if (editor) {
      editor.classList.add('hidden');
      editor.innerHTML = '';
    }
  }

  async function openEditor(project, workItemId, seedDetail) {
    state.selectedId = workItemId;
    enterEditorMode();

    const pane = $('workItemEditor');
    if (!pane) return;
    pane.classList.remove('hidden');
    pane.innerHTML = '<p class="ado-empty">A carregar…</p>';

    if (workItemId === '__new__') {
      const draft = loadDraft(project.id);
      state.detail = draft || seedDetail || {
        id: '__new__',
        origin: 'human',
        title: '',
        descriptionMarkdown: '',
        acceptanceCriteriaMarkdown: '',
        updates: [],
        complexity: 'medium',
        status: 'new',
        assigneeUserId: '',
        deliveryStageId: window.state?.deliverySelectedStageId || '',
      };
      state.canManage = true;
      state.canPostUpdate = false;
      state.canEditUpdate = false;
    } else {
      try {
        await fetchDetail(project.id, workItemId);
      } catch (err) {
        pane.innerHTML = `<p class="ado-empty">${escapeHtml(err.message)}</p>`;
        return;
      }
    }

    paintEditor(project);
    state.lastSaveSnapshot = '';
    setSaveIndicator('idle');
    focusEditorTitle();
  }

  function paintEditor(project) {
    const pane = $('workItemEditor');
    if (!pane || !state.detail) return;

    const item = state.detail;
    const editable = state.canManage && item.origin === 'human';
    const stages = window.state?.config?.deliveryStageFlow || [];
    const members = project.members || [];
    const users = window.state?.users || [];

    const assigneeOptions = members.map((m) => {
      const u = users.find((entry) => entry.id === m.userId);
      const label = u?.name || u?.email || m.userId;
      return `<option value="${escapeHtml(m.userId)}" ${item.assigneeUserId === m.userId ? 'selected' : ''}>${escapeHtml(label)}</option>`;
    }).join('');

    pane.innerHTML = `
      <form class="ado-editor-form" data-ado-detail-form>
        <div class="ado-editor-hero">
          <div class="ado-editor-type">Tarefa · ${escapeHtml(originClassLabel(item.origin))}</div>
          <input class="ado-editor-title" name="title" value="${escapeHtml(item.title)}"
            placeholder="Título da tarefa — o que precisa ser feito?"
            ${editable ? '' : 'readonly'} required />
        </div>

        <div class="ado-task-meta">
          <div class="ado-meta-status-row">
            <span class="ado-meta-label">Estado</span>
            ${renderStatusPills(item, editable)}
          </div>
          <div class="ado-meta-fields">
            ${item.origin === 'human' ? `
              <label class="ado-meta-field">
                <span class="ado-meta-label">Responsável</span>
                <select class="ado-meta-control" name="assigneeUserId" ${editable ? '' : 'disabled'}>
                  <option value="">Sem responsável</option>
                  ${assigneeOptions}
                </select>
              </label>
            ` : `
              <div class="ado-meta-field">
                <span class="ado-meta-label">Responsável</span>
                <span class="ado-meta-static">YourLab Agent</span>
              </div>
            `}
            <label class="ado-meta-field">
              <span class="ado-meta-label">Complexidade</span>
              <select class="ado-meta-control" name="complexity" ${editable ? '' : 'disabled'} required>
                <option value="low" ${item.complexity === 'low' ? 'selected' : ''}>Simples</option>
                <option value="medium" ${item.complexity === 'medium' ? 'selected' : ''}>Média</option>
                <option value="high" ${item.complexity === 'high' ? 'selected' : ''}>Complexa</option>
              </select>
            </label>
            <label class="ado-meta-field">
              <span class="ado-meta-label">Etapa</span>
              <select class="ado-meta-control" name="deliveryStageId" ${editable ? '' : 'disabled'}>
                <option value="">—</option>
                ${stages.map((s) => `<option value="${s.id}" ${item.deliveryStageId === s.id ? 'selected' : ''}>${escapeHtml(s.label)}</option>`).join('')}
              </select>
            </label>
            <label class="ado-meta-field">
              <span class="ado-meta-label">Início</span>
              <input class="ado-meta-control" type="date" name="scheduledStart"
                value="${escapeHtml((item.scheduledStart || '').slice(0, 10))}" ${editable ? '' : 'readonly'} />
            </label>
            <label class="ado-meta-field">
              <span class="ado-meta-label">Fim</span>
              <input class="ado-meta-control" type="date" name="scheduledEnd"
                value="${escapeHtml((item.scheduledEnd || '').slice(0, 10))}" ${editable ? '' : 'readonly'} />
            </label>
            ${item.origin === 'agent' && item.executionPlanId ? `
              <div class="ado-meta-field ado-meta-field-action">
                <button type="button" class="ado-meta-action" data-ado-open-delivery>Abrir em Entrega</button>
              </div>
            ` : ''}
          </div>
        </div>

        <section class="ado-editor-section">
          <h3 class="ado-section-title">Descrição</h3>
          <div class="ado-md-editor" data-ado-md-mount="description"></div>
        </section>

        <section class="ado-editor-section">
          <h3 class="ado-section-title">Critérios de aceitação</h3>
          <p class="ado-section-hint">Quando é que esta tarefa se considera concluída?</p>
          <div class="ado-md-editor" data-ado-md-mount="acceptance"></div>
        </section>

        <section class="ado-editor-section ado-updates-section">
          <h3 class="ado-section-title">Actualizações</h3>
          ${state.selectedId === '__new__' ? `
            <p class="ado-section-hint">Guarde a tarefa primeiro para publicar actualizações.</p>
          ` : state.canPostUpdate ? `
            <div class="ado-update-compose">
              <textarea class="ado-update-input" data-ado-update-input rows="4"
                placeholder="O que foi feito, bloqueios, decisões, próximos passos…"></textarea>
              <div class="ado-action-bar">
                <button type="button" class="ado-action-primary" data-ado-update-submit>Publicar actualização</button>
              </div>
            </div>
          ` : '<p class="ado-section-hint">Sem permissão para publicar actualizações.</p>'}
          <div class="ado-update-timeline" data-ado-update-timeline>
            ${renderUpdatesTimeline(item)}
          </div>
        </section>

        ${item.origin === 'agent' && item.resultSummaryMarkdown ? `
          <section class="ado-editor-result">
            <h4>Resultado do agente</h4>
            <div class="ado-result-body">${escapeHtml(item.resultSummaryMarkdown)}</div>
          </section>
        ` : ''}

        <input type="hidden" name="status" value="${escapeHtml(item.status)}" data-ado-status-input />
      </form>
    `;

    state.lastSaveSnapshot = formSnapshot(pane.querySelector('[data-ado-detail-form]'));

    mountEditorFields(project, editable);
    resizeDescription();
  }

  function mountEditorFields(project, editable) {
    const pane = $('workItemEditor');
    if (!pane || !state.detail) return;
    const item = state.detail;

    const descRoot = pane.querySelector('[data-ado-md-mount="description"]');
    window.WorkItemsMarkdown?.mount(descRoot, {
      value: item.descriptionMarkdown || '',
      fieldName: 'descriptionMarkdown',
      placeholder: 'Contexto, objectivo, passos principais, dependências…',
      editable,
      apiRequest,
      onChange: () => scheduleAutoSave(project),
    });
    window.WorkItemsMarkdown?.resize(descRoot);

    const acceptRoot = pane.querySelector('[data-ado-md-mount="acceptance"]');
    window.WorkItemsMarkdown?.mount(acceptRoot, {
      value: item.acceptanceCriteriaMarkdown || '',
      fieldName: 'acceptanceCriteriaMarkdown',
      placeholder: 'Liste condições verificáveis para considerar a tarefa terminada…',
      editable,
      compact: true,
      required: false,
      apiRequest,
      onChange: () => scheduleAutoSave(project),
    });
    window.WorkItemsMarkdown?.resize(acceptRoot, { minHeight: 140 });
  }

  function renderUpdatesTimeline(item) {
    const updates = [...(item?.updates || [])].sort((a, b) => {
      const ta = new Date(a.createdAt || 0).getTime();
      const tb = new Date(b.createdAt || 0).getTime();
      return ta - tb;
    });
    if (!updates.length) {
      return '<p class="ado-update-empty">Ainda sem actualizações nesta tarefa.</p>';
    }
    return updates.map((entry) => {
      const editing = state.editingUpdateId === entry.id;
      return `
        <article class="ado-update-item ${editing ? 'is-editing' : ''}" data-update-id="${escapeHtml(entry.id)}">
          <header class="ado-update-head">
            <div class="ado-update-meta">
              <strong class="ado-update-author">${escapeHtml(userLabel(entry.createdBy))}</strong>
              <time class="ado-update-date">${escapeHtml(formatWhen(entry.createdAt))}</time>
              ${entry.updatedAt && entry.updatedAt !== entry.createdAt
                ? `<span class="ado-update-edited">editado ${escapeHtml(formatWhen(entry.updatedAt))}</span>`
                : ''}
            </div>
            ${state.canEditUpdate ? `<button type="button" class="ado-action-ghost ado-action-small" data-ado-update-edit="${escapeHtml(entry.id)}">Editar</button>` : ''}
          </header>
          <div class="ado-update-body ${editing ? 'hidden' : ''}" data-ado-update-body>${escapeHtml(entry.bodyMarkdown)}</div>
          ${editing ? `
            <div class="ado-update-edit-pane" data-ado-update-edit-pane>
              <textarea class="ado-update-edit-input" data-ado-update-edit-input rows="4">${escapeHtml(entry.bodyMarkdown)}</textarea>
              <div class="ado-action-bar">
                <button type="button" class="ado-action-ghost" data-ado-update-cancel>Cancelar</button>
                <button type="button" class="ado-action-primary" data-ado-update-save="${escapeHtml(entry.id)}">Guardar</button>
              </div>
            </div>
          ` : ''}
        </article>
      `;
    }).join('');
  }

  function refreshUpdatesTimeline() {
    const host = $('workItemEditor')?.querySelector('[data-ado-update-timeline]');
    if (!host || !state.detail) return;
    host.innerHTML = renderUpdatesTimeline(state.detail);
  }

  function resizeDescription() {
    const pane = $('workItemEditor');
    const descRoot = pane?.querySelector('[data-ado-md-mount="description"]');
    const acceptRoot = pane?.querySelector('[data-ado-md-mount="acceptance"]');
    window.WorkItemsMarkdown?.resize(descRoot);
    window.WorkItemsMarkdown?.resize(acceptRoot, { minHeight: 140 });
  }

  function focusEditorTitle() {
    const input = $('workItemEditor')?.querySelector('.ado-editor-title');
    input?.focus();
  }

  async function patchItem(projectId, workItemId, patch) {
    const payload = await apiRequest(
      `/projects/${encodeURIComponent(projectId)}/work-items/${encodeURIComponent(workItemId)}`,
      { method: 'PATCH', body: patch },
    );
    const updated = payload.workItem;
    state.detail = updated;
    const idx = state.items.findIndex((item) => item.id === workItemId);
    if (idx >= 0) {
      state.items[idx] = {
        ...state.items[idx],
        title: updated.title,
        status: updated.status,
        complexity: updated.complexity,
        assigneeUserId: updated.assigneeUserId,
        deliveryStageId: updated.deliveryStageId,
        updatedAt: updated.updatedAt,
        agentStatus: updated.agentStatus,
        origin: updated.origin,
      };
    }
    return updated;
  }

  async function persistEditor(project, { silent = false } = {}) {
    const form = $('workItemEditor')?.querySelector('[data-ado-detail-form]');
    if (!form || !state.canManage) return false;

    const body = Object.fromEntries(new FormData(form).entries());
    if (!body.title?.trim() || !body.descriptionMarkdown?.trim()) {
      if (!silent) showToast('Título e descrição são obrigatórios.', 'error');
      return false;
    }

    setSaveIndicator('saving');
    try {
      if (state.selectedId === '__new__') {
        const payload = await apiRequest(
          `/projects/${encodeURIComponent(project.id)}/work-items`,
          { method: 'POST', body },
        );
        clearDraft(project.id);
        state.items.unshift({ ...payload.workItem, linkedRequirementCount: 0 });
        state.selectedId = payload.workItem.id;
        state.detail = payload.workItem;
        state.canPostUpdate = true;
        state.lastSaveSnapshot = formSnapshot(form);
        setSaveIndicator('saved');
        if (!silent) showToast('Tarefa criada.', 'ok');
        renderToolbar();
        paintEditor(project);
        fetchMeta(project.id);
        refreshBoardView();
        return true;
      }

      await patchItem(project.id, state.selectedId, body);
      state.lastSaveSnapshot = formSnapshot(form);
      setSaveIndicator('saved');
      if (!silent) showToast('Alterações guardadas.', 'ok');
      refreshBoardView();
      fetchMeta(project.id);
      return true;
    } catch (err) {
      setSaveIndicator('error');
      if (!silent) showToast(err.message, 'error');
      return false;
    }
  }

  function scheduleAutoSave(project) {
    const form = $('workItemEditor')?.querySelector('[data-ado-detail-form]');
    if (!form || !state.canManage) return;

    readFormIntoDetail(form);

    if (state.selectedId === '__new__') {
      clearTimeout(draftTimer);
      draftTimer = setTimeout(() => {
        saveDraft(project.id, state.detail);
        setSaveIndicator('dirty');
      }, 400);
      return;
    }

    const snapshot = formSnapshot(form);
    if (snapshot === state.lastSaveSnapshot) return;

    setSaveIndicator('dirty');
    clearTimeout(saveTimer);
    saveTimer = setTimeout(() => persistEditor(project, { silent: true }), 900);
  }

  function refreshBoardView() {
    if (state.mode !== 'browse') return;
    if (state.view === 'board') renderBoard();
    else renderList();
  }

  function wireEvents(project) {
    const root = $('workItemsRoot');
    if (!root || root._adoWired) return;
    root._adoWired = true;

    window.addEventListener('resize', resizeDescription);

    root.addEventListener('click', async (event) => {
      const viewBtn = event.target.closest('[data-ado-view]');
      if (viewBtn) {
        state.view = viewBtn.dataset.adoView;
        renderToolbar();
        refreshBoardView();
        return;
      }

      if (event.target.closest('[data-ado-toggle-filters]')) {
        state.filtersOpen = !state.filtersOpen;
        renderToolbar();
        return;
      }

      if (event.target.closest('[data-ado-new]')) {
        await openEditor(project, '__new__');
        return;
      }

      const row = event.target.closest('[data-work-item-id]');
      if (row) {
        await openEditor(project, row.dataset.workItemId);
        return;
      }

      if (event.target.closest('[data-ado-close-editor]')) {
        const form = $('workItemEditor')?.querySelector('[data-ado-detail-form]');
        if (form && state.canManage) {
          const snapshot = formSnapshot(form);
          if (snapshot !== state.lastSaveSnapshot && state.selectedId !== '__new__') {
            await persistEditor(project, { silent: true });
          }
        }
        leaveEditorMode();
        refreshBoardView();
        return;
      }

      if (event.target.closest('[data-ado-save-now]')) {
        await persistEditor(project);
        return;
      }

      if (event.target.closest('[data-ado-open-delivery]')) {
        window.switchToTab?.('deliveryos');
        return;
      }

      const statusPick = event.target.closest('[data-ado-status-pick]');
      if (statusPick && state.canManage && state.detail) {
        const status = statusPick.dataset.adoStatusPick;
        const input = $('workItemEditor')?.querySelector('[data-ado-status-input]');
        if (input) input.value = status;
        state.detail.status = status;
        statusPick.closest('.ado-status-pills')?.querySelectorAll('.ado-status-pill').forEach((btn) => {
          btn.classList.toggle('is-active', btn.dataset.adoStatusPick === status);
        });
        scheduleAutoSave(project);
        return;
      }

      if (event.target.closest('[data-ado-update-submit]')) {
        const input = $('workItemEditor')?.querySelector('[data-ado-update-input]');
        const bodyMarkdown = input?.value?.trim();
        if (!bodyMarkdown) {
          showToast('Escreva uma actualização antes de publicar.', 'error');
          return;
        }
        if (!state.selectedId || state.selectedId === '__new__') return;
        try {
          const payload = await apiRequest(
            `/projects/${encodeURIComponent(project.id)}/work-items/${encodeURIComponent(state.selectedId)}/updates`,
            { method: 'POST', body: { bodyMarkdown } },
          );
          state.detail = payload.workItem;
          if (input) input.value = '';
          state.editingUpdateId = null;
          refreshUpdatesTimeline();
          showToast('Actualização publicada.', 'ok');
        } catch (err) {
          showToast(err.message, 'error');
        }
        return;
      }

      const editUpdateBtn = event.target.closest('[data-ado-update-edit]');
      if (editUpdateBtn) {
        state.editingUpdateId = editUpdateBtn.dataset.adoUpdateEdit;
        refreshUpdatesTimeline();
        $('workItemEditor')?.querySelector('[data-ado-update-edit-input]')?.focus();
        return;
      }

      if (event.target.closest('[data-ado-update-cancel]')) {
        state.editingUpdateId = null;
        refreshUpdatesTimeline();
        return;
      }

      const saveUpdateBtn = event.target.closest('[data-ado-update-save]');
      if (saveUpdateBtn) {
        const updateId = saveUpdateBtn.dataset.adoUpdateSave;
        const input = $('workItemEditor')?.querySelector('[data-ado-update-edit-input]');
        const bodyMarkdown = input?.value?.trim();
        if (!bodyMarkdown) {
          showToast('A actualização não pode estar vazia.', 'error');
          return;
        }
        try {
          const payload = await apiRequest(
            `/projects/${encodeURIComponent(project.id)}/work-items/${encodeURIComponent(state.selectedId)}/updates/${encodeURIComponent(updateId)}`,
            { method: 'PATCH', body: { bodyMarkdown } },
          );
          state.detail = payload.workItem;
          state.editingUpdateId = null;
          refreshUpdatesTimeline();
          showToast('Actualização guardada.', 'ok');
        } catch (err) {
          showToast(err.message, 'error');
        }
        return;
      }

      if (event.target.closest('[data-ado-delete]') && state.detail?.id && state.detail.id !== '__new__') {
        if (!window.confirm('Remover esta tarefa?')) return;
        try {
          await apiRequest(
            `/projects/${encodeURIComponent(project.id)}/work-items/${encodeURIComponent(state.detail.id)}`,
            { method: 'DELETE' },
          );
          state.items = state.items.filter((item) => item.id !== state.detail.id);
          leaveEditorMode();
          refreshBoardView();
          fetchMeta(project.id);
          showToast('Tarefa removida.', 'ok');
        } catch (err) {
          showToast(err.message, 'error');
        }
      }
    });

    root.addEventListener('change', async (event) => {
      const filter = event.target.closest('[data-ado-filter]');
      if (filter && filter.dataset.adoFilter !== 'q') {
        state.filters[filter.dataset.adoFilter] = filter.value;
        if (state.projectId) {
          await fetchList(state.projectId);
          refreshBoardView();
        }
        return;
      }

      if (event.target.closest('[data-ado-detail-form]')) {
        scheduleAutoSave(project);
      }
    });

    root.addEventListener('input', (event) => {
      const filter = event.target.closest('[data-ado-filter="q"]');
      if (filter) {
        clearTimeout(searchTimer);
        searchTimer = setTimeout(async () => {
          state.filters.q = filter.value;
          if (state.projectId) {
            await fetchList(state.projectId);
            refreshBoardView();
          }
        }, 300);
        return;
      }

      if (event.target.closest('[data-ado-detail-form]')) {
        scheduleAutoSave(project);
      }
    });

    root.addEventListener('submit', async (event) => {
      const form = event.target.closest('[data-ado-detail-form]');
      if (!form) return;
      event.preventDefault();
      await persistEditor(project);
    });

    root.addEventListener('dragstart', (event) => {
      const card = event.target.closest('.ado-card');
      if (!card || !state.canManage || state.mode !== 'browse') return;
      event.dataTransfer.setData('text/plain', card.dataset.workItemId);
    });

    root.addEventListener('dragover', (event) => {
      if (event.target.closest('[data-drop-status]')) event.preventDefault();
    });

    root.addEventListener('drop', async (event) => {
      const col = event.target.closest('[data-drop-status]');
      if (!col || !state.canManage || state.mode !== 'browse') return;
      event.preventDefault();
      const id = event.dataTransfer.getData('text/plain');
      const status = col.dataset.dropStatus;
      if (!id || !status) return;
      try {
        await patchItem(project.id, id, { status });
        refreshBoardView();
      } catch (err) {
        showToast(err.message, 'error');
      }
    });
  }

  async function open(project) {
    if (!project?.id) return;
    const root = $('workItemsRoot');
    if (!root) return;

    if (state.projectId !== project.id) {
      state.projectId = project.id;
      state.loaded = false;
      state.items = [];
      state.filtersOpen = false;
      if (state.mode === 'editor') leaveEditorMode();
    }

    syncModeLayout();
    renderToolbar();

    if (!state.loaded) {
      $('workItemsBoard').innerHTML = '<p class="ado-empty">A carregar tarefas…</p>';
      try {
        await fetchList(project.id);
      } catch (err) {
        $('workItemsBoard').innerHTML = `<p class="ado-empty">${escapeHtml(err.message)}</p>`;
        return;
      }
    }

    refreshBoardView();
    wireEvents(project);
  }

  window.WorkItemsUI = {
    open,
    fetchMeta,
    getMeta() {
      return state.meta;
    },
  };
})();
