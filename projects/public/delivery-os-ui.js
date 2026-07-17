/* Product Delivery OS UI — shell, cards, drawer, agents, reviews */
(function () {
  const MODULE_NAV = [
    { id: '', label: 'Todos os módulos', title: 'Ver requisitos e artefactos de todos os módulos' },
    { id: 'CustomerNeed', label: 'Necessidade do cliente', title: 'Requisitos ligados à necessidade de negócio' },
    { id: 'Frontend', label: 'Frontend (ecrãs)', title: 'Aplicação visível ao utilizador' },
    { id: 'Backend', label: 'Backend (serviços)', title: 'APIs, regras de negócio e integrações' },
    { id: 'Database', label: 'Base de dados', title: 'Modelo e persistência de dados' },
    { id: 'System', label: 'System', title: 'Requisitos transversais, segurança, auditoria e regras globais' },
    { id: 'API', label: 'API', title: 'Contratos e endpoints entre sistemas' },
    { id: 'Integrations', label: 'Integrações', title: 'Ligações a sistemas externos' },
    { id: 'Tests', label: 'Testes', title: 'Casos de teste e validação' },
    { id: 'Operations', label: 'Operação', title: 'Monitorização e produção' },
  ];

  /** Módulo técnico só é relevante a partir da arquitectura — oculto em Requisitos e fases anteriores. */
  const STAGES_WITH_MODULE_NAV = new Set(['architecture', 'roadmap', 'implementation', 'validation']);

  function shouldShowModuleNav(stageId) {
    return STAGES_WITH_MODULE_NAV.has(stageId);
  }

  const FALLBACK_CONCEPTS = {
    capability: { title: 'Funcionalidade do produto', short: 'Bloco de valor que o sistema oferece — ex.: «Comprar plano», «Gerar cupom».', example: '' },
    cluster: { title: 'Grupo de requisitos', short: 'Requisitos relacionados dentro de uma funcionalidade.', example: '' },
    requirement: { title: 'Requisito', short: 'O que o sistema deve fazer ou como deve ser construído.', example: '' },
    architecturePack: { title: 'Pacote de arquitectura', short: 'Componentes, dados, APIs e riscos para um módulo técnico.', example: '' },
    module: { title: 'Módulo técnico', short: 'Frontend, Backend ou Base de dados — onde se implementa.', example: '' },
    humanReview: { title: 'Revisão humana', short: 'Aprovação antes de aplicar alterações propostas pela IA.', example: '' },
    artifact: { title: 'Artefacto', short: 'Documento ou resultado de uma fase.', example: '' },
    traceLink: { title: 'Ligação de rastreabilidade', short: 'Relação entre peças do projecto.', example: '' },
    snapshot: { title: 'Snapshot', short: 'Cópia do projecto num momento.', example: '' },
    stage: { title: 'Fase de entrega', short: 'Etapa do processo de entrega.', example: '' },
    promptRun: { title: 'Execução de agente', short: 'Prompt + resposta da IA, submetidos para revisão.', example: '' },
  };

  function getPlatformConcepts() {
    return window.state?.config?.platformConcepts || FALLBACK_CONCEPTS;
  }

  function getStageConceptKeys(stageId) {
    return window.state?.config?.stageConceptKeys?.[stageId]
      || { requirements: ['capability', 'cluster', 'requirement'], architecture: ['architecturePack', 'module'] }[stageId]
      || [];
  }

  function renderStageConceptBanner() {
    const el = $('pdosConceptBanner');
    if (el) el.innerHTML = '';
  }

  function renderPlatformGlossary() {
    /* Conteúdo movido para HelpUI (drawer global) */
  }

  const pdosState = {
    moduleFilter: '',
    drawerOpen: false,
    drawerLevel: 1,
    selectedCapabilityId: '',
    selectedClusterId: '',
    pendingPromptRun: null,
    activeJob: null,
    activeJobStep: '',
    activeRuntimeRun: null,
    activePlan: null,
    activePlanTaskId: '',
    promptLoadToken: 0,
    lastRuntimeOptions: null,
    lastRuntimePoll: null,
    lastRuntimeEvents: [],
    lastRuntimeSubtasks: [],
  };

  function nextPromptLoadToken() {
    pdosState.promptLoadToken += 1;
    return pdosState.promptLoadToken;
  }

  function isPromptLoadCurrent(token) {
    return token === pdosState.promptLoadToken;
  }

  function resetPromptWorkbenchUI({ summary = '', loading = false } = {}) {
    const raw = $('pdosPromptRaw');
    const output = $('pdosPromptOutput');
    const runId = $('pdosPromptRunId');
    const summaryEl = $('pdosPromptSummary');
    if (raw) {
      if (loading) raw.value = 'A carregar prompt…';
      raw.dataset.loading = loading ? '1' : '';
    }
    if (output) output.value = '';
    if (runId && loading) runId.value = '';
    if (summaryEl && summary) summaryEl.textContent = summary;
    // Show/hide spinner inside the workbench header while loading
    const wbHeader = $('pdosPromptWorkbench')?.querySelector('.pdos-prompt-loading-indicator');
    if (wbHeader) {
      if (loading) {
        wbHeader.innerHTML = `${typeof ylSpinner === 'function' ? ylSpinner('sm') : ''} <span>A carregar…</span>`;
        wbHeader.style.display = 'inline-flex';
      } else {
        wbHeader.style.display = 'none';
      }
    }
  }

  function actionableReviews(project) {
    return (project?.humanReviews || []).filter((r) => {
      if (r.status !== 'pending') return false;
      if (['information_classification', 'phase_link_sync'].includes(r.type)) return false;
      const sections = ensureArray(r.suggestedChanges?.sections);
      return (r.decisionsCount || 0) > 0 || sections.length > 0;
    });
  }

  const AGENT_TYPE_LABELS = {
    requirement_grouping: 'Agrupar requisitos',
    requirement_hierarchy: 'Reorganizar cadeia V',
  };
  function agentTypeLabel(agentType) {
    return AGENT_TYPE_LABELS[agentType] || agentType;
  }
  // Agentes que suportam divisao em lotes no cliente (espelha BATCHABLE_AGENTS).
  const BATCHABLE_AGENT_TYPES = ['requirement_grouping'];
  const AGENT_JOB_THRESHOLD = 25;

  const YAR_AGENT_BY_PLATFORM_TYPE = {
    reverse_idea: 'idea-to-requirements',
    requirements_to_architecture: 'requirements-to-architecture',
    roadmap_plan: 'architecture-to-roadmap',
    implementation_tasks: 'roadmap-to-implementation',
  };

  const RUNTIME_ACTIVE_STATUSES = new Set([
    'dispatching', 'claimed', 'running', 'queued', 'planning', 'executing',
    'self_review', 'verifying', 'cancel_requested',
  ]);
  const RUNTIME_PAUSED_STATUSES = new Set(['paused']);
  const RUNTIME_DONE_STATUSES = new Set([
    'result_received', 'waiting_review', 'pending_human_review', 'completed',
  ]);
  const RUNTIME_ERROR_STATUSES = new Set(['failed', 'cancelled']);

  const RUNTIME_STATUS_LABELS = {
    dispatching: 'A iniciar…',
    claimed: 'Pacote recebido',
    running: 'Em execução',
    queued: 'Na fila',
    planning: 'A planear tarefas',
    executing: 'A executar',
    self_review: 'Revisão automática',
    verifying: 'A verificar resultado',
    paused: 'Pausado',
    connection_lost: 'Ligação perdida — sem repetição automática',
    cancel_requested: 'Cancelamento pendente',
    result_received: 'Resultado recebido — a preparar revisão',
    waiting_review: 'Concluído — revisão humana',
    pending_human_review: 'Concluído — revisão humana',
    completed: 'Concluído',
    failed: 'Falhou',
    cancelled: 'Cancelado',
  };

  function yarAgentIdForPlatformType(agentType) {
    return YAR_AGENT_BY_PLATFORM_TYPE[agentType] || null;
  }

  function isAgentRuntimeEnabled() {
    const cfg = window.state?.config?.agentRuntime;
    return Boolean(cfg?.enabled);
  }

  function canRunViaAgentRuntime(agentType) {
    if (!isAgentRuntimeEnabled()) return false;
    const supported = window.state?.config?.agentRuntime?.supportedAgentTypes || Object.keys(YAR_AGENT_BY_PLATFORM_TYPE);
    return supported.includes(agentType) && Boolean(YAR_AGENT_BY_PLATFORM_TYPE[agentType]);
  }

  function resolveRuntimeAgentForPlan(plan) {
    if (!plan) return null;
    if (canRunViaAgentRuntime(plan.agentType)) return plan.agentType;
    if (
      plan.agentType === 'stage_transition'
      && plan.fromStageId === 'requirements'
      && plan.toStageId === 'architecture'
      && String(plan.direction || 'forward') === 'forward'
      && canRunViaAgentRuntime('requirements_to_architecture')
    ) {
      return 'requirements_to_architecture';
    }
    return null;
  }

  function planTransitionLabel(plan) {
    if (plan?.agentType !== 'stage_transition') return '';
    const dir = plan.direction === 'backward' ? 'retroceder' : 'avançar';
    if (plan.direction === 'backward') {
      return `${plan.toStageId} → ${plan.fromStageId} (${dir})`;
    }
    return `${plan.fromStageId} → ${plan.toStageId} (${dir})`;
  }

  function runtimeStatusLabel(status) {
    return RUNTIME_STATUS_LABELS[status] || status || '—';
  }

  function agentButtonLabel(text, agentType) {
    if (!canRunViaAgentRuntime(agentType)) return text;
    return text.replace(/com IA/gi, 'com YourLab Agent');
  }

  function buildAgentRuntimeOptions(agentType, project) {
    return {
      stageId: window.state?.deliverySelectedStageId,
      capabilityId: $('archGenCapability')?.value,
      moduleTag: $('archGenModule')?.value || pdosState.moduleFilter || undefined,
      enableWebSearch: ['discovery_research', 'reverse_idea', 'requirements_to_architecture'].includes(agentType),
    };
  }

  function agentModelProfiles() {
    return window.state?.config?.agentModelProfiles || {};
  }

  function selectedModelProfile() {
    const id = $('pdosAgentCfgModelProfile')?.value || 'medium';
    return agentModelProfiles()[id] || agentModelProfiles().medium || {
      id: 'medium',
      targetInputTokens: 14000,
      targetOutputTokens: 2500,
    };
  }

  function syncAgentProfileFields() {
    const profile = selectedModelProfile();
    if ($('pdosAgentCfgInputTokens')) $('pdosAgentCfgInputTokens').value = profile.targetInputTokens || 14000;
    if ($('pdosAgentCfgOutputTokens')) $('pdosAgentCfgOutputTokens').value = profile.targetOutputTokens || 2500;
  }

  function closeAgentConfigModal() {
    $('pdosAgentConfigModal')?.classList.add('hidden');
    pdosState.pendingAgentConfig = null;
  }

  function readAgentConfigFromForm() {
    const cfg = pdosState.pendingAgentConfig;
    if (!cfg) return null;
    return {
      agentType: cfg.agentType,
      project: cfg.project,
      prepare: cfg.prepare,
      options: {
        ...cfg.options,
        userRequest: $('pdosAgentCfgRequest')?.value?.trim() || cfg.options.userRequest || '',
        userRequestTitle: $('pdosAgentCfgRequest')?.value?.trim().split(/[.!?\n]/)[0].slice(0, 100) || cfg.options.userRequestTitle || '',
        desiredOutcome: $('pdosAgentCfgOutcome')?.value?.trim() || cfg.options.desiredOutcome || '',
        enableWebSearch: Boolean($('pdosAgentCfgWebSearch')?.checked),
        modelProfileId: $('pdosAgentCfgModelProfile')?.value || cfg.options.modelProfileId || 'medium',
        targetInputTokens: Number($('pdosAgentCfgInputTokens')?.value) || cfg.options.targetInputTokens,
        targetOutputTokens: Number($('pdosAgentCfgOutputTokens')?.value) || cfg.options.targetOutputTokens,
      },
      budget: {
        maxTokens: Number($('pdosAgentCfgMaxTokens')?.value) || cfg.prepare?.budget?.maxTokens || 120000,
        maxWallClockMinutes: Number($('pdosAgentCfgMaxMinutes')?.value) || cfg.prepare?.budget?.maxWallClockMinutes || 45,
        maxSubtasks: Number($('pdosAgentCfgMaxSubtasks')?.value) || cfg.prepare?.budget?.maxSubtasks || 8,
      },
    };
  }

  async function openAgentConfigModal(agentType, project, extraOptions = {}) {
    if (!canRunViaAgentRuntime(agentType)) {
      return false;
    }
    const defaultProfile = agentModelProfiles().medium || { targetInputTokens: 14000, targetOutputTokens: 2500 };
    const options = {
      modelProfileId: 'medium',
      targetInputTokens: defaultProfile.targetInputTokens,
      targetOutputTokens: defaultProfile.targetOutputTokens,
      ...buildAgentRuntimeOptions(agentType, project),
      ...extraOptions,
    };
    pdosState.pendingAgentConfig = { agentType, project, options, prepare: null };
    $('pdosAgentConfigModal')?.classList.remove('hidden');
    $('pdosAgentConfigTitle').textContent = `Configurar — ${agentFriendlyLabel(agentType)}`;
    $('pdosAgentConfigDesc').textContent = 'Explique o trabalho e o resultado esperado. O agente transformará o pedido em tarefas visíveis antes de executar.';
    if ($('pdosAgentCfgRequest')) $('pdosAgentCfgRequest').value = extraOptions.userRequest || `Executar ${agentFriendlyLabel(agentType)} nesta etapa do projecto.`;
    if ($('pdosAgentCfgOutcome')) $('pdosAgentCfgOutcome').value = extraOptions.desiredOutcome || '';
    const healthEl = $('pdosAgentConfigHealth');
    healthEl?.classList.add('hidden');

    try {
      const prepare = await apiRequest('/agent-runs/prepare', {
        method: 'POST',
        body: { projectId: project.id, agentType, options },
      });
      pdosState.pendingAgentConfig.prepare = prepare;
      pdosState.pendingAgentConfig.options = options;

      const profileSelect = $('pdosAgentCfgModelProfile');
      if (profileSelect) {
        const profiles = agentModelProfiles();
        const ids = Object.keys(profiles);
        if (ids.length) {
          profileSelect.innerHTML = ids.map((id) => `<option value="${escapeHtml(id)}">${escapeHtml(id)}</option>`).join('');
        }
        profileSelect.value = options.modelProfileId || prepare.modelProfileId || 'medium';
      }
      syncAgentProfileFields();
      $('pdosAgentCfgMaxTokens').value = prepare.budget?.maxTokens ?? 120000;
      $('pdosAgentCfgMaxMinutes').value = prepare.budget?.maxWallClockMinutes ?? 45;
      $('pdosAgentCfgMaxSubtasks').value = prepare.budget?.maxSubtasks ?? 8;
      $('pdosAgentCfgWebSearch').checked = options.enableWebSearch !== false;
      renderAgentConfigPlan(prepare, Number($('pdosAgentCfgMaxSubtasks').value));

      if (pdosState.activePlan?.tasks?.length && (
        pdosState.activePlan.agentType === agentType
        || resolveRuntimeAgentForPlan(pdosState.activePlan) === agentType
      )) {
        const epTasks = pdosState.activePlan.tasks;
        if (!pdosState.pendingAgentConfig.prepare?.taskPlan?.tasks?.length) {
          pdosState.pendingAgentConfig.prepare = {
            ...(pdosState.pendingAgentConfig.prepare || {}),
            taskPlan: {
              masterPlanMarkdown: pdosState.activePlan.masterPlanMarkdown,
              tasks: epTasks.map((t) => ({
                id: t.id,
                title: t.title,
                instruction: t.instruction,
                estimatedInputTokens: t.estimatedInputTokens,
                targetOutputTokens: t.targetOutputTokens,
                contextFromTaskIds: t.contextFromTaskIds,
                verificationPrompt: t.verificationPrompt,
                regressionGuardPrompt: t.regressionGuardPrompt,
                mergePrompt: t.mergePrompt,
                reversePrompt: t.reversePrompt,
                diagramType: t.diagramType,
                role: t.role,
                requirementIds: t.requirementIds,
                dependsOn: t.dependsOn,
              })),
              totalRequirements: project.requirementCount ?? ensureArray(project.requirements).length,
              diagramTaskCount: epTasks.filter((t) => t.diagramType || t.role === 'diagram').length,
            },
          };
        }
        renderAgentConfigPlan(pdosState.pendingAgentConfig.prepare, Number($('pdosAgentCfgMaxSubtasks').value));
      }

      $('pdosAgentCfgMaxSubtasks')?.addEventListener('change', () => {
        renderAgentConfigPlan(pdosState.pendingAgentConfig?.prepare, Number($('pdosAgentCfgMaxSubtasks').value));
      });
      $('pdosAgentCfgModelProfile')?.addEventListener('change', syncAgentProfileFields);

      if (healthEl) {
        if (prepare.runtimeReachable) {
          healthEl.textContent = 'Agent Runtime ligado e pronto.';
          healthEl.classList.remove('hidden');
          healthEl.classList.add('is-ok');
        } else {
          healthEl.textContent = prepare.runtimeHealth?.waitingForConnector
            ? `O trabalho ficará na fila até ${prepare.runtimeHealth.connector?.name || 'o Agent Runtime'} voltar a ligar.`
            : `Agent Runtime indisponível: ${prepare.runtimeHealth?.error || 'sem ligação'}.`;
          healthEl.classList.remove('hidden', 'is-ok');
        }
      }
    } catch (err) {
      showToast(err.message, 'error');
      if (healthEl) {
        healthEl.textContent = err.message;
        healthEl.classList.remove('hidden', 'is-ok');
      }
    }
    return true;
  }

  function buildRuntimeTaskPlanForSubmit(prepare, maxSubtasks) {
    const plan = prepare?.taskPlan;
    if (!plan?.tasks?.length) return null;
    const limit = Math.max(1, Number(maxSubtasks) || 8);
    const mergeTask = plan.tasks.find((t) => t.role === 'merge');
    const work = plan.tasks.filter((t) => t.role !== 'merge');
    const selected = work.slice(0, Math.max(1, limit - (mergeTask ? 1 : 0)));
    const deferred = work.slice(selected.length);
    const active = [...selected, ...(mergeTask ? [mergeTask] : [])];
    return {
      masterPlanMarkdown: plan.masterPlanMarkdown,
      deferredTaskCount: deferred.length,
      runtimeTasks: active.map((t) => ({
        id: t.id,
        title: t.title,
        instruction: t.instruction,
        estimatedInputTokens: t.estimatedInputTokens,
        targetOutputTokens: t.targetOutputTokens,
        contextFromTaskIds: t.contextFromTaskIds,
        verificationPrompt: t.verificationPrompt,
        regressionGuardPrompt: t.regressionGuardPrompt,
        mergePrompt: t.mergePrompt,
        reversePrompt: t.reversePrompt,
        diagramType: t.diagramType,
        role: t.role,
        requirementIds: t.requirementIds,
        dependsOn: t.dependsOn,
      })),
    };
  }

  function renderAgentPlanList(tasks, { listId = 'pdosAgentPlanList', wrapId = 'pdosAgentPlanWrap', subtaskStatuses = [] } = {}) {
    const wrap = $(wrapId);
    const list = $(listId);
    if (!wrap || !list || !tasks?.length) {
      wrap?.classList.add('hidden');
      return;
    }
    wrap.classList.remove('hidden');
    list.innerHTML = tasks.map((task, index) => {
      const st = subtaskStatuses[index];
      let stateClass = task.deferred ? 'is-deferred' : '';
      if (st === 'running') stateClass = 'is-running';
      if (st === 'done') stateClass = 'is-done';
      const tag = task.deferred
        ? 'Adiada (orçamento)'
        : task.role === 'merge'
          ? 'Consolidação'
          : task.reqKind === 'stakeholder'
            ? 'STK'
            : task.reqKind === 'functional'
              ? 'FR'
              : task.reqKind === 'non_functional'
                ? 'RNF'
                : task.reqKind === 'test_case'
                  ? 'TC'
                  : task.diagramType || 'diagrama';
      const meta = [
        task.phaseName ? escapeHtml(task.phaseName) : '',
        `${task.requirementIds?.length || 0} requisito(s)`,
        task.dependsOn?.length ? `após ${task.dependsOn.length} tarefa(s)` : '',
      ].filter(Boolean).join(' · ');
      return `
        <li class="pdos-agent-plan-node ${stateClass}">
          <span class="pdos-agent-plan-step">${index + 1}</span>
          <div class="pdos-agent-plan-body">
            <strong>${escapeHtml(task.title)}</strong>
            <div class="pdos-agent-plan-meta">${escapeHtml(meta)}</div>
          </div>
          <span class="pdos-agent-plan-tag${task.deferred ? ' is-deferred' : ''}">${escapeHtml(tag)}</span>
        </li>`;
    }).join('');
  }

  function renderAgentConfigPlan(prepare, maxSubtasks) {
    const wrap = $('pdosAgentConfigPlanWrap');
    const summary = $('pdosAgentConfigPlanSummary');
    const list = $('pdosAgentConfigPlanList');
    if (!prepare?.taskPlan?.tasks?.length) {
      wrap?.classList.add('hidden');
      return;
    }
    wrap?.classList.remove('hidden');
    const plan = prepare.taskPlan;
    if (summary) {
      summary.textContent = `${plan.totalRequirements || 0} requisitos → ${plan.diagramTaskCount || 0} diagrama(s) planeados. O orçamento de sub-tarefas limita quantas correm nesta execução.`;
    }
    const limit = Math.max(1, Number(maxSubtasks) || 8);
    const mergeTask = plan.tasks.find((t) => t.role === 'merge');
    const work = plan.tasks.filter((t) => t.role !== 'merge');
    const selected = work.slice(0, Math.max(1, limit - (mergeTask ? 1 : 0)));
    const deferred = work.slice(selected.length);
    const displayTasks = [
      ...selected.map((t) => ({ ...t, deferred: false })),
      ...deferred.map((t) => ({ ...t, deferred: true })),
      ...(mergeTask ? [{ ...mergeTask, deferred: false }] : []),
    ];
    renderAgentPlanList(displayTasks, { listId: 'pdosAgentConfigPlanList', wrapId: 'pdosAgentConfigPlanWrap' });
    if (deferred.length && list) {
      const note = document.createElement('p');
      note.className = 'muted-text pdos-agent-plan-deferred-note';
      note.textContent = `${deferred.length} tarefa(s) adiada(s) — aumente sub-tarefas ou continue depois de pausar.`;
      if (!wrap.querySelector('.pdos-agent-plan-deferred-note')) wrap.appendChild(note);
      else wrap.querySelector('.pdos-agent-plan-deferred-note').textContent = note.textContent;
    }
  }

  function closeManualTasksModal() {
    $('pdosAgentManualTasksModal')?.classList.add('hidden');
  }

  function closeAgentContinueModal() {
    $('pdosAgentContinueModal')?.classList.add('hidden');
  }

  function openAgentContinueModal(reason) {
    $('pdosAgentContinueReason').textContent = reason || 'Execução pausada — pode continuar com mais orçamento ou concluir parcialmente.';
    $('pdosAgentContinueModal')?.classList.remove('hidden');
  }

  function openManualAuxPrompt(task, key, title) {
    closeManualTasksModal();
    openPromptWorkbench({
      prompt: task?.[key] || '',
      promptRun: { summaryMarkdown: `${title}: ${task?.title || 'tarefa'}` },
    }, { bumpToken: false });
  }

  async function openManualPromptFromConfig() {
    const cfg = readAgentConfigFromForm();
    if (!cfg) return;
    const taskPlan = buildRuntimeTaskPlanForSubmit(cfg.prepare || pdosState.pendingAgentConfig?.prepare, cfg.budget.maxSubtasks);
    closeAgentConfigModal();

    if (taskPlan?.runtimeTasks?.length) {
      const list = $('pdosAgentManualTasksList');
      $('pdosAgentManualTasksModal')?.classList.remove('hidden');
      if (list) {
        list.innerHTML = taskPlan.runtimeTasks.map((task, index) => `
          <article class="pdos-agent-manual-task-card">
            <h4>${index + 1}. ${escapeHtml(task.title)}</h4>
            <p>${escapeHtml(task.diagramType || task.role || 'tarefa')} · ${task.requirementIds?.length || 0} requisito(s) · ${task.estimatedInputTokens || 0}/${task.targetOutputTokens || 0} tokens</p>
            <div class="pdos-agent-runtime-actions">
              <button type="button" class="btn tiny primary" data-manual-task-prompt="${index}">Prompt</button>
              ${task.verificationPrompt ? `<button type="button" class="btn tiny" data-manual-task-aux="${index}:verificationPrompt">Verificação</button>` : ''}
              ${task.regressionGuardPrompt ? `<button type="button" class="btn tiny" data-manual-task-aux="${index}:regressionGuardPrompt">Regression guard</button>` : ''}
              ${task.reversePrompt ? `<button type="button" class="btn tiny" data-manual-task-aux="${index}:reversePrompt">Reverse</button>` : ''}
              ${task.mergePrompt ? `<button type="button" class="btn tiny" data-manual-task-aux="${index}:mergePrompt">Merge</button>` : ''}
            </div>
          </article>`).join('');
        pdosState.manualTaskPrompts = taskPlan.runtimeTasks;
        list.querySelectorAll('[data-manual-task-aux]').forEach((btn) => {
          btn.addEventListener('click', () => {
            const [idx, key] = String(btn.dataset.manualTaskAux || '').split(':');
            const task = pdosState.manualTaskPrompts[Number(idx)];
            const labels = {
              verificationPrompt: 'Prompt de verificação',
              regressionGuardPrompt: 'Regression guard',
              reversePrompt: 'Reverse propagation',
              mergePrompt: 'Prompt de merge',
            };
            openManualAuxPrompt(task, key, labels[key] || 'Prompt auxiliar');
          });
        });
        list.querySelectorAll('[data-manual-task-prompt]').forEach((btn) => {
          btn.addEventListener('click', async () => {
            const task = pdosState.manualTaskPrompts[Number(btn.dataset.manualTaskPrompt)];
            const loadToken = nextPromptLoadToken();
            closeManualTasksModal();
            openPromptWorkbench({
              prompt: task.instruction || '',
              promptRun: { summaryMarkdown: `Tarefa manual: ${task.title}` },
            }, { bumpToken: false });
            try {
              const res = await apiRequest(`/projects/${cfg.project.id}/prompt-runs`, {
                method: 'POST',
                body: {
                  agentType: cfg.agentType,
                  stageId: cfg.options.stageId || 'architecture',
                  capabilityId: cfg.options.capabilityId,
                  moduleTag: cfg.options.moduleTag,
                },
              });
              if (!isPromptLoadCurrent(loadToken)) return;
              pdosState.pendingPromptRun = res.promptRun;
              $('pdosPromptRunId').value = res.promptRun?.id || '';
            } catch (err) {
              if (!isPromptLoadCurrent(loadToken)) return;
              showToast(err.message, 'error');
            }
          });
        });
      }
      return;
    }

    const loadToken = nextPromptLoadToken();
    try {
      const res = await apiRequest(`/projects/${cfg.project.id}/prompt-runs`, {
        method: 'POST',
        body: {
          agentType: cfg.agentType,
          stageId: cfg.options.stageId,
          capabilityId: cfg.options.capabilityId,
          moduleTag: cfg.options.moduleTag,
        },
      });
      if (!isPromptLoadCurrent(loadToken)) return;
      pdosState.pendingPromptRun = res.promptRun;
      openPromptWorkbench(res, { bumpToken: false });
      showToast('Prompt gerado — modo manual (copiar/colar no workbench)');
    } catch (err) {
      if (!isPromptLoadCurrent(loadToken)) return;
      showToast(err.message, 'error');
    }
  }

  async function startAgentFromConfig(ev) {
    ev?.preventDefault();
    const cfg = readAgentConfigFromForm();
    if (!cfg) return;
    const prepare = pdosState.pendingAgentConfig?.prepare;
    const taskPlan = buildRuntimeTaskPlanForSubmit(prepare, cfg.budget.maxSubtasks);
    pdosState.lastRuntimeOptions = { ...cfg.options, taskPlan, maxSubtasks: cfg.budget.maxSubtasks };
    closeAgentConfigModal();
    await runYourlabAgent(cfg.agentType, cfg.project, {
      options: {
        ...cfg.options,
        taskPlan,
        maxSubtasks: cfg.budget.maxSubtasks,
      },
      budget: cfg.budget,
      taskPlan,
    });
  }

  const SUBTASK_STATUS_LABELS = {
    pending: 'Pendente',
    running: 'A executar',
    done: 'Concluída',
    failed: 'Falhou',
  };

  function renderAgentSubtasks(payload) {
    const wrap = $('pdosAgentSubtasksWrap');
    const list = $('pdosAgentSubtasksList');
    if (!wrap || !list) return;

    let subtasks = ensureArray(payload?.subtasks);
    if (subtasks.length) {
      pdosState.lastRuntimeSubtasks = subtasks;
    } else if (pdosState.lastRuntimeSubtasks?.length) {
      subtasks = pdosState.lastRuntimeSubtasks;
    }

    const yarStatus = payload?.yarJob?.status || payload?.agentJob?.status;

    if (!subtasks.length) {
      if (['planning', 'dispatching', 'queued', 'running'].includes(yarStatus)) {
        wrap.classList.remove('hidden');
        list.innerHTML = '<li class="muted-text">A planear sub-tarefas…</li>';
        return;
      }
      wrap.classList.add('hidden');
      list.innerHTML = '';
      return;
    }

    const runningFromEvents = new Set();
    const doneFromEvents = new Set();
    ensureArray(payload?.events).forEach((ev) => {
      const idx = ev.data?.index;
      if (idx === undefined || idx === null) return;
      if (ev.type === 'subtask_started') runningFromEvents.add(idx);
      if (ev.type === 'subtask_done') {
        doneFromEvents.add(idx);
        runningFromEvents.delete(idx);
      }
    });

    wrap.classList.remove('hidden');
    list.innerHTML = subtasks.map((st, index) => {
      let status = st.status || 'pending';
      if (status === 'pending' && doneFromEvents.has(index)) status = 'done';
      else if ((status === 'pending' || status === 'running') && runningFromEvents.has(index)) status = 'running';
      const icon = status === 'done' ? '✓' : status === 'running' ? '▶' : '○';
      return `
        <li class="pdos-agent-subtask-row is-${status}">
          <span class="pdos-agent-subtask-icon" aria-hidden="true">${icon}</span>
          <div class="pdos-agent-subtask-body">
            <strong>${escapeHtml(st.title || `Sub-tarefa ${index + 1}`)}</strong>
            <span class="pdos-agent-subtask-status">${escapeHtml(SUBTASK_STATUS_LABELS[status] || status)}</span>
          </div>
        </li>`;
    }).join('');

    const planTasks = pdosState.activeTaskPlan?.runtimeTasks
      || pdosState.pendingAgentConfig?.prepare?.taskPlan?.tasks;
    if (planTasks?.length) {
      const statuses = subtasks.map((st) => st.status || 'pending');
      renderAgentPlanList(planTasks, { subtaskStatuses: statuses });
    }
  }

  function ensureArray(value) {
    return Array.isArray(value) ? value : [];
  }

  function $(id) { return document.getElementById(id); }

  function reqMatchesModule(req, mod) {
    if (!mod) return true;
    const tags = Array.isArray(req.moduleTags) ? req.moduleTags : [];
    if (tags.includes(mod)) return true;
    return String(req.module || '') === mod;
  }

  function countByStatus(requirements, ids) {
    const set = new Set(ids || []);
    const subset = ids ? requirements.filter((r) => set.has(r.id)) : requirements;
    const approved = subset.filter((r) => ['approved', 'planned', 'in_development', 'validated', 'delivered'].includes(r.status)).length;
    return { total: subset.length, approved, pending: subset.length - approved };
  }

  const STAGE_STATUS_LABEL = {
    not_started: 'Por iniciar',
    in_progress: 'Em curso',
    pending_review: 'Revisão',
    approved: 'Aprovado',
    blocked: 'Bloqueado',
    done: 'Concluído',
  };

  function getStageOrder() {
    return window.state?.config?.stageOrder || [
      'idea', 'discovery', 'requirements', 'architecture', 'roadmap',
      'implementation', 'validation', 'delivery', 'operations',
    ];
  }

  function getStages(project) {
    const flow = window.state?.config?.deliveryStageFlow || [];
    const fromProject = Array.isArray(project?.stages) ? project.stages : [];
    const byId = new Map(fromProject.map((s) => [s.id, s]));
    return getStageOrder().map((id) => {
      const base = flow.find((s) => s.id === id) || { id, label: id };
      const current = byId.get(id) || {};
      return {
        id,
        label: current.label || base.label || id,
        status: current.status || 'not_started',
        requiresHumanApproval: current.requiresHumanApproval === true,
      };
    });
  }

  function resolveProcessStageId(project, stages) {
    const inProgress = stages.find((s) => s.status === 'in_progress');
    if (inProgress) return inProgress.id;
    if (window.state?.deliverySelectedStageId) return window.state.deliverySelectedStageId;
    const pendingReview = stages.find((s) => s.status === 'pending_review');
    if (pendingReview) return pendingReview.id;
    const notDone = stages.find((s) => !['done', 'approved'].includes(s.status));
    return notDone?.id || stages[0]?.id || 'idea';
  }

  function projectDescription(project) {
    return String(
      project.description
      || project.summary?.scopeInPlainLanguage
      || project.summary?.businessContext
      || project.summary?.solutionOverview
      || ''
    ).trim();
  }

  function proposalCanViewHistory() {
    try {
      return window.ProposalDownloads?.canViewProposalHistory?.() || (typeof isSuperAdmin === 'function' && isSuperAdmin());
    } catch {
      return false;
    }
  }

  function renderProjectHeader(project) {
    const el = $('pdosProjectHeader');
    if (!el || !project) return;
    const latestCommercial = proposalCanViewHistory() && window.ProposalDownloads?.findLatestCommercial?.(project);
    const downloadActions = latestCommercial && window.ProposalDownloads?.renderActions
      ? window.ProposalDownloads.renderActions(project.id, latestCommercial, { compact: true })
      : '';
    el.innerHTML = `
      <div class="pdos-header-grid pdos-header-compact">
        <div class="pdos-header-main">
          <h2>${escapeHtml(project.name)}</h2>
        </div>
        <div class="pdos-header-side">
          <details class="pdos-project-more">
            <summary>Acções do projecto</summary>
            <div class="pdos-header-actions" role="group" aria-label="Acções do projecto">
              <button class="btn pdos-header-btn" id="pdosRelinkBtn" type="button">Reaplicar ligações</button>
              <button class="btn primary pdos-header-btn" id="pdosGenProposalBtn" type="button">Gerar proposta</button>
            </div>
            ${downloadActions ? `<div class="pdos-header-downloads">${downloadActions}</div>` : ''}
          </details>
        </div>
      </div>
    `;
    $('pdosRelinkBtn')?.addEventListener('click', () => relinkPhases());
    $('pdosGenProposalBtn')?.addEventListener('click', () => generateCommercialProposal());
  }

  function stageStatusClass(status) {
    return String(status || 'not_started').replace(/[^a-z_]/g, '');
  }

  function renderGoldenTimeline(project) {
    const el = $('pdosGoldenTimeline');
    if (!el || !project) return;

    const stages = getStages(project);
    const processStageId = resolveProcessStageId(project, stages);
    if (!window.state.deliverySelectedStageId) {
      window.state.deliverySelectedStageId = processStageId;
    }

    const nodes = collectDeliveryFeedNodes(project);
    const parts = [];

    stages.forEach((stage, index) => {
      const count = nodes.filter((n) => n.stageId === stage.id).length;
      const isSelected = stage.id === window.state.deliverySelectedStageId;
      const isProcess = stage.id === processStageId;
      const status = stageStatusClass(stage.status);

      parts.push(`
        <button type="button"
          class="golden-stage-node ${isSelected ? 'is-selected' : ''} ${isProcess ? 'is-process' : ''} status-${status}"
          data-delivery-stage="${escapeHtml(stage.id)}"
          title="${escapeHtml(STAGE_STATUS_LABEL[stage.status] || stage.status)}">
          <span class="golden-stage-label">${escapeHtml(stage.label)}</span>
          <span class="golden-stage-status">${escapeHtml(STAGE_STATUS_LABEL[stage.status] || stage.status)}</span>
          <span class="golden-stage-count">${count}</span>
          ${stage.requiresHumanApproval && stage.status !== 'approved' ? '<span class="golden-stage-gate" title="Gate de aprovação">⏸</span>' : ''}
        </button>
      `);

      if (index < stages.length - 1) {
        const next = stages[index + 1];
        parts.push(`
          <button type="button" class="golden-connector"
            data-from-stage="${escapeHtml(stage.id)}"
            data-to-stage="${escapeHtml(next.id)}"
            title="Transição ${escapeHtml(stage.label)} ↔ ${escapeHtml(next.label)} — agente de apoio à mudança de fase">
            <span class="golden-connector-line"></span>
            <span class="golden-connector-icon">⟷</span>
          </button>
        `);
      }
    });

    el.innerHTML = `<div class="golden-timeline-track">${parts.join('')}</div>`;

    const badge = $('pdosCurrentStageBadge');
    if (badge) {
      const selectedId = window.state.deliverySelectedStageId || processStageId;
      const current = stages.find((s) => s.id === selectedId) || stages[0];
      badge.innerHTML = `
        <span class="pdos-badge-label">Fase aberta</span>
        <strong>${escapeHtml(current?.label || selectedId)}</strong>
        <small>${escapeHtml(STAGE_STATUS_LABEL[current?.status] || '')}</small>
      `;
    }

    el.querySelectorAll('[data-delivery-stage]').forEach((btn) => {
      btn.addEventListener('click', () => {
        window.state.deliverySelectedStageId = btn.dataset.deliveryStage;
        renderGoldenTimeline(project);
        renderStageGuidance(project);
        renderCurrentFocus(project);
        renderStageConceptBanner();
        renderModuleNav();
        renderHumanReviewsSection(project);
        renderCardFeed(project);
        renderTracePanel(project);
        window.DiagramsUI?.renderShell?.(project);
        window.renderPhaseContextBar?.();
        window.DeliveryOsPlatform?.syncUrlDeepLink?.(btn.dataset.deliveryStage, 'deliveryos');
        window.DeliveryOsPlatform?.refreshPlatformUi?.(project);
      });
    });

    el.querySelectorAll('.golden-connector').forEach((btn) => {
      btn.addEventListener('click', (e) => {
        e.stopPropagation();
        openTransitionPicker(btn.dataset.fromStage, btn.dataset.toStage, project);
      });
    });

    el.querySelectorAll('.golden-stage-gate').forEach((gate) => {
      gate.addEventListener('click', async (e) => {
        e.stopPropagation();
        const node = gate.closest('[data-delivery-stage]');
        if (!node || !project?.id) return;
        try {
          await apiRequest(`/projects/${project.id}/stages/${node.dataset.deliveryStage}/approve`, { method: 'POST', body: {} });
          showToast('Stage aprovado');
          await reloadProject(project.id);
        } catch (err) {
          showToast(err.message, 'error');
        }
      });
    });
  }

  function renderStageGuidance(project) {
    // Navigation is handled by the golden timeline only — no bottom guidance bar.
    const el = $('pdosStageGuidance');
    if (el) el.innerHTML = '';
  }

  function renderCurrentFocus(project) {
    // Pending reviews are shown in the dedicated human-review panel.
    const el = $('pdosCurrentFocus');
    if (el) el.innerHTML = '';
  }

  function agentFriendlyLabel(agentType, plan = null) {
    const map = {
      reverse_idea: 'Visão da ideia',
      discovery_research: 'Descoberta',
      roadmap_plan: 'Roadmap',
      implementation_stack: 'Stack técnica',
      implementation_tasks: 'Tarefas',
      commercial_proposal: 'Proposta comercial',
      requirement_grouping: 'Agrupamento',
      requirement_hierarchy: 'Cadeia V',
      diagram_to_requirements: 'Diagrama → Requisitos',
      requirements_to_architecture: 'Arquitectura',
      capability_requirements: 'Requisitos',
      stage_transition: 'Transição de fase',
      meeting_classification: 'Classificação de ata',
    };
    const activePlan = plan || (agentType === 'stage_transition' ? pdosState.activePlan : null);
    if (agentType === 'stage_transition' && activePlan) {
      const hint = planTransitionLabel(activePlan);
      if (hint) return `Transição ${hint}`;
    }
    return map[agentType] || agentType || 'Agente IA';
  }

  function renderHumanReviewsSection(project) {
    const el = $('pdosHumanReviews');
    if (!el) return;
    const pending = actionableReviews(project);
    if (!pending.length) {
      el.innerHTML = '';
      el.classList.add('hidden');
      return;
    }
    el.classList.remove('hidden');
    el.innerHTML = `
      <section class="pdos-reviews-panel" aria-label="Revisões humanas">
        <header class="pdos-reviews-head">
          <div>
            <span class="pdos-section-label">Revisão humana</span>
            <p class="pdos-reviews-sub">Alterações reais propostas pela IA — aprove, rejeite, reprompt ou reverta antes de aplicar.</p>
          </div>
          <span class="pdos-reviews-count">${pending.length} pendente(s)</span>
        </header>
        <div class="pdos-reviews-grid">
          ${pending.map((r) => {
            const promptRun = (project.promptRuns || []).find((pr) => pr.id === r.promptRunId || pr.id === r.sourceId);
            const agent = promptRun ? agentFriendlyLabel(promptRun.agentType) : '';
            const changes = r.decisionsCount || r.suggestedChanges?.sections?.length || 0;
            return `
              <article class="hr-card">
                <div class="hr-card-top">
                  <span class="hr-card-status">Aguarda decisão</span>
                  <span class="hr-card-meta-line">${r.readingTimeMinutes || 5} min · ${changes} alteração(ões)</span>
                </div>
                <h4 class="hr-card-title">${escapeHtml(r.title || 'Revisão pendente')}</h4>
                <p class="hr-card-summary">${escapeHtml(shortText(r.summaryMarkdown || '', 160))}</p>
                ${agent ? `<span class="hr-card-agent">${escapeHtml(agent)}</span>` : ''}
                <div class="hr-card-actions">
                  <button type="button" class="btn tiny primary" data-view-review="${escapeHtml(r.id)}">Abrir revisão</button>
                </div>
              </article>`;
          }).join('')}
        </div>
      </section>`;

    el.querySelectorAll('[data-view-review]').forEach((btn) => {
      btn.addEventListener('click', () => openReviewDrawer(project, btn.dataset.viewReview));
    });
  }

  function openTransitionPicker(fromStageId, toStageId, project) {
    const modal = $('pdosTransitionModal');
    if (!modal) return;
    const stages = getStages(project);
    const from = stages.find((s) => s.id === fromStageId);
    const to = stages.find((s) => s.id === toStageId);
    $('pdosTransitionTitle').textContent = `${from?.label || fromStageId} ↔ ${to?.label || toStageId}`;
    $('pdosTransitionDesc').textContent = 'Configure o pedido. Os prompts e resultados serão tratados dentro das tarefas.';
    $('pdosTransitionForwardLabel').textContent = `Avançar para ${to?.label || toStageId}`;
    $('pdosTransitionBackwardLabel').textContent = `Regenerar ${from?.label || fromStageId}`;
    modal.classList.remove('hidden');
    const form = $('pdosTransitionConfigForm');
    let previewTimer = null;
    let activePreview = null;
    let requestToken = 0;
    const directionValues = () => {
      const direction = form.elements.transitionDirection.value || 'forward';
      return { direction, fromStageId: direction === 'forward' ? fromStageId : toStageId, toStageId: direction === 'forward' ? toStageId : fromStageId };
    };
    const readConfig = () => ({
      userRequest: $('pdosTransitionRequest').value.trim(), desiredOutcome: $('pdosTransitionOutcome').value.trim(),
      modelProfileId: $('pdosTransitionModelProfile').value, targetInputTokens: Number($('pdosTransitionInputTokens').value),
      targetOutputTokens: Number($('pdosTransitionOutputTokens').value), maxTokens: Number($('pdosTransitionMaxTokens').value),
      maxWallClockMinutes: Number($('pdosTransitionMaxMinutes').value), maxSubtasks: Number($('pdosTransitionMaxSubtasks').value),
      enableWebSearch: $('pdosTransitionWebSearch').checked,
    });
    const fillConfig = (values = {}, firstRequest = false) => {
      $('pdosTransitionRequest').value = values.userRequest || `Produzir o trabalho necessário para a transição de ${from?.label || fromStageId} para ${to?.label || toStageId}.`;
      $('pdosTransitionOutcome').value = values.desiredOutcome || `Artefactos de ${to?.label || toStageId} prontos para revisão.`;
      $('pdosTransitionModelProfile').value = values.modelProfileId || 'medium';
      $('pdosTransitionInputTokens').value = values.targetInputTokens || 14000; $('pdosTransitionOutputTokens').value = values.targetOutputTokens || 2500;
      $('pdosTransitionMaxTokens').value = values.maxTokens || 120000; $('pdosTransitionMaxMinutes').value = values.maxWallClockMinutes || 45;
      $('pdosTransitionMaxSubtasks').value = values.maxSubtasks || 8; $('pdosTransitionWebSearch').checked = values.enableWebSearch !== false;
      $('pdosTransitionRegeneration').value = firstRequest ? 'full' : 'affected';
    };
    const paintPreview = (preview) => {
      activePreview = preview;
      const summary = preview.diffSummary || {};
      $('pdosTransitionChangeSummary').textContent = preview.baselineRequest
        ? `${summary.changedTasks || 0} alterada(s), ${summary.newTasks || 0} nova(s), ${summary.removedTasks || 0} removida(s). ${summary.changedContext ? 'O contexto do projecto mudou.' : ''}`
        : 'Primeiro pedido desta transição: será criada uma versão completa.';
      const list = $('pdosTransitionPlanList');
      list.innerHTML = (preview.tasks || []).map((task, index) => `<li class="pdos-transition-preview-task"><span class="pdos-agent-plan-step">${index + 1}</span><div><strong>${escapeHtml(task.title)}</strong><small>${escapeHtml((task.requiredSkills || []).join(' · ') || task.role || 'execução')}</small>${task.promptDiff ? `<details><summary>Ver alteração do subprompt</summary><pre>${escapeHtml(task.promptDiff)}</pre></details>` : ''}</div><span class="pdos-task-change is-${escapeHtml(task.changeType || 'new')}">${escapeHtml(({ new: 'Nova', changed: 'Alterada', unchanged: 'Sem alteração' })[task.changeType] || task.changeType)}</span></li>`).join('');
      $('pdosTransitionPlanWrap').classList.remove('hidden');
      $('pdosTransitionPlanHeading').textContent = `${preview.tasks?.length || 0} subtarefa(s) serão criadas`;
      $('pdosTransitionPromptDiff').textContent = preview.requestPromptDiff || 'Sem alterações no texto principal do pedido.';
      $('pdosTransitionDiffWrap').classList.toggle('hidden', !preview.baselineRequest);
    };
    const loadTransitionPreview = async () => {
      const token = ++requestToken; const transition = directionValues();
      $('pdosTransitionChangeSummary').textContent = 'A preparar a divisão e a comparação…';
      try {
        const res = await apiRequest(`/projects/${project.id}/work-items/stage-transitions/preview`, { method: 'POST', body: { ...transition, regenerationMode: $('pdosTransitionRegeneration').value, config: readConfig() } });
        if (token !== requestToken) return; paintPreview(res.preview);
      } catch (error) {
        if (token !== requestToken) return;
        $('pdosTransitionChangeSummary').textContent = error.message;
        $('pdosTransitionPlanWrap')?.classList.add('hidden');
      }
    };
    const loadSaved = async () => {
      const transition = directionValues();
      try {
        const res = await apiRequest(`/projects/${project.id}/work-items/stage-transitions/config?fromStageId=${encodeURIComponent(transition.fromStageId)}&toStageId=${encodeURIComponent(transition.toStageId)}&direction=${encodeURIComponent(transition.direction)}`);
        fillConfig(res.config?.values || {}, !res.config?.version); await loadTransitionPreview();
      } catch (error) { showToast(error.message, 'error'); }
    };
    form.oninput = () => { clearTimeout(previewTimer); previewTimer = setTimeout(loadTransitionPreview, 350); };
    form.onchange = (event) => { if (event.target.name === 'transitionDirection') loadSaved(); };
    form.onsubmit = async (event) => {
      event.preventDefault();
      if (!activePreview) return;
      if (activePreview.baselineRequest && !['completed', 'cancelled', 'superseded'].includes(activePreview.baselineRequest.status)
        && !confirm('Existe um pedido anterior ainda aberto. Criar esta versão irá substituí-lo e cancelar apenas o trabalho inacabado. Continuar?')) return;
      const button = $('pdosTransitionCreateRequest'); button.disabled = true; button.textContent = 'A criar tarefas…';
      try {
        const transition = directionValues();
        const res = await apiRequest(`/projects/${project.id}/work-items/stage-transitions/requests`, { method: 'POST', body: { ...transition, regenerationMode: $('pdosTransitionRegeneration').value, config: readConfig(), idempotencyKey: `transition:${project.id}:${Date.now()}` } });
        closeTransitionModal(); window.switchToTab?.('tarefas');
        if (res.parentTaskId) await window.WorkItemsUI?.openTask?.(project, res.parentTaskId);
        showToast('Pedido criado. Os prompts e resultados ficam agora nas tarefas.', 'ok');
      } catch (error) { showToast(error.message, 'error'); }
      finally { button.disabled = false; button.textContent = 'Criar pedido e tarefas'; }
    };
    loadSaved();
  }

  function closeTransitionModal() {
    $('pdosTransitionModal')?.classList.add('hidden');
  }

  async function runStageTransition(fromStageId, toStageId, direction, project) {
    closeTransitionModal();
    pdosState.pendingPromptRun = null;
    return openExecutionPlan('stage_transition', project, {
      fromStageId,
      toStageId,
      direction,
      stageId: direction === 'forward' ? toStageId : fromStageId,
    });
  }

  function formatRequirementLinks(ids) {
    const list = ensureArray(ids).filter(Boolean);
    if (!list.length) return '';
    return list.map((id) =>
      `<button type="button" class="req-link-chip" data-goto-requirement="${escapeHtml(id)}">${escapeHtml(id)}</button>`
    ).join(' ');
  }

  function renderModuleNav() {
    const stageId = window.state?.deliverySelectedStageId || 'requirements';
    const block = document.querySelector('.pdos-module-block');
    const show = shouldShowModuleNav(stageId);
    if (block) block.classList.toggle('hidden', !show);

    const el = $('pdosModuleNav');
    if (!el) return;
    if (!show) {
      el.innerHTML = '';
      return;
    }

    el.innerHTML = MODULE_NAV.map((m) => `
      <button type="button" class="pdos-module-pill ${pdosState.moduleFilter === m.id ? 'active' : ''}" data-module="${escapeHtml(m.id)}" title="${escapeHtml(m.title || m.label)}">${escapeHtml(m.label)}</button>
    `).join('');
    el.querySelectorAll('[data-module]').forEach((btn) => {
      btn.addEventListener('click', () => {
        pdosState.moduleFilter = btn.dataset.module || '';
        renderModuleNav();
        if (window.state?.selectedProject) {
          renderCardFeed(window.state.selectedProject);
          renderTracePanel(window.state.selectedProject);
        }
      });
    });
  }

  function normalizeJsonInput(raw) {
    return String(raw || '')
      .replace(/^\uFEFF/, '')
      .replace(/[\u201c\u201d\u201e\u201f\u2033\u2036]/g, '"')
      .replace(/[\u2018\u2019\u201a\u201b\u2032\u2035]/g, "'")
      .trim();
  }

  function openArtifactDrawer(project, artifactId) {
    const art = (project.artifacts || []).find((a) => a.id === artifactId);
    const drawer = $('pdosDetailDrawer');
    const content = $('pdosDrawerContent');
    if (!drawer || !content || !art) return;
    drawer.classList.remove('hidden');
    content.innerHTML = `
      <div class="pdos-drawer-head">
        <h3>${escapeHtml(art.name)}</h3>
        <button type="button" class="btn tiny ghost pdos-drawer-close">Fechar</button>
      </div>
      <p class="muted-text">${escapeHtml(art.type)} · ${escapeHtml(art.stageId || '')}</p>
      ${formatRequirementLinks(art.relatedRequirementIds || art.metadata?.requirementIds) ? `<div class="arch-req-links drawer-req-links"><span class="muted-text">Requisitos:</span> ${formatRequirementLinks(art.relatedRequirementIds || art.metadata?.requirementIds)}</div>` : ''}
      <div id="pdosArtifactBody" class="markdown-preview"></div>
    `;
    content.querySelector('.pdos-drawer-close')?.addEventListener('click', closeDrawer);
    renderMarkdownPreview(art.bodyMarkdown || art.description || '', $('pdosArtifactBody'));
  }

  function renderPhaseStatTile({ tab, label, count, stageId, hint, view, scrollTarget }) {
    const empty = !count;
    if (scrollTarget) {
      return `
        <button type="button"
          class="pdos-stat-tile${empty ? ' is-empty' : ''}"
          data-scroll-target="${escapeHtml(scrollTarget)}"
          ${empty ? 'disabled' : ''}
          title="${escapeHtml(hint || `Ver ${label}`)}">
          <span class="pdos-stat-tile-count">${count}</span>
          <span class="pdos-stat-tile-label">${escapeHtml(label)}</span>
        </button>
      `;
    }
    return `
      <button type="button"
        class="pdos-stat-tile${empty ? ' is-empty' : ''}"
        data-nav-tab="${escapeHtml(tab)}"
        data-nav-stage="${escapeHtml(stageId)}"
        ${view ? `data-nav-view="${escapeHtml(view)}"` : ''}
        ${empty ? 'disabled' : ''}
        title="${escapeHtml(hint || `Ver ${label} desta fase`)}">
        <span class="pdos-stat-tile-count">${count}</span>
        <span class="pdos-stat-tile-label">${escapeHtml(label)}</span>
      </button>
    `;
  }

  function stageOptionsHtml(project, currentStageId) {
    return getStages(project)
      .map((s) => `<option value="${escapeHtml(s.id)}"${s.id === currentStageId ? ' selected' : ''}>${escapeHtml(s.label)}</option>`)
      .join('');
  }

  function renderPhaseItemRow({ id, kind, title, meta, currentStageId, project, canMove }) {
    return `
      <div class="pdos-phase-item" data-phase-item-kind="${escapeHtml(kind)}" data-phase-item-id="${escapeHtml(id)}">
        <div class="pdos-phase-item-main">
          <strong>${escapeHtml(title)}</strong>
          ${meta ? `<small class="muted-text">${escapeHtml(meta)}</small>` : ''}
        </div>
        <div class="pdos-phase-item-actions">
          <button type="button" class="btn tiny ghost" data-open-phase-item="${escapeHtml(id)}" data-open-phase-kind="${escapeHtml(kind)}">Abrir</button>
          ${canMove ? `<label class="pdos-phase-move"><span class="muted-text">Fase</span>
            <select data-move-phase-item="${escapeHtml(id)}" data-move-phase-kind="${escapeHtml(kind)}">${stageOptionsHtml(project, currentStageId)}</select>
          </label>` : ''}
        </div>
      </div>
    `;
  }

  function renderPhaseContentBlock(project, stageId) {
    const summary = window.PhaseContent?.getStageContentSummary(project, stageId);
    if (!summary) return '';
    const { counts, items } = summary;

    const tiles = [
      { tab: 'requisitos', label: 'Requisitos', count: counts.requirements },
      { tab: 'documentos', label: 'Anexos', count: counts.documents, view: 'uploads' },
      { tab: 'perguntas', label: 'Clarificações', count: counts.questions },
    ];

    const sections = [];

    const docRows = (items.documents || []).map((d) => renderPhaseItemRow({
      id: d.id,
      kind: 'document',
      title: d.title || d.originalName || 'Documento',
      meta: [d.docType, (d.updatedAt || d.uploadedAt || '').slice(0, 10)].filter(Boolean).join(' · '),
      currentStageId: window.PhaseContent.resolveDocumentStageId(d),
      project,
      canMove: true,
    })).join('');
    sections.push({ label: 'Documentos', count: (items.documents || []).length, body: docRows, addTab: 'documentos' });

    const qRows = (items.questions || []).map((q) => renderPhaseItemRow({
      id: q.id,
      kind: 'question',
      title: q.question || q.title || 'Pergunta',
      meta: q.status || '',
      currentStageId: stageId,
      project,
      canMove: false,
    })).join('');
    sections.push({ label: 'Perguntas', count: (items.questions || []).length, body: qRows, addTab: 'perguntas' });

    const sectionsHtml = sections.map((sec) => `
      <details class="pdos-phase-section">
        <summary>${escapeHtml(sec.label)} <span class="pdos-phase-count">${sec.count}</span></summary>
        <div class="pdos-phase-section-body">
          ${sec.body || '<p class="muted-text pdos-phase-empty">Sem itens nesta fase.</p>'}
          <button type="button" class="btn tiny ghost pdos-phase-add" data-phase-add-tab="${escapeHtml(sec.addTab)}">Gerir ${escapeHtml(sec.label.toLowerCase())} desta fase →</button>
        </div>
      </details>
    `).join('');

    const materialsTotal = Number(counts.requirements || 0) + Number(counts.documents || 0) + Number(counts.questions || 0);
    const taskTile = `
      <button type="button"
        class="pdos-stat-tile pdos-task-material-tile"
        data-view-all-phase-tasks="${escapeHtml(stageId)}"
        title="Ver todas as tarefas desta fase">
        <span class="pdos-stat-tile-count" data-phase-task-count="${escapeHtml(stageId)}">…</span>
        <span class="pdos-stat-tile-label">Tarefas</span>
        <span class="pdos-task-material-preview" data-phase-task-preview="${escapeHtml(stageId)}"></span>
      </button>
    `;
    return `
      <details class="pdos-card pdos-phase-content-card pdos-materials-card">
        <summary>Materiais ligados a esta fase <span class="pdos-phase-count" data-phase-material-total data-material-base-total="${materialsTotal}">${materialsTotal}</span></summary>
        <div class="pdos-materials-body">
          <div class="pdos-stat-tiles">${tiles.map((t) => renderPhaseStatTile({ ...t, stageId })).join('')}${taskTile}</div>
          ${sectionsHtml ? `<div class="pdos-phase-sections">${sectionsHtml}</div>` : ''}
        </div>
      </details>
    `;
  }

  async function hydratePhaseTaskCount(project, stageId) {
    const feed = $('pdosCardFeed');
    const countHost = feed?.querySelector(`[data-phase-task-count="${stageId}"]`);
    const previewHost = feed?.querySelector(`[data-phase-task-preview="${stageId}"]`);
    if (!countHost) return;
    try {
      const [payload, relevant] = await Promise.all([
        apiRequest(`/projects/${encodeURIComponent(project.id)}/work-items?deliveryStageId=${encodeURIComponent(stageId)}&limit=1`),
        apiRequest(`/projects/${encodeURIComponent(project.id)}/work-items/relevant?deliveryStageId=${encodeURIComponent(stageId)}&limit=4`),
      ]);
      const taskCount = Number(payload.total || 0);
      countHost.textContent = String(taskCount);
      if (previewHost) previewHost.innerHTML = ensureArray(relevant.workItems).map((task) => `<span><strong>${escapeHtml(task.title)}</strong><small>${escapeHtml(task.status === 'waiting_review' ? 'Aguarda revisão' : task.status === 'in_progress' ? 'Em curso' : task.status === 'blocked' ? 'Bloqueada' : task.status === 'failed' ? 'Falhou' : task.status === 'waiting_input' ? 'Aguarda informação' : task.status === 'ready' ? 'Pronta' : 'Planeada')} · ${escapeHtml(task.executorMode === 'agent' ? (task.agentId || 'YourLab Agent') : 'Responsável humano')}</small></span>`).join('');
      const totalHost = feed.querySelector('[data-phase-material-total]');
      if (totalHost) {
        totalHost.textContent = String(Number(totalHost.dataset.materialBaseTotal || 0) + taskCount);
      }
    } catch {
      countHost.textContent = '—';
    }
  }

  function renderCardFeed(project) {
    const el = $('pdosCardFeed');
    if (!el || !project) return;
    const stageId = window.state?.deliverySelectedStageId || 'requirements';
    const caps = project.capabilities || [];
    const openQuestions = (project.clarificationQuestions || []).filter((q) => ['open', 'sent', 'blocked'].includes(q.status));
    const risks = (project.risks || []);

    let html = '';

    if (stageId === 'requirements') {
      // Use requirementCount (present on overview payloads) or fall back to array length
      const reqCount = project.requirementCount ?? (project.requirements || []).length;
      const openQ = openQuestions.length;
      html += `
        <article class="pdos-card pdos-card-req-bridge">
          <h4>Requisitos</h4>
          <p class="muted-text">Consulte e edite os requisitos no espaço dedicado.</p>
          <div class="pdos-summary-grid pdos-summary-grid-static">
            <div><strong>${reqCount}</strong><span>requisitos</span></div>
            <div><strong>${openQ}</strong><span>dúvidas abertas</span></div>
            <div><strong>${caps.length}</strong><span>funcionalidades</span></div>
          </div>
          <div class="pdos-card-actions">
            <button type="button" class="btn tiny primary" data-goto-tab="requisitos">Abrir página Requisitos</button>
            <button type="button" class="btn tiny ghost" data-goto-tab="perguntas">Perguntas em aberto</button>
            ${window.canEditProject?.() ? `
              <button type="button" class="btn tiny" data-agent="requirement_hierarchy" title="Proposta IA para reorganizar cadeia V">IA: reorganizar V</button>
            ` : ''}
          </div>
        </article>
      `;
    } else if (stageId === 'idea') {
      html += renderIdeaStage(project);
    } else if (stageId === 'discovery') {
      html += renderDiscoveryStage(project);
    } else if (stageId === 'roadmap') {
      html += renderRoadmapStage(project);
    } else if (stageId === 'implementation') {
      html += renderImplementationStage(project);
    } else if (stageId === 'delivery') {
      html += renderProposalStage(project);
    }

    if (risks.length && stageId === 'requirements') {
      html += `
        <article class="pdos-card pdos-card-risks">
          <h4>Riscos principais</h4>
          <ul>${risks.slice(0, 5).map((r) => `<li>${escapeHtml(typeof r === 'string' ? r : r.description || r.title || '')}</li>`).join('')}</ul>
        </article>
      `;
    }

    html += renderPhaseContentBlock(project, stageId);

    el.innerHTML = html;

    if (stageId === 'requirements') {
      scheduleVChainCardHydrate(project);
    } else if (stageId === 'idea') {
      hydrateIdeaStage(project);
    } else if (stageId === 'discovery') {
      hydrateDiscoveryStage(project);
    } else if (stageId === 'roadmap') {
      hydrateRoadmapStage(project);
    } else if (stageId === 'implementation') {
      hydrateImplementationStage(project);
    } else if (stageId === 'delivery') {
      hydrateProposalStage(project);
    }

    wireCardFeedEvents(project);
    hydratePhaseTaskCount(project, stageId);
    renderMermaidInFeed();
  }

  function scheduleVChainCardHydrate(project) {
    const statsEl = document.getElementById('pdosVChainStats');
    if (!statsEl || !project?.id) return;

    statsEl.innerHTML = `
      <div><strong>…</strong><span>STK (L0)</span></div>
      <div><strong>…</strong><span>órfãos</span></div>
      <div><strong>…</strong><span>cobertura V</span></div>
    `;

    if (statsEl._vchainObserver) {
      statsEl._vchainObserver.disconnect();
      statsEl._vchainObserver = null;
    }

    const run = () => hydrateVChainCard(project);

    if (typeof IntersectionObserver === 'function') {
      const observer = new IntersectionObserver((entries) => {
        if (!entries.some((entry) => entry.isIntersecting)) return;
        observer.disconnect();
        statsEl._vchainObserver = null;
        run();
      }, { rootMargin: '120px' });
      observer.observe(statsEl);
      statsEl._vchainObserver = observer;

      requestAnimationFrame(() => {
        const rect = statsEl.getBoundingClientRect();
        if (rect.width > 0 && rect.top < window.innerHeight + 120 && rect.bottom > -120) {
          observer.disconnect();
          statsEl._vchainObserver = null;
          run();
        }
      });
      return;
    }

    window.setTimeout(run, 400);
  }

  async function hydrateVChainCard(project) {
    const statsEl = document.getElementById('pdosVChainStats');
    const batchBtn = document.querySelector('[data-pdos-hierarchy-batch]');
    const revertBtn = document.querySelector('[data-pdos-hierarchy-revert]');
    if (!statsEl || !project?.id) return;
    try {
      const hierarchy = await window.fetchRequirementsHierarchy?.(project, { summary: true })
        ?? await apiRequest(`/projects/${encodeURIComponent(project.id)}/requirements/hierarchy?summary=1&includeRevert=1`);
      const stkCount = hierarchy?.stakeholderCount ?? (hierarchy?.byLevel?.stakeholder || []).length;
      const orphans = hierarchy?.stats?.orphans ?? hierarchy?.orphanCount ?? (hierarchy?.orphans || []).length;
      const coverage = hierarchy?.stats?.coveragePct ?? 0;
      const suggestCount = hierarchy?.suggestedCount ?? (hierarchy?.suggestedStakeholders || []).length;
      const revertable = hierarchy?.revertableRepairs || {};
      statsEl.innerHTML = `
        <div><strong>${stkCount}</strong><span>STK (L0)</span></div>
        <div><strong>${orphans}</strong><span>órfãos</span></div>
        <div><strong>${coverage}%</strong><span>cobertura V</span></div>
      `;
      if (batchBtn) {
        batchBtn.hidden = !suggestCount;
        batchBtn.textContent = `Atribuir ${suggestCount} órfão${suggestCount === 1 ? '' : 's'} em lote`;
      }
      if (revertBtn) {
        revertBtn.hidden = !revertable.canRevert;
        revertBtn.textContent = `Reverter ${revertable.count || 0} STK automático${revertable.count === 1 ? '' : 's'}`;
      }
    } catch {
      statsEl.innerHTML = `
        <div><strong>—</strong><span>STK (L0)</span></div>
        <div><strong>—</strong><span>órfãos</span></div>
        <div><strong>—</strong><span>cobertura V</span></div>
      `;
    }
  }

  function ideaVision(project) {
    const v = project.vision && typeof project.vision === 'object' ? project.vision : {};
    return {
      headline: v.headline || '',
      mainIdeaMarkdown: v.mainIdeaMarkdown || project.ideaBriefMarkdown || '',
      philosophyMarkdown: v.philosophyMarkdown || '',
      problemMarkdown: v.problemMarkdown || '',
      targetUsers: Array.isArray(v.targetUsers) ? v.targetUsers : [],
      valuePropositionMarkdown: v.valuePropositionMarkdown || '',
      principles: Array.isArray(v.principles) ? v.principles : [],
      consequentIdeas: Array.isArray(v.consequentIdeas) ? v.consequentIdeas : [],
    };
  }

  function ideaHasContent(v) {
    return Boolean(
      v.headline || v.mainIdeaMarkdown || v.philosophyMarkdown || v.problemMarkdown
      || v.valuePropositionMarkdown || v.targetUsers.length || v.principles.length || v.consequentIdeas.length
    );
  }

  function renderIdeaStage(project) {
    const v = ideaVision(project);
    const genLabel = agentButtonLabel(ideaHasContent(v) ? 'Regenerar visão com IA' : 'Gerar visão com IA', 'reverse_idea');
    const canEdit = Boolean(window.canEditProject?.());
    const original = String(project.originalIdeaText || '').trim();
    const conversation = ensureArray(project.ideaConversation).slice(-30);
    const actionButtons = ideaHasContent(v)
      ? [
          ['organize', 'Organizar o que escrevi'],
          ['critique', 'Mostrar o que não está claro'],
          ['solutions', 'Explorar soluções'],
          ['research', 'Pesquisa inicial'],
        ]
      : [
          ['interpret', 'Interpretar a minha ideia'],
          ['question', 'Fazer uma pergunta útil'],
        ];
    const section = (title, field, markdownKey, content, extra = '') => content ? `
      <section class="idea-understanding-section" data-idea-section="${escapeHtml(field)}">
        <header><h4>${escapeHtml(title)}</h4>${canEdit ? `<div class="pdos-card-actions"><button type="button" class="btn tiny ghost" data-idea-accept="${escapeHtml(field)}">Aceitar</button><button type="button" class="btn tiny ghost" data-idea-edit="${escapeHtml(field)}">Editar</button><button type="button" class="btn tiny ghost" data-idea-reject="${escapeHtml(field)}">Rejeitar</button></div>` : ''}</header>
        ${markdownKey ? `<div class="idea-md" data-idea-md="${escapeHtml(markdownKey)}"></div>` : extra}
      </section>` : '';
    const usersHtml = v.targetUsers.length
      ? `<div class="idea-users">${v.targetUsers.map((user) => `<span class="idea-user-chip">${escapeHtml(user)}</span>`).join('')}</div>`
      : '';
    const direction = v.consequentIdeas.length
      ? v.consequentIdeas.map((item) => item.title || item.descriptionMarkdown || '').filter(Boolean).join('\n')
      : '';
    const assumptions = ensureArray(project.assumptions).filter(Boolean);

    return `
      <div class="idea-workspace">
        <article class="pdos-card idea-workspace-panel idea-panel-original">
          <header class="idea-panel-head"><div><span class="idea-eyebrow">1 · LEIA O PONTO DE PARTIDA</span><h3>A sua ideia original</h3></div>${canEdit ? '<button type="button" class="btn tiny ghost" data-idea-original-edit>Editar</button>' : ''}</header>
          <div class="idea-original-copy ${original ? '' : 'muted-text'}">${escapeHtml(original || 'Descreva a sua ideia aqui…')}</div>
          ${canEdit ? `<div class="idea-original-editor hidden"><textarea rows="8" data-idea-original-input placeholder="Descreva a sua ideia livremente…">${escapeHtml(original)}</textarea><div class="pdos-card-actions"><button type="button" class="btn tiny primary" data-idea-original-save>Guardar</button><button type="button" class="btn tiny ghost" data-idea-original-cancel>Cancelar</button></div></div>` : ''}
        </article>

        <article class="pdos-card idea-workspace-panel idea-panel-understanding">
          <header class="idea-panel-head"><div><span class="idea-eyebrow">2 · REVEJA E CORRIJA</span><h3>O que entendemos até agora</h3></div></header>
          ${section('Ideia principal', 'mainIdeaMarkdown', 'main', v.mainIdeaMarkdown)}
          ${section('O problema', 'problemMarkdown', 'problem', v.problemMarkdown)}
          ${section('Para quem', 'targetUsers', '', usersHtml, usersHtml)}
          ${section('Melhoria esperada', 'valuePropositionMarkdown', 'value', v.valuePropositionMarkdown)}
          ${direction ? section('Direcção possível', 'consequentIdeas', '', direction, `<p class="overview-preserve-lines">${escapeHtml(direction)}</p>`) : ''}
          ${assumptions.length ? `<section class="idea-understanding-section"><header><h4>Hipóteses abertas</h4></header><ul>${assumptions.map((item) => `<li>${escapeHtml(typeof item === 'string' ? item : item.description || item.title || '')}</li>`).join('')}</ul></section>` : ''}
          ${!ideaHasContent(v) ? '<p class="idea-later-note">Podemos explorar estas secções mais tarde.</p>' : ''}
          ${canEdit ? `<details class="collapsible idea-advanced-action"><summary>Acção avançada</summary><button type="button" class="btn tiny mt-8" data-agent="reverse_idea">${genLabel}</button></details>` : ''}
        </article>

        <article class="pdos-card idea-workspace-panel idea-panel-guidance">
          <header class="idea-panel-head"><div><span class="idea-eyebrow">3 · CONTINUE A CONVERSA</span><h3>Guia de IA</h3></div></header>
          <div class="idea-guidance-actions">${actionButtons.map(([mode, label]) => `<button type="button" class="btn tiny" data-idea-guidance-mode="${mode}" ${canEdit ? '' : 'disabled'}>${escapeHtml(label)}</button>`).join('')}</div>
          <div class="idea-conversation" data-idea-conversation>${conversation.length ? conversation.map((turn) => `<div class="idea-turn is-${turn.role === 'assistant' ? 'assistant' : 'user'}"><small>${turn.role === 'assistant' ? 'Guia' : 'Você'}</small><p>${escapeHtml(turn.content || '')}</p></div>`).join('') : '<p class="muted-text">Escolha uma acção ou escreva o que gostaria de explorar.</p>'}</div>
          <label class="idea-guidance-compose"><span class="sr-only">Mensagem para o guia</span><textarea rows="3" data-idea-guidance-input placeholder="Escreva uma resposta, dúvida ou detalhe…" ${canEdit ? '' : 'disabled'}></textarea></label>
          <div class="pdos-card-actions"><button type="button" class="btn tiny ghost" data-idea-guidance-unknown ${canEdit ? '' : 'disabled'}>Ainda não sei</button><button type="button" class="btn tiny primary" data-idea-guidance-send ${canEdit ? '' : 'disabled'}>Enviar</button></div>
          <div class="idea-guidance-status muted-text" data-idea-guidance-status aria-live="polite"></div>
          <details class="collapsible idea-manual-response hidden" data-idea-manual>
            <summary>Prompt gerado — modo manual</summary>
            <label class="full mt-8">Prompt<textarea rows="8" readonly data-idea-prompt></textarea></label>
            <label class="full mt-8">Colar resposta da IA<textarea rows="6" data-idea-manual-reply></textarea></label>
            <button type="button" class="btn tiny primary mt-8" data-idea-manual-accept>Guardar como compreensão</button>
          </details>
        </article>
      </div>
    `;
  }

  function hydrateIdeaStage(project) {
    const v = ideaVision(project);
    const fill = (key, md) => {
      const el = $('pdosCardFeed')?.querySelector(`[data-idea-md="${key}"]`);
      if (el && md) renderMarkdownPreview(md, el);
    };
    fill('main', v.mainIdeaMarkdown);
    fill('philosophy', v.philosophyMarkdown);
    fill('problem', v.problemMarkdown);
    fill('value', v.valuePropositionMarkdown);
    v.principles.forEach((p, i) => fill(`principle-${i}`, p.descriptionMarkdown));
    v.consequentIdeas.forEach((c, i) => fill(`consequent-${i}`, c.descriptionMarkdown));
  }

  async function patchIdea(project, patch, successMessage = 'Ideia actualizada.') {
    await apiRequest(`/projects/${encodeURIComponent(project.id)}`, { method: 'PATCH', body: patch });
    showToast(successMessage, 'ok');
    await reloadProject(project.id);
  }

  function wireIdeaStageEvents(project) {
    const root = $('pdosCardFeed')?.querySelector('.idea-workspace');
    if (!root) return;
    const originalCopy = root.querySelector('.idea-original-copy');
    const originalEditor = root.querySelector('.idea-original-editor');
    root.querySelector('[data-idea-original-edit]')?.addEventListener('click', () => {
      originalCopy?.classList.add('hidden');
      originalEditor?.classList.remove('hidden');
      root.querySelector('[data-idea-original-input]')?.focus();
    });
    root.querySelector('[data-idea-original-cancel]')?.addEventListener('click', () => {
      originalCopy?.classList.remove('hidden');
      originalEditor?.classList.add('hidden');
    });
    root.querySelector('[data-idea-original-save]')?.addEventListener('click', async () => {
      try {
        await patchIdea(project, { originalIdeaText: root.querySelector('[data-idea-original-input]')?.value || '' }, 'Ideia original guardada.');
      } catch (error) { showToast(error.message, 'error'); }
    });

    root.querySelectorAll('[data-idea-accept]').forEach((button) => {
      button.addEventListener('click', () => showToast('Compreensão aceite.', 'ok'));
    });
    root.querySelectorAll('[data-idea-edit]').forEach((button) => {
      button.addEventListener('click', () => {
        const field = button.dataset.ideaEdit;
        const sectionEl = button.closest('[data-idea-section]');
        if (!sectionEl || sectionEl.querySelector('[data-idea-inline-editor]')) return;
        const vision = ideaVision(project);
        let current = vision[field];
        if (field === 'targetUsers') current = ensureArray(current).join(', ');
        if (field === 'consequentIdeas') current = ensureArray(current).map((item) => item.title || item.descriptionMarkdown || '').filter(Boolean).join('\n');
        sectionEl.insertAdjacentHTML('beforeend', `<div class="idea-inline-editor" data-idea-inline-editor><textarea rows="5">${escapeHtml(String(current || ''))}</textarea><div class="pdos-card-actions"><button type="button" class="btn tiny primary" data-idea-inline-save>Guardar</button><button type="button" class="btn tiny ghost" data-idea-inline-cancel>Cancelar</button></div></div>`);
        const editor = sectionEl.querySelector('[data-idea-inline-editor]');
        editor.querySelector('[data-idea-inline-cancel]').addEventListener('click', () => editor.remove());
        editor.querySelector('[data-idea-inline-save]').addEventListener('click', async () => {
          try {
            const value = editor.querySelector('textarea').value.trim();
            const nextVision = { ...(project.vision || {}) };
            if (field === 'targetUsers') nextVision[field] = value.split(',').map((item) => item.trim()).filter(Boolean);
            else if (field === 'consequentIdeas') nextVision[field] = value.split('\n').map((title) => title.trim()).filter(Boolean).map((title) => ({ title, descriptionMarkdown: '' }));
            else nextVision[field] = value;
            const patch = { vision: nextVision };
            if (field === 'mainIdeaMarkdown') patch.ideaBriefMarkdown = value;
            await patchIdea(project, patch);
          } catch (error) { showToast(error.message, 'error'); }
        });
      });
    });
    root.querySelectorAll('[data-idea-reject]').forEach((button) => {
      button.addEventListener('click', async () => {
        if (!confirm('Remover esta parte da compreensão actual?')) return;
        try {
          const field = button.dataset.ideaReject;
          const nextVision = { ...(project.vision || {}) };
          nextVision[field] = ['targetUsers', 'consequentIdeas'].includes(field) ? [] : '';
          const patch = { vision: nextVision };
          if (field === 'mainIdeaMarkdown') patch.ideaBriefMarkdown = '';
          await patchIdea(project, patch, 'Secção removida.');
        } catch (error) { showToast(error.message, 'error'); }
      });
    });

    const requestGuidance = async (mode, userMessage = '') => {
      const status = root.querySelector('[data-idea-guidance-status]');
      const buttons = root.querySelectorAll('[data-idea-guidance-mode], [data-idea-guidance-send], [data-idea-guidance-unknown]');
      buttons.forEach((button) => { button.disabled = true; });
      if (status) status.textContent = 'A preparar orientação…';
      try {
        const response = await apiRequest(`/projects/${encodeURIComponent(project.id)}/idea-guidance`, {
          method: 'POST',
          body: { mode, userMessage, conversationHistory: project.ideaConversation || [] },
        });
        if (response.mode === 'auto' && response.reply) {
          if (status) status.textContent = '';
          await reloadProject(project.id);
          return;
        }
        const manual = root.querySelector('[data-idea-manual]');
        manual?.classList.remove('hidden');
        if (manual) manual.open = true;
        const prompt = root.querySelector('[data-idea-prompt]');
        if (prompt) prompt.value = response.prompt || '';
        if (status) status.textContent = response.runtimeError ? 'Resposta automática indisponível; use o prompt manual abaixo.' : 'Prompt pronto para usar manualmente.';
      } catch (error) {
        if (status) status.textContent = '';
        showToast(error.message, 'error');
      } finally {
        buttons.forEach((button) => { button.disabled = false; });
      }
    };
    root.querySelectorAll('[data-idea-guidance-mode]').forEach((button) => {
      button.addEventListener('click', () => requestGuidance(button.dataset.ideaGuidanceMode));
    });
    root.querySelector('[data-idea-guidance-send]')?.addEventListener('click', () => {
      const input = root.querySelector('[data-idea-guidance-input]');
      const message = input?.value.trim() || '';
      if (!message) return showToast('Escreva uma mensagem para continuar.', 'error');
      requestGuidance('freeform', message);
    });
    root.querySelector('[data-idea-guidance-unknown]')?.addEventListener('click', () => requestGuidance('freeform', 'Ainda não sei. Ajuda-me a avançar sem assumir uma resposta.'));
    root.querySelector('[data-idea-manual-accept]')?.addEventListener('click', async () => {
      const reply = root.querySelector('[data-idea-manual-reply]')?.value.trim() || '';
      if (!reply) return showToast('Cole primeiro a resposta da IA.', 'error');
      try {
        const now = new Date().toISOString();
        await patchIdea(project, {
          ideaBriefMarkdown: reply,
          vision: { ...(project.vision || {}), mainIdeaMarkdown: reply },
          ideaConversation: [...ensureArray(project.ideaConversation), { role: 'assistant', content: reply, timestamp: now }].slice(-100),
        }, 'Resposta guardada como compreensão inicial.');
      } catch (error) { showToast(error.message, 'error'); }
    });
  }

  function discoveryData(project) {
    const d = project.discovery && typeof project.discovery === 'object' ? project.discovery : {};
    return {
      marketSummaryMarkdown: d.marketSummaryMarkdown || '',
      marketSizing: d.marketSizing || { tam: '', sam: '', som: '', notesMarkdown: '' },
      segments: Array.isArray(d.segments) ? d.segments : [],
      competitors: Array.isArray(d.competitors) ? d.competitors : [],
      businessModel: d.businessModel || { revenueStreams: [], costStructure: [], channels: [], keyPartners: [] },
      commercialImpact: d.commercialImpact || { objectivesMarkdown: '', kpis: [] },
      swot: d.swot || { strengths: [], weaknesses: [], opportunities: [], threats: [] },
      goToMarketMarkdown: d.goToMarketMarkdown || '',
      assumptions: Array.isArray(d.assumptions) ? d.assumptions : [],
    };
  }

  function discoveryHasContent(d) {
    const bm = d.businessModel;
    const sw = d.swot;
    return Boolean(
      d.marketSummaryMarkdown || d.marketSizing.tam || d.marketSizing.sam || d.marketSizing.som
      || d.segments.length || d.competitors.length || d.commercialImpact.objectivesMarkdown
      || d.commercialImpact.kpis.length || d.goToMarketMarkdown || d.assumptions.length
      || bm.revenueStreams.length || bm.costStructure.length || bm.channels.length || bm.keyPartners.length
      || sw.strengths.length || sw.weaknesses.length || sw.opportunities.length || sw.threats.length
    );
  }

  function renderDiscoveryStage(project) {
    const d = discoveryData(project);
    const genLabel = agentButtonLabel(discoveryHasContent(d) ? 'Regenerar descoberta com IA' : 'Gerar descoberta com IA', 'discovery_research');

    if (!discoveryHasContent(d)) {
      return `
        <article class="pdos-card idea-empty">
          <h4>A descoberta de mercado ainda não foi feita</h4>
          <p class="muted-text">Gere uma análise estruturada — dimensão de mercado (TAM/SAM/SOM), segmentos, concorrência, modelo de negócio, impacto comercial e SWOT — a partir da ideia.</p>
          <div class="pdos-card-actions">
            <button type="button" class="btn primary" data-agent="discovery_research">${genLabel}</button>
          </div>
        </article>
      `;
    }

    const sizing = d.marketSizing;
    const sizingTiles = (sizing.tam || sizing.sam || sizing.som)
      ? `<div class="disc-sizing">
          <div class="disc-sizing-tile"><span>TAM</span><strong>${escapeHtml(sizing.tam || '—')}</strong><small>Mercado total</small></div>
          <div class="disc-sizing-tile"><span>SAM</span><strong>${escapeHtml(sizing.sam || '—')}</strong><small>Mercado acessível</small></div>
          <div class="disc-sizing-tile"><span>SOM</span><strong>${escapeHtml(sizing.som || '—')}</strong><small>Mercado obtível</small></div>
        </div>
        ${sizing.notesMarkdown ? `<div class="idea-md" data-disc-md="sizing-notes"></div>` : ''}`
      : '';

    const segments = d.segments.length
      ? `<section class="idea-block">
          <h4 class="idea-block-title">Segmentos-alvo</h4>
          <div class="disc-grid">
            ${d.segments.map((s, i) => `
              <article class="disc-card">
                <h5>${escapeHtml(s.name || '')}</h5>
                <div class="idea-md" data-disc-md="segment-${i}"></div>
                ${(s.painPoints || []).length ? `<ul class="disc-pains">${s.painPoints.map((p) => `<li>${escapeHtml(p)}</li>`).join('')}</ul>` : ''}
              </article>
            `).join('')}
          </div>
        </section>`
      : '';

    const competitors = d.competitors.length
      ? `<section class="idea-block">
          <h4 class="idea-block-title">Concorrência &amp; diferenciação</h4>
          <div class="disc-grid">
            ${d.competitors.map((c, i) => `
              <article class="disc-card">
                <h5>${escapeHtml(c.name || '')}</h5>
                <div class="idea-md" data-disc-md="competitor-${i}"></div>
                ${c.differentiation ? `<p class="disc-edge"><strong>A nossa vantagem:</strong> ${escapeHtml(c.differentiation)}</p>` : ''}
              </article>
            `).join('')}
          </div>
        </section>`
      : '';

    const bm = d.businessModel;
    const bmCol = (title, items) => items.length
      ? `<div class="disc-bm-col"><h5>${escapeHtml(title)}</h5><ul>${items.map((x) => `<li>${escapeHtml(x)}</li>`).join('')}</ul></div>`
      : '';
    const businessModel = (bm.revenueStreams.length || bm.costStructure.length || bm.channels.length || bm.keyPartners.length)
      ? `<section class="idea-block">
          <h4 class="idea-block-title">Modelo de negócio</h4>
          <div class="disc-bm">
            ${bmCol('Receitas', bm.revenueStreams)}
            ${bmCol('Custos', bm.costStructure)}
            ${bmCol('Canais', bm.channels)}
            ${bmCol('Parceiros-chave', bm.keyPartners)}
          </div>
        </section>`
      : '';

    const kpis = d.commercialImpact.kpis;
    const impact = (d.commercialImpact.objectivesMarkdown || kpis.length)
      ? `<section class="idea-block">
          <h4 class="idea-block-title">Impacto comercial desejado</h4>
          ${d.commercialImpact.objectivesMarkdown ? `<div class="idea-md" data-disc-md="impact-obj"></div>` : ''}
          ${kpis.length ? `<div class="disc-kpis">${kpis.map((k) => `
            <div class="disc-kpi">
              <strong>${escapeHtml(k.name || '')}</strong>
              ${k.target ? `<span class="disc-kpi-target">${escapeHtml(k.target)}</span>` : ''}
              ${k.rationale ? `<small>${escapeHtml(k.rationale)}</small>` : ''}
            </div>`).join('')}</div>` : ''}
        </section>`
      : '';

    const sw = d.swot;
    const swotQuad = (title, items, cls) => `
      <div class="disc-swot-quad ${cls}">
        <h5>${escapeHtml(title)}</h5>
        ${items.length ? `<ul>${items.map((x) => `<li>${escapeHtml(x)}</li>`).join('')}</ul>` : '<p class="muted-text">—</p>'}
      </div>`;
    const swot = (sw.strengths.length || sw.weaknesses.length || sw.opportunities.length || sw.threats.length)
      ? `<section class="idea-block">
          <h4 class="idea-block-title">SWOT</h4>
          <div class="disc-swot">
            ${swotQuad('Forças', sw.strengths, 'is-pos')}
            ${swotQuad('Fraquezas', sw.weaknesses, 'is-neg')}
            ${swotQuad('Oportunidades', sw.opportunities, 'is-pos')}
            ${swotQuad('Ameaças', sw.threats, 'is-neg')}
          </div>
        </section>`
      : '';

    const gtm = d.goToMarketMarkdown
      ? `<section class="idea-block"><h4 class="idea-block-title">Go-to-market</h4><div class="idea-md" data-disc-md="gtm"></div></section>`
      : '';

    const assumptions = d.assumptions.length
      ? `<section class="idea-block">
          <h4 class="idea-block-title">Hipóteses a validar</h4>
          <ul class="disc-assumptions">${d.assumptions.map((a) => `<li>${escapeHtml(a)}</li>`).join('')}</ul>
        </section>`
      : '';

    return `
      <article class="pdos-card idea-canvas discovery-canvas">
        <header class="idea-hero">
          <span class="idea-eyebrow">DESCOBERTA</span>
          <h2 class="idea-headline">Mercado &amp; negócio</h2>
          <div class="pdos-card-actions">
            <button type="button" class="btn tiny" data-agent="discovery_research">${genLabel}</button>
          </div>
        </header>
        <div class="idea-md idea-main" data-disc-md="summary"></div>
        ${sizingTiles ? `<section class="idea-block"><h4 class="idea-block-title">Dimensão de mercado</h4>${sizingTiles}</section>` : ''}
        ${segments}
        ${competitors}
        ${businessModel}
        ${impact}
        ${swot}
        ${gtm}
        ${assumptions}
      </article>
    `;
  }

  function hydrateDiscoveryStage(project) {
    const d = discoveryData(project);
    const fill = (key, md) => {
      const el = $('pdosCardFeed')?.querySelector(`[data-disc-md="${key}"]`);
      if (el && md) renderMarkdownPreview(md, el);
    };
    fill('summary', d.marketSummaryMarkdown);
    fill('sizing-notes', d.marketSizing.notesMarkdown);
    fill('impact-obj', d.commercialImpact.objectivesMarkdown);
    fill('gtm', d.goToMarketMarkdown);
    d.segments.forEach((s, i) => fill(`segment-${i}`, s.descriptionMarkdown));
    d.competitors.forEach((c, i) => fill(`competitor-${i}`, c.descriptionMarkdown));
  }

  function roadmapData(project) {
    const r = project.roadmap && typeof project.roadmap === 'object' ? project.roadmap : {};
    return {
      summaryMarkdown: r.summaryMarkdown || '',
      phases: Array.isArray(r.phases) ? r.phases : [],
    };
  }

  function fmtDate(value) {
    if (!value) return '';
    const d = new Date(value);
    if (Number.isNaN(d.getTime())) return value;
    return d.toLocaleDateString('pt-PT', { day: '2-digit', month: 'short', year: 'numeric' });
  }

  function planPhasesForRoadmap(project) {
    return ensureArray(project?.phases).filter((p) => String(p?.name || '').trim());
  }

  function renderRoadmapStage(project) {
    const r = roadmapData(project);
    const planPhases = planPhasesForRoadmap(project);
    const planCount = planPhases.length;
    const genLabel = agentButtonLabel(r.phases.length ? 'Enriquecer roadmap com IA' : 'Gerar roadmap com IA', 'roadmap_plan');
    const canEdit = window.canEditProject?.() !== false;

    if (!r.phases.length) {
      const planBridge = planCount
        ? `
          <div class="pdos-plan-bridge read-card">
            <p><strong>${planCount} fase(s)</strong> já definidas no plano de implementação (#Fases).</p>
            <p class="muted-text">Crie o roadmap em segundos a partir dessas fases — depois pode enriquecer com IA ou editar sub-milestones manualmente.</p>
            <div class="pdos-card-actions">
              ${canEdit ? `<button type="button" class="btn primary" data-roadmap-sync>Criar roadmap a partir das fases</button>` : ''}
              <button type="button" class="btn ghost" data-goto-tab="fases">Ver / editar fases</button>
              ${canEdit ? `<button type="button" class="btn ghost" data-agent="roadmap_plan">${genLabel}</button>` : ''}
            </div>
          </div>`
        : `
          <p class="muted-text">Defina primeiro as fases na aba <button type="button" class="btn link inline-link-btn" data-goto-tab="fases">Fases</button> ou peça à IA para propor o roadmap completo.</p>
          <div class="pdos-card-actions">
            <button type="button" class="btn ghost" data-goto-tab="fases">Ir para Fases</button>
            ${canEdit ? `<button type="button" class="btn primary" data-agent="roadmap_plan">${genLabel}</button>` : ''}
          </div>`;

      return `
        <article class="pdos-card idea-empty">
          <h4>O roadmap de implementação ainda não foi criado</h4>
          ${planBridge}
        </article>
      `;
    }

    const syncHint = planCount && planCount !== r.phases.length
      ? `<p class="muted-text rm-sync-hint">O plano tem ${planCount} fase(s) e o roadmap ${r.phases.length}. <button type="button" class="btn link inline-link-btn" data-roadmap-sync>Re-sincronizar com o plano</button></p>`
      : (planCount ? `<p class="muted-text">Alinhado com <strong>${planCount}</strong> fase(s) do plano. <button type="button" class="btn link inline-link-btn" data-goto-tab="fases">Editar fases</button></p>` : '');

    const reqMap = {};
    (Array.isArray(project.requirements) ? project.requirements : []).forEach((req) => { reqMap[req.id] = req; });
    const phaseNameById = {};
    r.phases.forEach((p) => { phaseNameById[p.id] = p.name; });

    const phaseCards = r.phases.map((p, i) => {
      const dates = [fmtDate(p.startDate), fmtDate(p.endDate)].filter(Boolean).join(' → ');
      const planBadge = p.planPhaseId ? `<span class="chip tiny" title="Fase do plano">${escapeHtml(p.planPhaseId)}</span>` : '';
      const reqChips = (p.requirementIds || []).map((id) => {
        const req = reqMap[id];
        const label = req ? (req.title || id) : id;
        return `<button type="button" class="rm-req-chip" data-goto-requirement="${escapeHtml(id)}" title="Ver requisito">${escapeHtml(label)}</button>`;
      }).join('');
      const modules = (p.moduleTags || []).map((m) => `<span class="rm-module">${escapeHtml(m)}</span>`).join('');
      const deps = (p.dependsOn || []).map((id) => phaseNameById[id]).filter(Boolean);
      const milestones = (p.milestones || []).map((m) => `<li>${escapeHtml(m.name)}${m.date ? ` <span class="rm-ms-date">${escapeHtml(fmtDate(m.date))}</span>` : ''}</li>`).join('');
      const tests = (p.tests || []).map((t) => `<li>${escapeHtml(t)}</li>`).join('');
      const risks = (p.risks || []).map((t) => `<li>${escapeHtml(t)}</li>`).join('');
      const msEditor = canEdit ? `
        <div class="rm-milestones-edit" data-rm-phase-id="${escapeHtml(p.id)}">
          <span class="rm-label">Sub-milestones</span>
          <div class="rm-ms-rows">
            ${(p.milestones || []).map((m, mi) => `
              <div class="rm-ms-row" data-ms-index="${mi}">
                <input type="text" class="rm-ms-name" value="${escapeHtml(m.name)}" placeholder="Nome do marco" />
                <input type="date" class="rm-ms-date-input" value="${escapeHtml(m.date || '')}" />
                <button type="button" class="btn tiny ghost rm-ms-remove" title="Remover">✕</button>
              </div>
            `).join('')}
          </div>
          <div class="pdos-card-actions">
            <button type="button" class="btn tiny ghost" data-rm-add-ms="${escapeHtml(p.id)}">+ Marco</button>
            <button type="button" class="btn tiny" data-rm-milestones-ai="${escapeHtml(p.id)}">IA: sugerir marcos</button>
            <button type="button" class="btn tiny primary" data-rm-save-ms="${escapeHtml(p.id)}">Guardar marcos</button>
          </div>
        </div>` : (milestones ? `<div class="rm-sub"><span class="rm-label">Milestones</span><ul class="rm-milestones">${milestones}</ul></div>` : '');

      return `
        <article class="rm-phase">
          <div class="rm-phase-rail"><span class="rm-phase-index">${i + 1}</span></div>
          <div class="rm-phase-body">
            <header class="rm-phase-head">
              <h4>${escapeHtml(p.name || `Fase ${i + 1}`)}</h4>
              ${planBadge}
              ${dates ? `<span class="rm-dates">${escapeHtml(dates)}</span>` : ''}
            </header>
            ${p.designPattern ? `<span class="rm-pattern">Design pattern: ${escapeHtml(p.designPattern)}</span>` : ''}
            <div class="idea-md" data-rm-md="goal-${i}"></div>
            ${p.deliverableMarkdown ? `<div class="rm-deliverable"><span class="rm-label">Entregável</span><div class="idea-md" data-rm-md="deliverable-${i}"></div></div>` : ''}
            ${modules ? `<div class="rm-modules">${modules}</div>` : ''}
            ${reqChips ? `<div class="rm-reqs"><span class="rm-label">Requisitos (${(p.requirementIds || []).length})</span><div class="rm-req-chips">${reqChips}</div></div>` : ''}
            ${tests ? `<div class="rm-sub"><span class="rm-label">Testes</span><ul>${tests}</ul></div>` : ''}
            ${msEditor}
            ${risks ? `<div class="rm-sub"><span class="rm-label">Riscos</span><ul>${risks}</ul></div>` : ''}
            ${deps.length ? `<div class="rm-deps">Depende de: ${deps.map((d) => escapeHtml(d)).join(', ')}</div>` : ''}
          </div>
        </article>
      `;
    }).join('');

    return `
      <article class="pdos-card idea-canvas roadmap-canvas">
        <header class="idea-hero">
          <span class="idea-eyebrow">ROADMAP</span>
          <h2 class="idea-headline">Plano de implementação</h2>
          ${syncHint}
          <div class="pdos-card-actions">
            ${canEdit && planCount ? `<button type="button" class="btn tiny ghost" data-roadmap-sync>Sincronizar com fases</button>` : ''}
            ${canEdit ? `<button type="button" class="btn tiny" data-agent="roadmap_plan">${genLabel}</button>` : ''}
          </div>
        </header>
        <div class="idea-md idea-main" data-rm-md="summary"></div>
        <div class="rm-timeline">${phaseCards}</div>
      </article>
    `;
  }

  function hydrateRoadmapStage(project) {
    const r = roadmapData(project);
    const fill = (key, md) => {
      const el = $('pdosCardFeed')?.querySelector(`[data-rm-md="${key}"]`);
      if (el && md) renderMarkdownPreview(md, el);
    };
    fill('summary', r.summaryMarkdown);
    r.phases.forEach((p, i) => {
      fill(`goal-${i}`, p.goalMarkdown);
      fill(`deliverable-${i}`, p.deliverableMarkdown);
    });
  }

  async function syncRoadmapFromPlanPhases(project) {
    const res = await apiRequest(`/projects/${encodeURIComponent(project.id)}/roadmap/sync-from-phases`, { method: 'POST' });
    showToast(res.message || 'Roadmap sincronizado.', 'ok');
    await reloadProject(project.id);
  }

  function collectMilestonesFromPhaseEditor(phaseId) {
    const wrap = $('pdosCardFeed')?.querySelector(`[data-rm-phase-id="${phaseId}"]`);
    if (!wrap) return [];
    return [...wrap.querySelectorAll('.rm-ms-row')].map((row) => ({
      name: row.querySelector('.rm-ms-name')?.value?.trim() || '',
      date: row.querySelector('.rm-ms-date-input')?.value?.trim() || '',
    })).filter((m) => m.name);
  }

  function addMilestoneRow(phaseId) {
    const wrap = $('pdosCardFeed')?.querySelector(`[data-rm-phase-id="${phaseId}"] .rm-ms-rows`);
    if (!wrap) return;
    const row = document.createElement('div');
    row.className = 'rm-ms-row';
    row.innerHTML = `
      <input type="text" class="rm-ms-name" value="" placeholder="Nome do marco" />
      <input type="date" class="rm-ms-date-input" value="" />
      <button type="button" class="btn tiny ghost rm-ms-remove" title="Remover">✕</button>
    `;
    row.querySelector('.rm-ms-remove')?.addEventListener('click', () => row.remove());
    wrap.appendChild(row);
    row.querySelector('.rm-ms-name')?.focus();
  }

  async function saveRoadmapMilestones(project, phaseId) {
    const milestones = collectMilestonesFromPhaseEditor(phaseId);
    await apiRequest(`/projects/${encodeURIComponent(project.id)}/roadmap/phases/${encodeURIComponent(phaseId)}`, {
      method: 'PATCH',
      body: { milestones },
    });
    showToast('Marcos guardados.', 'ok');
    await reloadProject(project.id);
  }

  async function runRoadmapMilestonesAgent(project, phaseId) {
    const res = await apiRequest(`/projects/${encodeURIComponent(project.id)}/prompt-runs`, {
      method: 'POST',
      body: {
        agentType: 'roadmap_milestones',
        stageId: 'roadmap',
        roadmapPhaseId: phaseId,
      },
    });
    pdosState.pendingPromptRun = res.promptRun;
    openPromptWorkbench(res);
    showToast('Prompt de sub-milestones — cole o JSON no workbench');
  }

  // ---- Implementation phase ----------------------------------------------
  const LLM_SIZES = [
    { id: 'small', label: 'LLM pequeno', hint: 'Prompt muito detalhado e exigente' },
    { id: 'medium', label: 'LLM médio', hint: 'Prompt equilibrado' },
    { id: 'large', label: 'LLM grande', hint: 'Prompt conciso (confia no modelo)' },
  ];
  const TASK_STATUSES = [
    { id: 'todo', label: 'A fazer' },
    { id: 'in_progress', label: 'Em curso' },
    { id: 'blocked', label: 'Bloqueada' },
    { id: 'done', label: 'Concluída' },
  ];
  const TASK_STATUS_LABEL = TASK_STATUSES.reduce((acc, s) => { acc[s.id] = s.label; return acc; }, {});
  let implViewMode = 'board';

  function implementationData(project) {
    const impl = project.implementation && typeof project.implementation === 'object' ? project.implementation : {};
    const stack = impl.stack && typeof impl.stack === 'object' ? impl.stack : {};
    return {
      stack: {
        summaryMarkdown: stack.summaryMarkdown || '',
        designPattern: stack.designPattern || '',
        languages: stack.languages || [],
        frameworks: stack.frameworks || [],
        datastores: stack.datastores || [],
        integrations: stack.integrations || [],
        deployment: stack.deployment || '',
        infrastructureMarkdown: stack.infrastructureMarkdown || '',
        resourcesMarkdown: stack.resourcesMarkdown || '',
        modules: Array.isArray(stack.modules) ? stack.modules : [],
        confirmed: Boolean(stack.confirmed),
      },
      // Legacy implementation tasks are migrated to project.workItems and are
      // never rendered as a second work queue inside this phase.
      tasks: [],
      legacyTaskCount: Array.isArray(impl.tasks) ? impl.tasks.length : 0,
    };
  }

  function stackHasContent(s) {
    return Boolean(
      s.summaryMarkdown || s.designPattern || s.deployment || s.modules.length
      || s.languages.length || s.frameworks.length || s.datastores.length || s.integrations.length
    );
  }

  function downloadTextFile(content, filename, mime = 'text/markdown') {
    const blob = new Blob([content], { type: `${mime};charset=utf-8` });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }

  function copyToClipboard(text) {
    if (navigator.clipboard?.writeText) return navigator.clipboard.writeText(text);
    const ta = document.createElement('textarea');
    ta.value = text;
    document.body.appendChild(ta);
    ta.select();
    try { document.execCommand('copy'); } finally { document.body.removeChild(ta); }
    return Promise.resolve();
  }

  // Compose the downloadable agent prompt from a task spec. The LLM size controls
  // verbosity: smaller models get a stricter, more explicit prompt.
  function buildTaskPrompt(task, llmSize, project) {
    const data = implementationData(project);
    const stack = data.stack;
    const reqMap = {};
    (Array.isArray(project.requirements) ? project.requirements : []).forEach((r) => { reqMap[r.id] = r; });
    const reqs = (task.requirementIds || []).map((id) => reqMap[id]).filter(Boolean);
    const phase = (project.roadmap?.phases || []).find((p) => p.id === task.roadmapPhaseId);
    const size = LLM_SIZES.some((s) => s.id === llmSize) ? llmSize : 'medium';

    const L = [];
    L.push(`# Tarefa: ${task.title || 'Implementação'}`);
    L.push('');
    if (size === 'small') {
      L.push('És um agente de desenvolvimento. Segue estas instruções com rigor, passo a passo. Não assumas nada que não esteja especificado — se faltar informação, lista as questões antes de escrever código. Implementa apenas o âmbito desta tarefa e não alteres código não relacionado.');
    } else if (size === 'large') {
      L.push('És um engenheiro de software sénior. Implementa o objetivo abaixo aplicando as melhores práticas e o teu critério técnico.');
    } else {
      L.push('És um agente de desenvolvimento. Implementa a tarefa abaixo respeitando os critérios de aceitação e as convenções do projeto.');
    }
    L.push('');
    L.push('## Objetivo');
    L.push(task.descriptionMarkdown || task.title || '');

    if (project?.name) {
      L.push('');
      L.push('## Contexto do projeto');
      L.push(`Projeto: ${project.name}${project.clientName ? ` (cliente: ${project.clientName})` : ''}.`);
      if (phase) L.push(`Fase do roadmap: ${phase.name}.`);
    }

    if (size !== 'large' && stackHasContent(stack)) {
      L.push('');
      L.push('## Stack técnica');
      if (stack.designPattern) L.push(`- Design pattern: ${stack.designPattern}`);
      if (stack.languages.length) L.push(`- Linguagens: ${stack.languages.join(', ')}`);
      if (stack.frameworks.length) L.push(`- Frameworks: ${stack.frameworks.join(', ')}`);
      if (stack.datastores.length) L.push(`- Dados: ${stack.datastores.join(', ')}`);
      if (stack.integrations.length) L.push(`- Integrações: ${stack.integrations.join(', ')}`);
      if (stack.deployment) L.push(`- Deploy: ${stack.deployment}`);
    } else if (size === 'large' && stack.designPattern) {
      L.push('');
      L.push(`Stack: ${[stack.designPattern, ...stack.languages, ...stack.frameworks].filter(Boolean).join(' · ')}`);
    }

    if ((task.moduleTags || []).length) {
      L.push('');
      L.push(`## Módulos: ${task.moduleTags.join(', ')}`);
    }

    if (reqs.length) {
      L.push('');
      L.push('## Requisitos a satisfazer (rastreabilidade)');
      reqs.forEach((r) => {
        if (size === 'large') {
          L.push(`- [${r.id}] ${r.title}`);
        } else if (size === 'medium') {
          L.push(`- [${r.id}] ${r.title}${r.shall ? ` — ${r.shall}` : ''}`);
        } else {
          L.push(`- [${r.id}] ${r.title}`);
          if (r.shall) L.push(`  - O sistema DEVE: ${r.shall}`);
          if (r.type) L.push(`  - Tipo: ${r.type}`);
        }
      });
    }

    if ((task.subtasks || []).length) {
      L.push('');
      if (size === 'small') {
        L.push('## Passos a seguir (executa por ordem)');
        task.subtasks.forEach((st, i) => {
          L.push(`${i + 1}. ${st.title}${st.descriptionMarkdown ? ` — ${st.descriptionMarkdown}` : ''}`);
        });
      } else {
        L.push('## Passos sugeridos');
        task.subtasks.forEach((st) => L.push(`- ${st.title}`));
      }
    }

    if ((task.acceptanceCriteria || []).length) {
      L.push('');
      L.push('## Critérios de aceitação');
      task.acceptanceCriteria.forEach((c) => L.push(`- [ ] ${c}`));
    }

    if (task.technicalNotesMarkdown) {
      L.push('');
      L.push('## Notas técnicas');
      L.push(task.technicalNotesMarkdown);
    }

    if (size === 'small') {
      L.push('');
      L.push('## Entrega esperada');
      L.push('- Código completo e funcional para o âmbito acima.');
      L.push('- Testes que validam os critérios de aceitação.');
      L.push('- Resumo curto do que foi feito e de decisões tomadas.');
      L.push('- Lista de quaisquer pressupostos ou questões em aberto.');
    }

    return L.join('\n');
  }

  function renderStackChips(label, items) {
    if (!items.length) return '';
    return `<div class="impl-chip-row"><span class="rm-label">${escapeHtml(label)}</span><div class="impl-chips">${items.map((x) => `<span class="impl-chip">${escapeHtml(x)}</span>`).join('')}</div></div>`;
  }

  function renderImplementationStage(project) {
    const data = implementationData(project);
    const stack = data.stack;
    const hasStack = stackHasContent(stack);

    const reqMap = {};
    (Array.isArray(project.requirements) ? project.requirements : []).forEach((r) => { reqMap[r.id] = r; });

    let stackBlock;
    if (!hasStack) {
      stackBlock = `
        <article class="pdos-card idea-empty">
          <h4>A stack técnica ainda não foi definida</h4>
          <p class="muted-text">Gere uma proposta de tecnologias (linguagens, frameworks, dados, deploy, recursos) ligada aos requisitos e à arquitetura.</p>
          <div class="pdos-card-actions">
            <button type="button" class="btn primary" data-agent="implementation_stack">Definir stack com IA</button>
          </div>
        </article>`;
    } else {
      const modules = stack.modules.map((m, i) => {
        const reqChips = (m.requirementIds || []).map((id) => {
          const req = reqMap[id];
          return `<button type="button" class="rm-req-chip" data-goto-requirement="${escapeHtml(id)}" title="Ver requisito">${escapeHtml(req ? (req.title || id) : id)}</button>`;
        }).join('');
        return `
          <article class="impl-module">
            <header><h5>${escapeHtml(m.name)}</h5>${m.technology ? `<span class="impl-chip">${escapeHtml(m.technology)}</span>` : ''}</header>
            <div class="idea-md" data-impl-md="module-${i}"></div>
            ${reqChips ? `<div class="rm-req-chips">${reqChips}</div>` : ''}
          </article>`;
      }).join('');

      stackBlock = `
        <article class="pdos-card impl-stack-card">
          <header class="impl-stack-head">
            <div>
              <span class="idea-eyebrow">STACK TÉCNICA</span>
              ${stack.confirmed ? '<span class="impl-confirmed">Confirmada</span>' : '<span class="impl-pending">Por confirmar</span>'}
            </div>
            <div class="pdos-card-actions">
              <button type="button" class="btn tiny ${stack.confirmed ? '' : 'primary'}" data-impl-confirm="${stack.confirmed ? 'unconfirm' : 'confirm'}">${stack.confirmed ? 'Reabrir' : 'Confirmar stack'}</button>
              <button type="button" class="btn tiny ghost" data-agent="implementation_stack">Regenerar</button>
            </div>
          </header>
          <div class="idea-md" data-impl-md="stack-summary"></div>
          ${stack.designPattern ? `<span class="rm-pattern">Design pattern: ${escapeHtml(stack.designPattern)}</span>` : ''}
          ${renderStackChips('Linguagens', stack.languages)}
          ${renderStackChips('Frameworks', stack.frameworks)}
          ${renderStackChips('Dados', stack.datastores)}
          ${renderStackChips('Integrações', stack.integrations)}
          ${stack.deployment ? `<div class="impl-chip-row"><span class="rm-label">Deploy</span><p class="impl-deploy">${escapeHtml(stack.deployment)}</p></div>` : ''}
          ${stack.infrastructureMarkdown ? `<div class="rm-sub"><span class="rm-label">Infraestrutura</span><div class="idea-md" data-impl-md="stack-infra"></div></div>` : ''}
          ${stack.resourcesMarkdown ? `<div class="rm-sub"><span class="rm-label">Recursos</span><div class="idea-md" data-impl-md="stack-resources"></div></div>` : ''}
          ${modules ? `<div class="rm-sub"><span class="rm-label">Módulos do sistema</span><div class="impl-modules">${modules}</div></div>` : ''}
        </article>`;
    }

    // Tasks — execution board / list
    let tasksBlock;
    if (!data.tasks.length) {
      tasksBlock = `
        <article class="pdos-card idea-empty">
          <h4>Execução centralizada em Tasks</h4>
          <p class="muted-text">Tarefas humanas, de agentes e aprovações são criadas e acompanhadas num único local.${data.legacyTaskCount ? ` ${data.legacyTaskCount} tarefa(s) anterior(es) serão migradas automaticamente.` : ''}</p>
          <div class="pdos-card-actions">
            <button type="button" class="btn primary" data-open-central-tasks>Abrir Tasks</button>
          </div>
        </article>`;
    } else {
      const phases = project.roadmap?.phases || [];
      const phaseName = {};
      phases.forEach((p) => { phaseName[p.id] = p.name; });

      const done = data.tasks.filter((t) => t.status === 'done').length;
      const progressPct = Math.round((done / data.tasks.length) * 100);

      let viewBody;
      if (implViewMode === 'board') {
        const cols = TASK_STATUSES.map((col) => {
          const colTasks = data.tasks.filter((t) => (t.status || 'todo') === col.id);
          const cards = colTasks.map((t) => renderTaskCard(t, project, reqMap, phaseName, true)).join('')
            || '<p class="impl-col-empty">—</p>';
          return `
            <div class="impl-col" data-col="${col.id}">
              <header class="impl-col-head"><span class="impl-task-status impl-status-${col.id}"></span>${escapeHtml(col.label)} <span class="impl-col-count">${colTasks.length}</span></header>
              <div class="impl-col-body">${cards}</div>
            </div>`;
        }).join('');
        viewBody = `<div class="impl-board">${cols}</div>`;
      } else {
        const groups = new Map();
        data.tasks.forEach((t) => {
          const key = t.roadmapPhaseId && phaseName[t.roadmapPhaseId] ? t.roadmapPhaseId : '__none__';
          if (!groups.has(key)) groups.set(key, []);
          groups.get(key).push(t);
        });
        viewBody = [...groups.entries()].map(([key, tasks]) => {
          const title = key === '__none__' ? 'Sem fase atribuída' : phaseName[key];
          const cards = tasks.map((t) => renderTaskCard(t, project, reqMap, phaseName, false)).join('');
          return `<section class="impl-task-group"><h4 class="impl-group-title">${escapeHtml(title)}</h4><div class="impl-list">${cards}</div></section>`;
        }).join('');
      }

      tasksBlock = `
        <article class="pdos-card impl-tasks-card">
          <header class="impl-stack-head">
            <div>
              <span class="idea-eyebrow">EXECUÇÃO DE TAREFAS</span>
              <span class="impl-progress-label">${done}/${data.tasks.length} concluídas</span>
            </div>
            <div class="pdos-card-actions">
              <div class="impl-view-toggle">
                <button type="button" class="btn tiny ${implViewMode === 'board' ? 'primary' : 'ghost'}" data-impl-view="board">Quadro</button>
                <button type="button" class="btn tiny ${implViewMode === 'list' ? 'primary' : 'ghost'}" data-impl-view="list">Lista</button>
              </div>
              <button type="button" class="btn tiny ghost" data-agent="implementation_tasks">Regenerar tarefas</button>
            </div>
          </header>
          <div class="impl-progress"><div class="impl-progress-bar" style="width:${progressPct}%"></div></div>
          ${viewBody}
        </article>`;
    }

    return `
      <div class="idea-canvas impl-canvas">
        <header class="idea-hero">
          <span class="idea-eyebrow">IMPLEMENTAÇÃO</span>
          <h2 class="idea-headline">Stack &amp; execução</h2>
        </header>
        ${stackBlock}
        ${tasksBlock}
      </div>
    `;
  }

  function renderTaskCard(t, project, reqMap, phaseName, isBoard) {
    const subDone = (t.subtasks || []).filter((s) => s.done).length;
    const subTotal = (t.subtasks || []).length;
    const model = LLM_SIZES.find((s) => s.id === t.llmSize);
    const phaseLabel = t.roadmapPhaseId && phaseName[t.roadmapPhaseId] ? phaseName[t.roadmapPhaseId] : '';
    const hasResult = Boolean(t.resultMarkdown || (t.outputLinks || []).length);
    const complexityBadge = t.complexity
      ? `<span class="impl-complexity impl-cx-${escapeHtml(t.complexity)}" title="Complexidade">${({ low: 'Simples', medium: 'Média', high: 'Complexa' })[t.complexity] || t.complexity}</span>`
      : '';
    return `
      <article class="impl-card" data-open-task="${escapeHtml(t.id)}" role="button" tabindex="0">
        <div class="impl-card-top">
          ${isBoard ? '' : `<span class="impl-task-status impl-status-${escapeHtml(t.status || 'todo')}"></span>`}
          <span class="impl-card-title">${escapeHtml(t.title)}</span>
        </div>
        <div class="impl-card-meta">
          ${model ? `<span class="impl-model-badge impl-model-${escapeHtml(t.llmSize)}" title="Modelo recomendado">${escapeHtml(model.label)}</span>` : ''}
          ${complexityBadge}
          ${isBoard && phaseLabel ? `<span class="impl-phase-chip">${escapeHtml(phaseLabel)}</span>` : ''}
          ${subTotal ? `<span class="impl-sub-progress">${subDone}/${subTotal} passos</span>` : ''}
          ${(t.requirementIds || []).length ? `<span class="impl-req-count" title="Requisitos ligados">${(t.requirementIds || []).length} req</span>` : ''}
          ${hasResult ? '<span class="impl-result-flag" title="Resultado registado">✓ resultado</span>' : ''}
        </div>
      </article>`;
  }

  function hydrateImplementationStage(project) {
    const data = implementationData(project);
    const fill = (key, md) => {
      const el = $('pdosCardFeed')?.querySelector(`[data-impl-md="${key}"]`);
      if (el && md) renderMarkdownPreview(md, el);
    };
    fill('stack-summary', data.stack.summaryMarkdown);
    fill('stack-infra', data.stack.infrastructureMarkdown);
    fill('stack-resources', data.stack.resourcesMarkdown);
    data.stack.modules.forEach((m, i) => fill(`module-${i}`, m.descriptionMarkdown));
    wireImplementationEvents(project);
  }

  async function persistImplementation(project, payload) {
    try {
      const res = await apiRequest(`/projects/${project.id}/implementation`, { method: 'POST', body: payload });
      if (res?.project && window.state) {
        window.state.selectedProject = res.project;
      }
      return res?.project || null;
    } catch (err) {
      showToast(err.message, 'error');
      return null;
    }
  }

  function wireImplementationEvents(project) {
    const feed = $('pdosCardFeed');
    if (!feed) return;

    feed.querySelector('[data-impl-confirm]')?.addEventListener('click', async (e) => {
      const confirm = e.currentTarget.dataset.implConfirm === 'confirm';
      const updated = await persistImplementation(project, { confirmStack: confirm });
      if (updated) {
        showToast(confirm ? 'Stack confirmada.' : 'Stack reaberta.');
        window.PdosUI?.renderAll(updated);
      }
    });

    feed.querySelectorAll('[data-impl-view]').forEach((btn) => {
      btn.addEventListener('click', () => {
        implViewMode = btn.dataset.implView;
        window.PdosUI?.renderAll(window.state?.selectedProject || project);
      });
    });

    feed.querySelectorAll('[data-open-task]').forEach((card) => {
      const open = () => openTaskDrawer(window.state?.selectedProject || project, card.dataset.openTask);
      card.addEventListener('click', open);
      card.addEventListener('keydown', (e) => {
        if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); open(); }
      });
    });
  }

  // Rich per-task execution drawer: objective, requirements, subtasks checklist,
  // model-aware prompt (download/copy), and post-execution result capture.
  function openTaskDrawer(project, taskId) {
    const data = implementationData(project);
    const task = data.tasks.find((t) => t.id === taskId);
    if (!task) return;

    const reqMap = {};
    (Array.isArray(project.requirements) ? project.requirements : []).forEach((r) => { reqMap[r.id] = r; });
    const phase = (project.roadmap?.phases || []).find((p) => p.id === task.roadmapPhaseId);

    document.querySelector('.impl-drawer-overlay')?.remove();
    const overlay = document.createElement('div');
    overlay.className = 'impl-drawer-overlay';

    const sizeOptions = LLM_SIZES.map((s) => `<option value="${s.id}" ${task.llmSize === s.id ? 'selected' : ''}>${s.label}${s.id === task.recommendedLlmSize ? ' (recomendado)' : ''}</option>`).join('');
    const statusOptions = TASK_STATUSES.map((s) => `<option value="${s.id}" ${task.status === s.id ? 'selected' : ''}>${s.label}</option>`).join('');
    const reqChips = (task.requirementIds || []).map((id) => {
      const req = reqMap[id];
      return `<button type="button" class="rm-req-chip" data-goto-requirement="${escapeHtml(id)}">${escapeHtml(req ? (req.title || id) : id)}</button>`;
    }).join('');
    const acc = (task.acceptanceCriteria || []).map((c) => `<li>${escapeHtml(c)}</li>`).join('');
    const subtasks = (task.subtasks || []).map((st) => `
      <li class="impl-subtask">
        <label><input type="checkbox" data-subtask="${escapeHtml(st.id)}" ${st.done ? 'checked' : ''}> <span class="${st.done ? 'impl-sub-done' : ''}">${escapeHtml(st.title)}</span></label>
        ${st.descriptionMarkdown ? `<p class="impl-sub-desc">${escapeHtml(st.descriptionMarkdown)}</p>` : ''}
      </li>`).join('');
    const linksText = (task.outputLinks || []).map((l) => (l.label ? `${l.label} ${l.url}` : l.url)).join('\n');
    const initialPrompt = buildTaskPrompt(task, task.llmSize, project);

    overlay.innerHTML = `
      <div class="impl-drawer" role="dialog" aria-modal="true">
        <header class="impl-drawer-head">
          <div>
            ${phase ? `<span class="impl-phase-chip">${escapeHtml(phase.name)}</span>` : ''}
            <h3>${escapeHtml(task.title)}</h3>
          </div>
          <button type="button" class="btn tiny ghost" data-drawer-close>Fechar</button>
        </header>
        <div class="impl-drawer-body">
          <section class="impl-drawer-section">
            <span class="rm-label">Objetivo</span>
            <div class="idea-md" data-drawer-md="desc"></div>
          </section>
          ${reqChips ? `<section class="impl-drawer-section"><span class="rm-label">Requisitos (rastreabilidade)</span><div class="rm-req-chips">${reqChips}</div></section>` : ''}
          ${acc ? `<section class="impl-drawer-section"><span class="rm-label">Critérios de aceitação</span><ul>${acc}</ul></section>` : ''}
          ${subtasks ? `<section class="impl-drawer-section"><span class="rm-label">Passos (${(task.subtasks || []).filter((s) => s.done).length}/${(task.subtasks || []).length})</span><ul class="impl-subtasks">${subtasks}</ul></section>` : ''}
          ${task.technicalNotesMarkdown ? `<section class="impl-drawer-section"><span class="rm-label">Notas técnicas</span><div class="idea-md" data-drawer-md="notes"></div></section>` : ''}

          <section class="impl-drawer-section impl-exec-controls">
            <label class="impl-control">Tamanho do LLM
              <select data-drawer-llm>${sizeOptions}</select>
            </label>
            <label class="impl-control">Estado
              <select data-drawer-status>${statusOptions}</select>
            </label>
          </section>
          <p class="impl-llm-hint" data-drawer-hint>${escapeHtml(LLM_SIZES.find((s) => s.id === task.llmSize)?.hint || '')}</p>

          <section class="impl-drawer-section">
            <div class="impl-prompt-actions">
              <span class="rm-label" style="flex:1">Prompt para o agente</span>
              <button type="button" class="btn tiny primary" data-drawer-download>Baixar</button>
              <button type="button" class="btn tiny" data-drawer-copy>Copiar</button>
            </div>
            <textarea class="impl-prompt-box" data-drawer-prompt readonly rows="12">${escapeHtml(initialPrompt)}</textarea>
          </section>

          <section class="impl-drawer-section impl-result">
            <span class="rm-label">Resultado da execução</span>
            <input type="text" class="impl-input" data-drawer-model placeholder="Modelo usado (ex.: GPT-5, Claude...)" value="${escapeHtml(task.executedModel || '')}">
            <textarea class="impl-textarea" data-drawer-result rows="4" placeholder="O que foi produzido, decisões, observações...">${escapeHtml(task.resultMarkdown || '')}</textarea>
            <textarea class="impl-textarea" data-drawer-links rows="2" placeholder="Links de saída (PR, commit, ficheiros) — um por linha">${escapeHtml(linksText)}</textarea>
            <div class="impl-prompt-actions">
              <button type="button" class="btn tiny primary" data-drawer-save-result>Guardar resultado</button>
              ${task.executedAt ? `<span class="impl-exec-at">Executada em ${escapeHtml(fmtDate(task.executedAt))}</span>` : ''}
            </div>
          </section>
        </div>
      </div>`;

    document.body.appendChild(overlay);
    document.body.style.overflow = 'hidden';

    if (task.descriptionMarkdown) renderMarkdownPreview(task.descriptionMarkdown, overlay.querySelector('[data-drawer-md="desc"]'));
    if (task.technicalNotesMarkdown) renderMarkdownPreview(task.technicalNotesMarkdown, overlay.querySelector('[data-drawer-md="notes"]'));

    const close = () => { overlay.remove(); document.body.style.overflow = ''; };
    overlay.addEventListener('click', (e) => { if (e.target === overlay) close(); });
    overlay.querySelector('[data-drawer-close]')?.addEventListener('click', close);
    overlay.querySelectorAll('[data-goto-requirement]').forEach((chip) => {
      chip.addEventListener('click', () => { close(); });
    });

    const promptBox = overlay.querySelector('[data-drawer-prompt]');
    const llmSel = overlay.querySelector('[data-drawer-llm]');
    llmSel?.addEventListener('change', () => {
      task.llmSize = llmSel.value;
      promptBox.value = buildTaskPrompt(task, task.llmSize, project);
      const hint = overlay.querySelector('[data-drawer-hint]');
      if (hint) hint.textContent = LLM_SIZES.find((s) => s.id === task.llmSize)?.hint || '';
      persistImplementation(project, { taskUpdates: [{ id: task.id, llmSize: task.llmSize }] });
    });

    overlay.querySelector('[data-drawer-status]')?.addEventListener('change', async (e) => {
      const status = e.currentTarget.value;
      task.status = status;
      const updated = await persistImplementation(project, { taskUpdates: [{ id: task.id, status }] });
      if (updated) window.PdosUI?.renderAll(updated);
    });

    overlay.querySelectorAll('[data-subtask]').forEach((cb) => {
      cb.addEventListener('change', (e) => {
        const id = e.currentTarget.dataset.subtask;
        const payload = e.currentTarget.checked
          ? { taskUpdates: [{ id: task.id, subtaskDone: [id] }] }
          : { taskUpdates: [{ id: task.id, subtaskDone: [], subtaskUndone: [id] }] };
        const span = e.currentTarget.parentElement.querySelector('span');
        if (span) span.className = e.currentTarget.checked ? 'impl-sub-done' : '';
        persistImplementation(project, payload);
      });
    });

    overlay.querySelector('[data-drawer-download]')?.addEventListener('click', () => {
      const slug = (task.title || 'tarefa').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 40);
      downloadTextFile(promptBox.value, `prompt-${slug || 'tarefa'}.md`);
    });
    overlay.querySelector('[data-drawer-copy]')?.addEventListener('click', async () => {
      await copyToClipboard(promptBox.value);
      showToast('Prompt copiado.');
    });

    overlay.querySelector('[data-drawer-save-result]')?.addEventListener('click', async () => {
      const model = overlay.querySelector('[data-drawer-model]').value;
      const result = overlay.querySelector('[data-drawer-result]').value;
      const links = overlay.querySelector('[data-drawer-links]').value
        .split('\n').map((l) => l.trim()).filter(Boolean)
        .map((line) => {
          const m = line.match(/^(.*?)(https?:\/\/\S+)$/);
          return m ? { label: m[1].trim(), url: m[2] } : { label: '', url: line };
        });
      const updated = await persistImplementation(project, {
        taskUpdates: [{ id: task.id, executedModel: model, resultMarkdown: result, outputLinks: links }],
      });
      if (updated) {
        showToast('Resultado guardado.');
        close();
        window.PdosUI?.renderAll(updated);
      }
    });
  }

  // ---- Proposal phase (commercial) ---------------------------------------
  function proposalCanViewBudget() {
    try { return typeof canViewBudget === 'function' ? canViewBudget() : true; } catch { return true; }
  }

  function formatMoney(value, currency) {
    const n = Number(value) || 0;
    const cur = currency || 'EUR';
    try {
      return new Intl.NumberFormat('pt-PT', { style: 'currency', currency: cur, maximumFractionDigits: 0 }).format(n);
    } catch {
      return `${cur} ${n.toLocaleString('pt-PT')}`;
    }
  }

  function proposalData(project) {
    const p = project.proposal && typeof project.proposal === 'object' ? project.proposal : {};
    return {
      headlineMarkdown: p.headlineMarkdown || '',
      valueJustificationMarkdown: p.valueJustificationMarkdown || '',
      currency: p.currency || 'EUR',
      totalValue: Number(p.totalValue) || 0,
      phases: Array.isArray(p.phases) ? p.phases : [],
      paymentTermsMarkdown: p.paymentTermsMarkdown || '',
      timelineMarkdown: p.timelineMarkdown || '',
    };
  }

  function proposalHasContent(p) {
    return Boolean(p.headlineMarkdown || p.valueJustificationMarkdown || p.phases.length || p.totalValue || p.paymentTermsMarkdown);
  }

  function renderProposalHistoryBlock(project) {
    if (!proposalCanViewHistory() || !window.ProposalDownloads?.renderGeneratedList) return '';
    const commercialProject = {
      ...project,
      generated: ensureArray(project.generated).filter((entry) => entry.mode === 'commercial'),
    };
    const list = window.ProposalDownloads.renderGeneratedList(commercialProject);
    if (!list) return '';
    return `
      <section class="idea-block prop-history-block">
        <h4 class="idea-block-title">Histórico de propostas geradas</h4>
        <div class="simple-list">${list}</div>
      </section>`;
  }

  function renderProposalStage(project) {
    const p = proposalData(project);
    const showMoney = proposalCanViewBudget();
    const showHistory = proposalCanViewHistory();
    // Use requirementCount (overview payload) or fall back to array length
    const reqCount = project.requirementCount ?? (project.requirements || []).length;

    if (!proposalHasContent(p)) {
      return `
        <article class="pdos-card idea-empty">
          <h4>A proposta comercial ainda não foi gerada</h4>
          <p class="muted-text">Gere uma proposta a partir dos ${reqCount} requisitos, do roadmap e dos documentos. Pode dar instruções específicas (tom, foco, restrições de valor).</p>
          <textarea class="impl-textarea" data-proposal-instructions rows="3" placeholder="Instruções para a IA (opcional): foco comercial, restrições de valor, tom..."></textarea>
          <div class="pdos-card-actions">
            <button type="button" class="btn primary" data-agent="commercial_proposal">Gerar proposta com IA</button>
          </div>
        </article>`;
    }

    if (!showHistory) {
      return `
        <article class="pdos-card idea-empty">
          <h4>Proposta comercial gerada</h4>
          <p class="muted-text">O conteúdo e o histórico das propostas ficam visíveis apenas para o administrador. Pode gerar uma nova proposta com o botão <strong>Gerar proposta</strong> acima.</p>
        </article>`;
    }

    const phaseCards = p.phases.map((ph, i) => `
      <article class="prop-phase">
        <header class="prop-phase-head">
          <h5>${escapeHtml(ph.name || `Fase ${i + 1}`)}</h5>
          ${showMoney ? `<span class="prop-phase-value">${escapeHtml(formatMoney(ph.value, p.currency))}</span>` : ''}
        </header>
        ${ph.justificationMarkdown ? `<div class="idea-md" data-prop-md="phase-just-${i}"></div>` : ''}
        ${(ph.deliverables || []).length ? `<ul class="prop-deliverables">${ph.deliverables.map((d) => `<li>${escapeHtml(d)}</li>`).join('')}</ul>` : ''}
      </article>`).join('');

    return `
      <article class="pdos-card idea-canvas proposal-canvas">
        <header class="idea-hero">
          <span class="idea-eyebrow">PROPOSTA COMERCIAL</span>
          <h2 class="idea-headline">Proposta &amp; valor</h2>
          <div class="pdos-card-actions">
            <button type="button" class="btn tiny ghost" data-proposal-regen>Regenerar com instruções</button>
          </div>
        </header>
        <div class="idea-md idea-main" data-prop-md="headline"></div>
        ${showMoney && p.totalValue ? `<div class="prop-total"><span class="rm-label">Valor total</span><strong>${escapeHtml(formatMoney(p.totalValue, p.currency))}</strong></div>` : ''}
        ${p.valueJustificationMarkdown ? `<section class="idea-block"><h4 class="idea-block-title">Justificação do valor</h4><div class="idea-md" data-prop-md="justification"></div></section>` : ''}
        ${phaseCards ? `<section class="idea-block"><h4 class="idea-block-title">Valor por fase</h4><div class="prop-phases">${phaseCards}</div></section>` : ''}
        ${p.timelineMarkdown ? `<section class="idea-block"><h4 class="idea-block-title">Cronograma</h4><div class="idea-md" data-prop-md="timeline"></div></section>` : ''}
        ${p.paymentTermsMarkdown ? `<section class="idea-block"><h4 class="idea-block-title">Condições de pagamento</h4><div class="idea-md" data-prop-md="payment"></div></section>` : ''}
        ${!showMoney ? '<p class="muted-text">Os valores comerciais estão ocultos para o seu perfil.</p>' : ''}
        <div class="prop-regen-panel hidden" data-proposal-panel>
          <textarea class="impl-textarea" data-proposal-instructions rows="3" placeholder="Instruções para regenerar (tom, foco, restrições de valor)..."></textarea>
          <div class="pdos-card-actions">
            <button type="button" class="btn tiny primary" data-agent="commercial_proposal">Gerar proposta</button>
          </div>
        </div>
        ${renderProposalHistoryBlock(project)}
      </article>`;
  }

  function hydrateProposalStage(project) {
    const p = proposalData(project);
    const fill = (key, md) => {
      const el = $('pdosCardFeed')?.querySelector(`[data-prop-md="${key}"]`);
      if (el && md) renderMarkdownPreview(md, el);
    };
    fill('headline', p.headlineMarkdown);
    fill('justification', p.valueJustificationMarkdown);
    fill('timeline', p.timelineMarkdown);
    fill('payment', p.paymentTermsMarkdown);
    p.phases.forEach((ph, i) => fill(`phase-just-${i}`, ph.justificationMarkdown));

    $('pdosCardFeed')?.querySelector('[data-proposal-regen]')?.addEventListener('click', () => {
      $('pdosCardFeed')?.querySelector('[data-proposal-panel]')?.classList.toggle('hidden');
    });
  }

  async function renderMermaidInFeed() {
    const project = window.state?.selectedProject;
    const wraps = $('pdosCardFeed')?.querySelectorAll('.pdos-mermaid-wrap[data-render-mermaid]');
    if (!wraps?.length || !project) return;
    try {
      await window.ensureMermaidLoaded?.();
    } catch {
      return;
    }
    const pack = (project.artifacts || []).find((a) => a.type === 'architecture');
    const src = project.technicalApproach?.architectureMermaid || pack?.metadata?.architectureMermaid || '';
    if (!src) return;
    for (const wrap of wraps) {
      const id = `mmd_${Math.random().toString(36).slice(2, 9)}`;
      try {
        const { svg } = await window.mermaid.render(id, src);
        wrap.innerHTML = svg;
        wrap.querySelectorAll('text, tspan').forEach((node) => {
          const text = (node.textContent || '').trim();
          if (text && /^(FR|TR|SR|NFR|BR|STK|REQ)-\d+/i.test(text)) {
            node.style.cursor = 'pointer';
            node.style.textDecoration = 'underline';
            node.addEventListener('click', (event) => {
              event.stopPropagation();
              window.navigateToRequirement?.(text);
            });
          }
        });
      } catch {
        wrap.innerHTML = `<pre class="minute-raw">${escapeHtml(src)}</pre>`;
      }
    }
  }

  async function renderMarkdownPreview(md, container) {
    if (!container) return;
    try {
      const res = await apiRequest('/markdown/render', { method: 'POST', body: { markdown: md } });
      container.innerHTML = res.html || '';
      container.classList.add('markdown-body');
    } catch {
      container.textContent = md;
    }
  }

  function wireCardFeedEvents(project) {
    $('pdosCardFeed')?.querySelectorAll('[data-view-all-phase-tasks]').forEach((btn) => {
      btn.addEventListener('click', () => {
        window.navigateToFilteredTab?.('tarefas', { deliveryStageId: btn.dataset.viewAllPhaseTasks });
        window.WorkItemsUI?.openFiltered?.(project, { deliveryStageId: btn.dataset.viewAllPhaseTasks });
      });
    });
    $('pdosCardFeed')?.querySelector('[data-open-central-tasks]')?.addEventListener('click', () => {
      window.navigateToFilteredTab?.('tarefas', { deliveryStageId: 'implementation' });
      window.WorkItemsUI?.openFiltered?.(project, { deliveryStageId: 'implementation' });
    });
    $('pdosCardFeed')?.querySelectorAll('[data-open-capability]').forEach((btn) => {
      btn.addEventListener('click', () => openDrawer(project, 'capability', btn.dataset.openCapability));
    });
    $('pdosCardFeed')?.querySelectorAll('[data-agent]').forEach((btn) => {
      btn.addEventListener('click', () => runAgent(btn.dataset.agent, project));
    });
    $('pdosCardFeed')?.querySelectorAll('[data-resume-job]').forEach((btn) => {
      btn.addEventListener('click', () => {
        const job = ensureArray(project.agentJobs).find((j) => j.id === btn.dataset.resumeJob);
        if (job) openJobWorkbench(job);
      });
    });
    $('pdosCardFeed')?.querySelectorAll('[data-job-chunk]').forEach((btn) => {
      btn.addEventListener('click', () => {
        const [jobId, idx] = String(btn.dataset.jobChunk).split(':');
        const job = ensureArray(project.agentJobs).find((j) => j.id === jobId);
        if (job) openJobWorkbench(job, Number(idx));
      });
    });
    $('pdosCardFeed')?.querySelectorAll('[data-approve-review]').forEach((btn) => {
      btn.addEventListener('click', () => resolveReview(btn.dataset.approveReview, 'approved'));
    });
    $('pdosCardFeed')?.querySelectorAll('[data-view-review]').forEach((btn) => {
      btn.addEventListener('click', () => openReviewDrawer(project, btn.dataset.viewReview));
    });
    $('pdosCardFeed')?.querySelectorAll('[data-open-artifact]').forEach((btn) => {
      btn.addEventListener('click', () => openArtifactDrawer(project, btn.dataset.openArtifact));
    });
    $('pdosCardFeed')?.querySelector('[data-unlinked-reqs]')?.addEventListener('click', () => {
      const linked = new Set();
      (project.capabilities || []).forEach((c) => (c.requirementIds || []).forEach((id) => linked.add(id)));
      const unlinked = (project.requirements || []).filter((r) => !linked.has(r.id));
      showToast(`${unlinked.length} requisito(s) ainda sem funcionalidade atribuída`);
    });
    $('pdosCardFeed')?.querySelectorAll('[data-open-req-map]').forEach((btn) => {
      btn.addEventListener('click', () => {
        window.RequirementsUI?.openRequirementsMap?.(btn.dataset.openReqMap);
      });
    });
    $('pdosCardFeed')?.querySelector('[data-pdos-hierarchy-batch]')?.addEventListener('click', async () => {
      try {
        const hierarchy = await apiRequest(`/projects/${encodeURIComponent(project.id)}/requirements/hierarchy`);
        const ids = (hierarchy?.suggestedStakeholders || []).map((s) => s.forRequirementId);
        if (!ids.length) return;
        if (!window.confirm(`Atribuir ${ids.length} órfão(s) a STK em lote?\n\nPrefira arrastar no mapa V para controlar cada ligação.`)) return;
        await window.RequirementsMapUI?.repairOrphans?.(project, ids);
        showToast('Atribuição em lote concluída.', 'ok');
        await reloadProject(project.id);
      } catch (err) {
        showToast(err.message, 'error');
      }
    });
    $('pdosCardFeed')?.querySelector('[data-pdos-hierarchy-revert]')?.addEventListener('click', async () => {
      try {
        const hierarchy = await apiRequest(`/projects/${encodeURIComponent(project.id)}/requirements/hierarchy?summary=1&includeRevert=1`);
        const count = hierarchy?.revertableRepairs?.count || 0;
        if (!count) return;
        if (!window.confirm(`Reverter ${count} STK(s) criados automaticamente?`)) return;
        await window.RequirementsMapUI?.revertStakeholderRepairs?.(project);
        showToast('Atribuições automáticas revertidas.', 'ok');
        await reloadProject(project.id);
      } catch (err) {
        showToast(err.message, 'error');
      }
    });
    $('pdosCardFeed')?.querySelectorAll('[data-scroll-target]').forEach((btn) => {
      btn.addEventListener('click', () => {
        if (btn.disabled) return;
        document.getElementById(btn.dataset.scrollTarget)?.scrollIntoView({ behavior: 'smooth', block: 'start' });
      });
    });
    $('pdosCardFeed')?.querySelectorAll('[data-nav-tab]').forEach((btn) => {
      btn.addEventListener('click', () => {
        if (btn.disabled) return;
        window.navigateToFilteredTab?.(btn.dataset.navTab, {
          deliveryStageId: btn.dataset.navStage,
          contentView: btn.dataset.navView || '',
        });
      });
    });
    $('pdosCardFeed')?.querySelectorAll('[data-open-phase-doc]').forEach((btn) => {
      btn.addEventListener('click', () => {
        const doc = (project.documents || []).find((d) => d.id === btn.dataset.openPhaseDoc);
        if (doc) window.RequirementsUI?.openDocumentViewer?.(doc, project);
      });
    });

    $('pdosCardFeed')?.querySelectorAll('[data-open-phase-item]').forEach((btn) => {
      btn.addEventListener('click', () => {
        const id = btn.dataset.openPhaseItem;
        const kind = btn.dataset.openPhaseKind;
        if (kind === 'document') {
          const doc = (project.documents || []).find((d) => d.id === id);
          if (doc) window.RequirementsUI?.openDocumentViewer?.(doc, project);
        } else if (kind === 'minute') {
          window.navigateToFilteredTab?.('atas', { deliveryStageId: window.state.deliverySelectedStageId });
        } else if (kind === 'question') {
          window.navigateToFilteredTab?.('perguntas', { deliveryStageId: window.state.deliverySelectedStageId });
        }
      });
    });

    $('pdosCardFeed')?.querySelectorAll('[data-phase-add-tab]').forEach((btn) => {
      btn.addEventListener('click', () => {
        window.navigateToFilteredTab?.(btn.dataset.phaseAddTab, { deliveryStageId: window.state.deliverySelectedStageId });
      });
    });

    $('pdosCardFeed')?.querySelectorAll('[data-move-phase-item]').forEach((sel) => {
      sel.addEventListener('change', async () => {
        const id = sel.dataset.movePhaseItem;
        const kind = sel.dataset.movePhaseKind;
        const target = sel.value;
        try {
          if (kind === 'document') {
            await apiRequest(`/projects/${project.id}/documents/${id}`, { method: 'PATCH', body: { deliveryStageId: target } });
          } else if (kind === 'minute') {
            await apiRequest(`/projects/${project.id}/meeting-minutes/${id}`, { method: 'PATCH', body: { targetStageId: target } });
          }
          showToast('Movido para a fase seleccionada');
          await reloadProject(project.id);
        } catch (err) {
          showToast(err.message, 'error');
        }
      });
    });

    $('pdosCardFeed')?.querySelectorAll('[data-roadmap-sync]').forEach((btn) => {
      btn.addEventListener('click', async () => {
        try {
          await syncRoadmapFromPlanPhases(project);
        } catch (err) {
          showToast(err.message, 'error');
        }
      });
    });

    $('pdosCardFeed')?.querySelectorAll('[data-rm-add-ms]').forEach((btn) => {
      btn.addEventListener('click', () => addMilestoneRow(btn.dataset.rmAddMs));
    });

    $('pdosCardFeed')?.querySelectorAll('[data-rm-save-ms]').forEach((btn) => {
      btn.addEventListener('click', async () => {
        try {
          await saveRoadmapMilestones(project, btn.dataset.rmSaveMs);
        } catch (err) {
          showToast(err.message, 'error');
        }
      });
    });

    $('pdosCardFeed')?.querySelectorAll('[data-rm-milestones-ai]').forEach((btn) => {
      btn.addEventListener('click', async () => {
        try {
          await runRoadmapMilestonesAgent(project, btn.dataset.rmMilestonesAi);
        } catch (err) {
          showToast(err.message, 'error');
        }
      });
    });

    $('pdosCardFeed')?.querySelectorAll('.rm-ms-remove').forEach((btn) => {
      btn.addEventListener('click', () => btn.closest('.rm-ms-row')?.remove());
    });
  }

  function openDrawer(project, type, id) {
    const drawer = $('pdosDetailDrawer');
    const content = $('pdosDrawerContent');
    if (!drawer || !content) return;
    pdosState.drawerOpen = true;
    drawer.classList.remove('hidden');

    if (type === 'capability') {
      const cap = (project.capabilities || []).find((c) => c.id === id);
      const clusters = (project.requirementClusters || []).filter((cl) => cl.capabilityId === id || (cap?.clusterIds || []).includes(cl.id));
      content.innerHTML = `
        <div class="pdos-drawer-head">
          <h3>${escapeHtml(cap?.name || id)}</h3>
          <button type="button" class="btn tiny ghost pdos-drawer-close">Fechar</button>
        </div>
        <div class="markdown-preview" id="pdosCapSummary"></div>
        <h4>Grupos de requisitos</h4>
        <div class="pdos-cluster-list">
          ${clusters.length ? clusters.map((cl) => `
            <button type="button" class="pdos-cluster-item" data-open-cluster="${escapeHtml(cl.id)}">
              <strong>${escapeHtml(cl.name)}</strong>
              <span>${(cl.requirementIds || []).length} requisitos</span>
            </button>
          `).join('') : '<p class="muted-text">Sem grupos — corre «Agrupar requisitos com IA» na fase Requisitos.</p>'}
        </div>
        <h4>Rastreabilidade (origem → requisito)</h4>
        <div id="pdosOnionLayers" class="pdos-onion"></div>
      `;
      renderMarkdownPreview(cap?.summaryMarkdown || '', $('pdosCapSummary'));
      content.querySelector('.pdos-drawer-close')?.addEventListener('click', closeDrawer);
      content.querySelectorAll('[data-open-cluster]').forEach((btn) => {
        btn.addEventListener('click', () => openClusterDrawer(project, btn.dataset.openCluster));
      });
      loadOnion(project, 'capability', id);
    }
  }

  function openClusterDrawer(project, clusterId) {
    const content = $('pdosDrawerContent');
    const cl = (project.requirementClusters || []).find((c) => c.id === clusterId);
    if (!content || !cl) return;
    const reqs = (cl.requirementIds || []).map((rid) => project.requirements.find((r) => r.id === rid)).filter(Boolean);
    content.innerHTML = `
      <div class="pdos-drawer-head">
        <button type="button" class="btn tiny ghost" id="pdosDrawerBack">← Funcionalidade</button>
        <h3>${escapeHtml(cl.name)}</h3>
        <button type="button" class="btn tiny ghost pdos-drawer-close">Fechar</button>
      </div>
      ${cl.clientRequestText ? `<blockquote class="pdos-client-request">"${escapeHtml(cl.clientRequestText)}"</blockquote>` : ''}
      <div class="pdos-req-list">
        ${reqs.map((r) => `
          <article class="pdos-req-item" data-req-id="${escapeHtml(r.id)}">
            <div class="pdos-req-head"><span>${escapeHtml(r.id)}</span><span>${escapeHtml(r.type)}</span></div>
            <strong>${escapeHtml(r.title)}</strong>
            <p>${escapeHtml(shortText(r.shall || r.need, 120))}</p>
            <div class="pdos-module-badges">${(r.moduleTags || [r.module]).filter(Boolean).map((m) =>
              `<button type="button" class="module-badge clickable" data-module-filter="${escapeHtml(m)}">${escapeHtml(m)}</button>`
            ).join('')}</div>
          </article>
        `).join('')}
      </div>
      <div id="pdosOnionLayers" class="pdos-onion"></div>
    `;
    content.querySelector('.pdos-drawer-close')?.addEventListener('click', closeDrawer);
    content.querySelector('#pdosDrawerBack')?.addEventListener('click', () => {
      if (cl.capabilityId) openDrawer(project, 'capability', cl.capabilityId);
    });
    content.querySelectorAll('[data-module-filter]').forEach((btn) => {
      btn.addEventListener('click', () => {
        pdosState.moduleFilter = btn.dataset.moduleFilter;
        renderModuleNav();
        closeDrawer();
        renderCardFeed(project);
      });
    });
    loadOnion(project, 'cluster', clusterId);
  }

  async function loadOnion(project, nodeType, nodeId) {
    const el = $('pdosOnionLayers');
    if (!el || !project?.id) return;
    try {
      const res = await apiRequest(`/projects/${project.id}/onion/${nodeType}/${encodeURIComponent(nodeId)}`);
      el.innerHTML = `
        <h4>Cebola de rastreabilidade</h4>
        ${(res.layers || []).map((l) => `
          <details class="pdos-onion-layer">
            <summary>${escapeHtml(l.nodeType)} — ${escapeHtml(l.nodeId)}</summary>
          </details>
        `).join('') || '<p class="muted-text">Sem ligações ainda. Usa Sync trace.</p>'}
      `;
    } catch { el.innerHTML = ''; }
  }

  function closeDrawer() {
    pdosState.drawerOpen = false;
    const drawer = $('pdosDetailDrawer');
    drawer?.classList.add('hidden');
    drawer?.classList.remove('hr-drawer-open');
  }

  function openAddInfoModal() {
    const modal = $('pdosAddInfoModal');
    if (modal) modal.classList.remove('hidden');
  }

  function closeAddInfoModal() {
    $('pdosAddInfoModal')?.classList.add('hidden');
  }

  async function submitAddInfo(e) {
    e.preventDefault();
    const project = window.state?.selectedProject;
    if (!project) return;
    const type = $('addInfoType')?.value;
    const stageId = $('addInfoStage')?.value || 'requirements';
    const bodyMarkdown = $('addInfoBody')?.value || '';
    const analyzeWithAgent = $('addInfoAnalyze')?.checked;
    try {
      await apiRequest(`/projects/${project.id}/add-information`, {
        method: 'POST',
        body: { type, stageId, bodyMarkdown, analyzeWithAgent },
      });
      showToast('Informação guardada');
      closeAddInfoModal();
      await reloadProject(project.id);
    } catch (err) {
      showToast(err.message, 'error');
    }
  }

  async function runDiagramToRequirements(project, options = {}) {
    const diagrams = project.diagramArtifacts || [];
    const preselected = options.diagramArtifactId;
    if (preselected) {
      await submitDiagramToRequirementsPrompt(project, preselected, null);
      return;
    }
    openDiagramToReqModal(project, diagrams, options);
  }

  async function submitDiagramToRequirementsPrompt(project, diagramArtifactId, bodyMarkdown) {
    await openExecutionPlan('diagram_to_requirements', project, {
      diagramArtifactId: diagramArtifactId || undefined,
      bodyMarkdown: diagramArtifactId ? undefined : bodyMarkdown,
      stageId: 'architecture',
    });
    showToast('Plano Diagrama → Requisitos aberto no workbench');
  }

  function openDiagramToReqModal(project, diagrams, modalOptions = {}) {
    $('diagramToReqModal')?.remove();
    const diagramOptionHtml = diagrams.map((d) =>
      `<option value="${escapeHtml(d.id)}">${escapeHtml(d.title)} (${escapeHtml(d.type)})</option>`
    ).join('');
    document.body.insertAdjacentHTML('beforeend', `
      <div id="diagramToReqModal" class="modal-overlay" role="dialog" aria-labelledby="diagramToReqTitle">
        <div class="modal-card modal-card-wide">
          <div class="modal-head">
            <h3 id="diagramToReqTitle">Diagrama → Requisitos</h3>
            <button type="button" class="btn tiny ghost" id="diagramToReqClose" aria-label="Fechar">✕</button>
          </div>
          <p class="muted-text">Escolha um diagrama da fase de arquitectura ou cole o código fonte. Será gerado um prompt v2 para extrair requisitos.</p>
          ${diagrams.length ? `
            <label class="full">Diagrama existente
              <select id="diagramToReqSelect">
                <option value="">— Colar manualmente —</option>
                ${diagramOptionHtml}
              </select>
            </label>
          ` : '<p class="muted-text">Sem diagramas guardados — cole o texto abaixo.</p>'}
          <label class="full">Código do diagrama (Mermaid, PlantUML, etc.)
            <textarea id="diagramToReqPaste" rows="10" placeholder="Cole aqui se não seleccionou um diagrama existente..."></textarea>
          </label>
          <div class="modal-actions">
            <button type="button" class="btn ghost" id="diagramToReqCancel">Cancelar</button>
            <button type="button" class="btn primary" id="diagramToReqConfirm">Gerar prompt</button>
          </div>
        </div>
      </div>
    `);
    const modal = $('diagramToReqModal');
    const close = () => modal?.remove();
    $('diagramToReqClose')?.addEventListener('click', close);
    $('diagramToReqCancel')?.addEventListener('click', close);
    modal?.addEventListener('click', (e) => { if (e.target === modal) close(); });
    const preselect = modalOptions.diagramArtifactId;
    if (preselect && $('diagramToReqSelect')) {
      $('diagramToReqSelect').value = preselect;
      $('diagramToReqSelect').dispatchEvent(new Event('change'));
    }
    $('diagramToReqSelect')?.addEventListener('change', (e) => {
      const d = diagrams.find((x) => x.id === e.target.value);
      const ta = $('diagramToReqPaste');
      if (d && ta) {
        ta.value = d.sourceText || '';
        ta.readOnly = true;
      } else if (ta) {
        ta.readOnly = false;
      }
    });
    $('diagramToReqConfirm')?.addEventListener('click', async () => {
      const diagramArtifactId = $('diagramToReqSelect')?.value || '';
      const bodyMarkdown = $('diagramToReqPaste')?.value?.trim() || '';
      if (!diagramArtifactId && !bodyMarkdown) {
        showToast('Seleccione um diagrama ou cole o código', 'error');
        return;
      }
      close();
      try {
        await submitDiagramToRequirementsPrompt(project, diagramArtifactId, bodyMarkdown);
      } catch (err) {
        showToast(err.message, 'error');
      }
    });
  }

  async function runArchitecturePackGeneration(project, options = {}) {
    if (canRunViaAgentRuntime('requirements_to_architecture')) {
      const caps = project.capabilities || [];
      return openAgentConfigModal('requirements_to_architecture', project, {
        capabilityId: options.capabilityId ?? $('archGenCapability')?.value ?? caps[0]?.id ?? '',
        moduleTag: options.moduleTag ?? $('archGenModule')?.value ?? (pdosState.moduleFilter || 'Backend'),
      });
    }
    try {
      const caps = project.capabilities || [];
      const capabilityId = options.capabilityId ?? $('archGenCapability')?.value ?? caps[0]?.id ?? '';
      const moduleTag = options.moduleTag ?? $('archGenModule')?.value ?? (pdosState.moduleFilter || 'Backend');
      const res = await apiRequest(`/projects/${project.id}/prompt-runs`, {
        method: 'POST',
        body: {
          agentType: 'requirements_to_architecture',
          stageId: 'architecture',
          capabilityId: capabilityId || undefined,
          moduleTag,
        },
      });
      pdosState.pendingPromptRun = res.promptRun;
      openPromptWorkbench(res);
      showToast('Prompt de arquitectura gerado — cole o JSON no workbench');
    } catch (err) {
      showToast(err.message, 'error');
    }
  }

  function getRuntimeJobs(project) {
    return ensureArray(project?.agentJobs).filter((j) => j.mode === 'runtime' || j.yarJobId);
  }

  function getActiveRuntimeJob(project) {
    return getRuntimeJobs(project).find(
      (j) => RUNTIME_ACTIVE_STATUSES.has(j.status) || RUNTIME_PAUSED_STATUSES.has(j.status)
    ) || null;
  }

  function openYourlabAgentPanel() {
    $('pdosYourlabAgentPanel')?.classList.remove('hidden');
    const project = window.state?.selectedProject;
    if (project) renderAgentRuntimeHistory(project);
    $('pdosAgentRuntimeLogWrap')?.toggleAttribute('open', true);
  }

  function closeYourlabAgentPanel() {
    $('pdosYourlabAgentPanel')?.classList.add('hidden');
  }

  function runtimeBadgeClass(status) {
    if (RUNTIME_DONE_STATUSES.has(status)) return 'is-done';
    if (RUNTIME_ERROR_STATUSES.has(status) || status === 'connection_lost') return 'is-error';
    if (RUNTIME_PAUSED_STATUSES.has(status) || status === 'cancel_requested') return 'is-paused';
    return 'is-running';
  }

  function canDebugAgentRuntime() {
    return window.state?.user?.role === 'super_admin';
  }

  function runtimeStatusValue(job, pollPayload) {
    if (!job && !pollPayload?.agentJob) return '';
    return pollPayload?.yarJob?.status || pollPayload?.agentJob?.status || job?.status || 'running';
  }

  function runtimeProgressParts(job, pollPayload) {
    const yar = pollPayload?.yarJob;
    const source = yar || pollPayload?.agentJob || job || {};
    const parts = [];
    if (source.subtasksTotal) parts.push(`${source.subtasksCompleted || 0}/${source.subtasksTotal} sub-tarefas`);
    if (source.tokensUsed) parts.push(`${Number(source.tokensUsed).toLocaleString('pt-PT')} tokens`);
    if (source.budget?.maxTokens && source.tokensUsed) {
      parts.push(`${Math.min(100, Math.round((source.tokensUsed / source.budget.maxTokens) * 100))}% orçamento`);
    }
    return parts;
  }

  function runtimeProgressPercent(job, pollPayload) {
    const yar = pollPayload?.yarJob;
    const source = yar || pollPayload?.agentJob || job || {};
    if (source.subtasksTotal) {
      return Math.round(((source.subtasksCompleted || 0) / source.subtasksTotal) * 100);
    }
    if (source.budget?.maxTokens && source.tokensUsed) {
      return Math.min(100, Math.round((source.tokensUsed / source.budget.maxTokens) * 100));
    }
    return RUNTIME_DONE_STATUSES.has(source.status) ? 100 : 8;
  }

  function updateAgentRuntimePanel(payload) {
    const yar = payload?.yarJob;
    const agentJob = payload?.agentJob;
    const yarError = payload?.yarError;
    let status = yar?.status || agentJob?.status || 'dispatching';
    if (payload?.dispatch?.desiredAction === 'cancel'
      && !['cancelled', 'failed', 'completed', 'pending_human_review', 'waiting_review'].includes(status)) {
      status = 'cancel_requested';
    }
    if (yarError && RUNTIME_ACTIVE_STATUSES.has(status)) {
      status = agentJob?.status || status;
    }
    const badge = $('pdosAgentRuntimeStatus');
    const progress = $('pdosAgentRuntimeProgress');
    const title = $('pdosAgentRuntimeTitle');
    const errEl = $('pdosAgentRuntimeError');
    const meter = $('pdosAgentRuntimeMeter');
    const meterFill = $('pdosAgentRuntimeMeterFill');

    if (title) {
      title.textContent = agentFriendlyLabel(agentJob?.agentType || agentJob?.platformAgentType || 'Agente');
    }
    if (badge) {
      badge.textContent = runtimeStatusLabel(status);
      badge.className = `pdos-agent-runtime-badge ${runtimeBadgeClass(status)}`;
    }

    if (progress) {
      if (yar) {
        const parts = [];
        if (yar.subtasksTotal) parts.push(`${yar.subtasksCompleted || 0}/${yar.subtasksTotal} sub-tarefas`);
        if (yar.tokensUsed) parts.push(`${yar.tokensUsed.toLocaleString()} tokens`);
        if (yar.budget?.maxTokens) {
          const pct = Math.min(100, Math.round((yar.tokensUsed / yar.budget.maxTokens) * 100));
          parts.push(`${pct}% orçamento`);
        }
        progress.textContent = parts.join(' · ') || runtimeStatusLabel(status);
        if (meter && meterFill) {
          meter.classList.remove('hidden');
          const pct = yar.subtasksTotal
            ? Math.round(((yar.subtasksCompleted || 0) / yar.subtasksTotal) * 100)
            : (yar.budget?.maxTokens ? Math.min(100, Math.round((yar.tokensUsed / yar.budget.maxTokens) * 100)) : 15);
          meterFill.style.width = `${Math.max(5, pct)}%`;
        }
      } else if (yarError) {
        progress.textContent = yarError;
        meter?.classList.add('hidden');
      } else if (agentJob?.yarJobId) {
        progress.textContent = 'A obter estado do Agent Runtime…';
        meter?.classList.add('hidden');
      } else if (status === 'dispatching') {
        progress.textContent = 'A enviar pedido ao Agent Runtime…';
        meter?.classList.add('hidden');
      } else {
        progress.textContent = runtimeStatusLabel(status);
        meter?.classList.add('hidden');
      }
    }

    const errorText = yar?.error || agentJob?.error || yarError;
    if (errEl) {
      if (errorText && (RUNTIME_ERROR_STATUSES.has(status) || (yarError && RUNTIME_ACTIVE_STATUSES.has(status)))) {
        errEl.textContent = errorText;
        errEl.classList.remove('hidden');
      } else {
        errEl.classList.add('hidden');
        errEl.textContent = '';
      }
    }

    const runId = agentJob?.promptRunId || pdosState.activeRuntimeRun?.runId;
    const resumeBtn = $('pdosAgentRuntimeResume');
    if (resumeBtn) {
      resumeBtn.classList.toggle('hidden', !RUNTIME_PAUSED_STATUSES.has(status));
      resumeBtn.textContent = RUNTIME_PAUSED_STATUSES.has(status) ? 'Continuar…' : 'Continuar';
    }
    $('pdosAgentRuntimeCancel')?.classList.toggle(
      'hidden',
      !RUNTIME_ACTIVE_STATUSES.has(status) && !RUNTIME_PAUSED_STATUSES.has(status)
    );
    $('pdosAgentRuntimeRerun')?.classList.toggle(
      'hidden',
      !(RUNTIME_ERROR_STATUSES.has(status) || RUNTIME_DONE_STATUSES.has(status))
    );
    const showReconnect = Boolean(yarError) || (status === 'dispatching' && pdosState.activeRuntimeRun?.pollErrors >= 2);
    $('pdosAgentRuntimeReconnect')?.classList.toggle('hidden', !showReconnect);
    $('pdosAgentRuntimeDismiss')?.classList.toggle('hidden', !runId);

    if (payload?.events?.length) {
      appendAgentRuntimeLog(payload.events);
      const maxId = Math.max(...payload.events.map((e) => Number(e._id ?? e.id) || 0));
      if (maxId && pdosState.activeRuntimeRun) {
        pdosState.activeRuntimeRun.lastEventId = maxId;
      }
    }

    pdosState.lastRuntimePoll = payload;
    renderAgentSubtasks(payload);
    renderAgentRuntimeBar(window.state?.selectedProject, payload);
    renderAgentOverviewCockpit(window.state?.selectedProject, payload);
  }

  function appendAgentRuntimeLog(events, replace = false) {
    const log = $('pdosAgentRuntimeLog');
    if (!events?.length) return;
    if (replace) pdosState.lastRuntimeEvents = [];
    pdosState.lastRuntimeEvents = [...pdosState.lastRuntimeEvents, ...events].slice(-80);
    renderAgentOverviewCockpit(window.state?.selectedProject, pdosState.lastRuntimePoll);
    if (!log) return;
    if (replace) log.innerHTML = '';
    events.forEach((ev) => {
      const li = document.createElement('li');
      const time = ev.timestamp ? new Date(ev.timestamp).toLocaleTimeString() : '';
      li.textContent = `${time ? `${time} — ` : ''}${ev.message || ev.type}`;
      log.appendChild(li);
    });
    while (log.children.length > 80) log.removeChild(log.firstChild);
    log.scrollTop = log.scrollHeight;
  }

  function stopAgentRuntimeMonitor() {
    if (pdosState.activeRuntimeRun?.intervalId) {
      clearTimeout(pdosState.activeRuntimeRun.intervalId);
    }
    if (pdosState.activeRuntimeRun) {
      pdosState.activeRuntimeRun.intervalId = null;
    }
  }

  function startAgentRuntimeMonitor(runId, projectId, { openPanel = false, pollMs = 12000, fastPollMs = 5000, fastForMs = 0 } = {}) {
    stopAgentRuntimeMonitor();
    pdosState.activeRuntimeRun = {
      runId,
      projectId,
      lastEventId: 0,
      intervalId: null,
      agentType: null,
      pollErrors: 0,
      fastUntil: Date.now() + Math.max(0, Number(fastForMs) || 0),
    };
    const log = $('pdosAgentRuntimeLog');
    if (log) log.innerHTML = '';
    pdosState.lastRuntimeEvents = [];
    pdosState.lastRuntimeSubtasks = [];
    if (openPanel) openYourlabAgentPanel();

    const scheduleNext = () => {
      if (!pdosState.activeRuntimeRun || pdosState.activeRuntimeRun.runId !== runId) return;
      const fast = Date.now() < (pdosState.activeRuntimeRun.fastUntil || 0);
      const delay = fast ? Math.max(3000, Number(fastPollMs) || 5000) : Math.max(10000, Number(pollMs) || 12000);
      pdosState.activeRuntimeRun.intervalId = setTimeout(tick, delay);
    };

    const tick = async () => {
      if (!pdosState.activeRuntimeRun || pdosState.activeRuntimeRun.runId !== runId) return;
      try {
        const after = pdosState.activeRuntimeRun.lastEventId || 0;
        const status = await apiRequest(
          `/agent-runs/${encodeURIComponent(runId)}/status?afterEventId=${after}`
        );
        if (status.agentJob?.agentType) {
          pdosState.activeRuntimeRun.agentType = status.agentJob.agentType;
        }
        updateAgentRuntimePanel(status);
        const yarStatus = status.yarJob?.status || status.agentJob?.status;

        if (status.yarError && !status.yarJob) {
          pdosState.activeRuntimeRun.pollErrors = (pdosState.activeRuntimeRun.pollErrors || 0) + 1;
        } else {
          pdosState.activeRuntimeRun.pollErrors = 0;
        }

        if (RUNTIME_DONE_STATUSES.has(yarStatus)) {
          stopAgentRuntimeMonitor();
          showToast('YourLab Agent concluído — revise o resultado na revisão humana');
          const project = await reloadProject(projectId);
          renderAgentRuntimeHistory(project || window.state?.selectedProject);
          return;
        }
        if (RUNTIME_ERROR_STATUSES.has(yarStatus)) {
          stopAgentRuntimeMonitor();
          showToast(status.yarJob?.error || status.agentJob?.error || status.yarError || `YourLab Agent: ${yarStatus}`, 'error');
          const project = await reloadProject(projectId);
          renderAgentRuntimeHistory(project || window.state?.selectedProject);
          return;
        }
      } catch (err) {
        const progress = $('pdosAgentRuntimeProgress');
        if (progress) progress.textContent = `Erro ao actualizar: ${err.message}`;
      }
      scheduleNext();
    };

    tick();
  }

  async function runYourlabAgent(agentType, project, runConfig = {}) {
    if (!canRunViaAgentRuntime(agentType)) {
      showToast('YourLab Agent não disponível para este tipo.', 'error');
      return false;
    }
    const options = { ...buildAgentRuntimeOptions(agentType, project), ...runConfig.options };
    if (runConfig.taskPlan) {
      options.taskPlan = runConfig.taskPlan;
    }
    const budget = runConfig.budget;
    pdosState.activeTaskPlan = runConfig.taskPlan || options.taskPlan || null;
    pdosState.lastRuntimeOptions = { ...options, taskPlan: pdosState.activeTaskPlan };
    try {
      stopAgentRuntimeMonitor();
      const body = {
        projectId: project.id,
        agentType,
        options,
        budget,
      };
      const res = await apiRequest('/agent-runs', { method: 'POST', body });
      if (res.requiresApproval && res.agentRequest) {
        showToast('O plano foi criado. Reveja as tarefas antes de iniciar.');
        window.switchToTab?.('tarefas');
        await window.WorkItemsUI?.openRequestPlan?.(project, res.agentRequest.id);
        return true;
      }
      pdosState.pendingPromptRun = res.promptRun;
      const runId = res.agentJob?.promptRunId || res.promptRun?.id;
      openYourlabAgentPanel();
      updateAgentRuntimePanel({ agentJob: res.agentJob, yarJob: res.yarJob, events: [], subtasks: [] });
      startAgentRuntimeMonitor(runId, project.id, { fastForMs: 45000 });
      showToast('YourLab Agent iniciado');
      const updated = await reloadProject(project.id);
      renderAgentRuntimeHistory(updated || project);
      renderAgentRuntimeBar(updated || project);
      return true;
    } catch (err) {
      showToast(err.message, 'error');
      return false;
    }
  }

  async function selectRuntimeHistoryRun(runId, project) {
    pdosState.activeRuntimeRun = {
      ...pdosState.activeRuntimeRun,
      runId,
      projectId: project.id,
      lastEventId: 0,
    };
    const log = $('pdosAgentRuntimeLog');
    if (log) log.innerHTML = '';
    pdosState.lastRuntimeEvents = [];
    try {
      const status = await apiRequest(`/agent-runs/${encodeURIComponent(runId)}/status?afterEventId=0`);
      updateAgentRuntimePanel(status);
      appendAgentRuntimeLog(status.events || [], false);
      const yarStatus = status.yarJob?.status || status.agentJob?.status;
      if (RUNTIME_ACTIVE_STATUSES.has(yarStatus) || RUNTIME_PAUSED_STATUSES.has(yarStatus)) {
        startAgentRuntimeMonitor(runId, project.id);
      } else {
        stopAgentRuntimeMonitor();
      }
    } catch (err) {
      showToast(err.message, 'error');
    }
    renderAgentRuntimeHistory(project, runId);
  }

  async function cancelAgentRuntime(runId, projectId) {
    try {
      const cancelled = await apiRequest(`/agent-runs/${encodeURIComponent(runId)}/cancel`, { method: 'POST', body: {} });
      const pending = cancelled.agentJob?.status === 'cancel_requested'
        || cancelled.dispatch?.status === 'cancel_requested';
      showToast(pending ? 'Cancelamento pedido — aguarda confirmação do agente' : 'YourLab Agent parado');
      const project = await reloadProject(projectId);
      const status = await apiRequest(`/agent-runs/${encodeURIComponent(runId)}/status`);
      updateAgentRuntimePanel(status);
      renderAgentRuntimeHistory(project);
      renderAgentRuntimeBar(project);
      if (pending) startAgentRuntimeMonitor(runId, projectId);
      else stopAgentRuntimeMonitor();
    } catch (err) {
      showToast(err.message, 'error');
    }
  }

  async function resumeAgentRuntime(runId, projectId, { budget, finishPartial = false } = {}) {
    try {
      await apiRequest(`/agent-runs/${encodeURIComponent(runId)}/resume`, {
        method: 'POST',
        body: {
          budget,
          approveStage: true,
          finishPartial,
        },
      });
      closeAgentContinueModal();
      showToast(finishPartial ? 'YourLab Agent a concluir parcialmente' : 'YourLab Agent retomado');
      startAgentRuntimeMonitor(runId, projectId, { fastForMs: 45000 });
      await reloadProject(projectId);
    } catch (err) {
      showToast(err.message, 'error');
    }
  }

  async function submitAgentContinueForm(ev) {
    ev?.preventDefault();
    const runId = pdosState.activeRuntimeRun?.runId;
    const projectId = pdosState.activeRuntimeRun?.projectId || window.state?.selectedProject?.id;
    if (!runId || !projectId) return;
    const yar = pdosState.lastRuntimePoll?.yarJob;
    const extraTokens = Number($('pdosAgentContinueTokens')?.value) || 30000;
    const extraMinutes = Number($('pdosAgentContinueMinutes')?.value) || 15;
    await resumeAgentRuntime(runId, projectId, {
      budget: {
        maxTokens: (yar?.budget?.maxTokens || 0) + extraTokens,
        maxWallClockMinutes: (yar?.budget?.maxWallClockMinutes || 45) + extraMinutes,
      },
    });
  }

  async function finishPartialAgentRuntime() {
    const runId = pdosState.activeRuntimeRun?.runId;
    const projectId = pdosState.activeRuntimeRun?.projectId || window.state?.selectedProject?.id;
    if (!runId || !projectId) return;
    await resumeAgentRuntime(runId, projectId, { finishPartial: true });
  }

  async function dismissAgentRuntime(runId, projectId) {
    try {
      await apiRequest(`/agent-runs/${encodeURIComponent(runId)}`, { method: 'DELETE' });
      if (pdosState.activeRuntimeRun?.runId === runId) {
        stopAgentRuntimeMonitor();
        pdosState.activeRuntimeRun = null;
        const log = $('pdosAgentRuntimeLog');
        if (log) log.innerHTML = '';
        pdosState.lastRuntimeEvents = [];
        $('pdosAgentRuntimeProgress').textContent = 'Sem execução activa.';
        $('pdosAgentRuntimeMeter')?.classList.add('hidden');
      }
      showToast('Execução removida do histórico');
      const project = await reloadProject(projectId);
      renderAgentRuntimeHistory(project);
      renderAgentRuntimeBar(project);
    } catch (err) {
      showToast(err.message, 'error');
    }
  }

  async function reconnectAgentRuntime(project) {
    try {
      const health = await apiRequest('/agent-runs/health');
      if (health.runtimeReachable) {
        showToast('Agent Runtime ligado', 'ok');
        const active = getActiveRuntimeJob(project);
        if (active?.promptRunId) startAgentRuntimeMonitor(active.promptRunId, project.id);
        return true;
      }
      showToast(health.error || 'Agent Runtime indisponível', 'error');
      return false;
    } catch (err) {
      showToast(err.message, 'error');
      return false;
    }
  }

  async function rerunAgentRuntime(agentType, project) {
    const runId = pdosState.activeRuntimeRun?.runId;
    const opts = pdosState.pendingAgentConfig?.options || pdosState.lastRuntimeOptions;
    if (runId) {
      try {
        const res = await apiRequest(`/agent-runs/${encodeURIComponent(runId)}/retry`, {
          method: 'POST',
          body: { options: opts || {} },
        });
        showToast('Execução reiniciada', 'ok');
        startAgentRuntimeMonitor(res.promptRunId || runId, project.id, { openPanel: true, fastForMs: 45000 });
        await reloadProject(project.id);
        return res;
      } catch {
        try {
          await apiRequest(`/agent-runs/${encodeURIComponent(runId)}`, { method: 'DELETE' });
        } catch { /* ignore */ }
      }
    }
    stopAgentRuntimeMonitor();
    return openAgentConfigModal(agentType, project, opts || {});
  }

  function renderAgentOverviewCockpit(project, pollPayload) {
    const el = $('projectAgentCockpit');
    if (!el) return;

    if (!project || !isAgentRuntimeEnabled() || !canDebugAgentRuntime()) {
      el.classList.add('hidden');
      el.innerHTML = '';
      return;
    }

    const jobs = getRuntimeJobs(project);
    const poll = pollPayload || pdosState.lastRuntimePoll;
    const activeRunId = pdosState.activeRuntimeRun?.runId;
    let current = null;

    if (poll?.agentJob && (!activeRunId || poll.agentJob.promptRunId === activeRunId || poll.agentJob.id === activeRunId)) {
      current = poll.agentJob;
    }
    if (!current) current = getActiveRuntimeJob(project) || jobs[0] || null;

    el.classList.remove('hidden');

    if (!current) {
      el.innerHTML = `
        <section class="agent-cockpit-shell">
          <div class="agent-cockpit-head">
            <div>
              <span class="pdos-section-label">YourLab Agent</span>
              <h4>Sem execuções registadas</h4>
            </div>
            <button type="button" class="btn tiny" data-goto-tab="deliveryos">Abrir Entrega</button>
          </div>
          <p class="muted-text">Quando um agente correr, o progresso e os registos recentes aparecem aqui.</p>
        </section>
      `;
      return;
    }

    const runId = current.promptRunId || current.id;
    const status = runtimeStatusValue(current, poll);
    const progressParts = runtimeProgressParts(current, poll);
    const progressPct = Math.max(5, Math.min(100, runtimeProgressPercent(current, poll)));
    const updatedAt = current.updatedAt || current.createdAt || '';
    const logs = (poll?.agentJob?.promptRunId === runId || poll?.agentJob?.id === runId)
      ? pdosState.lastRuntimeEvents.slice(-12)
      : [];
    const subtasks = (poll?.subtasks?.length ? poll.subtasks : pdosState.lastRuntimeSubtasks || []).slice(0, 8);
    const errorText = poll?.yarJob?.error || current.error || poll?.yarError || '';
    const canCancel = RUNTIME_ACTIVE_STATUSES.has(status) || RUNTIME_PAUSED_STATUSES.has(status);
    const canResume = RUNTIME_PAUSED_STATUSES.has(status);
    const canRerun = RUNTIME_ERROR_STATUSES.has(status) || RUNTIME_DONE_STATUSES.has(status);

    el.innerHTML = `
      <section class="agent-cockpit-shell">
        <div class="agent-cockpit-head">
          <div>
            <span class="pdos-section-label">YourLab Agent</span>
            <h4>${escapeHtml(agentFriendlyLabel(current.agentType || current.platformAgentType))}</h4>
            <p class="muted-text">
              <span class="pdos-agent-runtime-badge ${runtimeBadgeClass(status)}">${escapeHtml(runtimeStatusLabel(status))}</span>
              ${updatedAt ? `<span>Actualizado ${escapeHtml(new Date(updatedAt).toLocaleString('pt-PT'))}</span>` : ''}
            </p>
          </div>
          <div class="agent-cockpit-actions">
            <button type="button" class="btn tiny primary" data-cockpit-view="${escapeHtml(runId)}">Ver detalhe</button>
            <button type="button" class="btn tiny ghost" data-cockpit-reconnect>Testar ligação</button>
            ${canRerun ? `<button type="button" class="btn tiny" data-cockpit-rerun="${escapeHtml(runId)}" data-agent-type="${escapeHtml(current.agentType || current.platformAgentType || '')}">Repetir</button>` : ''}
            ${canResume ? `<button type="button" class="btn tiny primary" data-cockpit-resume="${escapeHtml(runId)}">Continuar</button>` : ''}
            ${canCancel ? `<button type="button" class="btn tiny danger" data-cockpit-cancel="${escapeHtml(runId)}">Parar</button>` : ''}
            <button type="button" class="btn tiny ghost" data-cockpit-dismiss="${escapeHtml(runId)}">Remover</button>
          </div>
        </div>

        <div class="agent-cockpit-meter" aria-hidden="true">
          <div style="width:${progressPct}%"></div>
        </div>
        <p class="agent-cockpit-progress muted-text">${escapeHtml(progressParts.join(' · ') || runtimeStatusLabel(status))}</p>
        ${errorText ? `<p class="pdos-agent-runtime-error">${escapeHtml(String(errorText).slice(0, 220))}</p>` : ''}

        <div class="agent-cockpit-grid">
          <section>
            <h5>Sub-tarefas</h5>
            ${subtasks.length ? `
              <ol class="agent-cockpit-list">
                ${subtasks.map((task) => `
                  <li>
                    <span>${escapeHtml(task.title || task.label || task.id || 'Sub-tarefa')}</span>
                    <small>${escapeHtml(runtimeStatusLabel(task.status || 'queued'))}</small>
                  </li>
                `).join('')}
              </ol>
            ` : '<p class="muted-text">Sem sub-tarefas recebidas nesta vista.</p>'}
          </section>
          <section>
            <h5>Registo recente</h5>
            ${logs.length ? `
              <ol class="agent-cockpit-log">
                ${logs.map((ev) => `
                  <li>${escapeHtml(`${ev.timestamp ? `${new Date(ev.timestamp).toLocaleTimeString('pt-PT')} — ` : ''}${ev.message || ev.type || 'Evento'}`)}</li>
                `).join('')}
              </ol>
            ` : '<p class="muted-text">Abra o detalhe para carregar ou acompanhar o registo desta execução.</p>'}
          </section>
        </div>

        <details class="collapsible agent-cockpit-history">
          <summary>Histórico recente</summary>
          <div class="agent-cockpit-history-list">
            ${jobs.slice(0, 6).map((job) => {
              const historyRunId = job.promptRunId || job.id;
              const historyStatus = job.status || '—';
              return `
                <button type="button" data-cockpit-view="${escapeHtml(historyRunId)}">
                  <strong>${escapeHtml(agentFriendlyLabel(job.agentType || job.platformAgentType))}</strong>
                  <span class="pdos-agent-runtime-badge ${runtimeBadgeClass(historyStatus)}">${escapeHtml(runtimeStatusLabel(historyStatus))}</span>
                  <small>${escapeHtml(job.updatedAt ? new Date(job.updatedAt).toLocaleString('pt-PT') : '')}</small>
                </button>
              `;
            }).join('')}
          </div>
        </details>
      </section>
    `;

    el.querySelectorAll('[data-cockpit-view]').forEach((btn) => {
      btn.addEventListener('click', () => {
        openYourlabAgentPanel();
        selectRuntimeHistoryRun(btn.dataset.cockpitView, project);
      });
    });
    el.querySelector('[data-cockpit-reconnect]')?.addEventListener('click', () => reconnectAgentRuntime(project));
    el.querySelectorAll('[data-cockpit-rerun]').forEach((btn) => {
      btn.addEventListener('click', () => {
        pdosState.activeRuntimeRun = {
          ...(pdosState.activeRuntimeRun || {}),
          runId: btn.dataset.cockpitRerun,
          projectId: project.id,
          agentType: btn.dataset.agentType,
        };
        rerunAgentRuntime(btn.dataset.agentType, project);
      });
    });
    el.querySelectorAll('[data-cockpit-resume]').forEach((btn) => {
      btn.addEventListener('click', () => {
        pdosState.activeRuntimeRun = {
          ...(pdosState.activeRuntimeRun || {}),
          runId: btn.dataset.cockpitResume,
          projectId: project.id,
        };
        openAgentContinueModal('Execução pausada — pode continuar com mais orçamento ou concluir parcialmente.');
      });
    });
    el.querySelectorAll('[data-cockpit-cancel]').forEach((btn) => {
      btn.addEventListener('click', () => cancelAgentRuntime(btn.dataset.cockpitCancel, project.id));
    });
    el.querySelectorAll('[data-cockpit-dismiss]').forEach((btn) => {
      btn.addEventListener('click', () => dismissAgentRuntime(btn.dataset.cockpitDismiss, project.id));
    });
  }

  function renderAgentRuntimeBar(project, pollPayload) {
    const bar = $('pdosAgentRuntimeBar');
    if (!bar) return;
    if (!isAgentRuntimeEnabled()) {
      bar.classList.add('hidden');
      return;
    }

    const poll = pollPayload || pdosState.lastRuntimePoll;
    const activeRunId = pdosState.activeRuntimeRun?.runId;
    let active = null;

    if (poll?.agentJob && (poll.agentJob.promptRunId === activeRunId || poll.agentJob.id === activeRunId)) {
      const st = poll.yarJob?.status || poll.agentJob.status;
      if (RUNTIME_ACTIVE_STATUSES.has(st) || RUNTIME_PAUSED_STATUSES.has(st)) {
        active = { ...poll.agentJob, status: st };
      }
    }

    if (!active) active = getActiveRuntimeJob(project);
    if (!active) {
      bar.classList.add('hidden');
      return;
    }
    bar.classList.remove('hidden');
    const runId = active.promptRunId || active.id;
    const status = active.status || 'running';
    const task = poll?.workItem || ensureArray(project.workItems).find((item) => item.id === active.workItemId);
    const requestTasks = task?.agentRequestId ? ensureArray(project.workItems).filter((item) => item.agentRequestId === task.agentRequestId) : [];
    const position = requestTasks.length ? requestTasks.findIndex((item) => item.id === task?.id) + 1 : Number(poll?.agentRequest?.completedTaskCount || 0) + 1;
    const totalTasks = requestTasks.length || Number(poll?.agentRequest?.taskCount || 0);
    const waitingReview = Number(poll?.agentRequest?.attentionCount || 0) || ensureArray(project.workItems).filter((item) => item.status === 'waiting_review').length;
    bar.innerHTML = `
      <span>
        <strong>${escapeHtml(task?.title || 'YourLab Agent')}</strong>
        <span class="pdos-agent-runtime-badge ${runtimeBadgeClass(status)}">${escapeHtml(runtimeStatusLabel(status))}</span>
        <span class="muted-text">${totalTasks ? ` · ${position || 1} de ${totalTasks}` : ''}${waitingReview ? ` · ${waitingReview} precisa(m) de atenção` : ''}</span>
      </span>
      <span class="muted-text">Abrir tarefa</span>
    `;
    bar.onclick = () => {
      window.switchToTab?.('tarefas');
      if (task?.id) window.WorkItemsUI?.openTask?.(project, task.id);
      else if (active.agentRequestId) window.WorkItemsUI?.openRequestPlan?.(project, active.agentRequestId);
      else {
        openYourlabAgentPanel();
        selectRuntimeHistoryRun(runId, project);
      }
    };
  }

  function renderAgentRuntimeHistory(project, selectedRunId) {
    const el = $('pdosAgentRuntimeHistory');
    if (!el || !project) return;
    const jobs = getRuntimeJobs(project).slice(0, 12);
    if (!jobs.length) {
      el.innerHTML = '<p class="muted-text">Sem execuções anteriores.</p>';
      return;
    }
    el.innerHTML = jobs.map((job) => {
      const runId = job.promptRunId || job.id;
      const status = job.status || '—';
      const isSelected = selectedRunId === runId || pdosState.activeRuntimeRun?.runId === runId;
      const when = job.updatedAt || job.createdAt || '';
      return `
        <div class="pdos-agent-history-row${isSelected ? ' is-selected' : ''}" data-history-run="${escapeHtml(runId)}">
          <div>
            <strong>${escapeHtml(agentFriendlyLabel(job.agentType))}</strong>
            <span class="pdos-agent-runtime-badge ${runtimeBadgeClass(status)}">${escapeHtml(runtimeStatusLabel(status))}</span>
            <span class="muted-text"> · ${escapeHtml(when ? new Date(when).toLocaleString() : '')}</span>
            ${job.error ? `<br><span class="muted-text">${escapeHtml(job.error.slice(0, 120))}</span>` : ''}
          </div>
          <div class="pdos-agent-runtime-actions">
            <button type="button" class="btn tiny" data-history-view="${escapeHtml(runId)}">Ver</button>
            ${RUNTIME_ERROR_STATUSES.has(status) || RUNTIME_DONE_STATUSES.has(status)
    ? `<button type="button" class="btn tiny" data-history-rerun="${escapeHtml(runId)}" data-agent-type="${escapeHtml(job.agentType)}">Repetir</button>`
    : ''}
            <button type="button" class="btn tiny ghost" data-history-dismiss="${escapeHtml(runId)}">Remover</button>
          </div>
        </div>`;
    }).join('');

    el.querySelectorAll('[data-history-view]').forEach((btn) => {
      btn.addEventListener('click', (e) => {
        e.stopPropagation();
        selectRuntimeHistoryRun(btn.dataset.historyView, project);
      });
    });
    el.querySelectorAll('[data-history-rerun]').forEach((btn) => {
      btn.addEventListener('click', (e) => {
        e.stopPropagation();
        rerunAgentRuntime(btn.dataset.agentType, project);
      });
    });
    el.querySelectorAll('[data-history-dismiss]').forEach((btn) => {
      btn.addEventListener('click', (e) => {
        e.stopPropagation();
        dismissAgentRuntime(btn.dataset.historyDismiss, project.id);
      });
    });
  }

  function watchActiveAgentRuns(project) {
    if (!project || !isAgentRuntimeEnabled()) return;
    renderAgentRuntimeBar(project);
    const active = getActiveRuntimeJob(project);
    if (!active) return;
    const runId = active.promptRunId || active.id;
    if (!pdosState.activeRuntimeRun?.intervalId) {
      startAgentRuntimeMonitor(runId, project.id);
    }
  }

  async function openExecutionPlan(agentType, project, extra = {}) {
    const loadToken = nextPromptLoadToken();
    pdosState.pendingPromptRun = null;
    pdosState.activePlan = null;
    pdosState.activePlanTaskId = '';
    pdosState.activeJob = null;
    setWorkbenchJobMode(false);
    $('pdosExecPlanBar')?.classList.add('hidden');
    $('pdosPromptWorkbench')?.classList.remove('hidden');
    $('pdosPromptAwaitBanner')?.classList.remove('hidden');
    resetPromptWorkbenchUI({ summary: 'A preparar plano…', loading: true });
    if (typeof loadingStart === 'function') loadingStart();

    const body = {
      agentType,
      stageId: window.state?.deliverySelectedStageId,
      ...extra,
    };
    if (agentType === 'commercial_proposal') {
      const ta = $('pdosCardFeed')?.querySelector('[data-proposal-instructions]');
      if (ta && ta.value.trim()) body.instructions = ta.value.trim();
    }
    let res;
    try {
      res = await apiRequest(`/projects/${project.id}/execution-plans`, { method: 'POST', body });
    } finally {
      if (typeof loadingDone === 'function') loadingDone();
      resetPromptWorkbenchUI({ loading: false });
    }
    if (!isPromptLoadCurrent(loadToken)) return null;
    pdosState.activePlan = res.plan;
    await openExecutionWorkbench(res.plan, project, { loadToken });
    return res.plan;
  }

  function workbenchSessionMatches(plan, taskId) {
    if (!plan?.id || pdosState.activePlan?.id !== plan.id) return false;
    if (taskId && pdosState.activePlanTaskId && pdosState.activePlanTaskId !== taskId) return false;
    return true;
  }

  function applyPromptToWorkbench({ prompt, promptRun, plan, taskId }) {
    if (!workbenchSessionMatches(plan, taskId)) return;
    const task = (plan?.tasks || []).find((t) => t.id === taskId);
    $('pdosPromptRunId').value = promptRun?.id || '';
    $('pdosPromptRaw').value = prompt || promptRun?.fullPrompt || task?.instruction || '';
    $('pdosPromptRaw').dataset.loading = '';
    $('pdosPromptOutput').value = '';
    $('pdosPromptSummary').textContent = task?.title
      ? `${planTransitionLabel(plan) || agentFriendlyLabel(plan?.agentType, plan)} — ${task.title}`
      : (plan?.masterPlanMarkdown || plan?.agentType || 'Plano de execução');
  }

  async function loadExecutionPlanTask(project, plan, taskId, options = {}) {
    const task = (plan.tasks || []).find((t) => t.id === taskId);
    const loadToken = options.loadToken ?? pdosState.promptLoadToken;

    pdosState.activePlan = plan;
    pdosState.activePlanTaskId = taskId;

    if (!options.skipInitialApply) {
      applyPromptToWorkbench({
        prompt: task?.instruction || '',
        promptRun: null,
        plan,
        taskId,
      });
    }

    if (options.localOnly) return null;

    try {
      const res = await apiRequest(
        `/projects/${project.id}/execution-plans/${encodeURIComponent(plan.id)}/tasks/${encodeURIComponent(taskId)}/prompt-run`,
        { method: 'POST', body: {} }
      );
      if (loadToken !== pdosState.promptLoadToken) return res;
      if (!workbenchSessionMatches(plan, taskId)) return res;
      pdosState.pendingPromptRun = null;
      applyPromptToWorkbench({
        prompt: res.prompt || task?.instruction || '',
        promptRun: res.promptRun,
        plan,
        taskId,
      });
      return res;
    } catch (err) {
      if (loadToken !== pdosState.promptLoadToken) throw err;
      if (!workbenchSessionMatches(plan, taskId)) throw err;
      if (!task?.instruction) {
        $('pdosPromptRaw').value = '';
        $('pdosPromptRaw').dataset.loading = '';
      }
      if (!options.silent) showToast(err.message || 'Erro ao registar execução do prompt', 'error');
      throw err;
    }
  }

  async function fetchExecutionPromptPack(project, plan) {
    if (!project?.id || !plan?.id) return null;
    return apiRequest(`/projects/${encodeURIComponent(project.id)}/execution-plans/${encodeURIComponent(plan.id)}/prompt-pack`);
  }

  async function copyExecutionPromptPack(project, plan) {
    try {
      const res = await fetchExecutionPromptPack(project, plan);
      await copyToClipboard(res?.markdown || '');
      showToast('Prompt pack copiado', 'ok');
    } catch (err) {
      showToast(err.message, 'error');
    }
  }

  async function downloadExecutionPromptPack(project, plan) {
    try {
      const res = await fetchExecutionPromptPack(project, plan);
      downloadTextFile(res?.markdown || '', `prompt-pack-${plan.id}.md`);
    } catch (err) {
      showToast(err.message, 'error');
    }
  }

  async function revertExecutionTask(project, plan, taskId) {
    if (!confirm('Reverter esta tarefa? O projecto volta ao snapshot anterior a esta execução e tarefas dependentes podem precisar de recheck.')) return;
    try {
      const res = await apiRequest(
        `/projects/${encodeURIComponent(project.id)}/execution-plans/${encodeURIComponent(plan.id)}/tasks/${encodeURIComponent(taskId)}/revert`,
        { method: 'POST', body: {} }
      );
      showToast('Tarefa revertida', 'ok');
      closePromptWorkbench();
      await reloadProject(project.id);
      if (res.project) window.PdosUI?.renderAll?.(res.project);
    } catch (err) {
      showToast(err.message, 'error');
    }
  }

  function renderExecutionPlanBar(plan) {
    const bar = $('pdosExecPlanBar');
    if (!bar || !plan?.tasks?.length) {
      bar?.classList.add('hidden');
      return;
    }
    const runtimeAgent = resolveRuntimeAgentForPlan(plan);
    bar.classList.remove('hidden');
    bar.innerHTML = `
      <div class="pdos-exec-plan-head">
        <strong>Plano: ${escapeHtml(agentFriendlyLabel(plan.agentType, plan))}</strong>
        <span class="muted-text">${escapeHtml(shortText(plan.masterPlanMarkdown || '', 120))}</span>
      </div>
      <ol class="pdos-exec-plan-tasks">
        ${plan.tasks.map((task) => {
          const active = task.id === pdosState.activePlanTaskId;
          const done = task.status === 'done';
          const needsRecheck = task.status === 'needs_recheck';
          const reverted = task.status === 'reverted' || task.revertedAt;
          const blocked = (task.dependsOn || []).some((depId) => {
            const dep = (plan.tasks || []).find((t) => t.id === depId);
            return !dep || !['done', 'verified', 'skipped'].includes(dep.status);
          });
          return `
            <li class="pdos-exec-plan-task ${active ? 'is-active' : ''} ${done ? 'is-done' : ''} ${needsRecheck ? 'needs-recheck' : ''} ${reverted ? 'is-reverted' : ''}">
              <button type="button" class="btn tiny ghost" data-exec-task="${escapeHtml(task.id)}" ${blocked || needsRecheck || reverted ? 'disabled' : ''}>
                ${reverted ? '↶' : done ? '✓' : needsRecheck ? '!' : blocked ? '⏳' : '○'} ${escapeHtml(task.title)}
              </button>
              ${task.auditId && !task.revertedAt ? `<button type="button" class="btn tiny ghost" data-revert-exec-task="${escapeHtml(task.id)}">Reverter</button>` : ''}
            </li>`;
        }).join('')}
      </ol>
      <div class="pdos-exec-plan-actions">
        <button type="button" class="btn tiny" id="pdosExecCopyPack">Copiar prompt pack</button>
        <button type="button" class="btn tiny ghost" id="pdosExecDownloadPack">Baixar pack</button>
        ${runtimeAgent ? `
          <button type="button" class="btn tiny primary" id="pdosExecRunAgent">Executar com YourLab Agent</button>
        ` : ''}
      </div>`;
    bar.querySelectorAll('[data-revert-exec-task]').forEach((btn) => {
      btn.addEventListener('click', (event) => {
        event.stopPropagation();
        const project = window.state?.selectedProject;
        if (project && pdosState.activePlan) revertExecutionTask(project, pdosState.activePlan, btn.dataset.revertExecTask);
      });
    });
    bar.querySelectorAll('[data-exec-task]').forEach((btn) => {
      btn.addEventListener('click', async () => {
        const project = window.state?.selectedProject;
        if (!project || !pdosState.activePlan) return;
        const taskId = btn.dataset.execTask;
        pdosState.activePlanTaskId = taskId;
        const task = (pdosState.activePlan.tasks || []).find((t) => t.id === taskId);
        if (task?.instruction) {
          applyPromptToWorkbench({
            prompt: task.instruction,
            promptRun: null,
            plan: pdosState.activePlan,
            taskId,
          });
        }
        try {
          await loadExecutionPlanTask(project, pdosState.activePlan, taskId, { silent: true });
          renderExecutionPlanBar(pdosState.activePlan);
        } catch (err) {
          showToast(err.message, 'error');
        }
      });
    });
    $('pdosExecRunAgent')?.addEventListener('click', () => {
      if (!pdosState.activePlan) return;
      const runtimeAgent = resolveRuntimeAgentForPlan(pdosState.activePlan);
      if (!runtimeAgent) return;
      openAgentConfigModal(runtimeAgent, window.state?.selectedProject, {
        ...(pdosState.activePlan.config || {}),
        executionPlanId: pdosState.activePlan.id,
        fromStageId: pdosState.activePlan.fromStageId,
        toStageId: pdosState.activePlan.toStageId,
        direction: pdosState.activePlan.direction,
      });
    });
    $('pdosExecCopyPack')?.addEventListener('click', () => {
      const project = window.state?.selectedProject;
      if (project && pdosState.activePlan) copyExecutionPromptPack(project, pdosState.activePlan);
    });
    $('pdosExecDownloadPack')?.addEventListener('click', () => {
      const project = window.state?.selectedProject;
      if (project && pdosState.activePlan) downloadExecutionPromptPack(project, pdosState.activePlan);
    });
  }

  async function openExecutionWorkbench(plan, project, options = {}) {
    const loadToken = options.loadToken ?? nextPromptLoadToken();
    pdosState.activePlan = plan;
    pdosState.pendingPromptRun = null;
    const firstTask = (plan.tasks || []).find((t) => t.status !== 'done') || plan.tasks?.[0];
    pdosState.activePlanTaskId = firstTask?.id || '';
    const modal = $('pdosPromptWorkbench');
    if (!modal) return;
    pdosState.activeJob = null;
    setWorkbenchJobMode(false);
    modal.classList.remove('hidden');
    $('pdosPromptAwaitBanner')?.classList.remove('hidden');
    const transitionHint = planTransitionLabel(plan);
    const summary = transitionHint
      ? `Transição ${transitionHint}${firstTask?.title ? ` — ${firstTask.title}` : ''}`
      : (plan.masterPlanMarkdown || plan.agentType || 'Plano de execução');
    $('pdosPromptSummary').textContent = summary;

    if (!firstTask) {
      $('pdosPromptRaw').value = '';
      $('pdosPromptRaw').dataset.loading = '';
      showToast('Este plano não tem tarefas — verifique a transição de fase.', 'error');
      return;
    }

    try {
      renderExecutionPlanBar(plan);
    } catch (err) {
      showToast(err.message || 'Erro ao renderizar plano', 'error');
    }

    applyPromptToWorkbench({
      prompt: firstTask.instruction || '',
      promptRun: null,
      plan,
      taskId: firstTask.id,
    });

    if (!firstTask.instruction) {
      showToast('Prompt desta tarefa vazio — a regenerar no servidor…', 'error');
    }

    if (firstTask && project) {
      loadExecutionPlanTask(project, plan, firstTask.id, {
        loadToken,
        skipInitialApply: true,
        silent: true,
      }).catch(() => {});
    }
  }

  async function runAgent(agentType, project) {
    if (agentType === 'requirements_to_architecture') {
      return runArchitecturePackGeneration(project);
    }
    if (agentType === 'diagram_to_requirements') {
      return runDiagramToRequirements(project);
    }
    if (BATCHABLE_AGENT_TYPES.includes(agentType)
      && (project.requirementCount ?? ensureArray(project.requirements).length) > AGENT_JOB_THRESHOLD) {
      try {
        return await openExecutionPlan(agentType, project);
      } catch (err) {
        showToast(err.message, 'error');
      }
      return undefined;
    }
    if (canRunViaAgentRuntime(agentType)) {
      try {
        await openExecutionPlan(agentType, project);
      } catch (err) {
        showToast(err.message, 'error');
        return openAgentConfigModal(agentType, project);
      }
      return undefined;
    }
    try {
      await openExecutionPlan(agentType, project);
    } catch (err) {
      showToast(err.message, 'error');
    }
  }

  function setWorkbenchJobMode(on) {
    $('pdosJobBar')?.classList.toggle('hidden', !on);
    $('pdosJobSubmit')?.classList.toggle('hidden', !on);
    $('pdosPromptApply')?.classList.toggle('hidden', on);
    if (!on) $('pdosJobAuto')?.classList.add('hidden');
  }

  async function fetchPromptRunFull(project, promptRun) {
    if (!promptRun?.id || !project?.id) return promptRun;
    if (promptRun.fullPrompt || !promptRun.hasFullPrompt) return promptRun;
    const res = await apiRequest(
      `/projects/${encodeURIComponent(project.id)}/prompt-runs/${encodeURIComponent(promptRun.id)}`
    );
    return res.promptRun || promptRun;
  }

  async function openPromptWorkbench(res, options = {}) {
    if (options.bumpToken !== false) nextPromptLoadToken();
    const modal = $('pdosPromptWorkbench');
    if (!modal) return;
    pdosState.activeJob = null;
    pdosState.activePlan = null;
    pdosState.activePlanTaskId = '';
    let promptRun = res.promptRun || null;
    pdosState.pendingPromptRun = promptRun;
    $('pdosExecPlanBar')?.classList.add('hidden');
    setWorkbenchJobMode(false);
    modal.classList.remove('hidden');
    $('pdosPromptAwaitBanner')?.classList.remove('hidden');
    $('pdosPromptSummary').textContent = promptRun?.summaryMarkdown || 'Prompt gerado.';
    $('pdosPromptRaw').value = res.prompt || promptRun?.fullPrompt || '';
    $('pdosPromptRaw').dataset.loading = '';
    $('pdosPromptOutput').value = promptRun?.rawOutput || '';
    $('pdosPromptRunId').value = promptRun?.id || '';

    const project = window.state?.selectedProject;
    if (project && promptRun?.id && !promptRun.fullPrompt && promptRun.hasFullPrompt) {
      resetPromptWorkbenchUI({ loading: true });
      if (typeof loadingStart === 'function') loadingStart();
      try {
        promptRun = await fetchPromptRunFull(project, promptRun);
        pdosState.pendingPromptRun = promptRun;
        $('pdosPromptRaw').value = res.prompt || promptRun.fullPrompt || '';
        $('pdosPromptRaw').dataset.loading = '';
        if (promptRun.rawOutput && !$('pdosPromptOutput').value) {
          $('pdosPromptOutput').value = promptRun.rawOutput;
        }
      } catch (err) {
        $('pdosPromptRaw').dataset.loading = '';
        showToast(err.message || 'Nao foi possivel carregar o prompt.', 'error');
      } finally {
        resetPromptWorkbenchUI({ loading: false });
        if (typeof loadingDone === 'function') loadingDone();
      }
    }
  }

  function closePromptWorkbench() {
    nextPromptLoadToken();
    $('pdosPromptWorkbench')?.classList.add('hidden');
    $('pdosPromptAwaitBanner')?.classList.add('hidden');
    $('pdosExecPlanBar')?.classList.add('hidden');
    setWorkbenchJobMode(false);
    pdosState.activeJob = null;
    pdosState.activeJobStep = '';
    pdosState.activePlan = null;
    pdosState.activePlanTaskId = '';
    pdosState.pendingPromptRun = null;
    resetPromptWorkbenchUI({ summary: '', loading: false });
  }

  async function startAgentJob(agentType, project) {
    try {
      const res = await apiRequest(`/projects/${project.id}/agent-jobs`, {
        method: 'POST',
        body: { agentType, stageId: window.state?.deliverySelectedStageId },
      });
      showToast('Pedido dividido em lotes — responda um lote de cada vez');
      openJobWorkbench(res.agentJob);
      await reloadProject(project.id);
    } catch (err) {
      showToast(err.message, 'error');
    }
  }

  // Escolhe o proximo passo do job: primeiro os lotes obrigatorios pendentes,
  // depois a consolidacao. Lotes deferidos (sem modulo) nao bloqueiam.
  function renderAgentJobsHtml(project) {
    const jobs = ensureArray(project.agentJobs).filter((j) => ['collecting', 'reconciling'].includes(j.status));
    if (!jobs.length) return '';
    return `
      <article class="pdos-card pdos-agent-jobs">
        <h4>Tarefas de IA em lotes</h4>
        <p class="muted-text">Pedidos grandes divididos em lotes — responda um de cada vez para não sobrecarregar o modelo.</p>
        ${jobs.map((job) => {
          const total = ensureArray(job.chunks).length;
          const done = ensureArray(job.chunks).filter((c) => c.status === 'done').length;
          const pendingDeferred = ensureArray(job.chunks).filter((c) => c.deferred && c.status !== 'done');
          const stateLabel = job.status === 'reconciling' ? 'Pronto para consolidação' : `${done}/${total} lotes concluídos`;
          return `
            <div class="pdos-job-row">
              <div class="pdos-job-row-info">
                <strong>${escapeHtml(agentTypeLabel(job.agentType))}</strong>
                <span class="muted-text"> · ${escapeHtml(stateLabel)}</span>
              </div>
              <div class="pdos-job-row-actions">
                <button type="button" class="btn tiny primary" data-resume-job="${escapeHtml(job.id)}">${job.status === 'reconciling' ? 'Consolidar' : 'Continuar'}</button>
                ${pendingDeferred.map((c) => `<button type="button" class="btn tiny" data-job-chunk="${escapeHtml(job.id)}:${c.index}">Definir: ${escapeHtml(c.label)}</button>`).join('')}
              </div>
            </div>`;
        }).join('')}
      </article>`;
  }

  function nextJobStep(job) {
    const pendingRequired = ensureArray(job.chunks).find((c) => !c.deferred && c.status !== 'done');
    if (pendingRequired) return { type: 'chunk', chunk: pendingRequired };
    if (job.promptRunId || job.status === 'review_pending' || job.status === 'applied') return { type: 'done' };
    return { type: 'reconcile' };
  }

  function openJobWorkbench(job, forceChunkIndex = null) {
    const modal = $('pdosPromptWorkbench');
    if (!modal || !job) return;
    pdosState.activeJob = job;
    setWorkbenchJobMode(true);
    modal.classList.remove('hidden');
    $('pdosJobId').value = job.id;
    renderJobStep(job, forceChunkIndex);
  }

  function renderJobStep(job, forceChunkIndex = null) {
    pdosState.activeJob = job;
    let step;
    if (forceChunkIndex != null) {
      const c = ensureArray(job.chunks).find((x) => Number(x.index) === Number(forceChunkIndex));
      step = c ? { type: 'chunk', chunk: c } : nextJobStep(job);
    } else {
      step = nextJobStep(job);
    }

    const total = ensureArray(job.chunks).length;
    const doneCount = ensureArray(job.chunks).filter((c) => c.status === 'done').length;

    if (step.type === 'done') {
      closePromptWorkbench();
      return;
    }

    if (step.type === 'reconcile') {
      pdosState.activeJobStep = 'reconcile';
      $('pdosJobChunkIndex').value = '';
      $('pdosPromptSummary').textContent = 'Consolidação final. Recomendado: "Consolidar automaticamente (sem IA)" — junta os lotes sem pedir nada ao ChatGPT. Opcional: cole grupos de fusão da IA para unir funcionalidades parecidas.';
      $('pdosPromptRaw').value = job.reconcilePrompt || '';
      $('pdosPromptOutput').value = '';
      $('pdosJobBar').innerHTML = `<span class="pdos-job-step">Passo final: consolidação</span><span class="pdos-job-progress">${doneCount}/${total} lotes concluídos</span>`;
      $('pdosJobAuto')?.classList.remove('hidden');
      $('pdosJobSubmit').textContent = 'Submeter grupos da IA';
      refreshReconcilePrompt(job);
      return;
    }

    const chunk = step.chunk;
    pdosState.activeJobStep = 'chunk';
    $('pdosJobAuto')?.classList.add('hidden');
    $('pdosJobChunkIndex').value = chunk.index;
    const human = Number(chunk.index) + 1;
    $('pdosPromptSummary').textContent = `Lote ${human} de ${total}: ${chunk.label} (${chunk.requirementIds.length} requisitos)${chunk.deferred ? ' — opcional, pode definir mais tarde' : ''}`;
    $('pdosPromptRaw').value = chunk.prompt || '';
    $('pdosPromptOutput').value = '';
    const dots = ensureArray(job.chunks).map((c) => `<span class="pdos-job-dot${c.status === 'done' ? ' done' : ''}${c.deferred ? ' deferred' : ''}" title="${escapeHtml(c.label)}">${Number(c.index) + 1}</span>`).join('');
    $('pdosJobBar').innerHTML = `<div class="pdos-job-dots">${dots}</div><span class="pdos-job-progress">${doneCount}/${total} concluídos</span>`;
    $('pdosJobSubmit').textContent = 'Submeter lote e seguir';
  }

  // Recalcula o prompt de consolidacao (compacto) no servidor, util para jobs
  // criados antes desta versao.
  async function refreshReconcilePrompt(job) {
    const project = window.state?.selectedProject;
    if (!project || !job) return;
    try {
      const res = await apiRequest(`/projects/${project.id}/agent-jobs/${job.id}/refresh-reconcile`, { method: 'POST' });
      if (pdosState.activeJob?.id === job.id && pdosState.activeJobStep === 'reconcile' && res.agentJob?.reconcilePrompt) {
        pdosState.activeJob = res.agentJob;
        $('pdosPromptRaw').value = res.agentJob.reconcilePrompt;
      }
    } catch (err) {
      // mantem o prompt anterior se falhar
    }
  }

  // Consolidacao deterministica (sem IA): funde os lotes por codigo e envia para
  // revisao humana. Caminho recomendado e a prova de truncamento do ChatGPT.
  async function submitJobAuto() {
    const project = window.state?.selectedProject;
    const job = pdosState.activeJob;
    if (!project || !job) return;
    try {
      const res = await apiRequest(`/projects/${project.id}/agent-jobs/${job.id}/reconcile`, {
        method: 'POST',
        body: {},
      });
      showToast('Consolidado automaticamente — reveja e aprove para aplicar');
      closePromptWorkbench();
      await reloadProject(project.id);
      if (res.review?.id) openReviewDrawer(window.state.selectedProject, res.review.id);
    } catch (err) {
      showToast(err.message, 'error');
    }
  }

  async function submitJobStep() {
    const project = window.state?.selectedProject;
    const job = pdosState.activeJob;
    if (!project || !job) return;
    const raw = $('pdosPromptOutput')?.value || '';
    if (!raw.trim()) {
      showToast('Cole o output da IA antes de submeter', 'error');
      return;
    }
    const normalized = normalizeJsonInput(raw);
    let parsed = null;
    try { parsed = JSON.parse(normalized); } catch {
      showToast('JSON inválido — use aspas rectas (" ") no output', 'error');
      return;
    }
    try {
      if (pdosState.activeJobStep === 'reconcile') {
        const res = await apiRequest(`/projects/${project.id}/agent-jobs/${job.id}/reconcile`, {
          method: 'POST',
          body: { rawOutput: normalized, parsedOutput: parsed },
        });
        showToast('Consolidação submetida para revisão humana — aprove para aplicar');
        closePromptWorkbench();
        await reloadProject(project.id);
        if (res.review?.id) openReviewDrawer(window.state.selectedProject, res.review.id);
      } else {
        const idx = $('pdosJobChunkIndex').value;
        const res = await apiRequest(`/projects/${project.id}/agent-jobs/${job.id}/chunks/${idx}`, {
          method: 'POST',
          body: { rawOutput: normalized, parsedOutput: parsed },
        });
        renderJobStep(res.agentJob);
        await reloadProject(project.id);
      }
    } catch (err) {
      showToast(err.message, 'error');
    }
  }

  async function applyPromptOutput() {
    const project = window.state?.selectedProject;
    const runId = $('pdosPromptRunId')?.value;
    const raw = $('pdosPromptOutput')?.value || '';
    if (!project || !runId) return;
    if (!raw.trim()) {
      showToast('Cole o output da IA antes de submeter', 'error');
      return;
    }
    const normalized = normalizeJsonInput(raw);
    let parsed = null;
    try { parsed = JSON.parse(normalized); } catch {
      showToast('JSON inválido — use aspas rectas (" ") no output', 'error');
      return;
    }

    const plan = pdosState.activePlan;
    const taskId = pdosState.activePlanTaskId;

    try {
      let res;
      if (plan?.id && taskId) {
        res = await apiRequest(
          `/projects/${project.id}/execution-plans/${encodeURIComponent(plan.id)}/tasks/${encodeURIComponent(taskId)}/submit`,
          { method: 'POST', body: { rawOutput: normalized, parsedOutput: parsed, deferApply: true } }
        );
      } else {
        res = await apiRequest(`/projects/${project.id}/prompt-runs/${runId}/apply`, {
          method: 'POST',
          body: { rawOutput: normalized, parsedOutput: parsed, deferApply: true },
        });
      }

      if (res.noChanges) {
        showToast('Nenhuma alteração detectada — revisão humana não criada.', 'ok');
      } else if (res.review?.id) {
        showToast('Submetido para revisão humana', 'ok');
        closePromptWorkbench();
        await reloadProject(project.id);
        openReviewDrawer(window.state.selectedProject, res.review.id);
        return;
      } else {
        showToast('Output registado — continue as tarefas do plano.', 'ok');
      }

      if (plan?.id) {
        const prevFrCount = (pdosState.activePlan?.tasks || []).filter((t) => t.reqKind === 'functional').length;
        const planRes = await apiRequest(`/projects/${project.id}/execution-plans/${encodeURIComponent(plan.id)}`);
        pdosState.activePlan = planRes.plan;
        renderExecutionPlanBar(planRes.plan);
        const newFrCount = (planRes.plan.tasks || []).filter((t) => t.reqKind === 'functional').length;
        if (newFrCount > prevFrCount) {
          showToast(`Plano actualizado: ${newFrCount} tarefas FR (uma por fase de implementação)`, 'ok');
        }
        const next = (planRes.plan.tasks || []).find((t) => t.status !== 'done' && t.status !== 'skipped');
        if (next) await loadExecutionPlanTask(window.state.selectedProject, planRes.plan, next.id);
      }
      await reloadProject(project.id);
    } catch (err) {
      showToast(err.message, 'error');
    }
  }

  async function pasteAlternative() {
    const project = window.state?.selectedProject;
    const runId = $('pdosPromptRunId')?.value;
    const raw = $('pdosAltOutput')?.value || '';
    if (!project || !runId || !raw) return;
    try {
      const res = await apiRequest(`/projects/${project.id}/prompt-runs/${runId}/alternative`, {
        method: 'POST',
        body: { rawOutput: raw, modelName: $('pdosAltModel')?.value || 'external' },
      });
      $('pdosAltDiff').textContent = res.alternative?.diffSummary || 'Resposta alternativa guardada.';
      showToast('Comparar outputs disponível');
    } catch (err) {
      showToast(err.message, 'error');
    }
  }

  async function resolveReview(reviewId, status, extra = {}) {
    const project = window.state?.selectedProject;
    if (!project) return;
    try {
      const res = await apiRequest(`/projects/${project.id}/human-reviews/${reviewId}/resolve`, {
        method: 'POST',
        body: {
          status,
          action: extra.action || status,
          resolutionNotes: extra.notes || '',
          applyChanges: status === 'approved' && extra.action !== 'rollback',
        },
      });
      if (res.rollback) showToast('Projecto revertido para snapshot anterior', 'ok');
      else if (extra.action === 'reprompt' && res.repromptRun) {
        showToast('Reprompt — cole novo output no workbench', 'ok');
        openPromptWorkbench({ promptRun: res.repromptRun, prompt: res.repromptRun.fullPrompt });
      } else if (status === 'approved') showToast('Revisão aprovada e alterações aplicadas', 'ok');
      else if (extra.action === 'cancel') showToast('Revisão cancelada', 'ok');
      else showToast('Revisão actualizada', 'ok');
      closeDrawer();
      await reloadProject(project.id);
    } catch (err) {
      showToast(err.message, 'error');
    }
  }

  function renderReviewSectionsHtml(review, promptRun) {
    const sections = review.suggestedChanges?.sections || [];
    const parsed = review.suggestedChanges?.parsed || promptRun?.parsedOutput;
    const rawOutput = review.suggestedChanges?.rawOutput || promptRun?.rawOutput;

    if (sections.length) {
      const kindBadge = { created: 'badge-green', updated: 'badge-orange' };
      const kindLabel = { created: 'Novo', updated: 'Alterado' };
      return sections.map((section) => `
        <div class="review-section review-section-${escapeHtml(section.kind || 'created')}">
          <h4>
            <span class="section-badge ${kindBadge[section.kind] || 'badge-gray'}">${escapeHtml(kindLabel[section.kind] || section.kind || 'Item')}</span>
            ${escapeHtml(section.label || section.entityType || 'Alteração')}
          </h4>
          ${section.before ? `<div class="review-diff"><strong>Antes</strong><pre class="minute-raw">${escapeHtml(String(section.before).slice(0, 4000))}</pre></div>` : ''}
          ${section.after ? `<div class="review-diff"><strong>Conteúdo proposto</strong><pre class="minute-raw">${escapeHtml(String(section.after).slice(0, 4000))}</pre></div>` : ''}
          ${section.items?.length ? `<ul class="review-items">${section.items.map((item) => {
            const parts = Object.entries(item).filter(([, v]) => v !== undefined && v !== '').map(([k, v]) => `<strong>${escapeHtml(k)}:</strong> ${escapeHtml(String(v))}`);
            return `<li>${parts.join(' · ')}</li>`;
          }).join('')}</ul>` : ''}
        </div>
      `).join('');
    }

    if (parsed) {
      return `<pre class="minute-raw">${escapeHtml(JSON.stringify(parsed, null, 2).slice(0, 16000))}</pre>`;
    }
    if (rawOutput && rawOutput.trim()) {
      return `<pre class="minute-raw">${escapeHtml(rawOutput.slice(0, 16000))}</pre>`;
    }
    return '<p class="muted-text">Sem output colado. Abra o Prompt Workbench, cole a resposta da IA e submeta para revisão.</p>';
  }

  async function openReviewDrawer(project, reviewId) {
    let review = (project.humanReviews || []).find((r) => r.id === reviewId);
    const drawer = $('pdosDetailDrawer');
    const content = $('pdosDrawerContent');
    if (!drawer || !content || !review) return;

    const promptRun = (project.promptRuns || []).find(
      (r) => r.id === review.promptRunId || r.id === review.sourceId
    );

    if ((!review.suggestedChanges || !review.bodyMarkdown) && promptRun && (promptRun.parsedOutput || promptRun.rawOutput)) {
      try {
        const res = await apiRequest(`/projects/${project.id}/human-reviews/${reviewId}/enrich`, { method: 'POST', body: {} });
        if (res.review) {
          review = res.review;
          const idx = (project.humanReviews || []).findIndex((r) => r.id === reviewId);
          if (idx >= 0) project.humanReviews[idx] = review;
        }
      } catch { /* fallback abaixo */ }
    }

    drawer.classList.remove('hidden');
    drawer.classList.add('hr-drawer-open');
    const agentLabel = promptRun ? agentFriendlyLabel(promptRun.agentType) : '';
    content.innerHTML = `
      <div class="pdos-drawer-head hr-drawer-head">
        <div>
          <span class="hr-card-status">Revisão humana</span>
          <h3>${escapeHtml(review.title)}</h3>
          ${agentLabel ? `<p class="muted-text">Origem: <strong>${escapeHtml(agentLabel)}</strong></p>` : ''}
        </div>
        <button type="button" class="btn tiny ghost pdos-drawer-close" aria-label="Fechar">Fechar</button>
      </div>
      <div class="hr-drawer-body">
        <section class="hr-drawer-section">
          <span class="rm-label">Resumo</span>
          <p class="review-summary">${escapeHtml(review.summaryMarkdown || '')}</p>
        </section>
        <section class="hr-drawer-section">
          <span class="rm-label">Alterações propostas (${review.decisionsCount || 0})</span>
          <div id="pdosReviewSections" class="review-sections hr-review-sections">${renderReviewSectionsHtml(review, promptRun)}</div>
        </section>
        ${review.bodyMarkdown ? `<section class="hr-drawer-section"><span class="rm-label">Detalhe narrativo</span><div id="pdosReviewMarkdown" class="markdown-preview idea-md"></div></section>` : ''}
      </div>
      <footer class="hr-drawer-footer">
        ${review.status === 'pending' && window.canEditProject?.() ? `
          <button type="button" class="btn primary" data-approve-review="${escapeHtml(review.id)}">Aprovar e aplicar</button>
          <button type="button" class="btn" data-reject-review="${escapeHtml(review.id)}">Rejeitar</button>
          <button type="button" class="btn" data-changes-review="${escapeHtml(review.id)}">Pedir alterações</button>
          <button type="button" class="btn" data-clarify-review="${escapeHtml(review.id)}">Necessita esclarecimento</button>
          <button type="button" class="btn" data-defer-review="${escapeHtml(review.id)}">Adiar</button>
          <button type="button" class="btn" data-reprompt-review="${escapeHtml(review.id)}">Reprompt</button>
          ${review.preApplySnapshotId ? `<button type="button" class="btn" data-rollback-review="${escapeHtml(review.id)}">Reverter</button>` : ''}
          <button type="button" class="btn ghost" data-cancel-review="${escapeHtml(review.id)}">Cancelar revisão</button>
        ` : `<span class="chip">${escapeHtml(review.status)}</span>`}
        <button type="button" class="btn ghost pdos-drawer-close-footer">Fechar</button>
      </footer>
    `;

    if (review.bodyMarkdown) {
      await renderMarkdownPreview(review.bodyMarkdown, $('pdosReviewMarkdown'));
    }

    content.querySelectorAll('.pdos-drawer-close, .pdos-drawer-close-footer').forEach((btn) => {
      btn.addEventListener('click', closeDrawer);
    });
    content.querySelector('[data-approve-review]')?.addEventListener('click', () => resolveReview(reviewId, 'approved'));
    content.querySelector('[data-reject-review]')?.addEventListener('click', () => resolveReview(reviewId, 'rejected'));
    content.querySelector('[data-changes-review]')?.addEventListener('click', () => {
      const notes = window.prompt('Notas para o reprompt ou alterações manuais:') || '';
      resolveReview(reviewId, 'changes_requested', { notes, action: 'changes_requested' });
    });
    content.querySelector('[data-reprompt-review]')?.addEventListener('click', () => {
      const notes = window.prompt('Instruções adicionais para o reprompt:') || '';
      resolveReview(reviewId, 'changes_requested', { notes, action: 'reprompt' });
    });
    content.querySelector('[data-clarify-review]')?.addEventListener('click', () => {
      const notes = window.prompt('O que precisa de ser esclarecido?') || '';
      resolveReview(reviewId, 'needs_clarification', { notes, action: 'needs_clarification' });
    });
    content.querySelector('[data-defer-review]')?.addEventListener('click', () => {
      const notes = window.prompt('Motivo para adiar (opcional):') || '';
      resolveReview(reviewId, 'deferred', { notes, action: 'deferred' });
    });
    content.querySelector('[data-rollback-review]')?.addEventListener('click', () => {
      if (!window.confirm('Reverter o projecto para o estado antes desta revisão?')) return;
      resolveReview(reviewId, 'rejected', { action: 'rollback' });
    });
    content.querySelector('[data-cancel-review]')?.addEventListener('click', () => {
      resolveReview(reviewId, 'cancelled', { action: 'cancel' });
    });
  }

  async function relinkPhases() {
    const project = window.state?.selectedProject;
    if (!project) return;
    const btn = $('pdosRelinkBtn');
    if (btn) { btn.disabled = true; btn.textContent = 'A reaplicar…'; }
    try {
      const res = await apiRequest(`/projects/${project.id}/relink-phases`, { method: 'POST' });
      showToast(res.report?.summary || 'Ligações reaplicadas');
      await reloadProject(project.id);
    } catch (err) {
      showToast(err.message, 'error');
    } finally {
      if (btn) { btn.disabled = false; btn.textContent = 'Reaplicar ligações entre fases'; }
    }
  }

  async function syncTraceLinks() {
    const project = window.state?.selectedProject;
    if (!project) return;
    try {
      await apiRequest(`/projects/${project.id}/trace-links/sync`, { method: 'POST' });
      if (typeof refreshTraceMap === 'function') await refreshTraceMap();
      await reloadProject(project.id);
    } catch (err) {
      showToast(err.message, 'error');
    }
  }

  async function generateCommercialProposal() {
    const project = window.state?.selectedProject;
    if (!project) return;
    if (window.ProposalConfigurator?.open) {
      await window.ProposalConfigurator.open(project.id, {
        onGenerated: async () => reloadProject(project.id),
      });
      return;
    }
    showToast('Configurador de proposta indisponível.', 'error');
  }

  async function reloadProject(projectId) {
    if (window.refreshSelectedProject) {
      return window.refreshSelectedProject({
        projectId,
        tab: 'deliveryos',
        renderDelivery: true,
        renderTab: false,
      });
    }
    const res = await apiRequest(`/projects/${projectId}`);
    window.state.selectedProject = res.project;
    renderPdosShell(res.project);
    if (typeof renderProjectDetails === 'function') renderProjectDetails();
    return res.project;
  }

  function renderPdosShell(project) {
    if (!project) return;
    const stageId = window.state?.deliverySelectedStageId || 'requirements';
    renderProjectHeader(project);
    renderGoldenTimeline(project);
    renderStageGuidance(project);
    renderCurrentFocus(project);
    renderStageConceptBanner();
    renderModuleNav();
    renderHumanReviewsSection(project);
    renderAgentRuntimeBar(project);
    $('projectAgentCockpit')?.classList.add('hidden');
    renderCardFeed(project);
    window.DiagramsUI?.renderShell?.(project);
    const flowEl = document.getElementById('pdosFlowHealth');
    if (flowEl && !window.DeliveryOsPlatform?.isClientRole?.()) {
      flowEl.classList.remove('hidden');
    }
  }

  function renderSnapshotsList(project) {
    const el = $('pdosSnapshotsList');
    if (!el) return;
    const snaps = project.versionSnapshots || [];
    el.innerHTML = snaps.length
      ? snaps.slice(0, 5).map((s) => `
        <div class="simple-item">
          <strong>${escapeHtml(s.label)}</strong>
          <small>${escapeHtml(s.createdAt)}</small>
          <button type="button" class="btn tiny" data-restore-snap="${escapeHtml(s.id)}">Restaurar</button>
        </div>
      `).join('')
      : '<span class="muted-text">Sem snapshots.</span>';
    el.querySelectorAll('[data-restore-snap]').forEach((btn) => {
      btn.addEventListener('click', async () => {
        if (!confirm('Restaurar esta versão?')) return;
        try {
          await apiRequest(`/projects/${project.id}/snapshots/${btn.dataset.restoreSnap}/restore`, { method: 'POST' });
          showToast('Versão restaurada');
          await reloadProject(project.id);
        } catch (err) {
          showToast(err.message, 'error');
        }
      });
    });
  }

  async function copyToClipboard(text) {
    return navigator.clipboard.writeText(String(text || ''));
  }

  function resolveDeliveryStageIdForRequirement(requirement) {
    const status = String(requirement?.status || '').toLowerCase();
    const type = String(requirement?.type || '').toLowerCase();
    if (status === 'delivered') return 'delivery';
    if (status === 'validated') return 'validation';
    if (status === 'in_development') return 'implementation';
    if (status === 'planned') return 'roadmap';
    if (type === 'test_case') return 'validation';
    return 'requirements';
  }

  function getDeliveryNodeKey(nodeType, nodeId) {
    return `${nodeType}:${nodeId}`;
  }

  function collectDeliveryFeedNodes(project) {
    const nodes = [];
    (project.requirements || []).forEach((req) => {
      nodes.push({
        nodeType: 'requirement',
        id: req.id,
        requirement: req,
        status: req.status,
        stageId: resolveDeliveryStageIdForRequirement(req),
      });
    });
    (project.artifacts || []).forEach((art) => {
      nodes.push({
        nodeType: 'artifact',
        id: art.id,
        artifact: art,
        type: art.type,
        status: art.status,
        stageId: art.stageId || 'requirements',
      });
    });
    return nodes;
  }

  async function loadTraceMap(projectId) {
    if (!projectId) {
      window.state.traceMap = null;
      return;
    }
    try {
      const payload = await apiRequest(`/projects/${encodeURIComponent(projectId)}/trace-map`);
      window.state.traceMap = {
        nodes: Array.isArray(payload?.nodes) ? payload.nodes : [],
        links: Array.isArray(payload?.links) ? payload.links : [],
      };
    } catch {
      window.state.traceMap = null;
    }
  }

  function renderTracePanel(project) {
    if (!project) return;

    const levels = window.state?.config?.deliveryLevels || ['simple', 'standard', 'complete'];
    const levelSelect = $('deliveryLevelSelect');
    if (levelSelect) {
      const currentLevel = String(project.deliveryLevel || 'standard').toLowerCase();
      levelSelect.innerHTML = levels.map((l) => `<option value="${escapeHtml(l)}">${escapeHtml(l)}</option>`).join('');
      levelSelect.value = levels.includes(currentLevel) ? currentLevel : 'standard';
    }

    const nodes = collectDeliveryFeedNodes(project);
    const traceMap = window.state.traceMap || { nodes: [], links: [] };
    $('traceMapMeta') && ($('traceMapMeta').textContent = `${traceMap.nodes.length} nodes • ${traceMap.links.length} links`);

    const feedNodes = nodes.filter((n) => n.stageId === window.state.deliverySelectedStageId);
    $('deliveryFeedTitle') && ($('deliveryFeedTitle').textContent = `Stage: ${window.state.deliverySelectedStageId}`);
    $('deliveryFeedMeta') && ($('deliveryFeedMeta').textContent = `${feedNodes.length} item(ns)`);

    $('deliveryFeedRail') && ($('deliveryFeedRail').innerHTML = feedNodes.length
      ? feedNodes.map((node) => {
        const title = node.nodeType === 'artifact' ? (node.artifact?.name || node.id) : (node.requirement?.title || node.id);
        const summary = node.nodeType === 'requirement' ? shortText(node.requirement?.shall || node.requirement?.need, 180) : shortText(node.artifact?.description, 120);
        return `
          <article class="delivery-card" data-delivery-node-type="${escapeHtml(node.nodeType)}" data-delivery-node-id="${escapeHtml(node.id)}">
            <div class="delivery-card-top"><span class="delivery-card-kind">${escapeHtml(node.nodeType)}</span><span>${escapeHtml(node.id)}</span></div>
            <h5>${escapeHtml(title)}</h5>
            <p>${escapeHtml(summary)}</p>
          </article>
        `;
      }).join('')
      : '<div class="delivery-empty-state">Sem itens neste estágio.</div>');

    const artifactTypes = window.state?.config?.artifactTypes || ['other'];
    const traceTypes = window.state?.config?.traceRelationshipTypes || [];
    const stageFlow = window.state?.config?.deliveryStageFlow || [];
    if ($('artifactType')) $('artifactType').innerHTML = artifactTypes.map((t) => `<option value="${escapeHtml(t)}">${escapeHtml(t)}</option>`).join('');
    if ($('artifactStageId')) $('artifactStageId').innerHTML = stageFlow.map((s) => `<option value="${escapeHtml(s.id)}">${escapeHtml(s.label)}</option>`).join('');
    if ($('traceRelationshipType')) $('traceRelationshipType').innerHTML = traceTypes.map((t) => `<option value="${escapeHtml(t)}">${escapeHtml(t)}</option>`).join('');

    $('artifactsList') && ($('artifactsList').innerHTML = (project.artifacts || []).slice(0, 20).map((a) => {
      const provBadge = window.DeliveryOsPlatform?.renderProvenanceBadge?.(a) || '';
      return `<div class="simple-item"><strong>${escapeHtml(a.name)}</strong> ${provBadge}<small>${escapeHtml(a.type)} · ${escapeHtml(a.status)}</small></div>`;
    }).join('') || '<span class="muted-text">Sem artefactos.</span>');

    $('traceLinksList') && ($('traceLinksList').innerHTML = (project.traceLinks || []).slice(0, 20).map((l) =>
      `<div class="simple-item"><small>${escapeHtml(l.sourceType)}:${escapeHtml(l.sourceId)} → ${escapeHtml(l.relationshipType)} → ${escapeHtml(l.targetType)}:${escapeHtml(l.targetId)}</small></div>`
    ).join('') || '<span class="muted-text">Sem trace links.</span>');

    $('impactReportsList') && ($('impactReportsList').innerHTML = (project.impactReports || []).slice(0, 10).map((r) =>
      `<div class="simple-item"><strong>${escapeHtml(r.sourceType)}:${escapeHtml(r.sourceId)}</strong><small>${escapeHtml(r.createdAt)}</small>
        <button type="button" class="btn tiny" data-export-impact="${escapeHtml(r.id)}">Export MD</button></div>`
    ).join('') || '<span class="muted-text">Sem reports.</span>');

    $('impactReportsList')?.querySelectorAll('[data-export-impact]').forEach((btn) => {
      btn.addEventListener('click', async () => {
        try {
          const res = await apiRequest(`/projects/${project.id}/impact-reports/${btn.dataset.exportImpact}/markdown`);
          await copyToClipboard(res.markdown);
          showToast('Impact report copiado (markdown)');
        } catch (err) { showToast(err.message, 'error'); }
      });
    });

    wireDeliveryMapFocus(project, traceMap);
  }

  function nodeLabel(traceMap, nodeType, nodeId) {
    const nodes = traceMap?.nodes || [];
    const node = nodes.find((n) => n.id === nodeId && (n.nodeType === nodeType || !nodeType));
    if (node) return node.title || node.id;
    return nodeId;
  }

  function renderTraceLinkChip(link, direction, traceMap) {
    const isUp = direction === 'upstream';
    const peerType = isUp ? link.targetType : link.sourceType;
    const peerId = isUp ? link.targetId : link.sourceId;
    const rel = link.relationshipType || 'link';
    return `
      <button type="button" class="delivery-map-link-chip" data-trace-focus-type="${escapeHtml(peerType)}" data-trace-focus-id="${escapeHtml(peerId)}">
        <span class="delivery-map-rel">${escapeHtml(rel)}</span>
        <span class="delivery-map-peer">${escapeHtml(peerType)}:${escapeHtml(peerId)}</span>
        <small>${escapeHtml(nodeLabel(traceMap, peerType, peerId))}</small>
      </button>
    `;
  }

  function renderDeliveryMapFocus(project, focusNodeId, traceMap) {
    const focusCard = $('deliveryFocusCard');
    const upEl = $('deliveryMapUpstream');
    const downEl = $('deliveryMapDownstream');
    if (!focusCard || !upEl || !downEl) return;

    if (!focusNodeId) {
      focusCard.classList.add('empty');
      focusCard.innerHTML = '<p class="muted-text">Seleccione um item no feed para ver ligações.</p>';
      upEl.innerHTML = '';
      downEl.innerHTML = '';
      return;
    }

    const nodes = traceMap?.nodes || [];
    const links = traceMap?.links || [];
    const focusNode = nodes.find((n) => n.id === focusNodeId)
      || (project.requirements || []).find((r) => r.id === focusNodeId);
    if (!focusNode) {
      focusCard.classList.add('empty');
      focusCard.innerHTML = '<p class="muted-text">Nó não encontrado.</p>';
      return;
    }

    const title = focusNode.title || focusNode.name || focusNode.id;
    const stk = focusNode.stakeholderRootId || focusNode.stakeholderRequirementLink || '';
    focusCard.classList.remove('empty');
    focusCard.innerHTML = `
      <div class="delivery-focus-top"><span>${escapeHtml(focusNode.nodeType || focusNode.type || 'item')}</span><span>${escapeHtml(focusNode.id)}</span></div>
      <strong>${escapeHtml(title)}</strong>
      ${stk ? `<small class="req-card-stk">↑ ${escapeHtml(stk)}</small>` : ''}
      <div class="delivery-focus-actions">
        <button type="button" class="btn tiny ghost" data-open-req-map-focus="vmap">Mapa V</button>
        <button type="button" class="btn tiny ghost" data-open-req-map-focus="implmap">Mapa impl.</button>
      </div>
    `;

    focusCard.querySelectorAll('[data-open-req-map-focus]').forEach((btn) => {
      btn.addEventListener('click', () => {
        window.RequirementsUI?.openRequirementsMap?.(btn.dataset.openReqMapFocus, {
          focusRequirementId: focusNode.id,
          focusStakeholderId: stk,
        });
      });
    });

    const upstream = links.filter((l) => l.sourceId === focusNodeId);
    const downstream = links.filter((l) => l.targetId === focusNodeId);

    if (window.RequirementsMapUI?.renderTraceLinkLists) {
      window.RequirementsMapUI.renderTraceLinkLists(upEl, downEl, upstream, downstream, traceMap);
    } else {
      upEl.innerHTML = upstream.length
        ? upstream.map((l) => renderTraceLinkChip(l, 'upstream', traceMap)).join('')
        : '<span class="muted-text">Sem upstream.</span>';
      downEl.innerHTML = downstream.length
        ? downstream.map((l) => renderTraceLinkChip(l, 'downstream', traceMap)).join('')
        : '<span class="muted-text">Sem downstream.</span>';
    }

    [upEl, downEl].forEach((panel) => {
      panel?.querySelectorAll('[data-trace-focus-id]').forEach((btn) => {
        btn.addEventListener('click', () => {
          window.state.deliveryMapFocusId = btn.dataset.traceFocusId;
          renderDeliveryMapFocus(project, window.state.deliveryMapFocusId, traceMap);
          $('deliveryFeedRail')?.querySelectorAll('.delivery-card').forEach((c) => {
            c.classList.toggle('is-selected', c.dataset.deliveryNodeId === window.state.deliveryMapFocusId);
          });
        });
      });
    });
  }

  function wireDeliveryMapFocus(project, traceMap) {
    const focusId = window.state?.deliveryMapFocusId || '';
    renderDeliveryMapFocus(project, focusId, traceMap);

    $('deliveryFeedRail')?.querySelectorAll('.delivery-card').forEach((card) => {
      card.classList.toggle('is-selected', card.dataset.deliveryNodeId === focusId);
      card.addEventListener('click', () => {
        window.state.deliveryMapFocusId = card.dataset.deliveryNodeId;
        renderDeliveryMapFocus(project, window.state.deliveryMapFocusId, traceMap);
        $('deliveryFeedRail')?.querySelectorAll('.delivery-card').forEach((c) => {
          c.classList.toggle('is-selected', c.dataset.deliveryNodeId === window.state.deliveryMapFocusId);
        });
      });
    });
  }

  function wireTraceEvents() {
    $('saveDeliveryLevelBtn')?.addEventListener('click', async () => {
      const project = window.state?.selectedProject;
      if (!project) return;
      try {
        await apiRequest(`/projects/${project.id}`, { method: 'PATCH', body: { deliveryLevel: $('deliveryLevelSelect')?.value } });
        showToast('Delivery level guardado');
        await reloadProject(project.id);
      } catch (err) { showToast(err.message, 'error'); }
    });

    $('refreshTraceMapBtn')?.addEventListener('click', () => syncTraceLinks());

    $('addArtifactForm')?.addEventListener('submit', async (e) => {
      e.preventDefault();
      const project = window.state?.selectedProject;
      if (!project) return;
      try {
        await apiRequest(`/projects/${project.id}/artifacts`, {
          method: 'POST',
          body: {
            type: $('artifactType')?.value,
            name: $('artifactName')?.value,
            stageId: $('artifactStageId')?.value,
            status: $('artifactStatus')?.value,
            relatedRequirementIds: ($('artifactRelatedIds')?.value || '').split(/[,\s]+/).filter(Boolean),
            description: $('artifactDescription')?.value,
            bodyMarkdown: $('artifactDescription')?.value,
          },
        });
        showToast('Artefacto guardado');
        await reloadProject(project.id);
      } catch (err) { showToast(err.message, 'error'); }
    });

    $('addTraceLinkForm')?.addEventListener('submit', async (e) => {
      e.preventDefault();
      const project = window.state?.selectedProject;
      if (!project) return;
      try {
        await apiRequest(`/projects/${project.id}/trace-links`, {
          method: 'POST',
          body: {
            sourceType: $('traceSourceType')?.value,
            sourceId: $('traceSourceId')?.value,
            targetType: $('traceTargetType')?.value,
            targetId: $('traceTargetId')?.value,
            relationshipType: $('traceRelationshipType')?.value,
            confidence: Number($('traceConfidence')?.value || 0.8),
            validatedByHuman: $('traceValidatedByHuman')?.checked,
          },
        });
        showToast('Trace link criado');
        await reloadProject(project.id);
      } catch (err) { showToast(err.message, 'error'); }
    });

    $('generateImpactForm')?.addEventListener('submit', async (e) => {
      e.preventDefault();
      const project = window.state?.selectedProject;
      if (!project) return;
      try {
        await apiRequest(`/projects/${project.id}/impact-report`, {
          method: 'POST',
          body: {
            sourceType: $('impactSourceType')?.value,
            sourceId: $('impactSourceId')?.value,
            includeUpstream: $('impactIncludeUpstream')?.checked,
          },
        });
        showToast('Impact report gerado');
        await reloadProject(project.id);
      } catch (err) { showToast(err.message, 'error'); }
    });
  }

  async function renderAll(project) {
    if (!project) return;
    renderPdosShell(project);
    renderTracePanel(project);
    watchActiveAgentRuns(project);
    ensureAdvancedTraceLazyLoad(project);
  }

  function ensureAdvancedTraceLazyLoad(project) {
    const details = document.getElementById('pdosAdvancedTrace');
    if (!details || details.dataset.traceLazyWired) return;
    details.dataset.traceLazyWired = '1';
    details.addEventListener('toggle', async () => {
      if (!details.open || !project?.id) return;
      await loadTraceMap(project.id);
      renderTracePanel(window.state?.selectedProject || project);
    });
  }

  function wirePdosEvents() {
    $('pdosAddInfoForm')?.addEventListener('submit', submitAddInfo);
    $('pdosAddInfoCancel')?.addEventListener('click', closeAddInfoModal);
    $('pdosPromptClose')?.addEventListener('click', closePromptWorkbench);
    $('pdosPromptCopy')?.addEventListener('click', () => {
      copyToClipboard($('pdosPromptRaw')?.value).then(() => showToast('Prompt copiado'));
    });
    $('pdosAgentConfigForm')?.addEventListener('submit', startAgentFromConfig);
    $('pdosAgentConfigManual')?.addEventListener('click', openManualPromptFromConfig);
    $('pdosAgentContinueForm')?.addEventListener('submit', submitAgentContinueForm);
    $('pdosAgentFinishPartial')?.addEventListener('click', finishPartialAgentRuntime);
    document.querySelectorAll('[data-close-manual-tasks]').forEach((el) => {
      el.addEventListener('click', closeManualTasksModal);
    });
    document.querySelectorAll('[data-close-continue-modal]').forEach((el) => {
      el.addEventListener('click', closeAgentContinueModal);
    });
    document.querySelectorAll('[data-close-agent-config]').forEach((el) => {
      el.addEventListener('click', closeAgentConfigModal);
    });
    document.querySelectorAll('[data-close-agent-panel]').forEach((el) => {
      el.addEventListener('click', closeYourlabAgentPanel);
    });
    $('pdosAgentRuntimeCancel')?.addEventListener('click', () => {
      const runId = pdosState.activeRuntimeRun?.runId;
      const projectId = pdosState.activeRuntimeRun?.projectId || window.state?.selectedProject?.id;
      if (runId && projectId) cancelAgentRuntime(runId, projectId);
    });
    $('pdosAgentRuntimeResume')?.addEventListener('click', () => {
      const reason = pdosState.lastRuntimePoll?.yarJob?.error
        || pdosState.lastRuntimePoll?.agentJob?.error
        || 'Limite de orçamento ou tempo atingido.';
      openAgentContinueModal(reason);
    });
    $('pdosAgentRuntimeDismiss')?.addEventListener('click', () => {
      const runId = pdosState.activeRuntimeRun?.runId;
      const projectId = pdosState.activeRuntimeRun?.projectId || window.state?.selectedProject?.id;
      if (runId && projectId) dismissAgentRuntime(runId, projectId);
    });
    $('pdosAgentRuntimeRerun')?.addEventListener('click', () => {
      const project = window.state?.selectedProject;
      const agentType = pdosState.activeRuntimeRun?.agentType || pdosState.pendingPromptRun?.agentType;
      if (project && agentType) rerunAgentRuntime(agentType, project);
    });
    $('pdosAgentRuntimeReconnect')?.addEventListener('click', () => {
      const project = window.state?.selectedProject;
      if (project) reconnectAgentRuntime(project);
    });
    $('pdosPromptApply')?.addEventListener('click', applyPromptOutput);
    $('pdosJobSubmit')?.addEventListener('click', submitJobStep);
    $('pdosJobAuto')?.addEventListener('click', submitJobAuto);
    $('pdosAltSubmit')?.addEventListener('click', pasteAlternative);
    $('pdosDrawerOverlay')?.addEventListener('click', closeDrawer);
    document.querySelectorAll('[data-close-transition]').forEach((el) => {
      el.addEventListener('click', closeTransitionModal);
    });
    document.addEventListener('keydown', (e) => {
      if (e.key === 'Escape') {
        closeDrawer();
        closeAddInfoModal();
        closeAgentConfigModal();
        closeManualTasksModal();
        closeAgentContinueModal();
        closeYourlabAgentPanel();
        closePromptWorkbench();
        closeTransitionModal();
      }
    });
  }

  window.PdosUI = {
    renderPdosShell,
    renderTracePanel,
    renderAll,
    renderAgentOverviewCockpit,
    loadTraceMap,
    wirePdosEvents,
    wireTraceEvents,
    closeDrawer,
    openPromptWorkbench,
    runArchitecturePackGeneration,
    runDiagramToRequirements,
    runYourlabAgent,
    openYourlabAgentPanel,
    openAgentConfigModal,
    openExecutionWorkbench,
    openExecutionPlan,
    pdosState,
  };
  window.refreshTraceMap = () => loadTraceMap(window.state?.selectedProject?.id);
})();
