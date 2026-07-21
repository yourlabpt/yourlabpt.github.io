/**
 * Work items — full-screen editor for create/edit; board is browse-only.
 */
(function initWorkItemsUi() {
  const API = '/api/projects';

  const ALL_STATUSES = [
    { id: 'planned', label: 'Planeada' }, { id: 'ready', label: 'Pronta' },
    { id: 'in_progress', label: 'Em curso' }, { id: 'waiting_input', label: 'Aguarda informação' },
    { id: 'waiting_review', label: 'Aguarda revisão' }, { id: 'completed', label: 'Concluída' },
    { id: 'failed', label: 'Falhou' }, { id: 'blocked', label: 'Bloqueada' },
    { id: 'cancelled', label: 'Cancelada' },
  ];
  const BOARD_GROUPS = [
    { id: 'planned', label: 'Planeado', statuses: ['planned', 'ready'] },
    { id: 'active', label: 'Em curso', statuses: ['in_progress'] },
    { id: 'attention', label: 'Precisa de atenção', statuses: ['waiting_input', 'waiting_review', 'failed', 'blocked'] },
    { id: 'completed', label: 'Concluído', statuses: ['completed', 'cancelled'] },
  ];

  const state = {
    projectId: null,
    items: [],
    meta: null,
    detail: null,
    detailChildren: [],
    detailRequest: null,
    detailExecution: null,
    detailOrchestration: null,
    detailReview: null,
    detailChangeSets: [],
    suggestions: [],
    automationRules: [],
    selectedIds: new Set(),
    selectedId: null,
    mode: 'browse',
    view: 'priority',
    showCompleted: false,
    agentRequests: [],
    selectedRequest: null,
    selectedRequestTasks: [],
    pendingConnectionTaskId: '',
    pendingConnectionAgentId: '',
    pendingConnectionSettings: null,
    filtersOpen: false,
    filters: { origin: '', status: '', stage: '', planPhaseId: '', executorMode: '', assigneeUserId: '', complexity: '', priority: '', clientVisible: '', q: '' },
    loaded: false,
    canManage: false,
    canPostUpdate: false,
    canEditUpdate: false,
    editingUpdateId: null,
    saveState: 'idle',
    lastSaveSnapshot: '',
    runtimeHealth: null,
  };

  let saveTimer = null;
  let draftTimer = null;
  let searchTimer = null;
  let connectionPollTimer = null;
  let connectionPollScheduled = false;
  let connectionPollInFlight = false;
  let connectionStreamAbort = null;
  let connectionStreamKey = '';
  let executionInteractionUntil = 0;
  let executionPaintTimer = null;
  let executionRequestVersion = 0;
  let executionAppliedVersion = 0;
  let runtimeHealthTimer = null;
  let taskBoardRefreshTimer = null;

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

  async function openRunEventStream(project, runId, taskId) {
    const key = `${runId}:${taskId}`;
    if (connectionStreamKey === key && connectionStreamAbort) return;
    connectionStreamAbort?.abort();
    connectionStreamAbort = new AbortController();
    connectionStreamKey = key;
    const token = window.state?.token || localStorage.getItem('requirements_platform_token');
    try {
      const response = await fetch(`${API}/agent-runs/${encodeURIComponent(runId)}/events/stream`, {
        headers: token ? { Authorization: `Bearer ${token}` } : {},
        signal: connectionStreamAbort.signal,
      });
      if (!response.ok || !response.body) throw new Error('Event stream unavailable');
      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      let buffer = '';
      while (state.selectedId === taskId && connectionStreamKey === key) {
        const chunk = await reader.read();
        if (chunk.done) break;
        buffer += decoder.decode(chunk.value, { stream: true });
        const blocks = buffer.split('\n\n');
        buffer = blocks.pop() || '';
        if (blocks.some((block) => block.includes('event: progress'))) {
          scheduleConnectionPoll(project, runId, taskId, 500);
        }
      }
    } catch (error) {
      if (error?.name === 'AbortError') return;
    } finally {
      if (connectionStreamKey === key && state.selectedId === taskId) {
        connectionStreamAbort = null;
        setTimeout(() => openRunEventStream(project, runId, taskId), 1000);
      }
    }
  }

  function scheduleConnectionPoll(project, runId, taskId, delayMs) {
    if (connectionPollScheduled || state.selectedId !== taskId) return;
    connectionPollScheduled = true;
    connectionPollTimer = setTimeout(() => {
      connectionPollScheduled = false;
      void pollConnectedTask(project, runId, taskId);
    }, Math.max(250, Number(delayMs) || 0));
  }

  function beginExecutionRequest() {
    executionRequestVersion += 1;
    return executionRequestVersion;
  }

  function hasObjectValues(value) {
    return Boolean(value && typeof value === 'object' && Object.keys(value).length);
  }

  function mergeExecutionEvents(previous = [], incoming = []) {
    const eventMap = new Map();
    [...previous, ...incoming].forEach((entry) => {
      const id = Number(entry?.id || entry?._id) || 0;
      const key = id || `${entry?.timestamp || entry?.createdAt || ''}:${entry?.type || ''}:${entry?.message || ''}`;
      eventMap.set(key, entry);
    });
    return [...eventMap.values()]
      .sort((a, b) => {
        const aId = Number(a?.id || a?._id) || 0;
        const bId = Number(b?.id || b?._id) || 0;
        if (aId || bId) return aId - bId;
        return new Date(a?.timestamp || a?.createdAt || 0).getTime()
          - new Date(b?.timestamp || b?.createdAt || 0).getTime();
      })
      .slice(-200);
  }

  function mergeExecutionSnapshot(previous, incoming) {
    if (!incoming) return previous || null;
    if (!previous || (previous.runId && incoming.runId && previous.runId !== incoming.runId)) {
      return { ...incoming, events: mergeExecutionEvents([], incoming.events || []) };
    }
    const previousTime = Date.parse(previous.updatedAt || '') || 0;
    const incomingTime = Date.parse(incoming.updatedAt || '') || 0;
    const stale = previousTime > 0 && incomingTime > 0 && incomingTime < previousTime;
    const events = mergeExecutionEvents(previous.events || [], incoming.events || []);
    if (stale) return { ...previous, events };

    const latestCommand = Number(incoming.latestCommand?.version || 0)
      >= Number(previous.latestCommand?.version || 0)
      ? (incoming.latestCommand || previous.latestCommand || null)
      : previous.latestCommand;
    const preferObject = (next, prior) => hasObjectValues(next) ? next : (prior || {});
    const monotonicNumber = (next, prior) => Math.max(Number(next) || 0, Number(prior) || 0);
    return {
      ...previous,
      ...incoming,
      runId: incoming.runId || previous.runId,
      status: incoming.status || previous.status,
      desiredAction: Object.prototype.hasOwnProperty.call(incoming, 'desiredAction')
        ? incoming.desiredAction
        : (previous.desiredAction || null),
      latestCommand,
      events,
      progressCurrent: monotonicNumber(incoming.progressCurrent, previous.progressCurrent),
      progressTotal: monotonicNumber(incoming.progressTotal, previous.progressTotal),
      tokensUsed: monotonicNumber(incoming.tokensUsed, previous.tokensUsed),
      localTokensUsed: monotonicNumber(incoming.localTokensUsed, previous.localTokensUsed),
      externalTokensUsed: monotonicNumber(incoming.externalTokensUsed, previous.externalTokensUsed),
      costUsed: monotonicNumber(incoming.costUsed, previous.costUsed),
      checkpoint: preferObject(incoming.checkpoint, previous.checkpoint),
      reviewPacket: preferObject(incoming.reviewPacket, previous.reviewPacket),
      hardwareSafety: preferObject(incoming.hardwareSafety, previous.hardwareSafety),
      checkpointBoundary: incoming.checkpointBoundary || previous.checkpointBoundary || '',
      phase: incoming.phase || previous.phase || '',
      createdAt: incoming.createdAt || previous.createdAt || null,
      updatedAt: incoming.updatedAt || previous.updatedAt || null,
    };
  }

  function applyExecutionSnapshot(snapshot, requestVersion) {
    if (requestVersion < executionRequestVersion || requestVersion < executionAppliedVersion) return false;
    executionAppliedVersion = requestVersion;
    state.detailExecution = mergeExecutionSnapshot(state.detailExecution, snapshot);
    return true;
  }

  function showToast(message, type) {
    window.showToast?.(message, type);
  }

  function runtimeStatusMarkup() {
    const configured = window.state?.config?.agentRuntime || {};
    const health = state.runtimeHealth || {};
    const connector = health.connector || configured.connector || null;
    const mode = health.mode || configured.mode || (configured.enabled ? 'local_push' : 'disabled');
    const online = health.runtimeReachable ?? connector?.online ?? false;
    const agents = connector?.capabilities?.agents || connector?.advertisedAgents || [];
    const agentCount = Array.isArray(agents) ? agents.length : 0;
    const name = connector?.name || 'Agent Runtime';
    const version = connector?.runtimeVersion || connector?.version || '';

    let tone = 'checking';
    let label = 'A verificar Agent Runtime…';
    let detail = 'Actualizar estado';
    if (mode === 'remote_pull' && connector && online) {
      tone = 'online';
      label = `${name} ligado`;
      detail = `${agentCount} agente${agentCount === 1 ? '' : 's'}${version ? ` · v${version.replace(/^v/i, '')}` : ''}`;
    } else if (mode === 'remote_pull' && connector) {
      tone = 'offline';
      label = `${name} offline`;
      detail = 'Os pedidos ficam em fila até o runtime voltar';
    } else if (mode === 'remote_pull') {
      tone = 'offline';
      label = 'Nenhum Agent Runtime emparelhado';
      detail = 'Emparelhe um dispositivo nas Definições';
    } else if (configured.enabled && online) {
      tone = 'online';
      label = 'Agent Runtime ligado';
      detail = 'Ligação directa disponível';
    } else if (configured.enabled) {
      tone = 'offline';
      label = 'Agent Runtime indisponível';
      detail = 'Verifique o processo local';
    } else {
      tone = 'offline';
      label = 'Agent Runtime desactivado';
      detail = 'Active-o nas Definições';
    }

    return `
      <div class="ado-runtime-status is-${tone}" role="status" aria-live="polite">
        <span class="ado-runtime-dot" aria-hidden="true"></span>
        <span class="ado-runtime-copy"><strong>${escapeHtml(label)}</strong><small>${escapeHtml(detail)}</small></span>
        <button type="button" data-ado-refresh-runtime aria-label="Actualizar estado do Agent Runtime" title="Actualizar estado">↻</button>
      </div>
    `;
  }

  function paintRuntimeStatus() {
    const current = $('workItemsToolbar')?.querySelector('.ado-runtime-status');
    if (current) current.outerHTML = runtimeStatusMarkup();
    else renderToolbar();
  }

  async function refreshRuntimeHealth(options = {}) {
    try {
      state.runtimeHealth = await apiRequest('/agent-runs/health');
      paintRuntimeStatus();
      if (options.announce) {
        showToast(state.runtimeHealth.runtimeReachable ? 'Agent Runtime ligado' : 'Agent Runtime offline', state.runtimeHealth.runtimeReachable ? 'ok' : 'error');
      }
    } catch (err) {
      if (options.announce) showToast(err.message, 'error');
    }
  }

  function scheduleRuntimeHealthRefresh() {
    clearTimeout(runtimeHealthTimer);
    runtimeHealthTimer = setTimeout(async () => {
      if (window.state?.activeTab === 'tarefas' && document.visibilityState !== 'hidden') {
        await refreshRuntimeHealth();
      }
      scheduleRuntimeHealthRefresh();
    }, 15000);
  }

  function taskBoardSignature(items = state.items) {
    return JSON.stringify((items || []).map((item) => [
      item.id,
      item.status,
      item.agentStatus,
      item.currentAction,
      item.lastMilestone,
      item.progressCurrent,
      item.progressTotal,
      item.updatedAt,
    ]));
  }

  function scheduleTaskBoardRefresh() {
    clearTimeout(taskBoardRefreshTimer);
    taskBoardRefreshTimer = setTimeout(async () => {
      if (
        window.state?.activeTab === 'tarefas'
        && document.visibilityState !== 'hidden'
        && state.loaded
        && state.projectId
      ) {
        const before = taskBoardSignature();
        try {
          await fetchList(state.projectId);
          if (before !== taskBoardSignature() && state.mode === 'browse') {
            refreshBoardView();
          }
        } catch {
          // Keep the current board stable during a transient sync failure.
        }
      }
      scheduleTaskBoardRefresh();
    }, 2000);
  }

  async function pollConnectedTask(project, runId, taskId) {
    clearTimeout(connectionPollTimer);
    connectionPollScheduled = false;
    if (!runId || state.selectedId !== taskId) return;
    if (connectionPollInFlight) {
      scheduleConnectionPoll(project, runId, taskId, 750);
      return;
    }
    connectionPollInFlight = true;
    const requestVersion = beginExecutionRequest();
    void openRunEventStream(project, runId, taskId);
    try {
      const priorEvents = state.detailExecution?.events || [];
      const afterEventId = priorEvents.reduce(
        (max, entry) => Math.max(max, Number(entry.id || entry._id) || 0),
        0
      );
      const eventQuery = afterEventId ? `?afterEventId=${encodeURIComponent(afterEventId)}` : '';
      const payload = await apiRequest(`/agent-runs/${encodeURIComponent(runId)}/status${eventQuery}`);
      const snapshot = {
        runId: payload.agentJob?.id || runId,
        status: payload.dispatch?.status || payload.agentJob?.status || '',
        desiredAction: payload.dispatch?.desiredAction || null,
        latestCommand: payload.dispatch?.latestCommand || null,
        events: payload.events || [],
        progressCurrent: payload.progress?.current ?? payload.agentJob?.subtasksCompleted ?? 0,
        progressTotal: payload.progress?.total ?? payload.agentJob?.subtasksTotal ?? 0,
        tokensUsed: payload.progress?.tokensUsed ?? payload.agentJob?.tokensUsed ?? 0,
        localTokensUsed: payload.progress?.localTokensUsed ?? 0,
        externalTokensUsed: payload.progress?.externalTokensUsed ?? 0,
        costUsed: payload.progress?.costUsed ?? 0,
        maxTokens: payload.progress?.maxTokens ?? payload.agentJob?.budget?.maxTokens ?? 0,
        externalMaxTokens: payload.progress?.externalMaxTokens ?? payload.agentJob?.budget?.externalMaxTokens ?? 0,
        maxCost: payload.progress?.maxCost ?? payload.agentJob?.budget?.maxCost ?? 0,
        maxWallClockMinutes: payload.progress?.maxWallClockMinutes ?? payload.agentJob?.budget?.maxWallClockMinutes ?? 0,
        phase: payload.progress?.phase || '',
        checkpointBoundary: payload.progress?.checkpointBoundary || '',
        hardwareSafety: payload.progress?.hardwareSafety || payload.agentJob?.hardwareSafety || {},
        checkpoint: payload.checkpoint || {},
        reviewPacket: payload.reviewPacket || {},
        bestEffort: payload.progress?.bestEffort === true || payload.agentJob?.bestEffort === true,
        qualityWarnings: payload.progress?.qualityWarnings || payload.agentJob?.qualityWarnings || [],
        error: payload.agentJob?.error || null,
        createdAt: payload.agentJob?.createdAt || state.detailExecution?.createdAt || null,
        updatedAt: payload.dispatch?.updatedAt || payload.agentJob?.updatedAt || null,
      };
      if (state.selectedId !== taskId || !applyExecutionSnapshot(snapshot, requestVersion)) return;
      paintAgentExecution();
      const status = $('workItemEditor')?.querySelector('[data-ado-connection-status]');
      if (status) status.textContent = payload.agentJob?.status === 'pending_human_review' ? 'Resultado recebido. Precisa da sua revisão.' : payload.workItem?.currentAction || `Agente: ${payload.agentJob?.status || 'em execução'}.`;
      if (['pending_human_review', 'completed', 'failed', 'cancelled'].includes(payload.agentJob?.status)) {
        connectionStreamAbort?.abort();
        connectionStreamAbort = null;
        connectionStreamKey = '';
        await fetchDetail(project.id, taskId); paintEditor(project); await fetchList(project.id); return;
      }
      scheduleConnectionPoll(project, runId, taskId, 5000);
    } catch {
      scheduleConnectionPoll(project, runId, taskId, 4000);
    } finally {
      connectionPollInFlight = false;
    }
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
    return ({ agent: 'Agente', platform: 'Plataforma', human: 'Humana' })[origin] || 'Humana';
  }

  function executorLabel(item) {
    if (item.executorMode === 'both') return 'Humano + agente';
    if (item.executorMode === 'agent' || item.origin === 'agent') return item.agentId || item.agentType || 'YourLab Agent';
    return userLabel(item.assigneeUserId);
  }

  function stageLabel(stageId) {
    return (window.state?.config?.deliveryStageFlow || []).find((stage) => stage.id === stageId)?.label || 'Sem etapa';
  }

  function attentionLabel(item) {
    return ({
      waiting_input: 'Precisa de informação', waiting_review: 'Precisa de revisão',
      failed: 'Execução falhou', blocked: 'Está bloqueada', in_progress: 'Agente a trabalhar',
      ready: 'Pronta para começar', planned: 'Aguarda dependências', completed: 'Concluída',
    })[item.status] || statusLabel(item.status);
  }

  function syncModeLayout() {
    const workspace = $('workItemsWorkspace');
    const browse = $('workItemsBrowse');
    const editor = $('workItemEditor');
    const toolbar = $('workItemsToolbar');
    if (!workspace || !browse || !editor) return;
    const editing = (state.mode === 'editor' && state.selectedId) || state.mode === 'plan';
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
      executorMode: fd.get('executorMode') || state.detail.executorMode || 'human',
      assigneeUserId: fd.get('assigneeUserId') || '',
      agentId: fd.get('agentId') || '',
      complexity: fd.get('complexity') || state.detail.complexity,
      priority: fd.get('priority') || '',
      deliveryStageId: fd.get('deliveryStageId') || '',
      planPhaseId: fd.get('planPhaseId') || '',
      parentTaskId: fd.get('parentTaskId') || '',
      clientVisible: fd.get('clientVisible') === 'on',
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
      if (state.mode === 'browse' && state.projectId === projectId) renderToolbar();
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
    params.set('view', state.view === 'priority' ? 'prioritized' : state.view);
    params.set('showCompleted', state.showCompleted ? 'true' : 'false');
    const qs = params.toString();
    const payload = await apiRequest(
      `/projects/${encodeURIComponent(projectId)}/work-items${qs ? `?${qs}` : ''}`,
    );
    state.items = payload.workItems || [];
    state.canManage = Boolean(payload.canManage);
    state.loaded = true;
    return state.items;
  }

  async function fetchAgentRequests(projectId) {
    const payload = await apiRequest(`/projects/${encodeURIComponent(projectId)}/work-items/agent-requests`);
    state.agentRequests = payload.agentRequests || [];
    return state.agentRequests;
  }

  function setTaskRoute({ taskId = '', requestId = '' } = {}) {
    const params = new URLSearchParams(window.location.search);
    if (taskId) params.set('task', taskId); else params.delete('task');
    if (requestId) params.set('agentRequest', requestId); else params.delete('agentRequest');
    params.set('tab', 'tarefas');
    const projectId = state.projectId || window.state?.selectedProject?.id;
    if (!projectId) return;
    const pathname = requestId
      ? `/projects/${encodeURIComponent(projectId)}/tasks/requests/${encodeURIComponent(requestId)}/plan`
      : taskId
        ? `/projects/${encodeURIComponent(projectId)}/tasks/${encodeURIComponent(taskId)}`
        : `/projects/${encodeURIComponent(projectId)}/tasks`;
    const nextUrl = `${pathname}?${params.toString()}${window.location.hash}`;
    if (`${window.location.pathname}${window.location.search}${window.location.hash}` !== nextUrl) {
      window.history?.pushState?.(window.history.state || {}, '', nextUrl);
    }
  }

  function readTaskRoute() {
    const match = window.location.pathname.match(/^\/projects\/([^/]+)\/tasks(?:\/requests\/([^/]+)\/plan|\/([^/]+))?\/?$/);
    if (!match) return { requestId: '', taskId: '' };
    try {
      return { requestId: match[2] ? decodeURIComponent(match[2]) : '', taskId: match[3] ? decodeURIComponent(match[3]) : '' };
    } catch {
      return { requestId: '', taskId: '' };
    }
  }

  async function fetchSuggestions(projectId, evaluate = false) {
    if (!state.canManage) return [];
    const payload = await apiRequest(`/projects/${encodeURIComponent(projectId)}/work-items/suggestions${evaluate ? '/evaluate' : '?status=proposed'}`, evaluate ? { method: 'POST', body: {} } : {});
    state.suggestions = (payload.suggestions || []).filter((entry) => entry.status === 'proposed');
    state.automationRules = payload.automationRules || [];
    return state.suggestions;
  }

  async function fetchDetail(projectId, workItemId) {
    const requestVersion = beginExecutionRequest();
    const payload = await apiRequest(
      `/projects/${encodeURIComponent(projectId)}/work-items/${encodeURIComponent(workItemId)}`,
    );
    state.detail = payload.workItem;
    state.detailChildren = payload.children || [];
    state.detailRequest = payload.agentRequest || null;
    if (requestVersion >= executionRequestVersion && requestVersion >= executionAppliedVersion) {
      executionAppliedVersion = requestVersion;
      state.detailExecution = mergeExecutionSnapshot(state.detailExecution, payload.agentExecution || null);
    }
    state.detailReview = payload.reviewTarget || null;
    state.detailOrchestration = payload.orchestration || null;
    state.canManage = Boolean(payload.canManage);
    state.canPostUpdate = Boolean(payload.canPostUpdate);
    state.canEditUpdate = Boolean(payload.canEditUpdate);
    state.detailChangeSets = [];
    if (window.state?.selectedProject?.featureFlags?.engineering_state_v1) {
      try {
        const engineeringPayload = await apiRequest(
          `/${encodeURIComponent(projectId)}/engineering/change-sets`,
        );
        state.detailChangeSets = (engineeringPayload.changeSets || []).filter(
          (entry) => entry.taskId === workItemId,
        );
      } catch {
        // Engineering is additive; a read failure must not block the existing Task editor.
      }
    }
    return state.detail;
  }

  function renderCard(item) {
    const assignee = executorLabel(item);
    return `
      <article class="ado-card"
        data-work-item-id="${escapeHtml(item.id)}"
        draggable="${state.canManage ? 'true' : 'false'}">
        ${state.canManage ? `<input class="ado-card-select" type="checkbox" data-ado-select="${escapeHtml(item.id)}" ${state.selectedIds.has(item.id) ? 'checked' : ''} aria-label="Seleccionar tarefa" />` : ''}
        <div class="ado-card-type">${escapeHtml(originClassLabel(item.origin))} · ${escapeHtml(statusLabel(item.status))}</div>
        <h4 class="ado-card-title">${escapeHtml(item.title)}</h4>
        <div class="ado-card-foot">
          <span class="ado-card-assignee">${escapeHtml(assignee)}</span>
          <span>${item.clientVisible ? 'Cliente' : 'Interna'}</span>
          <span class="ado-card-cx ado-cx-${escapeHtml(item.complexity)}">${escapeHtml(item.priority || '—')}</span>
        </div>
      </article>
    `;
  }

  function renderBoard() {
    const board = $('workItemsBoard');
    if (!board) return;
    board.className = 'ado-board';
    const byStatus = Object.fromEntries(BOARD_GROUPS.map((s) => [s.id, []]));
    state.items.forEach((item) => {
      const bucket = BOARD_GROUPS.find((group) => group.statuses.includes(item.status))?.id || 'planned';
      byStatus[bucket].push(item);
    });

    board.innerHTML = BOARD_GROUPS.map((col) => `
      <section class="ado-column" data-status-column="${col.id}">
        <header class="ado-column-head">
          <h3>${escapeHtml(col.label)}</h3>
          <span class="ado-column-count">${byStatus[col.id].length}</span>
        </header>
        <div class="ado-column-body">
          ${byStatus[col.id].map(renderCard).join('') || '<p class="ado-column-empty">—</p>'}
        </div>
      </section>
    `).join('');
  }

  function renderList() {
    const board = $('workItemsBoard');
    if (!board) return;
    board.className = 'ado-list';
    const prioritized = state.view === 'priority';
    board.classList.toggle('ado-priority-list', prioritized);
    board.innerHTML = `
      ${prioritized ? '<div class="ado-priority-intro"><strong>O trabalho mais importante aparece primeiro</strong><span>Revisões, pedidos de informação e bloqueios têm prioridade.</span></div>' : ''}
      <div class="ado-list-head ado-list-head-tasks">
        <span></span><span>Tarefa</span><span>Estado</span><span>Responsável</span><span>Etapa</span>
      </div>
      ${state.items.map((item) => `
        <div class="ado-list-row ado-list-row-task ${item.requiresAttention ? 'needs-attention' : ''}" data-work-item-id="${escapeHtml(item.id)}" role="button" tabindex="0">
          <span>${state.canManage ? `<input type="checkbox" data-ado-select="${escapeHtml(item.id)}" ${state.selectedIds.has(item.id) ? 'checked' : ''} aria-label="Seleccionar tarefa" />` : ''}</span>
          <span class="ado-list-title"><strong>${escapeHtml(item.title)}</strong>${item.agentRequestId ? `<small>Plano de agente${item.progressTotal ? ` · ${item.progressCurrent}/${item.progressTotal}` : ''}</small>` : ''}</span>
          <span class="ado-list-status"><span class="ado-status-dot status-${escapeHtml(item.status)}"></span>${escapeHtml(attentionLabel(item))}</span>
          <span class="ado-list-assignee">${escapeHtml(executorLabel(item))}</span>
          <span class="ado-list-type">${escapeHtml(stageLabel(item.deliveryStageId))}${item.priority === 'high' ? '<small>Prioridade alta</small>' : ''}</span>
        </div>
      `).join('') || '<p class="ado-empty">Sem tarefas neste projecto.</p>'}
    `;
  }

  function renderSelectionBar() {
    const el = $('workItemsSelectionBar');
    if (!el) return;
    const count = state.selectedIds.size;
    el.classList.toggle('hidden', !count || !state.canManage);
    el.innerHTML = count ? `<strong>${count} tarefa(s) seleccionada(s)</strong><div><button type="button" class="btn tiny" data-ado-batch-visible="true">Mostrar ao cliente</button><button type="button" class="btn tiny ghost" data-ado-batch-visible="false">Ocultar do cliente</button><button type="button" class="btn tiny ghost" data-ado-clear-selection>Limpar</button></div>` : '';
  }

  function renderSuggestions() {
    const el = $('workItemSuggestions');
    if (!el) return;
    el.classList.toggle('hidden', !state.canManage);
    if (!state.canManage) return;
    const proposedPlans = state.agentRequests.filter((request) =>
      ['awaiting_approval', 'revision_requested'].includes(request.status)
      && request.requestKind !== 'stage_transition'
    );
    el.innerHTML = `
      <div class="ado-suggestions-head">
        <div>
          <span class="ado-suggestions-eyebrow">OPCIONAL E CONTEXTUAL</span>
          <div class="ado-suggestions-title-row">
            <strong>Sugestões de tarefas</strong>
            <span class="ado-suggestions-count">${state.suggestions.length}</span>
          </div>
          <small>Propostas baseadas no estado actual do projecto. Só se tornam tarefas depois da sua confirmação.</small>
        </div>
        <button type="button" class="btn tiny ghost" data-ado-evaluate-suggestions>Actualizar sugestões</button>
      </div>
      ${state.suggestions.length ? `
        <div class="ado-suggestion-list">
          ${state.suggestions.map((suggestion) => `
            <article class="ado-suggestion-card">
              <div><strong>${escapeHtml(suggestion.title)}</strong><p>${escapeHtml(suggestion.reason)}</p></div>
              <div>
                <button type="button" class="btn tiny primary" data-ado-prepare-suggestion="${escapeHtml(suggestion.id)}">Rever e criar</button>
                <button type="button" class="btn tiny ghost" data-ado-dismiss-suggestion="${escapeHtml(suggestion.id)}">Dispensar</button>
              </div>
            </article>
          `).join('')}
        </div>
      ` : '<p class="ado-suggestions-empty">Não existem sugestões úteis para o estado actual do projecto.</p>'}
      ${proposedPlans.length ? `
        <div class="ado-suggestions-head ado-agent-plan-proposals">
          <div>
            <span class="ado-suggestions-eyebrow">AINDA NÃO SÃO TAREFAS ACEITES</span>
            <div class="ado-suggestions-title-row"><strong>Planos propostos por agentes</strong><span class="ado-suggestions-count">${proposedPlans.length}</span></div>
            <small>Ficam fora da lista principal até rever e aprovar o plano.</small>
          </div>
        </div>
        <div class="ado-suggestion-list">
          ${proposedPlans.map((request) => `
            <article class="ado-suggestion-card">
              <div><strong>${escapeHtml(request.title)}</strong><p>${escapeHtml(request.desiredOutcomeMarkdown || request.requestMarkdown || 'Plano de trabalho proposto pelo agente.')}</p></div>
              <div><button type="button" class="btn tiny primary" data-ado-open-agent-plan="${escapeHtml(request.id)}">Rever plano</button></div>
            </article>
          `).join('')}
        </div>
      ` : ''}
    `;
  }

  function renderToolbar() {
    const toolbar = $('workItemsToolbar');
    if (!toolbar) return;

    if (state.mode === 'plan' && state.selectedRequest) {
      toolbar.innerHTML = `<div class="ado-editor-bar"><button type="button" class="ado-back-btn" data-ado-close-plan>← Voltar às tarefas</button><span class="ado-plan-version">Plano v${state.selectedRequest.version || 1}</span></div>${runtimeStatusMarkup()}`;
      return;
    }

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
        ${runtimeStatusMarkup()}
      `;
      setSaveIndicator(state.saveState);
      return;
    }

    const stages = window.state?.config?.deliveryStageFlow || [];
    const project = window.state?.selectedProject || {};
    const phases = project.phases || [];
    const members = project.members || [];
    const activeFilters = Object.values(state.filters).filter(Boolean).length;
    const notifications = state.meta?.notifications || [];
    const notification = notifications[0];

    toolbar.innerHTML = `
      <div class="ado-toolbar-heading">
        <div>
          <span class="ado-toolbar-eyebrow">TRABALHO DO PROJECTO</span>
          <h2>Tarefas${state.meta?.counts?.attention ? ` <span class="ado-attention-count">${state.meta.counts.attention} precisa(m) de atenção</span>` : ''}</h2>
          <p>Veja primeiro o que precisa de si e acompanhe humanos e agentes no mesmo lugar.</p>
        </div>
        ${state.canManage ? '<button type="button" class="ado-btn-new" data-ado-new><span aria-hidden="true">+</span> Nova tarefa</button>' : ''}
      </div>
      ${runtimeStatusMarkup()}
      ${notification ? `
        <aside class="ado-notification-strip" role="status" aria-label="Notificação de trabalho">
          <span class="ado-notification-icon" aria-hidden="true">!</span>
          <div>
            <strong>${escapeHtml(notification.title || 'Uma tarefa precisa de atenção')}</strong>
            <span>${escapeHtml(notification.message || '')}${notifications.length > 1 ? ` · mais ${notifications.length - 1}` : ''}</span>
          </div>
          <button type="button" data-ado-open-notification="${escapeHtml(notification.id)}" data-task-id="${escapeHtml(notification.taskId || '')}" data-request-id="${escapeHtml(notification.agentRequestId || '')}">Abrir</button>
          <button type="button" class="ado-notification-dismiss" data-ado-dismiss-notification="${escapeHtml(notification.id)}" aria-label="Marcar notificação como lida">×</button>
        </aside>` : ''}
      <div class="ado-toolbar-main">
        <div class="ado-view-switch" role="tablist" aria-label="Modo de visualização">
          <button type="button" role="tab" aria-selected="${state.view === 'priority'}" class="ado-view-btn ${state.view === 'priority' ? 'is-active' : ''}" data-ado-view="priority">Prioridades</button>
          <button type="button" role="tab" aria-selected="${state.view === 'board'}" class="ado-view-btn ${state.view === 'board' ? 'is-active' : ''}" data-ado-view="board">Quadro</button>
          <button type="button" role="tab" aria-selected="${state.view === 'list'}" class="ado-view-btn ${state.view === 'list' ? 'is-active' : ''}" data-ado-view="list">Lista</button>
        </div>
        <div class="ado-toolbar-search">
          <span class="ado-search-icon" aria-hidden="true">⌕</span>
          <input type="search" data-ado-filter="q" placeholder="Pesquisar tarefas…" value="${escapeHtml(state.filters.q)}" />
        </div>
        <button type="button" class="ado-filter-toggle ${state.filtersOpen ? 'is-open' : ''}" data-ado-toggle-filters>
          <span aria-hidden="true">≡</span> Filtros${activeFilters ? ` <strong>${activeFilters}</strong>` : ''}
        </button>
        <label class="ado-show-completed"><input type="checkbox" data-ado-show-completed ${state.showCompleted ? 'checked' : ''}> Concluídas</label>
      </div>
      <div class="ado-toolbar-filters ${state.filtersOpen ? '' : 'hidden'}">
        <select class="ado-field-inline" data-ado-filter="origin" aria-label="Filtrar por tipo">
          <option value="">Tipo: todos</option>
          <option value="human" ${state.filters.origin === 'human' ? 'selected' : ''}>Humana</option>
          <option value="agent" ${state.filters.origin === 'agent' ? 'selected' : ''}>Agente</option>
          <option value="platform" ${state.filters.origin === 'platform' ? 'selected' : ''}>Plataforma</option>
        </select>
        <select class="ado-field-inline" data-ado-filter="status" aria-label="Filtrar por estado">
          <option value="">Estado: todos</option>
          ${ALL_STATUSES.map((s) => `<option value="${s.id}" ${state.filters.status === s.id ? 'selected' : ''}>${s.label}</option>`).join('')}
        </select>
        <select class="ado-field-inline" data-ado-filter="stage" aria-label="Filtrar por etapa">
          <option value="">Etapa: todas</option>
          ${stages.map((s) => `<option value="${s.id}" ${state.filters.stage === s.id ? 'selected' : ''}>${escapeHtml(s.label)}</option>`).join('')}
          <option value="unclassified" ${state.filters.stage === 'unclassified' ? 'selected' : ''}>Não classificado</option>
        </select>
        <select class="ado-field-inline" data-ado-filter="planPhaseId" aria-label="Filtrar por fase do plano"><option value="">Fase do plano: todas</option>${phases.map((phase, index) => `<option value="${escapeHtml(phase.id)}" ${state.filters.planPhaseId === phase.id ? 'selected' : ''}>${escapeHtml(phase.name || `Fase ${index + 1}`)}</option>`).join('')}</select>
        <select class="ado-field-inline" data-ado-filter="executorMode" aria-label="Filtrar por executor"><option value="">Executor: todos</option><option value="human" ${state.filters.executorMode === 'human' ? 'selected' : ''}>Humano</option><option value="agent" ${state.filters.executorMode === 'agent' ? 'selected' : ''}>Agente</option><option value="both" ${state.filters.executorMode === 'both' ? 'selected' : ''}>Humano + agente</option></select>
        <select class="ado-field-inline" data-ado-filter="assigneeUserId" aria-label="Filtrar por responsável"><option value="">Responsável: todos</option>${members.map((member) => `<option value="${escapeHtml(member.userId)}" ${state.filters.assigneeUserId === member.userId ? 'selected' : ''}>${escapeHtml(userLabel(member.userId))}</option>`).join('')}</select>
        <select class="ado-field-inline" data-ado-filter="complexity" aria-label="Filtrar por complexidade">
          <option value="">Complexidade</option>
          <option value="low" ${state.filters.complexity === 'low' ? 'selected' : ''}>Simples</option>
          <option value="medium" ${state.filters.complexity === 'medium' ? 'selected' : ''}>Média</option>
          <option value="high" ${state.filters.complexity === 'high' ? 'selected' : ''}>Complexa</option>
        </select>
        <select class="ado-field-inline" data-ado-filter="priority" aria-label="Filtrar por prioridade"><option value="">Prioridade: todas</option><option value="high" ${state.filters.priority === 'high' ? 'selected' : ''}>Alta</option><option value="medium" ${state.filters.priority === 'medium' ? 'selected' : ''}>Média</option><option value="low" ${state.filters.priority === 'low' ? 'selected' : ''}>Baixa</option></select>
        <select class="ado-field-inline" data-ado-filter="clientVisible" aria-label="Filtrar por visibilidade"><option value="">Cliente: todas</option><option value="true" ${state.filters.clientVisible === 'true' ? 'selected' : ''}>Visíveis</option><option value="false" ${state.filters.clientVisible === 'false' ? 'selected' : ''}>Internas</option></select>
      </div>
    `;
  }

  function renderStatusPills(item, editable) {
    const options = item.origin === 'agent'
      ? ALL_STATUSES.filter((status) => !['in_progress', 'waiting_review'].includes(status.id))
      : ALL_STATUSES;
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
    state.selectedRequest = null;
    state.selectedRequestTasks = [];
    state.saveState = 'idle';
    state.lastSaveSnapshot = '';
    state.editingUpdateId = null;
    clearTimeout(saveTimer);
    clearTimeout(connectionPollTimer);
    syncModeLayout();
    renderToolbar();
    const editor = $('workItemEditor');
    if (editor) {
      editor.classList.add('hidden');
      editor.innerHTML = '';
    }
    setTaskRoute();
  }

  function resetBrowseFilters() {
    Object.keys(state.filters).forEach((key) => { state.filters[key] = ''; });
    state.showCompleted = false;
    state.selectedIds.clear();
  }

  async function refreshTasks(project, options = {}) {
    if (!project?.id) return;
    state.projectId = project.id;
    if (options.resetFilters) resetBrowseFilters();
    state.loaded = false;
    await fetchList(project.id);
    await Promise.all([
      fetchMeta(project.id).catch(() => null),
      fetchAgentRequests(project.id).catch(() => []),
      fetchSuggestions(project.id).catch(() => []),
    ]);
    refreshBoardView();
    if (options.openTaskId) await openEditor(project, options.openTaskId);
  }

  async function openEditor(project, workItemId, seedDetail) {
    beginExecutionRequest();
    executionAppliedVersion = executionRequestVersion;
    state.selectedId = workItemId;
    state.detailExecution = null;
    connectionStreamAbort?.abort();
    connectionStreamAbort = null;
    connectionStreamKey = '';
    enterEditorMode();

    const pane = $('workItemEditor');
    if (!pane) return;
    pane.classList.remove('hidden');
    pane.innerHTML = '<p class="ado-empty">A carregar…</p>';

    if (workItemId === '__new__') {
      const draft = loadDraft(project.id);
      state.detail = seedDetail || draft || {
        id: '__new__',
        origin: 'human',
        executorMode: 'human',
        title: '',
        descriptionMarkdown: '',
        acceptanceCriteriaMarkdown: '',
        updates: [],
        complexity: 'medium',
        status: 'planned',
        assigneeUserId: '',
        priority: 'medium', clientVisible: false, planPhaseId: '', parentTaskId: '', sourceRefs: [],
        deliveryStageId: window.state?.deliverySelectedStageId || 'unclassified',
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
    if (state.detail?.agentJobId && [
      'dispatching',
      'queued',
      'claimed',
      'running',
      'planning',
      'executing',
      'self_review',
      'verifying',
      'paused',
      'connection_lost',
      'cancel_requested',
    ].includes(state.detail.agentStatus)) {
      pollConnectedTask(project, state.detail.agentJobId, state.detail.id);
    }
    if (workItemId !== '__new__') setTaskRoute({ taskId: workItemId });
    state.lastSaveSnapshot = '';
    setSaveIndicator('idle');
    focusEditorTitle();
  }

  async function openRequestPlan(project, requestId) {
    state.mode = 'plan';
    state.selectedId = null;
    syncModeLayout();
    renderToolbar();
    const pane = $('workItemEditor');
    if (!pane) return;
    pane.classList.remove('hidden');
    pane.innerHTML = '<p class="ado-empty">A preparar o plano…</p>';
    try {
      const payload = await apiRequest(`/projects/${encodeURIComponent(project.id)}/work-items/agent-requests/${encodeURIComponent(requestId)}`);
      state.selectedRequest = payload.agentRequest;
      state.selectedRequestTasks = payload.workItems || [];
      state.canManage = Boolean(payload.canManage);
      renderToolbar();
      paintRequestPlan(project);
      setTaskRoute({ requestId });
    } catch (err) {
      pane.innerHTML = `<p class="ado-empty">${escapeHtml(err.message)}</p>`;
    }
  }

  function paintRequestPlan(project) {
    const pane = $('workItemEditor');
    const request = state.selectedRequest;
    const tasks = state.selectedRequestTasks || [];
    if (!pane || !request) return;
    const needsApproval = ['awaiting_approval', 'revision_requested'].includes(request.status);
    const riskLabels = { multiple_tasks: 'Várias tarefas', client_visible: 'Visível ao cliente', external_impact: 'Impacto externo', sensitive_data: 'Dados sensíveis', irreversible_change: 'Alteração difícil de reverter', high_budget: 'Orçamento elevado', human_review: 'Revisão humana' };
    pane.innerHTML = `
      <article class="ado-plan-review">
        <header class="ado-plan-hero">
          <span class="ado-editor-type">PLANO DE TRABALHO DO AGENTE</span>
          <h2>${escapeHtml(request.title)}</h2>
          <p>${escapeHtml(request.requestMarkdown || 'Pedido de trabalho ao agente.')}</p>
        </header>
        <section class="ado-plan-summary-grid">
          <div><span>Resultado esperado</span><strong>${escapeHtml(request.desiredOutcomeMarkdown || 'Outputs definidos nas tarefas')}</strong></div>
          <div><span>Plano</span><strong>${tasks.length} tarefa(s)</strong></div>
          <div><span>Impacto</span><strong>${escapeHtml(request.risk?.level === 'high' ? 'Elevado' : request.risk?.level === 'medium' ? 'Moderado' : 'Baixo')}</strong></div>
          <div><span>Decisão</span><strong>${needsApproval ? 'Precisa da sua aprovação' : 'Aprovado para executar'}</strong></div>
        </section>
        <section class="ado-plan-sequence">
          <div class="ado-section-heading"><div><h3>Como o agente vai trabalhar</h3><p>Unidades de trabalho significativas, na ordem em que serão executadas.</p></div></div>
          <ol>${tasks.map((task, index) => `
            <li>
              <span class="ado-plan-step">${index + 1}</span>
              <div><strong>${escapeHtml(task.title)}</strong><p>${escapeHtml(task.expectedOutputs?.[0]?.label || task.acceptanceCriteriaMarkdown || 'Produzir o resultado esperado.')}</p><small>${escapeHtml(executorLabel(task))}${task.dependencyTaskIds?.length ? ` · depende de ${task.dependencyTaskIds.length} tarefa(s)` : ''}${task.reviewRequired ? ' · revisão humana' : ''}</small></div>
              <div class="ado-plan-task-tools"><span class="ado-plan-task-status">${escapeHtml(statusLabel(task.status))}</span>${needsApproval && state.canManage ? `<span><button type="button" data-ado-plan-move="up" data-task-id="${escapeHtml(task.id)}" aria-label="Mover para cima" ${index === 0 ? 'disabled' : ''}>↑</button><button type="button" data-ado-plan-move="down" data-task-id="${escapeHtml(task.id)}" aria-label="Mover para baixo" ${index === tasks.length - 1 ? 'disabled' : ''}>↓</button><button type="button" data-ado-plan-remove data-task-id="${escapeHtml(task.id)}" aria-label="Remover tarefa" ${tasks.length === 1 ? 'disabled' : ''}>×</button></span>` : ''}</div>
            </li>`).join('')}</ol>
        </section>
        ${needsApproval && state.canManage ? `<section class="ado-plan-decision"><div><strong>O plano está pronto para a sua decisão.</strong><p>A execução só começa depois da aprovação.</p></div><button type="button" class="ado-action-primary" data-ado-approve-plan>Aprovar e iniciar</button><button type="button" class="ado-action-ghost" data-ado-revise-plan>Pedir revisão do plano</button></section>` : ''}
        ${!needsApproval && request.status === 'ready' && state.canManage ? `<section class="ado-plan-decision"><div><strong>Plano aprovado.</strong><p>A primeira tarefa pronta pode ser iniciada.</p></div><button type="button" class="ado-action-primary" data-ado-start-plan>Iniciar trabalho</button></section>` : ''}
        <details class="ado-advanced-details"><summary>Mais detalhes</summary><div class="ado-advanced-grid"><p><strong>Agente</strong><br>${escapeHtml(request.agentId || request.agentType)}</p><p><strong>Etapa</strong><br>${escapeHtml(stageLabel(request.deliveryStageId))}</p><p><strong>Motivos de controlo</strong><br>${escapeHtml((request.risk?.flags || []).map((flag) => riskLabels[flag] || flag).join(', ') || 'Rotina de baixo risco')}</p><p><strong>ID rastreável</strong><br>${escapeHtml(request.id)}</p></div></details>
      </article>`;
  }

  async function startApprovedRequest(project, request) {
    const tasks = state.selectedRequestTasks || [];
    const requestedTask = state.pendingConnectionTaskId
      ? tasks.find((entry) => entry.id === state.pendingConnectionTaskId)
      : null;
    const task = requestedTask?.status === 'ready'
      ? requestedTask
      : tasks.find((entry) => entry.taskRole !== 'coordination' && entry.status === 'ready')
        || tasks.find((entry) => entry.status === 'ready');
    const taskId = task?.id;
    if (!taskId) throw new Error('O plano foi aprovado, mas ainda não existe uma tarefa pronta para iniciar.');
    const payload = await apiRequest('/agent-runs', {
      method: 'POST',
      body: { projectId: project.id, agentId: state.pendingConnectionAgentId || request.agentId, agentType: request.agentType, agentRequestId: request.id, workItemId: taskId },
    });
    if (payload.requiresApproval) throw new Error('O plano ainda precisa de aprovação.');
    await fetchList(project.id);
    await fetchAgentRequests(project.id).catch(() => []);
    const openedTaskId = payload.workItem?.id || taskId;
    state.pendingConnectionTaskId = '';
    state.pendingConnectionAgentId = '';
    if (openedTaskId) await openEditor(project, openedTaskId);
    showToast('O agente iniciou a primeira tarefa.', 'ok');
  }

  function renderAgentExecution() {
    const execution = state.detailExecution;
    if (!execution) return '<p class="ado-agent-log-empty">A execução ainda não produziu eventos.</p>';
    const events = execution.events || [];
    const rawStatus = String(execution.status || 'queued').toLowerCase();
    const desiredAction = String(execution.desiredAction || '').toLowerCase();
    const latestAction = String(execution.latestCommand?.action || '').toLowerCase();
    const activeStatuses = new Set(['claimed', 'running', 'planning', 'researching', 'executing', 'self_review', 'verifying']);
    const status = desiredAction === 'pause'
      || (latestAction === 'pause' && activeStatuses.has(rawStatus))
      ? 'pausing'
      : desiredAction === 'cancel'
        ? 'cancel_requested'
        : desiredAction === 'resume' && rawStatus === 'paused'
          ? 'reconnecting'
          : rawStatus;
    const current = Number(execution.progressCurrent) || 0;
    const total = Number(execution.progressTotal) || 0;
    const progress = total ? Math.min(100, Math.round((current / total) * 100)) : 0;
    const latestGoal = [...events].reverse().find((event) => event.type === 'goal_check');
    const goalMet = Number(latestGoal?.data?.met) || 0;
    const goalTotal = Number(latestGoal?.data?.total) || 0;
    const active = ['claimed', 'running', 'planning', 'executing', 'self_review', 'verifying'].includes(status);
    const cancellable = !['completed', 'failed', 'cancelled', 'waiting_review', 'pending_human_review'].includes(status);
    const reviewPacket = execution.reviewPacket || {};
    const checkpoint = execution.checkpoint || {};
    const hardware = execution.hardwareSafety || checkpoint.budgetState?.hardwareSafety || {};
    const hardwareAssessment = hardware.assessment || {};
    const hardwareSnapshot = hardwareAssessment.snapshot || {};
    const hardwareReasons = Array.isArray(hardwareAssessment.reasons)
      ? hardwareAssessment.reasons
      : [];
    const reviewChecklist = Array.isArray(reviewPacket.acceptanceChecklist)
      ? reviewPacket.acceptanceChecklist
      : [];
    const reviewExceptions = reviewChecklist.filter((criterion) =>
      !['passed', 'waived'].includes(String(criterion.status || '').toLowerCase())
    );
    const reviewScopeCount = Array.isArray(reviewPacket.scopeCompleted)
      ? reviewPacket.scopeCompleted.length
      : Number(reviewPacket.scopeCompleted || 0);
    const reviewArtifacts = Array.isArray(reviewPacket.artifacts)
      ? reviewPacket.artifacts.length
      : 0;
    const reviewVerifications = Array.isArray(reviewPacket.verificationResults)
      ? reviewPacket.verificationResults.length
      : 0;
    const statusLabels = {
      queued: 'Na fila', claimed: 'Recebida pelo runtime', running: 'Em execução',
      planning: 'A planear', executing: 'A executar', self_review: 'Em verificação',
      researching: 'Em investigação', verifying: 'Em verificação', pausing: 'A pausar',
      paused: 'Em pausa', cancel_requested: 'A cancelar', reconnecting: 'A retomar',
      connection_lost: 'Ligação perdida', waiting_review: 'Aguarda avaliação',
      pending_human_review: 'Aguarda avaliação', completed: 'Concluída',
      failed: 'Falhou', blocked: 'Bloqueada', budget_exhausted: 'Limite atingido',
      cancelled: 'Cancelada',
    };
    const eventLabels = {
      planning: 'Plano de execução', info: 'Actualização', goal_set: 'Critérios de sucesso',
      subtask_started: 'Passo iniciado', subtask_done: 'Passo concluído',
      goal_check: 'Verificação dos critérios', goal_gap: 'Correcção planeada',
      replanning: 'Replaneamento', token_usage: 'Consumo actualizado',
      llm_request: 'Modelo iniciado', llm_response: 'Modelo respondeu',
      peer_review: 'Revisão independente', paused: 'Execução pausada',
      failed: 'Falha', completed: 'Execução concluída', review_ready: 'Pronto para avaliação',
      wave_started: 'Fase iniciada', wave_done: 'Fase concluída',
      run_created: 'Execução durável criada', attempt_claimed: 'Worker assumiu a execução',
      provider_request_started: 'Modelo iniciou o passo',
      provider_response_received: 'Modelo terminou o passo',
      action_proposed: 'Próxima ação delimitada',
      checkpoint_committed: 'Checkpoint persistido',
      tool_call_completed: 'Ferramenta concluída',
      side_effect_started: 'Alteração preparada',
      side_effect_committed: 'Alteração confirmada',
      artifact_created: 'Artefacto produzido',
      criterion_evaluated: 'Critério avaliado',
      step_completed: 'Passo durável concluído',
      run_waiting_review: 'Pronto para revisão humana',
      run_budget_exhausted: 'Limite atingido com checkpoint',
      worker_failed: 'Worker encontrou uma falha',
      hardware_assessed: 'Segurança do Mac verificada',
      resource_guard_paused: 'Pausa de proteção do Mac',
      provider_timeout: 'Modelo excedeu o tempo seguro',
      provider_action_rejected: 'Ação do modelo rejeitada',
      run_blocked: 'Execução bloqueada',
      best_effort_review_submitted: 'Resultado parcial enviado para revisão',
    };
    const errorEventTypes = new Set([
      'failed', 'worker_failed', 'provider_action_rejected', 'run_blocked',
    ]);
    const warningEventTypes = new Set([
      'paused', 'resource_guard_paused', 'provider_timeout', 'run_budget_exhausted',
    ]);
    const eventToneClass = (event) => (
      errorEventTypes.has(event.type)
        ? ' is-error'
        : warningEventTypes.has(event.type)
          ? ' is-warning'
          : ''
    );
    const describeEvent = (event) => {
      const data = event.data || {};
      if (event.type === 'goal_check') {
        return `${data.met ?? '?'} de ${data.total ?? '?'} critérios satisfeitos${data.feedback ? ` — ${data.feedback}` : ''}`;
      }
      if (event.type === 'goal_set' && Array.isArray(data.goals)) {
        return data.goals.map((goal) => goal.title).filter(Boolean).join(' · ');
      }
      if (['subtask_started', 'subtask_done'].includes(event.type)) {
        const position = data.step && data.total ? `Passo ${data.step}/${data.total}: ` : '';
        const tokens = event.type === 'subtask_done' && data.tokens
          ? ` · ${Number(data.tokens).toLocaleString('pt-PT')} tokens`
          : '';
        return `${position}${event.message || 'Passo do plano'}${tokens}`;
      }
      if (event.type === 'planning' && Array.isArray(data.tasks)) {
        return `${data.tasks.length} passos: ${data.tasks.join(' → ')}`;
      }
      if (event.type === 'token_usage') {
        return `${Number(data.tokensUsed || data.tokens || 0).toLocaleString('pt-PT')} tokens utilizados`;
      }
      if (event.type === 'llm_request') {
        return `A processar com ${data.tier || 'modelo'}${data.model ? ` / ${data.model}` : ''}`;
      }
      if (event.type === 'llm_response') {
        return `Resposta recebida${data.tokens ? ` · ${Number(data.tokens).toLocaleString('pt-PT')} tokens` : ''}${data.summary ? ` — ${data.summary}` : ''}`;
      }
      if (event.type === 'hardware_assessed') {
        const snapshot = data.snapshot || {};
        return `${data.safe === false ? 'Execução local bloqueada' : 'Recursos disponíveis'} · memória ${Number(snapshot.availableMemoryPercent || 0).toFixed(0)}% · térmico ${snapshot.thermalState || 'desconhecido'}${data.reasons?.length ? ` — ${data.reasons.join('; ')}` : ''}`;
      }
      if (event.type === 'resource_guard_paused' || event.type === 'provider_timeout') {
        return data.message || 'A execução foi interrompida e guardada num checkpoint seguro.';
      }
      return event.message || event.summary || event.detail || '';
    };
    return `
      <div class="ado-agent-command-center">
        <div class="ado-agent-log-head">
          <span class="ado-agent-log-status">${escapeHtml(statusLabels[status] || status)}</span>
          <small>${events.length} evento${events.length === 1 ? '' : 's'} recentes · ${Number(execution.tokensUsed || 0).toLocaleString('pt-PT')} tokens · ${Number(execution.maxTokens) > 0 ? `limite ${Number(execution.maxTokens).toLocaleString('pt-PT')}` : 'tokens locais sem limite'}${execution.updatedAt ? ` · sync ${escapeHtml(formatWhen(execution.updatedAt))}` : ''}</small>
        </div>
        <div class="ado-agent-goals">
          <span>Uso local <strong>${Number(execution.localTokensUsed || 0).toLocaleString('pt-PT')}</strong></span>
          <span>Uso externo <strong>${Number(execution.externalTokensUsed || 0).toLocaleString('pt-PT')}${execution.externalMaxTokens ? ` / ${Number(execution.externalMaxTokens).toLocaleString('pt-PT')}` : ''}</strong></span>
          <span>Custo <strong>€${Number(execution.costUsed || 0).toFixed(2)}${execution.maxCost ? ` / €${Number(execution.maxCost).toFixed(2)}` : ''}</strong></span>
        </div>
        ${hardwareSnapshot.capturedAt ? `<section class="${hardwareAssessment.safe === false ? 'ado-agent-quality-warning' : 'ado-advanced-details'}"><strong>Proteção do Mac · ${hardwareAssessment.safe === false ? 'execução pausada' : 'recursos seguros'}</strong><p>${escapeHtml(hardwareSnapshot.model || 'Apple Silicon')} · memória disponível ${Number(hardwareSnapshot.availableMemoryPercent || 0).toFixed(0)}% · térmico ${escapeHtml(hardwareSnapshot.thermalState || 'desconhecido')}${hardwareAssessment.estimatedInputTokens ? ` · contexto estimado ${Number(hardwareAssessment.estimatedInputTokens).toLocaleString('pt-PT')} tokens` : ''}</p>${hardwareReasons.length ? `<ul>${hardwareReasons.map((reason) => `<li>${escapeHtml(reason)}</li>`).join('')}</ul>` : ''}${hardware.cooldownUntil ? `<small>Cooldown até ${escapeHtml(formatWhen(hardware.cooldownUntil))}.</small>` : ''}</section>` : ''}
        ${total ? `<div class="ado-agent-progress"><div><span>Progresso</span><strong>${current}/${total} passos · ${progress}%</strong></div><progress max="100" value="${progress}"></progress></div>` : ''}
        ${goalTotal ? `<div class="ado-agent-goals"><span>Critérios verificados</span><strong>${goalMet}/${goalTotal}</strong></div>` : ''}
        ${Object.keys(checkpoint).length ? `<details class="ado-advanced-details"><summary>Último checkpoint${execution.checkpointBoundary ? ` · ${escapeHtml(execution.checkpointBoundary)}` : ''}</summary><p>${escapeHtml(checkpoint.contextSummary || checkpoint.boundary || 'Estado persistido e pronto para continuação.')}</p>${Array.isArray(checkpoint.completedStepIds) ? `<small>${checkpoint.completedStepIds.length} passo(s) persistidos.</small>` : ''}</details>` : ''}
        ${Object.keys(reviewPacket).length ? `<section class="ado-agent-quality-warning"><strong>Pacote de revisão · ${reviewExceptions.length ? `${reviewExceptions.length} exceção(ões)` : 'sem exceções'}</strong><p>${escapeHtml(reviewPacket.outcomeSummary || 'Resultado preparado para avaliação.')}</p>${reviewExceptions.length ? `<ul>${reviewExceptions.slice(0, 5).map((criterion) => `<li><strong>${escapeHtml(criterion.description || criterion.id || 'Critério')}</strong> — ${escapeHtml(criterion.detail || criterion.status || 'sem evidência')}</li>`).join('')}</ul>` : ''}<small>${reviewScopeCount} passo(s) · ${reviewChecklist.length} critério(s) · ${reviewArtifacts} artefacto(s) · ${reviewVerifications} verificação(ões)${Array.isArray(reviewPacket.risksAndUncertainties) ? ` · ${reviewPacket.risksAndUncertainties.length} risco(s)` : ''}</small></section>` : ''}
        ${execution.bestEffort ? `<div class="ado-agent-quality-warning"><strong>Resultado disponível para decisão humana</strong><p>O agente atingiu o limite de correções e enviou o melhor resultado produzido. Reveja os avisos antes de aprovar.</p>${(execution.qualityWarnings || []).length ? `<ul>${execution.qualityWarnings.map((warning) => `<li>${escapeHtml(warning)}</li>`).join('')}</ul>` : ''}</div>` : ''}
        ${desiredAction ? `<p class="ado-agent-control-pending">Comando pendente: ${escapeHtml(({ pause: 'pausar', resume: 'continuar', cancel: 'cancelar', finish_partial: 'enviar progresso para avaliação', sync_now: 'sincronizar agora' })[desiredAction] || desiredAction)}</p>` : ''}
        ${execution.error ? `<p class="ado-agent-error">${escapeHtml(execution.error)}</p>` : ''}
        ${state.canManage ? `<div class="ado-action-bar ado-agent-controls">
          ${active && !desiredAction ? '<button type="button" class="ado-action-ghost" data-ado-run-control="pause">Pausar no próximo checkpoint</button>' : ''}
          ${status === 'paused' && !desiredAction ? '<button type="button" class="ado-action-primary" data-ado-run-control="resume">Continuar</button><button type="button" class="ado-action-ghost" data-ado-run-control="finish-partial">Enviar progresso para avaliação</button>' : ''}
          ${['blocked', 'budget_exhausted'].includes(status) && !desiredAction ? '<button type="button" class="ado-action-ghost" data-ado-run-control="finish-partial">Enviar checkpoint para avaliação</button>' : ''}
          ${['failed', 'blocked', 'budget_exhausted', 'connection_lost', 'cancelled'].includes(status) ? `<button type="button" class="ado-action-primary" data-ado-run-control="retry">${status === 'cancelled' ? 'Reiniciar do último checkpoint' : 'Retomar do último checkpoint'}</button>` : ''}
          ${['waiting_review', 'pending_human_review'].includes(status) ? '<button type="button" class="ado-action-primary" data-ado-focus-review>Avaliar resultado</button>' : ''}
          ${!desiredAction && !['completed', 'cancelled'].includes(status) ? '<button type="button" class="ado-action-ghost" data-ado-run-control="sync-now">Sincronizar agora</button>' : ''}
          ${cancellable && desiredAction !== 'cancel' ? '<button type="button" class="ado-action-danger" data-ado-run-control="cancel">Cancelar execução</button>' : ''}
          ${!['completed', 'cancelled', 'waiting_review', 'pending_human_review'].includes(status) ? '<button type="button" class="ado-action-danger" data-ado-run-control="abandon">Terminar e desbloquear</button>' : ''}
        </div>` : ''}
      </div>
      <div class="ado-agent-log-list">
        ${events.length ? events.map((event) => `
          <article class="ado-agent-log-entry${eventToneClass(event)}">
            <time>${escapeHtml(formatWhen(event.timestamp || event.createdAt))}</time>
            <div><strong>${escapeHtml(eventLabels[event.type] || event.type || 'Evento')}</strong><p>${escapeHtml(describeEvent(event))}</p></div>
          </article>
        `).join('') : '<p class="ado-agent-log-empty">O pedido está na fila; os eventos aparecerão quando o agente iniciar.</p>'}
      </div>
    `;
  }

  function renderOrchestrationBar(orchestration, options = {}) {
    const orch = orchestration || {};
    const runtimeConfig = window.state?.config?.agentRuntime || {};
    const agentUnavailableReason = runtimeConfig.mode === 'remote_pull' && !runtimeConfig.enabled
      ? 'Nenhum Agent Runtime está emparelhado. Configure em Agentes.'
      : runtimeConfig.mode === 'disabled'
        ? 'A execução por agente está desativada.'
        : '';
    const chip = orch.statusChip || { label: '—', tone: 'planned' };
    const action = orch.availableAction || 'none';
    const disabled = action === 'none' || Boolean(agentUnavailableReason);
    const disabledAttr = disabled
      ? `disabled title="${escapeHtml(agentUnavailableReason || orch.blockingReason || '')}"`
      : '';
    const primaryButton = action !== 'none'
      ? `<button type="button" class="ado-action-primary" data-ado-orchestration="${escapeHtml(action)}" ${disabledAttr}>${escapeHtml(orch.label || 'Executar')}</button>`
      : '';
    const runLink = orch.currentRunId
      ? `<button type="button" class="ado-action-ghost" data-ado-open-execution>Abrir execução</button>`
      : '';
    const adminLink = options.showAdminLink !== false
      ? `<button type="button" class="ado-action-ghost" data-ado-goto-agents>Definições de agentes</button>`
      : '';
    return `
      <div class="ado-orchestration-bar" data-orchestration-respects-pause="${orch.respectsPauseForSubtaskReview === true}">
        <span class="ado-exec-status-chip tone-${escapeHtml(chip.tone)}">${escapeHtml(chip.label)}</span>
        <div class="ado-action-bar">${primaryButton}${runLink}${adminLink}</div>
      </div>
      ${orch.blockingReason ? `<p class="ado-section-hint">${escapeHtml(orch.blockingReason)}</p>` : ''}
      <div class="ado-agent-connection-pane hidden" data-ado-connection-pane>
        <p data-ado-connection-status>A verificar o Agent Runtime…</p>
        <div data-ado-connection-details></div>
      </div>
    `;
  }

  async function prepareAgentConnection(project, taskId) {
    const pane = $('workItemEditor')?.querySelector('[data-ado-connection-pane]');
    const status = pane?.querySelector('[data-ado-connection-status]');
    const details = pane?.querySelector('[data-ado-connection-details]');
    pane?.classList.remove('hidden');
    if (status) status.textContent = 'A verificar ligação, competências e ferramentas…';
    if (details) details.innerHTML = '';
    const payload = await apiRequest(
      `/projects/${encodeURIComponent(project.id)}/work-items/${encodeURIComponent(taskId)}/agent-connection/prepare`,
    );
    if (!payload.selectedAgentId) {
      throw new Error('O runtime ainda não publicou um agente para esta tarefa. Sincronize o runtime e tente novamente.');
    }
    state.detailOrchestration = payload.orchestration || state.detailOrchestration;
    state.pendingConnectionTaskId = taskId;
    state.pendingConnectionAgentId = payload.selectedAgentId;
    state.pendingConnectionSettings = payload.settings || null;
    const sendLabel = payload.scope === 'tree' || state.detailOrchestration?.scope === 'tree'
      ? 'Executar plano completo'
      : 'Enviar esta tarefa ao agente';
    if (status) status.textContent = payload.contextSummary;
    if (details) {
      details.innerHTML = `<div class="ado-agent-match"><label>${payload.compatibilityPending ? 'Agente selecionado (capacidades a sincronizar)' : 'Agente compatível'}<select data-ado-agent-select>${(payload.agents || []).filter((agent) => agent.compatible || agent.id === payload.selectedAgentId).map((agent) => `<option value="${escapeHtml(agent.id)}" ${agent.id === payload.selectedAgentId ? 'selected' : ''}>${escapeHtml(agent.name)}${agent.compatible ? '' : ' — a sincronizar'}</option>`).join('')}</select></label>${payload.compatibilityPending ? `<p class="ado-agent-control-pending">O pedido pode entrar na fila agora. Só será reclamado quando o runtime confirmar: ${escapeHtml((payload.compatibilityPendingReasons || []).join(', '))}.</p>` : ''}<p><strong>Competências:</strong> ${escapeHtml((payload.requiredSkills || []).join(', ') || 'Contexto geral')}</p><p><strong>Ferramentas MCP:</strong> ${escapeHtml((payload.requiredMcpTools || []).join(', ') || 'Sem ferramentas adicionais')}</p><button type="button" class="ado-action-primary" data-ado-send-agent>${escapeHtml(sendLabel)}</button></div>`;
    }
    pane?.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
    return payload;
  }

  async function handleOrchestrationAction(project, action) {
    const orch = state.detailOrchestration || {};
    const taskId = orch.targetWorkItemId || state.detail?.id;
    if (!taskId || !state.detail) return;
    if (action === 'approve_plan') {
      if (state.detail.agentRequestId) await openRequestPlan(project, state.detail.agentRequestId);
      else showToast('Não existe um plano pendente de aprovação.', 'error');
      return;
    }
    if (action === 'open_execution' || action === 'resume') {
      $('workItemEditor')?.querySelector('.ado-agent-log-section')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
      if (action === 'resume') {
        const resumeBtn = $('workItemEditor')?.querySelector('[data-ado-run-control="resume"], [data-ado-run-control="retry"]');
        if (resumeBtn) resumeBtn.click();
      }
      return;
    }
    if (action === 'review_results') {
      const reviewChild = orch.targetWorkItemId && orch.targetWorkItemId !== state.detail.id
        ? orch.targetWorkItemId
        : null;
      if (reviewChild) await openEditor(project, reviewChild);
      else $('workItemEditor')?.querySelector('.ado-decision-section, .ado-editor-result')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
      return;
    }
    if (action === 'connect_and_run') {
      try {
        await prepareAgentConnection(project, taskId);
      } catch (err) {
        const pane = $('workItemEditor')?.querySelector('[data-ado-connection-pane]');
        const status = pane?.querySelector('[data-ado-connection-status]');
        if (status) status.textContent = err.message;
        pane?.classList.remove('hidden');
        showToast(err.message, 'error');
      }
    }
  }

  function paintAgentExecution(options = {}) {
    const host = $('workItemEditor')?.querySelector('[data-ado-agent-log]');
    if (!host) return;
    const interacting = Date.now() < executionInteractionUntil
      || host.matches(':hover')
      || host.contains(document.activeElement);
    if (!options.force && interacting) {
      clearTimeout(executionPaintTimer);
      executionPaintTimer = setTimeout(() => paintAgentExecution(), 750);
      return;
    }
    const signature = JSON.stringify([
      state.detailExecution?.status,
      state.detailExecution?.desiredAction,
      state.detailExecution?.latestCommand?.version,
      state.detailExecution?.progressCurrent,
      state.detailExecution?.progressTotal,
      state.detailExecution?.tokensUsed,
      state.detailExecution?.localTokensUsed,
      state.detailExecution?.externalTokensUsed,
      state.detailExecution?.costUsed,
      state.detailExecution?.checkpointBoundary,
      state.detailExecution?.bestEffort,
      state.detailExecution?.qualityWarnings,
      state.detailExecution?.events?.length,
      state.detailExecution?.events?.at?.(-1)?.id,
      state.detailExecution?.error,
    ]);
    if (!options.force && host.dataset.executionSignature === signature) return;
    const priorLog = host.querySelector('.ado-agent-log-list');
    const priorScrollTop = priorLog?.scrollTop ?? 0;
    const stickToBottom = priorLog
      ? (priorLog.scrollHeight - priorScrollTop - priorLog.clientHeight) < 48
      : true;
    host.innerHTML = renderAgentExecution();
    host.dataset.executionSignature = signature;
    const nextLog = host.querySelector('.ado-agent-log-list');
    if (nextLog) {
      if (stickToBottom) nextLog.scrollTop = nextLog.scrollHeight;
      else nextLog.scrollTop = Math.min(priorScrollTop, Math.max(0, nextLog.scrollHeight - nextLog.clientHeight));
    }
  }

  function paintEditor(project) {
    const pane = $('workItemEditor');
    if (!pane || !state.detail) return;

    const item = state.detail;
    const editable = state.canManage;
    const executorLocked = item.agentStatus === 'running';
    const derivedStatus = item.executorMode === 'both' || Number(item.childTaskCount || 0) > 0;
    const stages = window.state?.config?.deliveryStageFlow || [];
    const phases = project.phases || [];
    const members = project.members || [];
    const users = window.state?.users || [];
    const children = state.detailChildren || [];
    const engineeringChangeSets = state.detailChangeSets || [];
    const request = state.detailRequest || null;
    const executionSettings = item.executionSettings || {};
    const isCoordination = item.taskRole === 'coordination';
    const runtimeConfig = window.state?.config?.agentRuntime || {};
    const agentUnavailableReason = runtimeConfig.mode === 'remote_pull' && !runtimeConfig.enabled
      ? 'Nenhum Agent Runtime está emparelhado. Um super-admin deve emparelhar o dispositivo em Definições.'
      : runtimeConfig.mode === 'disabled'
        ? 'A execução por agente está desativada.'
        : '';
    const agentConnectAttributes = agentUnavailableReason
      ? `disabled title="${escapeHtml(agentUnavailableReason)}"`
      : '';
    const agentPairingGuidance = agentUnavailableReason
      ? `<p class="ado-section-hint">${escapeHtml(agentUnavailableReason)}</p>`
      : '';
    const executionSettingsMarkup = (item.executorMode === 'agent' || item.executorMode === 'both' || item.origin === 'agent') ? `
      <p class="ado-section-hint">Modelo, limites e política de revisão estão centralizados em <button type="button" class="ado-inline-link" data-ado-goto-agents>Agentes</button>. As alterações aplicam-se às próximas execuções.</p>
    ` : '';

    const assigneeOptions = members.map((m) => {
      const u = users.find((entry) => entry.id === m.userId);
      const label = u?.name || u?.email || m.userId;
      return `<option value="${escapeHtml(m.userId)}" ${item.assigneeUserId === m.userId ? 'selected' : ''}>${escapeHtml(label)}</option>`;
    }).join('');
    const parentOptions = state.items.filter((candidate) => candidate.id !== item.id && !candidate.parentTaskId).map((candidate) => `<option value="${escapeHtml(candidate.id)}" ${item.parentTaskId === candidate.id ? 'selected' : ''}>${escapeHtml(candidate.title)}</option>`).join('');
    const reviewRef = (item.sourceRefs || []).find((ref) => ref.type === 'review');
    const approvalRef = (item.sourceRefs || []).find((ref) => ref.type === 'approval');
    const manualSourceTypes = ['requirement', 'document', 'project_element', 'decision', 'change_request'];
    const primarySource = (item.sourceRefs || []).find((ref) => manualSourceTypes.includes(ref.type)) || {};

    pane.innerHTML = `
      <form class="ado-editor-form" data-ado-detail-form>
        <div class="ado-editor-hero">
          <div class="ado-editor-type">Tarefa · ${escapeHtml(originClassLabel(item.origin))}</div>
          <input class="ado-editor-title" name="title" value="${escapeHtml(item.title)}"
            placeholder="Título da tarefa — o que precisa ser feito?"
            ${editable ? '' : 'readonly'} required />
        </div>

        ${item.origin === 'agent' ? `
          <section class="ado-now-card status-${escapeHtml(item.status)}">
            <div><span class="ado-meta-label">AGORA</span><h3>${escapeHtml(attentionLabel(item))}</h3><p>${escapeHtml(item.currentAction || 'Consulte o plano e o resultado esperado desta tarefa.')}</p>${item.lastMilestone ? `<small>Último marco: ${escapeHtml(item.lastMilestone)}</small>` : ''}</div>
            ${item.progressTotal ? `<div class="ado-now-progress"><strong>${item.progressCurrent || 0}/${item.progressTotal}</strong><span>passos</span></div>` : ''}
          </section>
        ` : ''}

        ${isCoordination ? `
          <section class="ado-editor-section ado-coordination-panel">
            <div class="ado-section-heading"><div><h3 class="ado-section-title">Plano deste pedido</h3><p class="ado-section-hint">A tarefa-pai executa continuamente todas as subtarefas aprovadas ainda abertas, sem parar para revisão entre elas nem repetir trabalho concluído.</p></div><strong>${children.filter((child) => ['completed', 'waiting_review'].includes(child.status)).length}/${children.length}</strong></div>
            ${request?.diffSummary ? `<div class="ado-request-diff-summary"><span>${request.diffSummary.changedTasks || 0} alterada(s)</span><span>${request.diffSummary.newTasks || 0} nova(s)</span><span>${request.diffSummary.removedTasks || 0} removida(s)</span></div>` : ''}
            <div class="ado-child-task-list">${children.map((child, index) => `<button type="button" data-ado-open-child="${escapeHtml(child.id)}"><span>${index + 1}</span><strong>${escapeHtml(child.title)}</strong><small>${escapeHtml(statusLabel(child.status))}</small></button>`).join('')}</div>
            ${renderOrchestrationBar(state.detailOrchestration)}
            <details class="ado-advanced-details"><summary>Mais ações do plano</summary><div class="ado-action-bar"><button type="button" class="ado-action-ghost" data-ado-copy-package>Copiar subtarefas ainda abertas</button><button type="button" class="ado-action-ghost" data-ado-bundle-output>Colar resultados das subtarefas abertas</button></div></details>
            ${agentPairingGuidance}
            <div class="ado-manual-output-pane hidden" data-ado-bundle-pane><label>Pacote JSON completo<textarea rows="14" data-ado-bundle-raw placeholder='{"requestId":"…","requestVersion":1,"taskOutputs":[…]}'></textarea></label><p class="ado-section-hint" data-ado-bundle-preview></p><div class="ado-action-bar"><button type="button" class="ado-action-ghost" data-ado-preview-bundle>Validar pacote</button><button type="button" class="ado-action-primary" data-ado-submit-bundle disabled>Enviar tudo para revisão</button></div></div>
            ${children.some((child) => child.status === 'waiting_review') && state.canManage ? `<div class="ado-bundle-review"><strong>Resultados prontos para decisão</strong><div class="ado-action-bar"><button type="button" class="ado-action-primary" data-ado-review-bundle="approved">Aprovar e aplicar todos</button><button type="button" class="ado-action-ghost" data-ado-review-bundle="changes_requested">Pedir alterações</button><button type="button" class="ado-action-ghost" data-ado-review-bundle="rejected">Rejeitar</button></div></div>` : ''}
            ${executionSettingsMarkup}
            ${request?.diffSummary?.requestPromptDiff ? `<details class="ado-advanced-details"><summary>Diferenças do pedido</summary><pre>${escapeHtml(request.diffSummary.requestPromptDiff)}</pre></details>` : ''}
          </section>
        ` : ''}
        ${!isCoordination ? executionSettingsMarkup : ''}

        <div class="ado-task-meta">
          <div class="ado-meta-status-row">
            <span class="ado-meta-label">Estado</span>
            ${renderStatusPills(item, editable && !derivedStatus && item.agentStatus !== 'running')}
            ${derivedStatus ? '<small class="ado-section-hint">Estado calculado pelas subtarefas.</small>' : ''}
          </div>
          <div class="ado-meta-fields">
            <label class="ado-meta-field"><span class="ado-meta-label">Executor</span><select class="ado-meta-control" name="executorMode" ${editable && !executorLocked ? '' : 'disabled'}><option value="human" ${item.executorMode === 'human' ? 'selected' : ''}>Humano</option><option value="agent" ${item.executorMode === 'agent' ? 'selected' : ''}>Agente de IA</option><option value="both" ${item.executorMode === 'both' ? 'selected' : ''}>Humano + agente</option></select></label>
            <label class="ado-meta-field"><span class="ado-meta-label">Responsável humano</span><select class="ado-meta-control" name="assigneeUserId" ${editable && !executorLocked ? '' : 'disabled'}><option value="">Sem responsável</option>${assigneeOptions}</select></label>
            <label class="ado-meta-field"><span class="ado-meta-label">Agente</span><input class="ado-meta-control" name="agentId" value="${escapeHtml(item.agentId || item.agentType || '')}" placeholder="Tipo ou identificador" ${editable && !executorLocked ? '' : 'disabled'} /></label>
            <label class="ado-meta-field">
              <span class="ado-meta-label">Complexidade</span>
              <select class="ado-meta-control" name="complexity" ${editable ? '' : 'disabled'} required>
                <option value="low" ${item.complexity === 'low' ? 'selected' : ''}>Simples</option>
                <option value="medium" ${item.complexity === 'medium' ? 'selected' : ''}>Média</option>
                <option value="high" ${item.complexity === 'high' ? 'selected' : ''}>Complexa</option>
              </select>
            </label>
            <label class="ado-meta-field"><span class="ado-meta-label">Prioridade</span><select class="ado-meta-control" name="priority" ${editable ? '' : 'disabled'}><option value="">Sem prioridade</option><option value="low" ${item.priority === 'low' ? 'selected' : ''}>Baixa</option><option value="medium" ${item.priority === 'medium' ? 'selected' : ''}>Média</option><option value="high" ${item.priority === 'high' ? 'selected' : ''}>Alta</option></select></label>
            <label class="ado-meta-field">
              <span class="ado-meta-label">Etapa</span>
              <select class="ado-meta-control" name="deliveryStageId" ${editable ? '' : 'disabled'}>
                ${stages.map((s) => `<option value="${s.id}" ${item.deliveryStageId === s.id ? 'selected' : ''}>${escapeHtml(s.label)}</option>`).join('')}
                <option value="unclassified" ${item.deliveryStageId === 'unclassified' ? 'selected' : ''}>Não classificado</option>
              </select>
            </label>
            <label class="ado-meta-field"><span class="ado-meta-label">Fase do plano</span><select class="ado-meta-control" name="planPhaseId" ${editable ? '' : 'disabled'}><option value="">Sem fase específica</option>${phases.map((phase, index) => `<option value="${escapeHtml(phase.id)}" ${item.planPhaseId === phase.id ? 'selected' : ''}>${escapeHtml(phase.name || `Fase ${index + 1}`)}</option>`).join('')}</select></label>
            <label class="ado-meta-field"><span class="ado-meta-label">Tarefa-pai</span><select class="ado-meta-control" name="parentTaskId" ${editable && !executorLocked ? '' : 'disabled'}><option value="">Sem tarefa-pai</option>${parentOptions}</select></label>
            <label class="ado-meta-field ado-client-visible-field"><span class="ado-meta-label">Visibilidade</span><span class="checkline"><input type="checkbox" name="clientVisible" ${item.clientVisible ? 'checked' : ''} ${editable ? '' : 'disabled'} /> Visível para o cliente</span><small>O cliente só actualiza se for responsável ou aprovador.</small></label>
            <label class="ado-meta-field"><span class="ado-meta-label">Tipo de origem</span><select class="ado-meta-control" name="sourceType" ${editable ? '' : 'disabled'}><option value="">Sem origem manual</option>${manualSourceTypes.map((type) => `<option value="${type}" ${primarySource.type === type ? 'selected' : ''}>${type}</option>`).join('')}</select></label>
            <label class="ado-meta-field"><span class="ado-meta-label">ID do elemento</span><input class="ado-meta-control" name="sourceId" value="${escapeHtml(primarySource.id || '')}" placeholder="Ex.: FR-01 ou doc_…" ${editable ? '' : 'disabled'} /></label>
            <label class="ado-meta-field"><span class="ado-meta-label">Nome da origem</span><input class="ado-meta-control" name="sourceLabel" value="${escapeHtml(primarySource.label || '')}" placeholder="Descrição curta" ${editable ? '' : 'disabled'} /></label>
            <label class="ado-meta-field">
              <span class="ado-meta-label">Etapa</span>
              <select class="ado-meta-control" name="deliveryStageId" ${editable ? '' : 'disabled'} required>
                ${stages.map((s) => `<option value="${s.id}" ${item.deliveryStageId === s.id ? 'selected' : ''}>${escapeHtml(s.label)}</option>`).join('')}
                <option value="unclassified" ${item.deliveryStageId === 'unclassified' ? 'selected' : ''}>Não classificado</option>
              </select>
            </label>
            <label class="ado-meta-field">
              <span class="ado-meta-label">Fase do plano</span>
              <select class="ado-meta-control" name="planPhaseId" ${editable ? '' : 'disabled'}>
                <option value="">Sem fase específica</option>
                ${phases.map((phase, index) => `<option value="${escapeHtml(phase.id)}" ${item.planPhaseId === phase.id ? 'selected' : ''}>${escapeHtml(phase.name || `Fase ${index + 1}`)}</option>`).join('')}
              </select>
            </label>
            <label class="ado-meta-field">
              <span class="ado-meta-label">Tarefa-pai</span>
              <select class="ado-meta-control" name="parentTaskId" ${editable && !executorLocked ? '' : 'disabled'}>
                <option value="">Sem tarefa-pai</option>
                ${parentOptions}
              </select>
            </label>
            <label class="ado-meta-field ado-client-visible-field">
              <span class="ado-meta-label">Visibilidade</span>
              <span class="checkline"><input type="checkbox" name="clientVisible" ${item.clientVisible ? 'checked' : ''} ${editable ? '' : 'disabled'} /> Visível para o cliente</span>
              <small>Visibilidade não concede edição; o cliente só actualiza se for responsável ou aprovador.</small>
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
          <h3 class="ado-section-title">${item.origin === 'agent' ? 'Instruções e contexto' : 'Descrição'}</h3>
          <div class="ado-md-editor" data-ado-md-mount="description"></div>
        </section>

        ${item.origin === 'agent' && item.status === 'waiting_review' && !reviewRef && state.canManage ? `
          <section class="ado-editor-section ado-editor-result ado-decision-section">
            <span class="ado-suggestions-eyebrow">AÇÃO NECESSÁRIA</span>
            <h3 class="ado-section-title">Conteúdo a rever</h3>
            <p class="ado-section-hint">${state.detailReview?.resultHash ? `Resultado rastreável ${escapeHtml(state.detailReview.resultHash.slice(0, 12))}. ` : ''}A resposta completa e a decisão ficam ligadas à mesma tentativa.</p>
            <details open class="ado-advanced-details"><summary>Ver resposta completa</summary><pre class="ado-result-body">${escapeHtml(state.detailReview?.rawOutput || state.detailReview?.bodyMarkdown || item.resultSummaryMarkdown || 'O runtime não enviou conteúdo para esta tentativa.')}</pre></details>
            <div class="ado-action-bar"><button type="button" class="ado-action-primary" data-ado-task-review="approved">Aprovar e aplicar</button><button type="button" class="ado-action-ghost" data-ado-task-review="changes_requested">Pedir alterações</button><button type="button" class="ado-action-ghost" data-ado-task-review="rejected">Rejeitar</button></div>
          </section>
        ` : ''}

        ${item.origin === 'agent' && !isCoordination ? `
          <section class="ado-editor-section ado-agent-actions">
            <div><h3 class="ado-section-title">Execução</h3><p class="ado-section-hint">Estado da execução e ligação ao Agent Runtime.</p></div>
            ${renderOrchestrationBar(state.detailOrchestration)}
            <details class="ado-advanced-details"><summary>Execução manual</summary><div class="ado-action-bar"><button type="button" class="ado-action-ghost" data-ado-copy-package>Copiar instruções</button><button type="button" class="ado-action-ghost" data-ado-manual-output>Registar resultado manual</button>${item.agentStatus !== 'running' ? '<button type="button" class="ado-action-ghost" data-ado-assume-human>Assumir como tarefa humana</button>' : ''}</div></details>
            ${agentPairingGuidance}
            <div class="ado-manual-output-pane hidden" data-ado-manual-pane><label>Resultado obtido<textarea rows="10" data-ado-manual-raw placeholder="Cole aqui a resposta completa ou o JSON produzido…"></textarea></label><p class="ado-section-hint" data-ado-manual-preview></p><div class="ado-action-bar"><button type="button" class="ado-action-ghost" data-ado-preview-manual>Validar e pré-visualizar</button><button type="button" class="ado-action-primary" data-ado-submit-manual disabled>Enviar para revisão</button></div></div>
          </section>
        ` : ''}

        ${item.origin === 'agent' && state.detailExecution ? `
          <section class="ado-editor-section ado-agent-log-section">
            <h3 class="ado-section-title">Execução do agente</h3>
            <p class="ado-section-hint">Eventos recebidos do runtime local, preservados no histórico desta tarefa.</p>
            <div data-ado-agent-log>${renderAgentExecution()}</div>
          </section>
        ` : ''}

        ${item.sourceRefs?.length ? `<section class="ado-editor-section"><h3 class="ado-section-title">Origem e rastreabilidade</h3><div class="ado-source-list">${item.sourceRefs.map((ref) => `<span>${escapeHtml(ref.label || `${ref.type}: ${ref.id}`)}</span>`).join('')}</div></section>` : ''}

        ${item.executionPackage?.promptDiff ? `<section class="ado-editor-section"><details class="ado-advanced-details"><summary>O que mudou neste subprompt</summary><pre>${escapeHtml(item.executionPackage.promptDiff)}</pre></details></section>` : ''}

        ${item.origin === 'agent' && item.status !== 'waiting_review' && (state.detailReview?.rawOutput || state.detailReview?.bodyMarkdown || item.resultSummaryMarkdown) ? `
          <section class="ado-editor-section ado-editor-result">
            <h3 class="ado-section-title">${item.status === 'waiting_review' ? 'Conteúdo a rever' : 'Resultado entregue pelo agente'}</h3>
            ${state.detailExecution?.bestEffort ? '<p class="ado-section-hint">Resultado best-effort: pode ser aprovado, devolvido com alterações ou rejeitado.</p>' : ''}
            <p class="ado-section-hint">${state.detailReview?.resultHash ? `Resultado rastreável ${escapeHtml(state.detailReview.resultHash.slice(0, 12))}. ` : ''}A resposta completa permanece ligada a esta tentativa.</p>
            <details open class="ado-advanced-details"><summary>Ver resposta completa</summary><pre class="ado-result-body">${escapeHtml(state.detailReview?.rawOutput || state.detailReview?.bodyMarkdown || item.resultSummaryMarkdown)}</pre></details>
          </section>
        ` : ''}

        ${engineeringChangeSets.length ? `
          <section class="ado-editor-section ado-engineering-change-sets">
            <h3 class="ado-section-title">Alterações de engenharia propostas</h3>
            <p class="ado-section-hint">Estas alterações ainda não modificam o projecto. Cada secção requer decisão humana e o apply é atómico, com snapshot.</p>
            ${engineeringChangeSets.map((changeSet) => `
              <article class="simple-item engineering-change-set" data-change-set-id="${escapeHtml(changeSet.id)}">
                <div class="engineering-change-set-head"><strong>${escapeHtml(changeSet.summary || changeSet.id)}</strong><span class="badge badge-gray">${escapeHtml(changeSet.status)}</span></div>
                ${(changeSet.sections || []).map((section) => `
                  <div class="engineering-section" data-section-id="${escapeHtml(section.id)}">
                    <div><strong>${escapeHtml(section.title)}</strong><small>${escapeHtml(section.decision || 'pending')} · ${(section.operations || []).length} operações</small></div>
                    ${state.canManage && changeSet.status !== 'applied' ? `<div class="actions-row"><button type="button" class="btn tiny" data-engineering-decision="approved">Aceitar</button><button type="button" class="btn tiny ghost" data-engineering-decision="changes_requested">Pedir correções</button><button type="button" class="btn tiny danger" data-engineering-decision="rejected">Rejeitar</button></div>` : ''}
                  </div>`).join('')}
                ${state.canManage && changeSet.status !== 'applied' ? '<button type="button" class="btn primary tiny" data-engineering-apply>Aplicar secções aprovadas</button>' : ''}
              </article>`).join('')}
          </section>
        ` : ''}

        ${reviewRef && state.canManage ? `<section class="ado-editor-section ado-decision-section"><h3 class="ado-section-title">Decisão da revisão</h3><p class="ado-section-hint">A decisão e a evidência permanecem ligadas à revisão; o estado desta tarefa é sincronizado.</p><div class="ado-action-bar"><button type="button" class="ado-action-primary" data-ado-review-decision="approved" data-domain-id="${escapeHtml(reviewRef.id)}">Aprovar revisão</button><button type="button" class="ado-action-ghost" data-ado-review-decision="changes_requested" data-domain-id="${escapeHtml(reviewRef.id)}">Pedir alterações</button></div></section>` : ''}
        ${approvalRef && (state.canManage || state.canPostUpdate) ? `<section class="ado-editor-section ado-decision-section"><h3 class="ado-section-title">Decisão da aprovação</h3><p class="ado-section-hint">Registe a decisão sem sair da tarefa.</p><div class="ado-action-bar"><button type="button" class="ado-action-primary" data-ado-approval-decision="approved" data-domain-id="${escapeHtml(approvalRef.id)}">Aprovar entrega</button><button type="button" class="ado-action-ghost" data-ado-approval-decision="rejected" data-domain-id="${escapeHtml(approvalRef.id)}">Rejeitar</button></div></section>` : ''}

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

        <input type="hidden" name="status" value="${escapeHtml(item.status)}" data-ado-status-input />
        ${item.suggestionId ? `<input type="hidden" name="suggestionId" value="${escapeHtml(item.suggestionId)}" />` : ''}
      </form>
    `;

    const meta = pane.querySelector('.ado-task-meta');
    const fields = meta?.querySelector('.ado-meta-fields');
    if (fields) {
      const seenNames = new Set();
      fields.querySelectorAll('[name]').forEach((control) => {
        if (!control.name || !seenNames.has(control.name)) { seenNames.add(control.name); return; }
        control.closest('.ado-meta-field')?.remove();
      });
      const details = document.createElement('details');
      details.className = 'ado-advanced-details ado-task-details';
      details.innerHTML = '<summary>Responsáveis, estado e mais detalhes</summary>';
      fields.parentNode.insertBefore(details, fields);
      details.appendChild(fields);
    }

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
    const updates = [
      ...(item?.taskActivity || []).map((event) => ({ ...event, bodyMarkdown: event.message, createdBy: event.actorId, isSystemEvent: true })),
      ...(item?.updates || []),
    ].sort((a, b) => {
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
              <strong class="ado-update-author">${escapeHtml(entry.isSystemEvent ? (entry.actorType === 'agent' ? 'Agente' : entry.actorType === 'platform' ? 'Plataforma' : userLabel(entry.createdBy)) : userLabel(entry.createdBy))}</strong>
              <time class="ado-update-date">${escapeHtml(formatWhen(entry.createdAt))}</time>
              ${entry.updatedAt && entry.updatedAt !== entry.createdAt
                ? `<span class="ado-update-edited">editado ${escapeHtml(formatWhen(entry.updatedAt))}</span>`
                : ''}
            </div>
            ${state.canEditUpdate && !entry.isSystemEvent ? `<button type="button" class="ado-action-ghost ado-action-small" data-ado-update-edit="${escapeHtml(entry.id)}">Editar</button>` : ''}
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
        executorMode: updated.executorMode,
        agentId: updated.agentId,
        deliveryStageId: updated.deliveryStageId,
        planPhaseId: updated.planPhaseId,
        parentTaskId: updated.parentTaskId,
        priority: updated.priority,
        clientVisible: updated.clientVisible,
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
    body.clientVisible = Boolean(form.elements.clientVisible?.checked);
    if (!body.title?.trim() || !body.descriptionMarkdown?.trim() || !body.deliveryStageId) {
      if (!silent) showToast('Título, descrição e etapa são obrigatórios.', 'error');
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
    renderSelectionBar();
    renderSuggestions();
  }

  function wireEvents(project) {
    const root = $('workItemsRoot');
    if (!root || root._adoWired) return;
    root._adoWired = true;

    window.addEventListener('resize', resizeDescription);
    root.addEventListener('pointerdown', (event) => {
      if (event.target.closest('[data-ado-agent-log]')) {
        executionInteractionUntil = Date.now() + 4000;
      }
    });

    root.addEventListener('click', async (event) => {
      project = window.state?.selectedProject || project;
      const runControl = event.target.closest('[data-ado-run-control]');
      if (runControl && state.detailExecution?.runId) {
        const action = runControl.dataset.adoRunControl;
        const controlledRunId = state.detailExecution.runId;
        if (action === 'cancel' && !window.confirm('Cancelar esta execução do agente? O trabalho já concluído continuará no histórico.')) return;
        if (action === 'abandon' && !window.confirm('Terminar esta execução, revogar o controlo remoto antigo e desbloquear a tarefa? Os checkpoints e o histórico serão preservados.')) return;
        runControl.disabled = true;
        const executionBeforeCommand = state.detailExecution;
        try {
          const desiredAction = ({
            pause: 'pause', resume: 'resume', cancel: 'cancel',
            'finish-partial': 'finish_partial', 'sync-now': 'sync_now',
          })[action] || null;
          if (desiredAction && action !== 'retry' && action !== 'abandon') {
            state.detailExecution = {
              ...state.detailExecution,
              desiredAction,
              latestCommand: {
                ...(state.detailExecution.latestCommand || {}),
                action: desiredAction,
                version: Number(state.detailExecution.latestCommand?.version || 0) + 1,
              },
            };
            paintAgentExecution({ force: true });
          }
          await apiRequest(`/agent-runs/${encodeURIComponent(controlledRunId)}/${encodeURIComponent(action)}`, { method: 'POST', body: {} });
          await fetchDetail(project.id, state.detail.id);
          paintEditor(project);
          showToast(action === 'pause'
            ? 'Pausa pedida.'
            : action === 'resume'
              ? 'Continuação pedida.'
              : action === 'retry'
                ? 'Recuperação pedida; o agente continuará do último checkpoint.'
                : action === 'abandon'
                  ? 'Execução antiga terminada; a tarefa foi desbloqueada.'
                  : action === 'finish-partial'
                    ? 'O progresso será preparado para avaliação.'
                    : action === 'sync-now'
                      ? 'Sincronização imediata pedida.'
                      : 'Cancelamento pedido.', 'ok');
          pollConnectedTask(project, controlledRunId, state.detail.id);
        } catch (err) {
          state.detailExecution = executionBeforeCommand;
          paintAgentExecution({ force: true });
          runControl.disabled = false;
          showToast(err.message, 'error');
        }
        return;
      }
      if (event.target.closest('[data-ado-focus-review]')) {
        $('workItemEditor')?.querySelector('.ado-decision-section')?.scrollIntoView({ behavior: 'smooth', block: 'center' });
        return;
      }
      if (event.target.closest('[data-ado-refresh-runtime]')) {
        await refreshRuntimeHealth({ announce: true });
        return;
      }
      const notificationControl = event.target.closest('[data-ado-open-notification], [data-ado-dismiss-notification]');
      if (notificationControl) {
        const notificationId = notificationControl.dataset.adoOpenNotification || notificationControl.dataset.adoDismissNotification;
        try {
          await apiRequest(`/projects/${encodeURIComponent(project.id)}/work-items/notifications/${encodeURIComponent(notificationId)}/read`, { method: 'POST', body: {} });
          if (state.meta?.notifications) state.meta.notifications = state.meta.notifications.filter((entry) => entry.id !== notificationId);
          renderToolbar();
          if (notificationControl.dataset.adoOpenNotification) {
            if (notificationControl.dataset.taskId) await openEditor(project, notificationControl.dataset.taskId);
            else if (notificationControl.dataset.requestId) await openRequestPlan(project, notificationControl.dataset.requestId);
          }
        } catch (err) { showToast(err.message, 'error'); }
        return;
      }
      const proposedPlanControl = event.target.closest('[data-ado-open-agent-plan]');
      if (proposedPlanControl) {
        await openRequestPlan(project, proposedPlanControl.dataset.adoOpenAgentPlan);
        return;
      }
      const viewBtn = event.target.closest('[data-ado-view]');
      if (viewBtn) {
        state.view = viewBtn.dataset.adoView;
        await fetchList(project.id);
        renderToolbar();
        refreshBoardView();
        return;
      }

      if (event.target.closest('[data-ado-close-plan]')) {
        leaveEditorMode(); refreshBoardView(); return;
      }
      if (event.target.closest('[data-ado-approve-plan]')) {
        try {
          const payload = await apiRequest(`/projects/${encodeURIComponent(project.id)}/work-items/agent-requests/${encodeURIComponent(state.selectedRequest.id)}/approve`, { method: 'POST', body: {} });
          state.selectedRequest = payload.agentRequest;
          state.selectedRequestTasks = payload.workItems || [];
          paintRequestPlan(project);
          await startApprovedRequest(project, state.selectedRequest);
        } catch (err) { showToast(err.message, 'error'); }
        return;
      }
      if (event.target.closest('[data-ado-start-plan]')) {
        try { await startApprovedRequest(project, state.selectedRequest); }
        catch (err) { showToast(err.message, 'error'); }
        return;
      }
      if (event.target.closest('[data-ado-revise-plan]')) {
        const feedbackMarkdown = window.prompt('O que deve ser alterado neste plano?')?.trim();
        if (!feedbackMarkdown) return;
        try {
          const payload = await apiRequest(`/projects/${encodeURIComponent(project.id)}/work-items/agent-requests/${encodeURIComponent(state.selectedRequest.id)}/revision`, { method: 'POST', body: { feedbackMarkdown } });
          state.selectedRequest = { ...state.selectedRequest, ...payload.agentRequest };
          paintRequestPlan(project); showToast('Pedido de revisão registado.', 'ok');
        } catch (err) { showToast(err.message, 'error'); }
        return;
      }
      const movePlanTask = event.target.closest('[data-ado-plan-move]');
      const removePlanTask = event.target.closest('[data-ado-plan-remove]');
      if ((movePlanTask || removePlanTask) && state.selectedRequest) {
        const control = movePlanTask || removePlanTask;
        const order = (state.selectedRequestTasks || []).map((task) => task.id);
        const index = order.indexOf(control.dataset.taskId);
        if (index < 0) return;
        if (removePlanTask) order.splice(index, 1);
        else {
          const target = movePlanTask.dataset.adoPlanMove === 'up' ? index - 1 : index + 1;
          if (target < 0 || target >= order.length) return;
          [order[index], order[target]] = [order[target], order[index]];
        }
        try {
          const payload = await apiRequest(`/projects/${encodeURIComponent(project.id)}/work-items/agent-requests/${encodeURIComponent(state.selectedRequest.id)}/plan`, { method: 'PATCH', body: { orderedTaskIds: order } });
          state.selectedRequest = payload.agentRequest;
          state.selectedRequestTasks = payload.workItems || [];
          renderToolbar(); paintRequestPlan(project);
          showToast('Plano actualizado; precisa de nova aprovação.', 'ok');
        } catch (err) { showToast(err.message, 'error'); }
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

      const selection = event.target.closest('[data-ado-select]');
      if (selection) {
        event.stopPropagation();
        if (selection.checked) state.selectedIds.add(selection.dataset.adoSelect); else state.selectedIds.delete(selection.dataset.adoSelect);
        renderSelectionBar();
        return;
      }
      if (event.target.closest('[data-ado-clear-selection]')) { state.selectedIds.clear(); refreshBoardView(); return; }
      const batch = event.target.closest('[data-ado-batch-visible]');
      if (batch) {
        try {
          await apiRequest(`/projects/${encodeURIComponent(project.id)}/work-items/batch`, { method: 'PATCH', body: { ids: [...state.selectedIds], clientVisible: batch.dataset.adoBatchVisible === 'true' } });
          state.selectedIds.clear(); await fetchList(project.id); refreshBoardView(); showToast('Visibilidade actualizada.', 'ok');
        } catch (err) { showToast(err.message, 'error'); }
        return;
      }
      if (event.target.closest('[data-ado-evaluate-suggestions]')) {
        try { await fetchSuggestions(project.id, true); renderSuggestions(); showToast('Sugestões reavaliadas.', 'ok'); }
        catch (err) { showToast(err.message, 'error'); }
        return;
      }
      const prepare = event.target.closest('[data-ado-prepare-suggestion]');
      if (prepare) {
        try {
          const payload = await apiRequest(`/projects/${encodeURIComponent(project.id)}/work-items/suggestions/${encodeURIComponent(prepare.dataset.adoPrepareSuggestion)}/prepare`, { method: 'POST', body: {} });
          await openEditor(project, '__new__', payload.draft);
        } catch (err) { showToast(err.message, 'error'); }
        return;
      }
      const dismiss = event.target.closest('[data-ado-dismiss-suggestion]');
      if (dismiss) {
        try {
          await apiRequest(`/projects/${encodeURIComponent(project.id)}/work-items/suggestions/${encodeURIComponent(dismiss.dataset.adoDismissSuggestion)}/dismiss`, { method: 'POST', body: {} });
          state.suggestions = state.suggestions.filter((entry) => entry.id !== dismiss.dataset.adoDismissSuggestion); renderSuggestions();
        } catch (err) { showToast(err.message, 'error'); }
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
            const saved = await persistEditor(project, { silent: true });
            if (!saved) {
              showToast('Não foi possível guardar a tarefa. Corrija o erro antes de voltar.', 'error');
              return;
            }
          }
        }
        leaveEditorMode();
        await fetchList(project.id);
        await fetchAgentRequests(project.id).catch(() => []);
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

      const openChild = event.target.closest('[data-ado-open-child]');
      if (openChild) { await openEditor(project, openChild.dataset.adoOpenChild); return; }

      if (event.target.closest('[data-ado-bundle-output]')) {
        $('workItemEditor')?.querySelector('[data-ado-bundle-pane]')?.classList.toggle('hidden'); return;
      }
      if (event.target.closest('[data-ado-preview-bundle]') && state.detail) {
        const pane = $('workItemEditor'); const rawOutput = pane?.querySelector('[data-ado-bundle-raw]')?.value?.trim();
        if (!rawOutput) { showToast('Cole primeiro o pacote JSON.', 'error'); return; }
        try {
          const payload = await apiRequest(`/projects/${encodeURIComponent(project.id)}/work-items/${encodeURIComponent(state.detail.id)}/manual-output/bundle/preview`, { method: 'POST', body: { rawOutput } });
          pane.querySelector('[data-ado-bundle-preview]').textContent = `${payload.taskCount} resultado(s) válidos. Todos irão aguardar revisão.`;
          pane.querySelector('[data-ado-submit-bundle]').disabled = !payload.valid;
        } catch (err) { pane.querySelector('[data-ado-bundle-preview]').textContent = err.message; pane.querySelector('[data-ado-submit-bundle]').disabled = true; }
        return;
      }
      if (event.target.closest('[data-ado-submit-bundle]') && state.detail) {
        const rawOutput = $('workItemEditor')?.querySelector('[data-ado-bundle-raw]')?.value?.trim();
        try {
          await apiRequest(`/projects/${encodeURIComponent(project.id)}/work-items/${encodeURIComponent(state.detail.id)}/manual-output/bundle`, { method: 'POST', body: { rawOutput } });
          await fetchDetail(project.id, state.detail.id); paintEditor(project); await fetchList(project.id); showToast('Pacote completo enviado para revisão.', 'ok');
        } catch (err) { showToast(err.message, 'error'); }
        return;
      }
      const bundleReview = event.target.closest('[data-ado-review-bundle]');
      if (bundleReview && state.detail) {
        const action = bundleReview.dataset.adoReviewBundle; const feedbackMarkdown = action === 'approved' ? '' : window.prompt(action === 'rejected' ? 'Porque rejeita estes resultados?' : 'Que alterações são necessárias?')?.trim();
        if (action !== 'approved' && !feedbackMarkdown) return;
        try {
          await apiRequest(`/projects/${encodeURIComponent(project.id)}/work-items/${encodeURIComponent(state.detail.id)}/review-bundle`, { method: 'POST', body: { action, feedbackMarkdown } });
          await fetchDetail(project.id, state.detail.id); paintEditor(project); await fetchList(project.id); showToast('Decisão aplicada ao pacote.', 'ok');
        } catch (err) { showToast(err.message, 'error'); }
        return;
      }

      if (event.target.closest('[data-ado-goto-agents]')) {
        window.switchToTab?.('agentes');
        return;
      }
      if (event.target.closest('[data-ado-open-execution]')) {
        $('workItemEditor')?.querySelector('.ado-agent-log-section')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
        return;
      }
      const orchestrationBtn = event.target.closest('[data-ado-orchestration]');
      if (orchestrationBtn && state.detail) {
        orchestrationBtn.disabled = true;
        try {
          await handleOrchestrationAction(project, orchestrationBtn.dataset.adoOrchestration);
        } finally {
          orchestrationBtn.disabled = false;
        }
        return;
      }
      if (event.target.closest('[data-ado-connect-agent]') && state.detail) {
        try {
          await prepareAgentConnection(project, state.detail.id);
        } catch (err) {
          showToast(err.message, 'error');
        }
        return;
      }
      if (event.target.closest('[data-ado-send-agent]') && state.detail) {
        const editor = $('workItemEditor');
        const agentId = editor?.querySelector('[data-ado-agent-select]')?.value
          || state.pendingConnectionAgentId
          || state.detail.agentId;
        const settings = { ...(state.pendingConnectionSettings || state.detail.executionSettings || {}) };
        settings.timeLimitEnabled = Number(settings.maxWallClockMinutes) > 0;
        settings.timePolicy = settings.timeLimitEnabled
          ? { mode: 'limited', enforced: true, maxWallClockMinutes: Number(settings.maxWallClockMinutes), onLimit: 'best_effort_review' }
          : { mode: 'unlimited', enforced: false, onLimit: 'best_effort_review' };
        const status = editor?.querySelector('[data-ado-connection-status]');
        if (status) status.textContent = 'A ligar e a entregar o pacote versionado…';
        try {
          const payload = await apiRequest('/agent-runs', {
            method: 'POST',
            body: {
              projectId: project.id,
              agentId,
              agentType: state.detail.agentType,
              agentRequestId: state.detail.agentRequestId,
              workItemId: state.pendingConnectionTaskId || state.detail.id,
              budget: {
                maxTokens: settings.maxTokens,
                maxWallClockMinutes: settings.maxWallClockMinutes,
                maxSubtasks: settings.maxSubtasks || settings.planningWaveSize,
              },
              options: {
                ...settings,
                stageId: state.detail.deliveryStageId,
                enableWebSearch: settings.enableWebSearch,
              },
            },
          });
          if (payload.requiresApproval) {
            state.pendingConnectionTaskId = state.detail.id;
            state.pendingConnectionAgentId = agentId;
            showToast('O plano precisa de aprovação antes de ser enviado.', 'error');
            await openRequestPlan(project, state.detail.agentRequestId);
            return;
          }
          const taskId = payload.workItem?.id || state.pendingConnectionTaskId || state.detail.id;
          await fetchDetail(project.id, taskId);
          paintEditor(project);
          await fetchList(project.id);
          showToast('Tarefa entregue ao agente. O progresso ficará visível aqui.', 'ok');
          pollConnectedTask(project, payload.agentJob?.id || payload.promptRun?.id, taskId);
        } catch (err) {
          if (status) status.textContent = err.message;
          showToast(err.message, 'error');
        }
        return;
      }
      if (event.target.closest('[data-ado-save-execution-settings]') && state.detail) {
        const editor = $('workItemEditor'); const settings = {};
        editor?.querySelectorAll('[data-ado-setting]').forEach((control) => { settings[control.dataset.adoSetting] = control.dataset.adoSetting === 'allowedMcpTools' ? control.value.split(',').map((value) => value.trim()).filter(Boolean) : control.type === 'checkbox' ? control.checked : control.type === 'number' ? Number(control.value) : control.value; });
        settings.timeLimitEnabled = Number(settings.maxWallClockMinutes) > 0;
        settings.timePolicy = settings.timeLimitEnabled
          ? { mode: 'limited', enforced: true, maxWallClockMinutes: Number(settings.maxWallClockMinutes), onLimit: 'best_effort_review' }
          : { mode: 'unlimited', enforced: false, onLimit: 'best_effort_review' };
        try {
          const payload = await apiRequest(`/projects/${encodeURIComponent(project.id)}/work-items/${encodeURIComponent(state.detail.id)}/execution-settings`, { method: 'POST', body: { settings } });
          state.detail = payload.workItem;
          state.detailChildren = payload.children || state.detailChildren;
          paintEditor(project);
          showToast('Configuração actualizada no mesmo plano; será usada na continuação ou próxima tentativa.', 'ok');
        } catch (err) { showToast(err.message, 'error'); }
        return;
      }

      if (event.target.closest('[data-ado-copy-package]') && state.detail) {
        try {
          const payload = await apiRequest(`/projects/${encodeURIComponent(project.id)}/work-items/${encodeURIComponent(state.detail.id)}/execution-package`);
          await navigator.clipboard.writeText(payload.text);
          showToast('Instruções copiadas.', 'ok');
        } catch (err) { showToast(err.message, 'error'); }
        return;
      }
      if (event.target.closest('[data-ado-manual-output]')) {
        $('workItemEditor')?.querySelector('[data-ado-manual-pane]')?.classList.toggle('hidden');
        return;
      }
      if (event.target.closest('[data-ado-preview-manual]') && state.detail) {
        const pane = $('workItemEditor');
        const rawOutput = pane?.querySelector('[data-ado-manual-raw]')?.value?.trim();
        if (!rawOutput) { showToast('Cole primeiro o resultado.', 'error'); return; }
        try {
          const payload = await apiRequest(`/projects/${encodeURIComponent(project.id)}/work-items/${encodeURIComponent(state.detail.id)}/manual-output/preview`, { method: 'POST', body: { rawOutput } });
          pane.querySelector('[data-ado-manual-preview]').textContent = `${payload.preview}. O resultado será enviado para revisão antes de ser aplicado.`;
          pane.querySelector('[data-ado-submit-manual]').disabled = !payload.valid;
        } catch (err) { showToast(err.message, 'error'); }
        return;
      }
      if (event.target.closest('[data-ado-submit-manual]') && state.detail) {
        const rawOutput = $('workItemEditor')?.querySelector('[data-ado-manual-raw]')?.value?.trim();
        try {
          const payload = await apiRequest(`/projects/${encodeURIComponent(project.id)}/work-items/${encodeURIComponent(state.detail.id)}/manual-output`, { method: 'POST', body: { rawOutput } });
          state.detail = payload.workItem; paintEditor(project); await fetchList(project.id); showToast('Resultado enviado para revisão.', 'ok');
        } catch (err) { showToast(err.message, 'error'); }
        return;
      }
      if (event.target.closest('[data-ado-assume-human]') && state.detail) {
        try {
          const payload = await apiRequest(`/projects/${encodeURIComponent(project.id)}/work-items/${encodeURIComponent(state.detail.id)}/assume-human`, { method: 'POST', body: {} });
          state.detail = payload.workItem; paintEditor(project); showToast('A tarefa foi atribuída a si.', 'ok');
        } catch (err) { showToast(err.message, 'error'); }
        return;
      }
      const taskReview = event.target.closest('[data-ado-task-review]');
      if (taskReview && state.detail) {
        const action = taskReview.dataset.adoTaskReview;
        const feedbackMarkdown = action === 'approved' ? '' : window.prompt(action === 'rejected' ? 'Porque rejeita este resultado?' : 'Que alterações são necessárias?')?.trim();
        if (action !== 'approved' && !feedbackMarkdown) return;
        taskReview.disabled = true;
        try {
          const payload = await apiRequest(`/projects/${encodeURIComponent(project.id)}/work-items/${encodeURIComponent(state.detail.id)}/review`, { method: 'POST', body: { action, feedbackMarkdown } });
          state.detail = payload.workItem;
          paintEditor(project);
          await fetchList(project.id);
          if (action === 'approved') {
            await window.PdosUI?.reloadProject?.(project.id);
          }
          if (action === 'approved' && payload.nextWorkItem) {
            const next = payload.nextWorkItem;
            const run = await apiRequest('/agent-runs', {
              method: 'POST',
              body: {
                projectId: project.id,
                agentType: next.agentType,
                agentRequestId: next.agentRequestId,
                workItemId: next.id,
                options: { stageId: next.deliveryStageId },
              },
            });
            await fetchList(project.id);
            await openEditor(project, next.id);
            showToast(`Resultado aplicado. A próxima subtarefa “${next.title}” foi iniciada.`, 'ok');
            pollConnectedTask(project, run.agentJob?.id || run.promptRun?.id, next.id);
          } else {
            showToast(action === 'approved' ? 'Resultado aprovado e aplicado ao projecto.' : 'Decisão registada.', 'ok');
          }
        } catch (err) {
          showToast(err.message, 'error');
          await fetchList(project.id).catch(() => {});
        } finally {
          taskReview.disabled = false;
        }
        return;
      }

      const reviewDecision = event.target.closest('[data-ado-review-decision]');
      if (reviewDecision) {
        try {
          await apiRequest(`/projects/${encodeURIComponent(project.id)}/human-reviews/${encodeURIComponent(reviewDecision.dataset.domainId)}/resolve`, { method: 'POST', body: { action: reviewDecision.dataset.adoReviewDecision, status: reviewDecision.dataset.adoReviewDecision, applyChanges: reviewDecision.dataset.adoReviewDecision === 'approved' } });
          await fetchDetail(project.id, state.selectedId); paintEditor(project); await fetchList(project.id); showToast('Decisão registada.', 'ok');
        } catch (err) { showToast(err.message, 'error'); }
        return;
      }

      const approvalDecision = event.target.closest('[data-ado-approval-decision]');
      if (approvalDecision) {
        try {
          await apiRequest(`/projects/${encodeURIComponent(project.id)}/client-approvals`, { method: 'POST', body: { approvalId: approvalDecision.dataset.domainId, action: approvalDecision.dataset.adoApprovalDecision } });
          await fetchDetail(project.id, state.selectedId); paintEditor(project); await fetchList(project.id); showToast('Decisão registada.', 'ok');
        } catch (err) { showToast(err.message, 'error'); }
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
        if (!window.confirm(state.detail.origin === 'agent'
          ? 'Remover esta tarefa? A plataforma também cancelará a execução ligada no Agent Runtime.'
          : 'Remover esta tarefa?')) return;
        try {
          const payload = await apiRequest(
            `/projects/${encodeURIComponent(project.id)}/work-items/${encodeURIComponent(state.detail.id)}`,
            { method: 'DELETE' },
          );
          state.items = state.items.filter((item) => item.id !== state.detail.id);
          leaveEditorMode();
          refreshBoardView();
          fetchMeta(project.id);
          showToast(payload.cancellation?.requested
            ? `Tarefa removida; cancelamento do agente ${payload.cancellation.status === 'cancelled' ? 'confirmado' : 'pedido'}.`
            : 'Tarefa removida.', 'ok');
        } catch (err) {
          showToast(err.message, 'error');
        }
      }
    });

    root.addEventListener('change', async (event) => {
      project = window.state?.selectedProject || project;
      if (event.target.closest('[data-ado-show-completed]')) {
        state.showCompleted = event.target.checked;
        await fetchList(project.id);
        refreshBoardView();
        return;
      }
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
        if (event.target.name === 'assigneeUserId') {
          const member = (project.members || []).find((entry) => entry.userId === event.target.value);
          if (member?.role === 'client' && event.target.form?.elements.clientVisible && !event.target.form.elements.clientVisible.checked) {
            event.target.form.elements.clientVisible.checked = true;
            showToast('A tarefa ficou visível porque foi atribuída a um cliente.', 'ok');
          }
        }
        scheduleAutoSave(project);
      }
    });

    root.addEventListener('input', (event) => {
      project = window.state?.selectedProject || project;
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

    root.addEventListener('keydown', (event) => {
      project = window.state?.selectedProject || project;
      const row = event.target.closest('.ado-list-row-task[data-work-item-id]');
      if (row && (event.key === 'Enter' || event.key === ' ')) {
        event.preventDefault();
        openEditor(project, row.dataset.workItemId);
      }
    });

    root.addEventListener('submit', async (event) => {
      project = window.state?.selectedProject || project;
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
      project = window.state?.selectedProject || project;
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

  async function open(project, options = {}) {
    if (!project?.id) return;
    const root = $('workItemsRoot');
    if (!root) return;

    if (state.projectId !== project.id) {
      state.projectId = project.id;
      state.loaded = false;
      state.items = [];
      state.meta = null;
      state.suggestions = [];
      state.agentRequests = [];
      state.detailChangeSets = [];
      state.automationRules = [];
      state.selectedIds.clear();
      state.filters.planPhaseId = '';
      state.filtersOpen = false;
      if (state.mode === 'editor') leaveEditorMode();
    }
    const requestedStage = options.deliveryStageId || window.state?.tabFilters?.deliveryStageId || '';
    if (requestedStage && state.filters.stage !== requestedStage) { state.filters.stage = requestedStage; state.loaded = false; }
    if (options.planPhaseId && state.filters.planPhaseId !== options.planPhaseId) { state.filters.planPhaseId = options.planPhaseId; state.loaded = false; }

    syncModeLayout();
    renderToolbar();
    void refreshRuntimeHealth();
    scheduleRuntimeHealthRefresh();
    scheduleTaskBoardRefresh();

    if (!state.loaded) {
      $('workItemsBoard').innerHTML = '<p class="ado-empty">A carregar tarefas…</p>';
      try {
        await fetchList(project.id);
        await fetchMeta(project.id).catch(() => null);
        await fetchAgentRequests(project.id).catch(() => []);
        await fetchSuggestions(project.id).catch(() => []);
      } catch (err) {
        $('workItemsBoard').innerHTML = `<p class="ado-empty">${escapeHtml(err.message)}</p>`;
        return;
      }
    }

    refreshBoardView();
    wireEvents(project);
    const params = new URLSearchParams(window.location.search);
    const pathRoute = readTaskRoute();
    const requestId = pathRoute.requestId || params.get('agentRequest');
    const taskId = pathRoute.taskId || params.get('task');
    if (requestId && state.selectedRequest?.id !== requestId) await openRequestPlan(project, requestId);
    else if (taskId && state.selectedId !== taskId) await openEditor(project, taskId);
  }

  document.addEventListener('engineering:changed', async (event) => {
    const project = window.state?.selectedProject;
    if (!project?.id || event.detail?.projectId !== project.id || !state.detail?.id || state.detail.id === '__new__') return;
    await fetchDetail(project.id, state.detail.id).catch(() => null);
    paintEditor(project);
  });

  window.WorkItemsUI = {
    open,
    fetchMeta,
    getMeta() {
      return state.meta;
    },
    openFiltered(project, filters = {}) { return open(project, filters); },
    openRequestPlan(project, requestId) { return openRequestPlan(project, requestId); },
    openTask(project, taskId) { return openEditor(project, taskId); },
    refreshTasks(project, options = {}) { return refreshTasks(project, options); },
    __testApplyExecution(snapshot) {
      const requestVersion = beginExecutionRequest();
      applyExecutionSnapshot(snapshot, requestVersion);
      const project = window.state?.selectedProject;
      if (!project || !state.detail) return;
      if (!$('workItemEditor')?.querySelector('[data-ado-agent-log]')) {
        paintEditor(project);
      } else {
        paintAgentExecution({ force: true });
      }
    },
  };
})();
