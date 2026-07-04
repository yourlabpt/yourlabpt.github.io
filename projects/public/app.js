const API = '/api/projects';
const TOKEN_KEY = 'requirements_platform_token';
const NAV_RAIL_DOCKED_KEY = 'platform_navRail_docked';
const NAV_RAIL_EXPANDED_KEY = 'platform_navRail_expanded';
const NAV_RAIL_MORE_OPEN_KEY = 'platform_navRail_more_open';

const PROJECTLESS_TABS = new Set(['projetos', 'definicoes']);

const NAV_ICON_PATHS = {
  folder: 'M8 4h8l1 2h3v14H4V6h3z',
  timeline: 'M3 12h6l2-7 3 14 2-7h5',
  list: 'M8 7h8M8 12h8M8 17h5',
  file: 'M7 3h7l5 5v13H7zM14 3v5h5',
  notes: 'M7 4h10v16H7zM9 8h6M9 12h4',
  help: 'M9.5 9a2.5 2.5 0 1 1 4.2 1.8c-.9.8-1.7 1.2-1.7 2.7M12 17h.01',
  chart: 'M4 19V5M4 19h16M8 17V9M12 17V6M16 17v-4',
  plan: 'M4 18h16M7 18V9M12 18V6M17 18v-4',
  bolt: 'M13 3L4 14h6l-1 7 9-11h-6z',
  clock: 'M12 6v6l4 2M12 22a10 10 0 1 1 0-20 10 10 0 0 1 0 20z',
  settings: 'M12 15.5a3.5 3.5 0 1 0 0-7 3.5 3.5 0 0 0 0 7zM19.4 15a1.7 1.7 0 0 0 .1-1l2-1.5-2-3.5-2.4 1a8 8 0 0 0-1.7-1l.8-4h-7l.8 4a8 8 0 0 0-1.7 1l-2.4-1-2 3.5 2 1.5a1.7 1.7 0 0 0 .1 1l-2 1.5 2 3.5 2.4-1a8 8 0 0 0 1.7 1l.8 4h7l.8-4a8 8 0 0 0 1.7-1l2.4 1 2-3.5z',
  more: 'M6 12h.01M12 12h.01M18 12h.01',
};

const NAV_GROUPS = [
  {
    id: 'main',
    items: [{ id: 'projetos', label: 'Projetos', icon: 'folder' }],
  },
  {
    id: 'work',
    label: 'Trabalho',
    requiresProject: true,
    items: [
      { id: 'deliveryos', label: 'Entrega', icon: 'timeline' },
      { id: 'requisitos', label: 'Requisitos', icon: 'list' },
    ],
  },
  {
    id: 'more',
    label: 'Mais',
    requiresProject: true,
    collapsible: true,
    items: [
      { id: 'projeto', label: 'Visão', icon: 'chart' },
      { id: 'documentos', label: 'Documentos', icon: 'file' },
      { id: 'perguntas', label: 'Perguntas', icon: 'help' },
      { id: 'fases', label: 'Fases', icon: 'plan' },
      { id: 'gerar', label: 'Gerar', icon: 'bolt' },
      { id: 'atas', label: 'Atas', icon: 'notes' },
      { id: 'atividade', label: 'Log', icon: 'clock' },
    ],
  },
  {
    id: 'system',
    items: [{ id: 'definicoes', label: 'Definições', icon: 'settings' }],
  },
];

/** Flat lookup for tab metadata */
const NAV_PAGES = NAV_GROUPS.flatMap((g) => g.items);

const state = {
  token: localStorage.getItem(TOKEN_KEY) || '',
  user: null,
  config: null,
  users: [],
  projects: [],
  selectedProjectId: null,
  selectedProject: null,
  traceMap: null,
  deliverySelectedStageId: 'requirements',
  selectedRequirementId: null,
  generationModulesSelected: [],
  selectedMinuteIds: [],
  questionFilters: {
    status: '',
    targetRole: '',
    byCurrentStage: true,
  },
  activeTab: 'projetos',
  tabFilters: {
    deliveryStageId: '',
    contentView: '',
    keepModule: false,
  },
  filters: {
    search: '',
    type: '',
    status: '',
    module: '',
    phase: '',
    priority: '',
    onlySmartIssues: false,
  },
  requirementsHierarchy: null,
  listLimits: {
    requirements: 50,
    questions: 50,
    implPlanReqsPerPhase: 30,
  },
};

const els = {
  loginCard: document.getElementById('loginCard'),
  workspace: document.getElementById('workspace'),
  loginForm: document.getElementById('loginForm'),
  loginEmail: document.getElementById('loginEmail'),
  loginPassword: document.getElementById('loginPassword'),
  loginStatus: document.getElementById('loginStatus'),
  loginLogo: document.getElementById('loginLogo'),
  workspaceLogo: document.getElementById('workspaceLogo'),
  currentProjectTitle: document.getElementById('currentProjectTitle'),
  currentProjectSwitchBtn: document.getElementById('currentProjectSwitchBtn'),
  userMenuBtn: document.getElementById('userMenuBtn'),
  userMenuPopover: document.getElementById('userMenuPopover'),
  userMenuInfo: document.getElementById('userMenuInfo'),
  logoutBtn: document.getElementById('logoutBtn'),
  themeToggleBtn: document.getElementById('themeToggleBtn'),
  appLayout: document.getElementById('appLayout'),
  navRail: document.getElementById('navRail'),
  navRailItems: document.getElementById('navRailItems'),
  navRailExpandBtn: document.getElementById('navRailExpandBtn'),
  refreshProjectsBtn: document.getElementById('refreshProjectsBtn'),
  projectsPageGrid: document.getElementById('projectsPageGrid'),
  projectList: document.getElementById('projectList'),
  noProject: document.getElementById('noProject'),
  projectWorkspace: document.getElementById('projectWorkspace'),
  createProjectForm: document.getElementById('createProjectForm'),
  openSettingsBtn: document.getElementById('openSettingsBtn'),
  settingsUsersCard: document.getElementById('settingsUsersCard'),
  settingsProjectSection: document.getElementById('settingsProjectSection'),
  settingsProjectHint: document.getElementById('settingsProjectHint'),
  settingsProjectBody: document.getElementById('settingsProjectBody'),
  phaseContextBar: document.getElementById('phaseContextBar'),
  usersList: document.getElementById('usersList'),
  createUserForm: document.getElementById('createUserForm'),
  newUserRole: document.getElementById('newUserRole'),
  newUserCanViewBudget: document.getElementById('newUserCanViewBudget'),
  assignMemberForm: document.getElementById('assignMemberForm'),
  assignUserId: document.getElementById('assignUserId'),
  projectMembers: document.getElementById('projectMembers'),
  saveProjectBtn: document.getElementById('saveProjectBtn'),
  saveAdvancedBtn: document.getElementById('saveAdvancedBtn'),
  projectName: document.getElementById('projectName'),
  projectClient: document.getElementById('projectClient'),
  projectStatus: document.getElementById('projectStatus'),
  projectCode: document.getElementById('projectCode'),
  projectCurrency: document.getElementById('projectCurrency'),
  projectLanguage: document.getElementById('projectLanguage'),
  projectDescription: document.getElementById('projectDescription'),
  summaryBusinessContext: document.getElementById('summaryBusinessContext'),
  summaryGoals: document.getElementById('summaryGoals'),
  summaryScope: document.getElementById('summaryScope'),
  summarySolution: document.getElementById('summarySolution'),
  projectKpis: document.getElementById('projectKpis'),
  projectReadability: document.getElementById('projectReadability'),
  uploadDocForm: document.getElementById('uploadDocForm'),
  docFile: document.getElementById('docFile'),
  documentsList: document.getElementById('documentsList'),
  addMeetingMinuteForm: document.getElementById('addMeetingMinuteForm'),
  meetingMinuteDate: document.getElementById('meetingMinuteDate'),
  meetingMinuteTitle: document.getElementById('meetingMinuteTitle'),
  meetingMinuteRaw: document.getElementById('meetingMinuteRaw'),
  meetingMinuteImpactScope: document.getElementById('meetingMinuteImpactScope'),
  minutesPromptObjective: document.getElementById('minutesPromptObjective'),
  minutesPromptExtraInstructions: document.getElementById('minutesPromptExtraInstructions'),
  buildMinutesPromptBtn: document.getElementById('buildMinutesPromptBtn'),
  minutesPromptOutput: document.getElementById('minutesPromptOutput'),
  requirementsChangeJson: document.getElementById('requirementsChangeJson'),
  importRequirementChangesBtn: document.getElementById('importRequirementChangesBtn'),
  minutesHistoryList: document.getElementById('minutesHistoryList'),
  minutesPromptHistoryList: document.getElementById('minutesPromptHistoryList'),
  minutePropagationPanel: document.getElementById('minutePropagationPanel'),
  analyzeMinutePropagationBtn: document.getElementById('analyzeMinutePropagationBtn'),
  generateMinutePropagationPromptBtn: document.getElementById('generateMinutePropagationPromptBtn'),
  addQuestionForm: document.getElementById('addQuestionForm'),
  questionText: document.getElementById('questionText'),
  questionContext: document.getElementById('questionContext'),
  questionTargetRole: document.getElementById('questionTargetRole'),
  questionCategory: document.getElementById('questionCategory'),
  questionPriority: document.getElementById('questionPriority'),
  questionStatus: document.getElementById('questionStatus'),
  questionDeliveryStage: document.getElementById('questionDeliveryStage'),
  questionDueDate: document.getElementById('questionDueDate'),
  questionLinkedRequirementIds: document.getElementById('questionLinkedRequirementIds'),
  questionFilterStatus: document.getElementById('questionFilterStatus'),
  questionFilterTargetRole: document.getElementById('questionFilterTargetRole'),
  questionsMeta: document.getElementById('questionsMeta'),
  questionsTable: document.getElementById('questionsTable'),
  sourceText: document.getElementById('sourceText'),
  saveSourceTextBtn: document.getElementById('saveSourceTextBtn'),
  buildPromptBtn: document.getElementById('buildPromptBtn'),
  aiPrompt: document.getElementById('aiPrompt'),
  aiJson: document.getElementById('aiJson'),
  importAiBtn: document.getElementById('importAiBtn'),
  addRequirementForm: document.getElementById('addRequirementForm'),
  reqType: document.getElementById('reqType'),
  reqTitle: document.getElementById('reqTitle'),
  reqStatus: document.getElementById('reqStatus'),
  reqPriority: document.getElementById('reqPriority'),
  reqPhase: document.getElementById('reqPhase'),
  reqDescription: document.getElementById('reqDescription'),
  reqSearch: document.getElementById('reqSearch'),
  reqFilterType: document.getElementById('reqFilterType'),
  reqFilterStatus: document.getElementById('reqFilterStatus'),
  reqFilterModule: document.getElementById('reqFilterModule'),
  reqOnlySmartIssues: document.getElementById('reqOnlySmartIssues'),
  clearAllRequirementsBtn: document.getElementById('clearAllRequirementsBtn'),
  requirementsMeta: document.getElementById('requirementsMeta'),
  submoduleSuggestions: document.getElementById('submoduleSuggestions'),
  reqModule: document.getElementById('reqModule'),
  reqSubmodule: document.getElementById('reqSubmodule'),
  reqRelatedIds: document.getElementById('reqRelatedIds'),
  requirementsTable: document.getElementById('requirementsTable'),
  implementationPlanView: document.getElementById('implementationPlanView'),
  requirementDetailPanel: document.getElementById('requirementDetailPanel'),
  requirementDetailEmpty: document.getElementById('requirementDetailEmpty'),
  requirementQuickView: document.getElementById('requirementQuickView'),
  requirementDetailForm: document.getElementById('requirementDetailForm'),
  saveRequirementDetailsBtn: document.getElementById('saveRequirementDetailsBtn'),
  deleteRequirementDetailsBtn: document.getElementById('deleteRequirementDetailsBtn'),
  detailReqId: document.getElementById('detailReqId'),
  detailReqType: document.getElementById('detailReqType'),
  detailReqStatus: document.getElementById('detailReqStatus'),
  detailReqPriority: document.getElementById('detailReqPriority'),
  detailReqPhase: document.getElementById('detailReqPhase'),
  detailReqModule: document.getElementById('detailReqModule'),
  detailReqSubmodule: document.getElementById('detailReqSubmodule'),
  detailReqVersion: document.getElementById('detailReqVersion'),
  detailReqTitle: document.getElementById('detailReqTitle'),
  detailReqNeed: document.getElementById('detailReqNeed'),
  detailReqShall: document.getElementById('detailReqShall'),
  detailReqCondition: document.getElementById('detailReqCondition'),
  detailReqMeasure: document.getElementById('detailReqMeasure'),
  detailReqRationale: document.getElementById('detailReqRationale'),
  detailReqVerification: document.getElementById('detailReqVerification'),
  detailReqAssumption: document.getElementById('detailReqAssumption'),
  detailReqStakeholderLink: document.getElementById('detailReqStakeholderLink'),
  detailReqLinkedFunctionalRequirement: document.getElementById('detailReqLinkedFunctionalRequirement'),
  detailReqBusinessValue: document.getElementById('detailReqBusinessValue'),
  detailReqTarget: document.getElementById('detailReqTarget'),
  detailReqRelatedIds: document.getElementById('detailReqRelatedIds'),
  detailReqNotes: document.getElementById('detailReqNotes'),
  integrationsJson: document.getElementById('integrationsJson'),
  risksText: document.getElementById('risksText'),
  assumptionsText: document.getElementById('assumptionsText'),
  riskAssumptionView: document.getElementById('riskAssumptionView'),
  commercialValidityDays: document.getElementById('commercialValidityDays'),
  commercialWarrantyDays: document.getElementById('commercialWarrantyDays'),
  commercialExclusions: document.getElementById('commercialExclusions'),
  commercialNotes: document.getElementById('commercialNotes'),
  technicalApproachJson: document.getElementById('technicalApproachJson'),
  generateTechnicalBtn: document.getElementById('generateTechnicalBtn'),
  generateCommercialBtn: document.getElementById('generateCommercialBtn'),
  dryRunToggle: document.getElementById('dryRunToggle'),
  generationModules: document.getElementById('generationModules'),
  generatedLinks: document.getElementById('generatedLinks'),
  refreshActivityBtn: document.getElementById('refreshActivityBtn'),
  activityList: document.getElementById('activityList'),
  globalStatus: document.getElementById('globalStatus'),
};

function statusOptions() {
  const source = state.config?.statusFlow || [];
  return source.map((status) => `<option value="${escapeHtml(status)}">${escapeHtml(status)}</option>`).join('');
}

function questionStatusOptions() {
  const source = state.config?.questionStatusFlow || ['open', 'sent', 'answered', 'resolved', 'blocked'];
  return source.map((status) => `<option value="${escapeHtml(status)}">${escapeHtml(status)}</option>`).join('');
}

function questionTargetOptions() {
  const source = state.config?.questionTargetFlow || ['client', 'partner', 'both'];
  return source.map((target) => `<option value="${escapeHtml(target)}">${escapeHtml(target)}</option>`).join('');
}

function questionCategoryOptions() {
  const source = state.config?.questionCategoryFlow || ['scope', 'functional', 'non_functional', 'integration', 'data', 'business_rule', 'ux', 'security', 'timeline', 'pricing', 'other'];
  return source.map((category) => `<option value="${escapeHtml(category)}">${escapeHtml(category)}</option>`).join('');
}

async function apiRequest(path, { method = 'GET', body, isForm = false } = {}) {
  const headers = {};
  if (state.token) {
    headers.Authorization = `Bearer ${state.token}`;
  }
  if (!isForm) {
    headers['Content-Type'] = 'application/json';
  }

  const response = await fetch(`${API}${path}`, {
    method,
    headers,
    body: body
      ? isForm
        ? body
        : JSON.stringify(body)
      : undefined,
  });

  const text = await response.text();
  let payload = null;
  try {
    payload = text ? JSON.parse(text) : null;
  } catch {
    payload = { message: text || 'Resposta inválida do servidor.' };
  }

  if (!response.ok) {
    const message = payload?.message || `Erro HTTP ${response.status}`;
    const error = new Error(message);
    error.status = response.status;
    error.payload = payload;
    throw error;
  }

  return payload;
}

function projectCacheStorageKey(projectId) {
  return `yl_project_cache_${projectId}`;
}

function readProjectCache(projectId) {
  try {
    return JSON.parse(sessionStorage.getItem(projectCacheStorageKey(projectId)) || 'null');
  } catch {
    return null;
  }
}

function writeProjectCache(projectId, etag, project) {
  try {
    sessionStorage.setItem(projectCacheStorageKey(projectId), JSON.stringify({ etag, project }));
  } catch {
    // quota exceeded — ignore
  }
}

function clearProjectCache(projectId) {
  if (!projectId) return;
  try {
    sessionStorage.removeItem(projectCacheStorageKey(projectId));
  } catch {
    // ignore
  }
}

async function fetchProjectById(projectId) {
  const cached = readProjectCache(projectId);
  const headers = {};
  if (state.token) headers.Authorization = `Bearer ${state.token}`;
  if (cached?.etag) headers['If-None-Match'] = cached.etag;

  const response = await fetch(`${API}/projects/${encodeURIComponent(projectId)}`, { headers });
  if (response.status === 304 && cached?.project) {
    return { project: cached.project, fromCache: true };
  }

  const text = await response.text();
  let payload = null;
  try {
    payload = text ? JSON.parse(text) : null;
  } catch {
    payload = { message: text || 'Resposta inválida do servidor.' };
  }

  if (!response.ok) {
    const message = payload?.message || `Erro HTTP ${response.status}`;
    const error = new Error(message);
    error.status = response.status;
    error.payload = payload;
    throw error;
  }

  const etag = response.headers.get('ETag');
  if (etag && payload?.project) {
    writeProjectCache(projectId, etag, payload.project);
  }
  return payload;
}

function applyProjectPatch(project, options = {}) {
  if (!project) return;
  state.selectedProject = project;
  state.selectedProjectId = project.id;
  state.requirementsHierarchy = null;
  clearProjectCache(project.id);
  if (options.renderList !== false) renderProjects();
  const tab = options.tab || state.activeTab;
  if (options.refreshChrome) {
    renderProjectDetails(options.skipTab ? { skipTab: true } : {});
  } else if (options.renderTab !== false) {
    renderActiveTab(project, tab);
  }
  if ((tab === 'deliveryos' || state.activeTab === 'deliveryos') && options.renderDelivery !== false) {
    window.PdosUI?.renderAll?.(project);
  }
}

async function refreshSelectedProject(options = {}) {
  const id = options.projectId || state.selectedProjectId || state.selectedProject?.id;
  if (!id) return null;
  const payload = await fetchProjectById(id);
  applyProjectPatch(payload.project, options);
  return payload.project;
}

window.applyProjectPatch = applyProjectPatch;
window.refreshSelectedProject = refreshSelectedProject;
window.fetchProjectById = fetchProjectById;
window.clearProjectCache = clearProjectCache;

function showToast(message, type = 'ok') {
  const el = els.globalStatus;
  el.textContent = message;
  el.className = `toast ${type}`;
  el.classList.remove('hidden');
  setTimeout(() => el.classList.add('hidden'), 3800);
}

function setLoginStatus(message, type = 'error') {
  els.loginStatus.className = `status ${type}`;
  els.loginStatus.textContent = message;
}

function clearLoginStatus() {
  els.loginStatus.className = 'status';
  els.loginStatus.textContent = '';
}

function isSuperAdmin() {
  return state.user?.role === 'super_admin';
}

function isClientUser() {
  if (isSuperAdmin()) return false;
  if (state.user?.role === 'client') return true;
  if (!state.selectedProject) return state.user?.role === 'client';
  const member = (state.selectedProject.members || []).find((m) => m.userId === state.user?.id);
  return member?.role === 'client';
}

function isPartnerEditor() {
  if (isSuperAdmin()) return true;
  if (!state.selectedProject || state.user?.role !== 'partner') return false;
  const member = (state.selectedProject.members || []).find((m) => m.userId === state.user?.id);
  return member?.role === 'partner';
}

function canEdit() {
  return isPartnerEditor();
}

// Clientes: apenas visualização. Parceiros no projecto: edição completa.
function canContribute() {
  return canEdit();
}

function canViewBudget() {
  return state.user?.canViewBudget === true;
}

function escapeHtml(text) {
  return String(text || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function linesToArray(text) {
  return String(text || '')
    .split('\n')
    .map((line) => line.trim())
    .filter(Boolean);
}

function arrayToLines(values) {
  return (Array.isArray(values) ? values : []).join('\n');
}

function valueToLines(value) {
  if (Array.isArray(value)) return value.join('\n');
  return String(value || '');
}

function autoResizeTextarea(node) {
  if (!node || node.tagName !== 'TEXTAREA') return;
  node.style.height = 'auto';
  node.style.height = `${Math.max(node.scrollHeight, 64)}px`;
}

function refreshAutoResize(root = document) {
  Array.from(root.querySelectorAll('textarea')).forEach((node) => autoResizeTextarea(node));
}

function shortText(value, max = 240) {
  const text = String(value || '').trim();
  if (!text) return 'N/A';
  return text.length > max ? `${text.slice(0, max)}...` : text;
}

function renderSimpleListHtml(items) {
  const safe = Array.isArray(items) ? items.filter((entry) => String(entry || '').trim()) : [];
  if (!safe.length) return '<p class="muted">N/A</p>';
  return `<ul>${safe.map((entry) => `<li>${escapeHtml(entry)}</li>`).join('')}</ul>`;
}

function splitRequirementIds(value) {
  if (Array.isArray(value)) {
    return value
      .map((entry) => String(entry || '').trim())
      .filter(Boolean)
      .map((entry) => entry.toUpperCase());
  }
  return String(value || '')
    .split(/[,\n;]/)
    .map((entry) => entry.trim())
    .filter(Boolean)
    .map((entry) => entry.toUpperCase());
}

function joinRequirementIds(value) {
  return splitRequirementIds(value).join(', ');
}

function getArchitectureModules() {
  const modules = Array.isArray(state.config?.architectureModules) ? state.config.architectureModules : [];
  return modules.length ? modules : ['Frontend', 'Backend', 'Database'];
}

function normalizeForCompare(value) {
  return String(value || '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, ' ')
    .replace(/[^a-z0-9]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function findDuplicatePhaseName(phases) {
  const seen = new Map();
  for (const phase of phases || []) {
    const name = String(phase?.name || '').trim();
    if (!name) continue;
    const token = normalizeForCompare(name);
    if (seen.has(token)) return { name, other: seen.get(token) };
    seen.set(token, name);
  }
  return null;
}

function formatPhaseLabel(index, name) {
  const num = Number(index) + 1;
  const label = String(name || '').trim();
  return label ? `#${num} · ${label}` : `#${num}`;
}

let ipDragReqId = null;
let phaseSyncInFlight = false;
let phaseSyncPromise = null;

async function ensurePhasesSynced(project) {
  if (!project || !canEdit()) return project;
  if (!window.PhaseSync?.needsRequirementsPhaseSync?.(project)) return project;
  if (phaseSyncPromise) return phaseSyncPromise;

  phaseSyncPromise = (async () => {
    phaseSyncInFlight = true;
    try {
      const res = await apiRequest(
        `/projects/${encodeURIComponent(project.id)}/phases/sync-requirements`,
        { method: 'POST' }
      );
      state.selectedProject = res.project;
      if (res.updated) {
        showToast(`${res.updated} requisito(s) alinhados às fases #1, #2… do plano.`, 'ok');
      }
      return res.project;
    } catch (error) {
      showToast(error.message || 'Erro ao sincronizar fases.', 'error');
      return project;
    } finally {
      phaseSyncInFlight = false;
      phaseSyncPromise = null;
    }
  })();

  return phaseSyncPromise;
}

async function moveRequirementToPhase(reqId, targetPhaseName) {
  const project = state.selectedProject;
  if (!project || !reqId || !canEdit()) return;
  const phase = String(targetPhaseName || '').trim() || 'Backlog';
  const req = (project.requirements || []).find((r) => r.id === reqId);
  if (!req) return;
  const current = String(req.phase || 'Backlog').trim() || 'Backlog';
  if (current === phase) return;
  try {
    const res = await apiRequest(
      `/projects/${encodeURIComponent(project.id)}/requirements/${encodeURIComponent(reqId)}`,
      { method: 'PATCH', body: { phase } }
    );
    state.selectedProject = res.project;
    renderImplementationPlan(state.selectedProject);
    renderRequirements(state.selectedProject);
    showToast(`Requisito movido para ${phase}.`, 'ok');
  } catch (error) {
    showToast(error.message || 'Erro ao mover requisito.', 'error');
  }
}

function wirePhaseRequirementDragDrop(root, project) {
  if (!root || !canEdit()) return;

  root.querySelectorAll('.ip-req-chip[draggable="true"]').forEach((chip) => {
    chip.addEventListener('dragstart', (e) => {
      ipDragReqId = chip.dataset.reqId || '';
      chip.classList.add('ip-req-chip--dragging');
      e.dataTransfer.effectAllowed = 'move';
      e.dataTransfer.setData('text/plain', ipDragReqId);
    });
    chip.addEventListener('dragend', () => {
      chip.classList.remove('ip-req-chip--dragging');
      ipDragReqId = null;
      root.querySelectorAll('.ip-req-chips.ip-drop-target').forEach((z) => z.classList.remove('ip-drop-target'));
    });
  });

  root.querySelectorAll('.ip-req-chips[data-ip-phase]').forEach((zone) => {
    zone.addEventListener('dragover', (e) => {
      e.preventDefault();
      zone.classList.add('ip-drop-target');
    });
    zone.addEventListener('dragleave', () => zone.classList.remove('ip-drop-target'));
    zone.addEventListener('drop', (e) => {
      e.preventDefault();
      zone.classList.remove('ip-drop-target');
      const reqId = e.dataTransfer.getData('text/plain') || ipDragReqId;
      if (!reqId) return;
      moveRequirementToPhase(reqId, zone.dataset.ipPhase || 'Backlog');
    });
  });

  root.querySelectorAll('[data-open-req-chip]').forEach((chip) => {
    chip.addEventListener('click', (e) => {
      if (chip.classList.contains('ip-req-chip--dragging')) return;
      e.preventDefault();
      const reqId = chip.dataset.openReqChip;
      if (reqId && window.RequirementsUI?.openRequirementModal) {
        window.RequirementsUI.openRequirementModal(reqId, project);
      }
    });
  });

  root.querySelectorAll('[data-assign-req-phase]').forEach((sel) => {
    sel.addEventListener('change', () => {
      const reqId = sel.dataset.assignReqPhase;
      const phase = sel.value;
      if (reqId && phase) moveRequirementToPhase(reqId, phase);
      sel.value = '';
    });
  });
}

function normalizeModuleToken(value) {
  const text = normalizeForCompare(value);
  if (!text) return null;
  const hasWord = (word) => new RegExp(`(^|\\s)${word}(\\s|$)`).test(text);

  if (text.includes('frontend') || text.includes('front end') || hasWord('ui') || hasWord('ux') || text.includes('client')) {
    return 'Frontend';
  }
  if (text.includes('database') || text.includes('base de dados') || text.includes('banco de dados') || text === 'db' || text.includes('schema') || text.includes('sql') || text.includes('postgres')) {
    return 'Database';
  }
  if (text.includes('backend') || text.includes('back end') || text.includes('api') || text.includes('server') || text.includes('servico')) {
    return 'Backend';
  }
  return null;
}

function normalizeModuleName(value) {
  const direct = normalizeModuleToken(value);
  if (direct) return direct;
  if (getArchitectureModules().includes(String(value || '').trim())) {
    return String(value || '').trim();
  }
  return 'Backend';
}

function normalizeSubmoduleName(value) {
  return String(value || '').replace(/\s+/g, ' ').trim();
}

function formatModuleLabel(requirement) {
  const tags = Array.isArray(requirement?.moduleTags) ? requirement.moduleTags.filter(Boolean) : [];
  if (tags.length) return tags.join(', ');
  const moduleName = normalizeModuleName(requirement?.module);
  const submodule = normalizeSubmoduleName(requirement?.submodule);
  return submodule ? `${moduleName} / ${submodule}` : moduleName;
}

function collectModules() {
  return getArchitectureModules().slice();
}

function collectSubmodules(project = state.selectedProject, moduleName = '') {
  const requirements = Array.isArray(project?.requirements) ? project.requirements : [];
  const selectedModule = moduleName ? normalizeModuleName(moduleName) : '';
  const values = requirements
    .filter((req) => !selectedModule || normalizeModuleName(req.module) === selectedModule)
    .map((req) => normalizeSubmoduleName(req.submodule))
    .filter(Boolean);
  return Array.from(new Set(values)).sort((a, b) => a.localeCompare(b, 'pt-PT'));
}

function getSelectedRequirement(project = state.selectedProject) {
  if (!project || !state.selectedRequirementId) return null;
  return (project.requirements || []).find((entry) => entry.id === state.selectedRequirementId) || null;
}

function getFilteredRequirements(items) {
  const search = String(state.filters.search || '').trim().toLowerCase();
  const type = String(state.filters.type || '');
  const status = String(state.filters.status || '');
  const module = String(state.filters.module || '');
  const onlySmartIssues = Boolean(state.filters.onlySmartIssues);

  return items.filter((req) => {
    if (type && req.type !== type) return false;
    if (status && req.status !== status) return false;
    if (module) {
      const tags = Array.isArray(req.moduleTags) && req.moduleTags.length
        ? req.moduleTags
        : [normalizeModuleName(req.module)].filter(Boolean);
      if (!tags.includes(module)) return false;
    }
    if (onlySmartIssues && !(req.type === 'functional' && !req.smartIsValid)) return false;

    if (!search) return true;
    const searchable = [
      req.id,
      req.title,
      req.module,
      req.submodule,
      req.need,
      req.shall,
      req.condition,
      req.measure,
      req.rationale,
      req.verification,
      req.phase,
      joinRequirementIds(req.relatedRequirementIds),
    ].map((entry) => String(entry || '').toLowerCase()).join(' ');
    return searchable.includes(search);
  });
}

function setReadonlyByRole() {
  const readonly = !canEdit();

  const editableIds = [
    'saveProjectBtn', 'saveAdvancedBtn', 'assignMemberForm', 'createProjectForm', 'createUserForm',
    'addMeetingMinuteForm', 'saveSourceTextBtn', 'buildPromptBtn', 'buildMinutesPromptBtn', 'importRequirementChangesBtn', 'importAiBtn', 'addRequirementForm',
    'generateTechnicalBtn', 'generateCommercialBtn'
  ];

  editableIds.forEach((id) => {
    const el = els[id];
    if (!el) return;
    if (el.tagName === 'FORM') {
      Array.from(el.querySelectorAll('input, textarea, select, button')).forEach((node) => {
        node.disabled = readonly;
      });
      return;
    }
    el.disabled = readonly;
  });

  // Formulários de contribuição: perguntas e documentos. Disponíveis para
  // clientes/parceiros (apenas adicionar), restantes ações continuam bloqueadas.
  const contributeDisabled = !canContribute();
  ['uploadDocForm', 'addQuestionForm', 'addMeetingMinuteForm'].forEach((id) => {
    const el = document.getElementById(id);
    if (!el) return;
    Array.from(el.querySelectorAll('input, textarea, select, button')).forEach((node) => {
      node.disabled = contributeDisabled;
    });
  });

  Array.from(els.requirementDetailForm.querySelectorAll('input, textarea, select')).forEach((node) => {
    if (node.id === 'detailReqId' || node.id === 'detailReqType') {
      return;
    }
    node.disabled = readonly;
  });
  els.saveRequirementDetailsBtn.disabled = readonly;
  els.deleteRequirementDetailsBtn.disabled = readonly;

  if (els.settingsUsersCard) els.settingsUsersCard.classList.toggle('hidden', !isSuperAdmin());
  applyClientTabVisibility();
  applyReadOnlyChrome();
}

function applyClientTabVisibility() {
  const clientTabs = new Set(['projetos', 'deliveryos', 'requisitos', 'fases', 'atas', 'documentos']);
  const partnerExtraTabs = new Set(['atividade', 'perguntas']);
  document.querySelectorAll('#sectionTabs .tab-btn').forEach((btn) => {
    const tab = btn.dataset.tab;
    if (isClientUser()) {
      btn.classList.toggle('hidden', !clientTabs.has(tab));
    } else if (isPartnerEditor() && !isSuperAdmin()) {
      btn.classList.toggle('hidden', tab === 'definicoes' || tab === 'gerar');
    } else {
      btn.classList.remove('hidden');
    }
  });
  if (isClientUser() && state.activeTab && !clientTabs.has(state.activeTab)) {
    switchToTab('deliveryos');
  }
  const settingsBtn = document.getElementById('openSettingsBtn');
  if (settingsBtn) settingsBtn.classList.toggle('hidden', isClientUser());
  const createProjectSection = document.querySelector('#createProjectForm')?.closest('.panel');
  if (createProjectSection) createProjectSection.classList.toggle('hidden', isClientUser());
}

function applyReadOnlyChrome() {
  const readOnly = isClientUser();
  document.body.classList.toggle('is-client-readonly', readOnly);
  document.querySelectorAll('[data-writes-only]').forEach((el) => {
    el.classList.toggle('hidden', readOnly);
  });
}

window.isClientUser = isClientUser;
window.isPartnerEditor = isPartnerEditor;
window.canEditProject = canEdit;

function setMonetaryVisibilityByRole() {
  const hideMonetary = !canViewBudget();

  Array.from(document.querySelectorAll('[data-sensitive-money]')).forEach((node) => {
    node.classList.toggle('hidden', hideMonetary);
  });
}

function syncBudgetAccessControl() {
  if (!els.newUserRole || !els.newUserCanViewBudget) return;
  const isPartner = els.newUserRole.value === 'partner';
  els.newUserCanViewBudget.disabled = !isPartner;
  if (!isPartner) {
    els.newUserCanViewBudget.checked = false;
  }
}

function renderUsersPanel() {
  if (!isSuperAdmin()) return;

  const visibleUsers = state.users.filter((user) => user.role !== 'super_admin');
  els.usersList.innerHTML = visibleUsers.length
    ? visibleUsers.map((user) => `
      <div class="simple-item">
        <strong>${escapeHtml(user.name)}</strong>
        <small>${escapeHtml(user.email)} • ${escapeHtml(user.role)}${user.canViewBudget ? ' • budget' : ''}</small>
      </div>
    `).join('')
    : '<div class="simple-item"><small>Sem utilizadores client/partner.</small></div>';

  els.assignUserId.innerHTML = visibleUsers
    .map((user) => `<option value="${escapeHtml(user.id)}">${escapeHtml(user.name)} (${escapeHtml(user.role)})</option>`)
    .join('');
}

function renderProjects() {
  renderProjectsPage();
  const selected = state.selectedProjectId;
  if (!state.projects.length) {
    if (els.projectList) {
      els.projectList.innerHTML = '<div class="simple-item"><small>Sem projetos ainda.</small></div>';
    }
    renderTopbarProject();
    return;
  }

  if (els.projectList) {
    els.projectList.innerHTML = state.projects.map((project) => {
      const active = selected === project.id ? 'active' : '';
      return `
        <article class="project-item ${active}" data-project-id="${escapeHtml(project.id)}">
          <h4>${escapeHtml(project.name)}</h4>
          <p>${escapeHtml(project.clientName)} • ${escapeHtml(project.status || 'active')}</p>
        </article>
      `;
    }).join('');
  }
  renderTopbarProject();
}

function renderProjectsPage() {
  const grid = els.projectsPageGrid;
  if (!grid) return;
  const selected = state.selectedProjectId;

  if (!state.projects.length) {
    grid.innerHTML = `
      <div class="projects-empty read-card">
        <h4>Ainda não há projectos</h4>
        <p class="muted-text">Use o formulário abaixo para criar o primeiro projecto.</p>
      </div>
    `;
    return;
  }

  grid.innerHTML = state.projects.map((project) => {
    const active = selected === project.id ? 'is-active' : '';
    const reqCount = Array.isArray(project.requirements) ? project.requirements.length : (project.requirementCount || 0);
    return `
      <article class="project-card ${active}" data-project-id="${escapeHtml(project.id)}">
        <div class="project-card-head">
          <h4>${escapeHtml(project.name)}</h4>
          <span class="project-card-status">${escapeHtml(project.status || 'active')}</span>
        </div>
        <p class="project-card-client">${escapeHtml(project.clientName || '—')}</p>
        <div class="project-card-meta">
          <span>${reqCount} requisitos</span>
          <span>${escapeHtml(project.proposalCode || project.id)}</span>
        </div>
        <button type="button" class="btn tiny primary project-card-open" data-project-id="${escapeHtml(project.id)}">Abrir projecto</button>
      </article>
    `;
  }).join('');
}

function renderTopbarProject() {
  const titleEl = els.currentProjectTitle;
  const switchBtn = els.currentProjectSwitchBtn;
  if (!titleEl) return;

  const project = state.selectedProject;
  if (!project) {
    titleEl.textContent = '';
    titleEl.classList.add('hidden');
    titleEl.classList.remove('has-project');
    switchBtn?.classList.add('hidden');
    return;
  }

  titleEl.textContent = project.name;
  titleEl.classList.remove('hidden');
  titleEl.classList.add('has-project');
  switchBtn?.classList.remove('hidden');
}

function renderUserMenuInfo() {
  if (!els.userMenuInfo || !state.user) return;
  els.userMenuInfo.innerHTML = `
    <strong>${escapeHtml(state.user.name)}</strong>
    <span class="muted-text">${escapeHtml(state.user.role)}</span>
  `;
}

function setUserMenuOpen(open) {
  els.userMenuPopover?.classList.toggle('hidden', !open);
  els.userMenuBtn?.setAttribute('aria-expanded', open ? 'true' : 'false');
}

function navIconSvg(iconKey) {
  const path = NAV_ICON_PATHS[iconKey] || NAV_ICON_PATHS.folder;
  return `<svg class="nav-rail-icon" viewBox="0 0 24 24" aria-hidden="true"><path d="${path}" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/></svg>`;
}

function isNavGroupVisible(group) {
  if (group.requiresProject && !state.selectedProject) return false;
  return true;
}

function isNavPageRequiresProject(pageId) {
  const page = NAV_PAGES.find((p) => p.id === pageId);
  if (!page) return false;
  const group = NAV_GROUPS.find((g) => g.items.some((item) => item.id === pageId));
  return Boolean(group?.requiresProject);
}

function renderNavItem(item, { compact = false } = {}) {
  const active = state.activeTab === item.id;
  return `
    <button type="button"
      class="nav-rail-item ${active ? 'active' : ''}"
      data-nav-tab="${escapeHtml(item.id)}"
      title="${escapeHtml(item.label)}"
      aria-label="${escapeHtml(item.label)}"
      aria-current="${active ? 'page' : 'false'}">
      ${navIconSvg(item.icon)}
      <span class="nav-rail-label">${escapeHtml(item.label)}</span>
    </button>
  `;
}

const COLLAPSED_QUICK_NAV = ['projetos', 'deliveryos', 'requisitos', 'definicoes'];

function findNavItem(pageId) {
  for (const group of NAV_GROUPS) {
    const item = group.items.find((entry) => entry.id === pageId);
    if (item) return item;
  }
  return null;
}

function renderNavRail() {
  const container = els.navRailItems;
  if (!container) return;

  const expanded = localStorage.getItem(NAV_RAIL_EXPANDED_KEY) === 'true';
  const moreOpen = localStorage.getItem(NAV_RAIL_MORE_OPEN_KEY) === 'true';
  const active = state.activeTab;
  const activeInMore = NAV_GROUPS.find((g) => g.id === 'more')?.items.some((i) => i.id === active);

  let html = '';

  if (!expanded) {
    for (const pageId of COLLAPSED_QUICK_NAV) {
      const item = findNavItem(pageId);
      if (!item) continue;
      if (isNavPageRequiresProject(pageId) && !state.selectedProject) continue;
      html += renderNavItem(item);
    }
    if (state.selectedProject) {
      const moreActive = activeInMore || ['projeto', 'documentos', 'atas', 'perguntas', 'fases', 'gerar', 'atividade'].includes(active);
      html += `
        <button type="button" class="nav-rail-item nav-rail-more ${moreActive ? 'active' : ''}" data-nav-more-toggle title="Mais páginas" aria-label="Mais páginas">
          ${navIconSvg('more')}
          <span class="nav-rail-label">Mais</span>
        </button>
      `;
    }
    container.innerHTML = html;
    return;
  }

  for (const group of NAV_GROUPS) {
    if (!isNavGroupVisible(group)) continue;

    if (group.label && group.id === 'work') {
      html += `<div class="nav-rail-group-label">${escapeHtml(group.label)}</div>`;
    }

    if (group.collapsible && expanded) {
      const open = moreOpen || activeInMore;
      html += `<details class="nav-rail-group" ${open ? 'open' : ''} data-nav-group="more">
        <summary class="nav-rail-group-summary">${escapeHtml(group.label)}</summary>
        <div class="nav-rail-group-items">
          ${group.items.map((item) => renderNavItem(item)).join('')}
        </div>
      </details>`;
      continue;
    }

    html += group.items.map((item) => renderNavItem(item)).join('');
  }

  container.innerHTML = html;
}

function applyNavRailLayout() {
  const layout = els.appLayout;
  if (!layout) return;

  const expanded = localStorage.getItem(NAV_RAIL_EXPANDED_KEY) === 'true';

  layout.classList.add('is-docked');
  layout.classList.remove('is-overlay', 'nav-rail-open');
  layout.classList.toggle('is-expanded', expanded);
  layout.classList.toggle('is-collapsed', !expanded);

  if (els.navRailExpandBtn) {
    els.navRailExpandBtn.setAttribute('aria-expanded', expanded ? 'true' : 'false');
    els.navRailExpandBtn.title = expanded ? 'Recolher menu' : 'Expandir menu';
    const path = els.navRailExpandBtn.querySelector('path');
    if (path) path.setAttribute('d', expanded ? 'M15 6l-6 6 6 6' : 'M9 6l6 6-6 6');
  }
}

function initNavRail() {
  if (localStorage.getItem(NAV_RAIL_EXPANDED_KEY) === null) {
    localStorage.setItem(NAV_RAIL_EXPANDED_KEY, 'false');
  }
  localStorage.setItem(NAV_RAIL_DOCKED_KEY, 'true');

  applyNavRailLayout();
  renderNavRail();

  els.navRailExpandBtn?.addEventListener('click', () => {
    const expanded = localStorage.getItem(NAV_RAIL_EXPANDED_KEY) === 'true';
    localStorage.setItem(NAV_RAIL_EXPANDED_KEY, expanded ? 'false' : 'true');
    applyNavRailLayout();
    renderNavRail();
  });

  els.navRailItems?.addEventListener('click', (event) => {
    const moreBtn = event.target.closest('[data-nav-more-toggle]');
    if (moreBtn) {
      localStorage.setItem(NAV_RAIL_EXPANDED_KEY, 'true');
      localStorage.setItem(NAV_RAIL_MORE_OPEN_KEY, 'true');
      applyNavRailLayout();
      renderNavRail();
      return;
    }

    const btn = event.target.closest('[data-nav-tab]');
    if (!btn) return;
    switchToTab(btn.dataset.navTab);
  });

  els.navRailItems?.addEventListener('toggle', (event) => {
    const details = event.target.closest('details[data-nav-group="more"]');
    if (!details) return;
    localStorage.setItem(NAV_RAIL_MORE_OPEN_KEY, details.open ? 'true' : 'false');
  });

  window.addEventListener('resize', () => applyNavRailLayout());
}

function renderActiveTab(project, tabId) {
  if (!project) return;
  const tab = tabId || state.activeTab;
  window.ProposalDownloads?.mountBar?.();

  switch (tab) {
    case 'projeto':
      renderProjectClarity(project);
      renderMembers(project);
      renderRiskAssumptionView(project);
      break;
    case 'documentos':
      renderDocuments(project);
      break;
    case 'atas':
      renderMeetingMinutes(project);
      break;
    case 'perguntas':
      renderClarificationQuestions(project);
      break;
    case 'requisitos':
      renderRequirementModuleControls(project);
      renderRequirements(project);
      break;
    case 'fases':
      renderImplementationPlan(project);
      break;
    case 'gerar':
      renderGenerated(project);
      break;
    case 'deliveryos':
      window.PdosUI?.renderAll?.(project);
      break;
    case 'atividade':
      loadActivity().catch(() => {});
      break;
    case 'definicoes':
      renderUsersPanel();
      setReadonlyByRole();
      break;
    default:
      break;
  }
}

function renderProjectDetails(options = {}) {
  renderSettingsAvailability();
  renderNavRail();
  renderTopbarProject();
  const project = state.selectedProject;

  els.projectWorkspace.classList.remove('hidden');

  if (!project) {
    const allowed = PROJECTLESS_TABS.has(state.activeTab);
    if (!allowed) {
      state.activeTab = 'projetos';
    }
    els.noProject.classList.toggle('hidden', state.activeTab !== 'projetos');
    document.querySelectorAll('.tab-panel').forEach((p) => {
      const show = p.dataset.panel === state.activeTab || (state.activeTab === 'projetos' && p.dataset.panel === 'projetos');
      p.classList.toggle('hidden', !show);
    });
    renderPhaseContextBar();
    window.ProposalDownloads?.mountBar?.();
    renderProjectsPage();
    return;
  }

  els.noProject.classList.add('hidden');

  els.projectName.value = project.name || '';
  els.projectClient.value = project.clientName || '';
  els.projectStatus.value = project.status || 'active';
  els.projectCode.value = project.proposalCode || '';
  els.projectCurrency.value = project.currency || 'EUR';
  els.projectLanguage.value = project.language || 'pt-PT';
  els.projectDescription.value = project.description || '';

  els.summaryBusinessContext.value = project.summary?.businessContext || '';
  els.summaryGoals.value = arrayToLines(project.summary?.goals || []);
  els.summaryScope.value = project.summary?.scopeInPlainLanguage || '';
  els.summarySolution.value = project.summary?.solutionOverview || '';

  const sourceTextEl = document.getElementById('sourceText');
  if (sourceTextEl) sourceTextEl.value = project.sourceText || '';
  const aiPromptEl = document.getElementById('aiPrompt');
  if (aiPromptEl) aiPromptEl.value = project.aiPrompt || '';
  const reqChangeEl = document.getElementById('requirementsChangeJson');
  if (reqChangeEl && !reqChangeEl.value) reqChangeEl.value = '';

  if (els.commercialValidityDays) els.commercialValidityDays.value = project.commercialTerms?.validityDays ?? 30;
  if (els.commercialWarrantyDays) els.commercialWarrantyDays.value = project.commercialTerms?.warrantyDays ?? 30;
  if (els.commercialExclusions) els.commercialExclusions.value = arrayToLines(project.commercialTerms?.exclusions || []);
  if (els.commercialNotes) els.commercialNotes.value = arrayToLines(project.commercialTerms?.notes || []);
  els.integrationsJson.value = JSON.stringify(project.integrations || [], null, 2);
  els.risksText.value = arrayToLines(project.risks || []);
  els.assumptionsText.value = arrayToLines(project.assumptions || []);
  els.technicalApproachJson.value = JSON.stringify(project.technicalApproach || {}, null, 2);

  document.querySelectorAll('.tab-panel').forEach((p) => {
    p.classList.toggle('hidden', p.dataset.panel !== state.activeTab);
  });
  renderPhaseContextBar();
  if (!options.skipTab) {
    renderActiveTab(project, state.activeTab);
  }
  requestAnimationFrame(() => refreshAutoResize(els.projectWorkspace));
}

// Distribuição canónica por módulo e fase — usa as mesmas fontes únicas
// (moduleTags e req.phase ∪ project.phases) que o resto da aplicação.
function getCanonicalModuleDistribution(project) {
  const reqs = Array.isArray(project?.requirements) ? project.requirements : [];
  const counts = new Map();
  reqs.forEach((req) => {
    const tags = Array.isArray(req.moduleTags) && req.moduleTags.length
      ? req.moduleTags
      : [normalizeModuleName(req.module)].filter(Boolean);
    (tags.length ? tags : ['Sem módulo']).forEach((tag) => {
      counts.set(tag, (counts.get(tag) || 0) + 1);
    });
  });
  return Array.from(counts.entries()).sort((a, b) => b[1] - a[1]);
}

function getCanonicalPhaseDistribution(project) {
  const reqs = Array.isArray(project?.requirements) ? project.requirements : [];
  const phases = Array.isArray(project?.phases) ? project.phases : [];
  const order = [];
  const counts = new Map();
  phases.forEach((p, i) => {
    const name = String(p?.name || `Fase ${i + 1}`).trim();
    if (!counts.has(name)) { counts.set(name, 0); order.push(name); }
  });
  reqs.forEach((req) => {
    const name = String(req.phase || '').trim() || 'Sem fase';
    if (!counts.has(name)) { counts.set(name, 0); order.push(name); }
    counts.set(name, counts.get(name) + 1);
  });
  return order.map((name) => [name, counts.get(name) || 0]);
}

function renderProjectClarity(project) {
  const reqs = Array.isArray(project.requirements) ? project.requirements : [];
  const questions = Array.isArray(project.clarificationQuestions) ? project.clarificationQuestions : [];
  const openQuestions = questions.filter((entry) => ['open', 'sent', 'answered', 'blocked'].includes(String(entry.status || ''))).length;
  const byType = (type) => reqs.filter((entry) => entry.type === type).length;
  const functional = reqs.filter((entry) => entry.type === 'functional');
  const functionalValid = functional.filter((entry) => entry.smartIsValid).length;
  const smartRate = functional.length ? Math.round((functionalValid / functional.length) * 100) : 100;

  const moduleDist = getCanonicalModuleDistribution(project);
  const phaseDist = getCanonicalPhaseDistribution(project);

  els.projectKpis.innerHTML = `
    <div class="kpi-box"><strong>${reqs.length}</strong><small>Requisitos totais</small></div>
    <div class="kpi-box"><strong>${byType('functional')}</strong><small>Funcionais</small></div>
    <div class="kpi-box"><strong>${byType('non_functional')}</strong><small>Não funcionais</small></div>
    <div class="kpi-box"><strong>${phaseDist.length}</strong><small>Fases</small></div>
    <div class="kpi-box"><strong>${moduleDist.length}</strong><small>Módulos</small></div>
    <div class="kpi-box"><strong>${smartRate}%</strong><small>Cobertura SMART funcional</small></div>
    <div class="kpi-box" id="hierarchyCoverageKpi"><strong>—</strong><small>Cobertura V (STK)</small></div>
    <div class="kpi-box" id="hierarchyOrphansKpi"><strong>—</strong><small>Órfãos V-cycle</small></div>
    <div class="kpi-box"><strong>${openQuestions}</strong><small>Perguntas em aberto</small></div>
  `;

  const goals = (project.summary?.goals || []).slice(0, 4);
  const risks = (project.risks || []).slice(0, 3);

  const distItem = (label, count) => `<li><span class="dist-label">${escapeHtml(label)}</span><span class="dist-count">${count}</span></li>`;

  els.projectReadability.innerHTML = `
    <article class="read-card">
      <h4>Contexto de Negócio</h4>
      <p>${escapeHtml(shortText(project.summary?.businessContext, 360))}</p>
    </article>
    <article class="read-card">
      <h4>Escopo em Linguagem Simples</h4>
      <p>${escapeHtml(shortText(project.summary?.scopeInPlainLanguage || project.summary?.solutionOverview, 360))}</p>
    </article>
    <article class="read-card">
      <h4>Visão da Solução</h4>
      <p>${escapeHtml(shortText(project.summary?.solutionOverview, 360)) || 'N/A'}</p>
    </article>
    <article class="read-card">
      <h4>Objetivos Prioritários</h4>
      ${goals.length ? `<ul>${goals.map((goal) => `<li>${escapeHtml(goal)}</li>`).join('')}</ul>` : '<p>N/A</p>'}
    </article>
    <article class="read-card">
      <h4>Distribuição por Módulo</h4>
      <small class="muted-text">Fonte única: moduleTags da classificação</small>
      ${moduleDist.length ? `<ul class="dist-list">${moduleDist.map(([m, c]) => distItem(m, c)).join('')}</ul>` : '<p>N/A</p>'}
    </article>
    <article class="read-card">
      <h4>Distribuição por Fase</h4>
      <small class="muted-text">Fonte única: fases dos requisitos + plano</small>
      ${phaseDist.length ? `<ul class="dist-list">${phaseDist.map(([p, c]) => distItem(p, c)).join('')}</ul>` : '<p>N/A</p>'}
    </article>
    <article class="read-card">
      <h4>Riscos que Merecem Atenção</h4>
      ${risks.length ? `<ul>${risks.map((risk) => `<li>${escapeHtml(risk)}</li>`).join('')}</ul>` : '<p>N/A</p>'}
    </article>
  `;

  refreshHierarchyKpis(project);
}

async function fetchRequirementsHierarchy(project, options = {}) {
  if (!project?.id) return null;
  const cacheKey = options.summary ? 'summary' : 'full';
  const cache = state.requirementsHierarchy;
  if (!options.force
    && cache?.projectId === project.id
    && cache?.updatedAt === project.updatedAt
    && cache?.mode === cacheKey
    && cache?.data) {
    return cache.data;
  }
  const qs = options.summary ? '?summary=1' : '';
  const hierarchy = await apiRequest(`/projects/${encodeURIComponent(project.id)}/requirements/hierarchy${qs}`);
  state.requirementsHierarchy = {
    projectId: project.id,
    updatedAt: project.updatedAt,
    mode: cacheKey,
    data: hierarchy,
  };
  return hierarchy;
}

window.fetchRequirementsHierarchy = fetchRequirementsHierarchy;

async function refreshHierarchyKpis(project) {
  const covEl = document.getElementById('hierarchyCoverageKpi');
  const orphEl = document.getElementById('hierarchyOrphansKpi');
  if (!project?.id || !covEl) return;
  try {
    const hierarchy = await fetchRequirementsHierarchy(project, { summary: true });
    const stats = hierarchy?.stats || {};
    covEl.innerHTML = `<strong>${stats.coveragePct ?? 0}%</strong><small>Cobertura V (STK)</small>`;
    if (orphEl) {
      const orphans = stats.orphans ?? hierarchy?.orphanCount ?? 0;
      orphEl.innerHTML = `<strong>${orphans}</strong><small>Órfãos V-cycle</small>`;
    }
  } catch {
    covEl.innerHTML = '<strong>—</strong><small>Cobertura V (STK)</small>';
    if (orphEl) orphEl.innerHTML = '<strong>—</strong><small>Órfãos V-cycle</small>';
  }
}

function renderMembers(project) {
  const members = Array.isArray(project.members) ? project.members : [];
  if (!members.length) {
    els.projectMembers.innerHTML = '<div class="simple-item"><small>Sem membros associados.</small></div>';
    return;
  }

  const usersById = new Map(state.users.map((user) => [user.id, user]));
  const editable = canEdit();
  els.projectMembers.innerHTML = members.map((member) => {
    const user = usersById.get(member.userId);
    const name = user ? user.name : member.userId;
    const email = user ? user.email : '';
    const role = member.role || 'client';
    const initials = String(name || '?').trim().slice(0, 2).toUpperCase();

    const roleControl = editable
      ? `<select class="member-role-select" data-member-role data-user-id="${escapeHtml(member.userId)}">
          <option value="client" ${role === 'client' ? 'selected' : ''}>Client</option>
          <option value="partner" ${role === 'partner' ? 'selected' : ''}>Partner</option>
        </select>`
      : `<span class="member-role-badge member-role-${escapeHtml(role)}">${escapeHtml(role)}</span>`;
    const removeBtn = editable
      ? `<button class="btn tiny ghost danger" data-action="remove-member" data-user-id="${escapeHtml(member.userId)}" title="Remover membro">Remover</button>`
      : '';

    return `
      <div class="member-row">
        <div class="member-avatar" aria-hidden="true">${escapeHtml(initials)}</div>
        <div class="member-info">
          <strong class="member-name">${escapeHtml(name)}</strong>
          ${email ? `<small class="member-email">${escapeHtml(email)}</small>` : ''}
        </div>
        <div class="member-actions">
          ${roleControl}
          ${removeBtn}
        </div>
      </div>
    `;
  }).join('');

  if (editable) {
    els.projectMembers.querySelectorAll('[data-member-role]').forEach((sel) => {
      sel.addEventListener('change', (e) => handleMemberRoleChange(e.target.dataset.userId, e.target.value));
    });
  }
}

async function handleMemberRoleChange(userId, role) {
  if (!state.selectedProject || !userId || !canEdit()) return;
  try {
    await apiRequest(`/projects/${encodeURIComponent(state.selectedProject.id)}/members`, {
      method: 'POST',
      body: { userId, role },
    });
    showToast('Perfil do membro atualizado.', 'ok');
    await refreshSelectedProject();
  } catch (error) {
    showToast(error.message, 'error');
  }
}

function renderDocuments(project) {
  if (window.DocumentsUI?.renderDocumentsPage) {
    window.DocumentsUI.renderDocumentsPage(project);
    return;
  }
  let docs = Array.isArray(project.documents) ? project.documents : [];
  const stageFilter = String(state.tabFilters?.deliveryStageId || '').trim();
  if (stageFilter && state.activeTab === 'documentos') {
    const resolve = window.PhaseContent?.resolveDocumentStageId || ((d) => d.deliveryStageId || 'discovery');
    docs = docs.filter((d) => resolve(d) === stageFilter);
  }
  if (!docs.length) {
    els.documentsList.innerHTML = `<div class="simple-item"><small>${stageFilter ? 'Sem documentos nesta fase.' : 'Sem documentos carregados.'}</small></div>`;
    return;
  }

  els.documentsList.innerHTML = docs.map((doc) => {
    const name = doc.title || doc.originalName;
    const stage = doc.deliveryStageId ? stageLabel(doc.deliveryStageId) : '';
    const typeLabel = doc.docType || 'anexo';
    return `
    <div class="simple-item doc-list-item">
      <button type="button" class="nav-link-btn" data-open-doc="${escapeHtml(doc.id)}">
        <strong>${escapeHtml(name)}</strong>
      </button>
      <small>${new Date(doc.uploadedAt || doc.createdAt).toLocaleString('pt-PT')} · ${typeLabel}${stage ? ` · ${escapeHtml(stage)}` : ''} ${doc.hasExtractedText || doc.contentMarkdown ? '· texto' : ''}</small>
      <a href="/api/projects/projects/${encodeURIComponent(project.id)}/documents/${encodeURIComponent(doc.id)}/download" target="_blank" rel="noopener">Download</a>
    </div>
  `;
  }).join('');

  els.documentsList.querySelectorAll('[data-open-doc]').forEach((btn) => {
    btn.addEventListener('click', () => {
      const doc = docs.find((d) => d.id === btn.dataset.openDoc);
      if (doc) window.RequirementsUI?.openDocumentViewer?.(doc, project);
    });
  });
}

function renderMeetingMinutes(project) {
  if (window.MinutesUI?.renderMinutesPage) {
    window.MinutesUI.renderMinutesPage(project);
    return;
  }
}

function questionStageOptions(selected) {
  const stages = state.config?.stageOrder || ['requirements'];
  return stages.map((stageId) =>
    `<option value="${escapeHtml(stageId)}" ${stageId === (selected || 'requirements') ? 'selected' : ''}>${escapeHtml(stageLabel(stageId))}</option>`
  ).join('');
}

function getFilteredClarificationQuestions(project) {
  const questions = Array.isArray(project?.clarificationQuestions) ? project.clarificationQuestions : [];
  const statusFilter = String(state.questionFilters.status || '').trim();
  const targetFilter = String(state.questionFilters.targetRole || '').trim();
  const stageFilter = state.questionFilters.byCurrentStage && state.activeTab === 'perguntas'
    ? String(state.tabFilters?.deliveryStageId || state.deliverySelectedStageId || '').trim()
    : '';

  return questions.filter((entry) => {
    if (statusFilter && entry.status !== statusFilter) return false;
    if (targetFilter && entry.targetRole !== targetFilter) return false;
    if (stageFilter && entry.deliveryStageId !== stageFilter) return false;
    return true;
  });
}

function renderClarificationQuestions(project) {
  const allQuestions = Array.isArray(project?.clarificationQuestions) ? project.clarificationQuestions : [];
  const filtered = getFilteredClarificationQuestions(project);
  const tbody = els.questionsTable.querySelector('tbody');
  if (els.questionDeliveryStage && state.deliverySelectedStageId) {
    els.questionDeliveryStage.value = state.deliverySelectedStageId;
  }
  if (els.questionFilterStatus) {
    const value = state.questionFilters.status || '';
    if (Array.from(els.questionFilterStatus.options).some((opt) => opt.value === value)) {
      els.questionFilterStatus.value = value;
    }
  }
  if (els.questionFilterTargetRole) {
    const value = state.questionFilters.targetRole || '';
    if (Array.from(els.questionFilterTargetRole.options).some((opt) => opt.value === value)) {
      els.questionFilterTargetRole.value = value;
    }
  }
  const unresolved = allQuestions.filter((entry) => ['open', 'sent', 'answered', 'blocked'].includes(String(entry.status || ''))).length;
  const answered = allQuestions.filter((entry) => String(entry.status || '') === 'resolved').length;
  const byTarget = {
    client: allQuestions.filter((entry) => entry.targetRole === 'client').length,
    partner: allQuestions.filter((entry) => entry.targetRole === 'partner').length,
    both: allQuestions.filter((entry) => entry.targetRole === 'both').length,
  };
  els.questionsMeta.textContent = `${filtered.length} pergunta(s) no filtro (de ${allQuestions.length}) • Fase activa: ${stageLabel(state.deliverySelectedStageId || 'requirements')} • Em aberto: ${unresolved} • Resolvidas: ${answered} • Client: ${byTarget.client} • Partner: ${byTarget.partner} • Both: ${byTarget.both}`;

  if (!filtered.length) {
    tbody.innerHTML = `<tr><td colspan="10">${allQuestions.length ? 'Nenhuma pergunta corresponde ao filtro.' : 'Sem perguntas registadas.'}</td></tr>`;
    return;
  }

  const questionLimit = state.listLimits?.questions || 50;
  const displayQuestions = filtered.length > questionLimit ? filtered.slice(0, questionLimit) : filtered;
  const hasMoreQuestions = filtered.length > displayQuestions.length;

  const canWrite = canEdit();
  const disabled = canWrite ? '' : 'disabled';
  const statusOptionsHtml = questionStatusOptions();
  const targetOptionsHtml = questionTargetOptions();
  const categoryOptionsHtml = questionCategoryOptions();

  tbody.innerHTML = displayQuestions.map((entry) => {
    const linked = joinRequirementIds(entry.linkedRequirementIds);
    const dueDate = String(entry.dueDate || '').slice(0, 10);
    const contextText = entry.context ? `<div class="muted">Contexto: ${escapeHtml(shortText(entry.context, 150))}</div>` : '';
    const answerText = entry.answer ? escapeHtml(entry.answer) : '';

    if (!canWrite) {
      return `
        <tr data-question-id="${escapeHtml(entry.id)}" class="question-row readonly-row">
          <td data-label="ID">${escapeHtml(entry.id)}</td>
          <td data-label="Pergunta">
            <strong class="question-main-text">${escapeHtml(entry.question || '')}</strong>
            ${contextText}
            <div class="muted">Due: ${escapeHtml(dueDate || 'N/A')}</div>
          </td>
          <td data-label="Fase">${escapeHtml(stageLabel(entry.deliveryStageId || 'requirements'))}</td>
          <td data-label="Destino">${escapeHtml(entry.targetRole || 'client')}</td>
          <td data-label="Status">${escapeHtml(entry.status || 'open')}</td>
          <td data-label="Prioridade">${escapeHtml(entry.priority || 'medium')}</td>
          <td data-label="Categoria">${escapeHtml(entry.category || 'other')}</td>
          <td data-label="Requisitos">${escapeHtml(linked || '-')}</td>
          <td data-label="Resposta">${answerText || '-'}</td>
          <td data-label="Ações">-</td>
        </tr>
      `;
    }

    return `
      <tr data-question-id="${escapeHtml(entry.id)}" class="question-row editable-row">
        <td data-label="ID">${escapeHtml(entry.id)}</td>
        <td data-label="Pergunta">
          <span class="field-title">Pergunta</span>
          <textarea class="question-main-input" data-field="question" rows="4" ${disabled}>${escapeHtml(entry.question || '')}</textarea>
          <span class="field-title">Contexto</span>
          <textarea data-field="context" rows="3" placeholder="Contexto" ${disabled}>${escapeHtml(entry.context || '')}</textarea>
          <span class="field-title">Data limite</span>
          <input data-field="dueDate" type="date" value="${escapeHtml(dueDate)}" ${disabled} />
        </td>
        <td data-label="Fase">
          <select data-field="deliveryStageId" ${disabled}>${questionStageOptions(entry.deliveryStageId)}</select>
        </td>
        <td data-label="Destino">
          <select data-field="targetRole" ${disabled}>${targetOptionsHtml}</select>
        </td>
        <td data-label="Status">
          <select data-field="status" ${disabled}>${statusOptionsHtml}</select>
        </td>
        <td data-label="Prioridade">
          <select data-field="priority" ${disabled}>
            <option value="high" ${entry.priority === 'high' ? 'selected' : ''}>high</option>
            <option value="medium" ${entry.priority === 'medium' ? 'selected' : ''}>medium</option>
            <option value="low" ${entry.priority === 'low' ? 'selected' : ''}>low</option>
          </select>
        </td>
        <td data-label="Categoria">
          <select data-field="category" ${disabled}>${categoryOptionsHtml}</select>
        </td>
        <td data-label="Requisitos">
          <span class="field-title">IDs ligados</span>
          <input data-field="linkedRequirementIds" value="${escapeHtml(linked)}" ${disabled} />
        </td>
        <td data-label="Resposta">
          <span class="field-title">Resposta</span>
          <textarea class="question-answer-input" data-field="answer" rows="4" placeholder="Resposta do cliente/partner" ${disabled}>${answerText}</textarea>
        </td>
        <td data-label="Ações" class="question-actions-cell">
          <button class="btn primary" data-action="save-question">Guardar</button>
          <button class="btn" data-action="delete-question">Apagar</button>
        </td>
      </tr>
    `;
  }).join('');

  refreshAutoResize(els.questionsTable);

  if (canWrite) {
    filtered.forEach((entry) => {
      const row = tbody.querySelector(`tr[data-question-id="${entry.id}"]`);
      if (!row) return;
      const targetNode = row.querySelector('select[data-field="targetRole"]');
      const statusNode = row.querySelector('select[data-field="status"]');
      const categoryNode = row.querySelector('select[data-field="category"]');
      if (targetNode) targetNode.value = entry.targetRole || 'client';
      if (statusNode) statusNode.value = entry.status || 'open';
      if (categoryNode) categoryNode.value = entry.category || 'other';
    });
  }

  if (hasMoreQuestions && els.questionsTable) {
    const foot = els.questionsTable.querySelector('tfoot') || document.createElement('tfoot');
    foot.innerHTML = `
      <tr><td colspan="10" class="list-chunk-actions">
        <button type="button" class="btn tiny ghost" data-questions-load-more>
          Mostrar mais (${filtered.length - displayQuestions.length})
        </button>
      </td></tr>`;
    if (!els.questionsTable.querySelector('tfoot')) els.questionsTable.appendChild(foot);
    foot.querySelector('[data-questions-load-more]')?.addEventListener('click', () => {
      state.listLimits.questions += 50;
      renderClarificationQuestions(project);
    });
  } else {
    els.questionsTable?.querySelector('tfoot')?.remove();
  }
}

function renderRequirementModuleControls(project) {
  const modules = collectModules(project);
  const requirements = Array.isArray(project?.requirements) ? project.requirements : [];
  const previousFilter = state.filters.module;
  const filterValue = modules.includes(previousFilter) ? previousFilter : '';
  state.filters.module = filterValue;

  els.reqFilterModule.innerHTML = `<option value="">Todos os módulos</option>${modules
    .map((moduleName) => `<option value="${escapeHtml(moduleName)}">${escapeHtml(moduleName)}</option>`)
    .join('')}`;
  els.reqFilterModule.value = filterValue;

  els.reqModule.innerHTML = modules
    .map((moduleName) => `<option value="${escapeHtml(moduleName)}">${escapeHtml(moduleName)}</option>`)
    .join('');
  const reqModuleValue = modules.includes(els.reqModule.value) ? els.reqModule.value : 'Backend';
  els.reqModule.value = reqModuleValue;
  els.detailReqModule.innerHTML = modules
    .map((moduleName) => `<option value="${escapeHtml(moduleName)}">${escapeHtml(moduleName)}</option>`)
    .join('');
  const detailModuleValue = modules.includes(els.detailReqModule.value) ? els.detailReqModule.value : 'Backend';
  els.detailReqModule.value = detailModuleValue;

  const selectedModuleForSubmoduleList = normalizeModuleName(els.reqModule.value || modules[0]);
  const submodules = collectSubmodules(project, selectedModuleForSubmoduleList);
  els.submoduleSuggestions.innerHTML = submodules
    .map((submoduleName) => `<option value="${escapeHtml(submoduleName)}"></option>`)
    .join('');

  const checked = new Set(state.generationModulesSelected || []);
  const hasMatchingSelection = modules.some((moduleName) => checked.has(moduleName));
  const shouldCheckAll = checked.size === 0 || !hasMatchingSelection;
  els.generationModules.innerHTML = modules
    .map((moduleName) => {
      const total = requirements.filter((entry) => normalizeModuleName(entry.module) === moduleName).length;
      const isChecked = shouldCheckAll || checked.has(moduleName);
      return `
        <label class="module-chip">
          <input type="checkbox" data-module-generate="${escapeHtml(moduleName)}" ${isChecked ? 'checked' : ''} />
          ${escapeHtml(moduleName)} (${total})
        </label>
      `;
    })
    .join('');
}

// Edição manual das fases de implementação (project.phases).
let implPhasesEditing = false;
let implPhasesDraft = null;

function startEditImplementationPhases() {
  const project = state.selectedProject;
  if (!project) return;
  implPhasesDraft = (Array.isArray(project.phases) ? project.phases : []).map((p, i) => ({
    id: String(p?.id || '').trim() || `F${i + 1}`,
    name: String(p?.name || '').trim(),
    durationWeeks: Number(p?.durationWeeks || 0) || 0,
    objective: String(p?.objective || p?.description || '').trim(),
  }));
  implPhasesEditing = true;
  renderImplementationPlan(project);
}

function cancelEditImplementationPhases() {
  implPhasesEditing = false;
  implPhasesDraft = null;
  renderImplementationPlan(state.selectedProject);
}

function syncImplPhasesDraftFromDom() {
  if (!implPhasesDraft) return;
  const rows = els.implementationPlanView.querySelectorAll('.ip-pe-row');
  implPhasesDraft = Array.from(rows).map((row) => {
    const idx = Number(row.dataset.phaseIndex);
    const prev = implPhasesDraft[idx] || {};
    return {
      id: prev.id || `F${idx + 1}`,
      name: String(row.querySelector('.ip-pe-name')?.value || '').trim(),
      durationWeeks: Number(row.querySelector('.ip-pe-dur')?.value || 0) || 0,
      objective: String(row.querySelector('.ip-pe-obj')?.value || '').trim(),
    };
  });
}

async function saveImplementationPhases() {
  const project = state.selectedProject;
  if (!project) return;
  syncImplPhasesDraftFromDom();
  const phases = (implPhasesDraft || [])
    .filter((p) => p.name)
    .map((p, i) => ({ id: p.id || `F${i + 1}`, name: p.name, durationWeeks: p.durationWeeks, objective: p.objective }));
  const duplicate = findDuplicatePhaseName(phases);
  if (duplicate) {
    showToast(`Nome duplicado: «${duplicate.name}». Cada fase (#1, #2…) precisa de um nome único.`, 'error');
    return;
  }
  if (!phases.length) {
    showToast('Adicione pelo menos uma fase com nome.', 'error');
    return;
  }
  try {
    const res = await apiRequest(`/projects/${encodeURIComponent(project.id)}`, {
      method: 'PATCH',
      body: { phases },
    });
    implPhasesEditing = false;
    implPhasesDraft = null;
    clearProjectCache(project.id);
    applyProjectPatch(res.project, { tab: 'fases', renderDelivery: state.activeTab === 'deliveryos' });
    window.RequirementsUI?.populateAddRequirementPhase?.(state.selectedProject);
    let msg = 'Fases atualizadas.';
    if (res.requirementsPhaseRenamed) {
      msg += ` ${res.requirementsPhaseRenamed} requisito(s) sincronizados com os novos nomes.`;
    }
    if (res.requirementsPhaseSynced) {
      msg += ` ${res.requirementsPhaseSynced} requisito(s) alinhados por número de fase (#1, #2…).`;
    }
    if (res.roadmapSynced) {
      msg += ` Roadmap sincronizado (${res.roadmapSyncedCount || phases.length} fase(s)).`;
    }
    showToast(msg, 'ok');
  } catch (error) {
    showToast(error.message || 'Erro ao guardar fases.', 'error');
  }
}

function buildImplementationPhasesEditorHtml() {
  const draft = implPhasesDraft || [];

  const rows = draft.map((p, i) => `
    <div class="ip-pe-row" data-phase-index="${i}">
      <span class="ip-pe-num" title="Número único da fase">#${i + 1}</span>
      <input class="ip-pe-name" type="text" value="${escapeHtml(p.name)}" placeholder="Nome da fase (ex.: Discovery, MVP)" />
      <input class="ip-pe-dur" type="number" min="0" step="1" value="${p.durationWeeks || ''}" placeholder="sem." title="Duração em semanas" />
      <input class="ip-pe-obj" type="text" value="${escapeHtml(p.objective || '')}" placeholder="Objetivo" />
      <button type="button" class="btn tiny ghost ip-pe-remove" data-remove-phase="${i}" title="Remover fase">✕</button>
    </div>
  `).join('');

  return `
    <div class="ip-phase-editor">
      <p class="ip-muted ip-phase-editor-hint">O número (#1, #2…) é fixo. Requisitos com «Fase 1», F1, etc. passam automaticamente para o nome da fase correspondente ao guardar.</p>
      <div class="ip-pe-head"><span>#</span><span>Nome</span><span>Sem.</span><span>Objetivo</span><span></span></div>
      <div class="ip-pe-rows">${rows || '<p class="ip-muted">Sem fases. Adicione a primeira.</p>'}</div>
      <button type="button" class="btn tiny ghost" data-add-phase>+ Adicionar fase</button>
      <div class="ip-pe-actions">
        <button type="button" class="btn small" data-save-phases>Guardar fases</button>
        <button type="button" class="btn small ghost" data-cancel-phases>Cancelar</button>
      </div>
    </div>
  `;
}

function wireImplementationPlanEvents() {
  const root = els.implementationPlanView;
  if (!root) return;
  root.querySelector('[data-edit-phases]')?.addEventListener('click', () => startEditImplementationPhases());
  root.querySelector('[data-cancel-phases]')?.addEventListener('click', () => cancelEditImplementationPhases());
  root.querySelector('[data-save-phases]')?.addEventListener('click', () => saveImplementationPhases());
  root.querySelector('[data-add-phase]')?.addEventListener('click', () => {
    syncImplPhasesDraftFromDom();
    const n = (implPhasesDraft || []).length + 1;
    implPhasesDraft = [...(implPhasesDraft || []), { id: `F${n}_${Date.now()}`, name: '', durationWeeks: 0, objective: '' }];
    renderImplementationPlan(state.selectedProject);
  });
  root.querySelectorAll('[data-remove-phase]').forEach((btn) => {
    btn.addEventListener('click', () => {
      syncImplPhasesDraftFromDom();
      const idx = Number(btn.dataset.removePhase);
      implPhasesDraft = (implPhasesDraft || []).filter((_, i) => i !== idx);
      renderImplementationPlan(state.selectedProject);
    });
  });
  root.querySelector('[data-sync-req-phases]')?.addEventListener('click', async () => {
    const project = await ensurePhasesSynced(state.selectedProject);
    if (project) renderImplementationPlan(project);
  });
  root.querySelectorAll('[data-goto-req-phase]').forEach((btn) => {
    btn.addEventListener('click', () => {
      state.filters = state.filters || {};
      state.filters.phase = btn.dataset.gotoReqPhase || '';
      switchToTab('requisitos');
    });
  });
  root.querySelectorAll('[data-ip-load-more]').forEach((btn) => {
    btn.addEventListener('click', () => {
      state.listLimits.implPlanReqsPerPhase = (state.listLimits.implPlanReqsPerPhase || 30) + 30;
      renderImplementationPlan(state.selectedProject);
    });
  });
  wirePhaseRequirementDragDrop(root, state.selectedProject);
}

function renderImplementationPlan(project) {
  if (project && canEdit() && !implPhasesEditing && window.PhaseSync?.needsRequirementsPhaseSync?.(project)) {
    ensurePhasesSynced(project).then((synced) => {
      if (synced) renderImplementationPlan(synced);
    });
  }

  const requirements = Array.isArray(project?.requirements) ? project.requirements : [];
  const questions = Array.isArray(project?.clarificationQuestions) ? project.clarificationQuestions : [];
  const risks = Array.isArray(project?.risks) ? project.risks : [];
  const phases = Array.isArray(project?.phases) ? project.phases : [];
  const integrations = Array.isArray(project?.integrations) ? project.integrations : [];
  const technicalApproach = project?.technicalApproach || {};
  const blockedStatuses = new Set(['blocked']);
  const doneStatuses = new Set(['approved', 'done', 'completed', 'closed', 'resolved']);

  const unresolvedQuestions = questions.filter((entry) => !doneStatuses.has(String(entry.status || '').toLowerCase()));
  const functional = requirements.filter((entry) => entry.type === 'functional');
  const smartMissing = functional.filter((entry) => !entry.smartIsValid);
  const pendingRequirements = requirements.filter((entry) => !doneStatuses.has(String(entry.status || '').toLowerCase()));
  const blockedRequirements = requirements.filter((entry) => blockedStatuses.has(String(entry.status || '').toLowerCase()));

  // Apenas fases do plano (#1, #2…). Requisitos mapeiam por número (Fase 1, F1…)
  // ou por nome exacto — sincronizados automaticamente ao guardar / abrir Fases.
  const phaseDefs = phases.map((phase, index) => ({
    id: String(phase?.id || '').trim(),
    name: String(phase?.name || `Fase ${index + 1}`).trim(),
    durationWeeks: Number(phase?.durationWeeks || 0),
    objective: String(phase?.objective || phase?.description || '').trim(),
    orderNum: index + 1,
  }));

  const matchPhaseDef = (req) => {
    const resolved = window.PhaseSync?.resolveRequirementPhase?.(req, phases);
    if (!resolved) return null;
    return phaseDefs.find((p) => normalizeForCompare(p.name) === normalizeForCompare(resolved)) || null;
  };

  const outOfPlan = requirements.filter((req) => !matchPhaseDef(req));
  const phaseRows = phaseDefs.map((phase, index) => {
    const phaseName = phase.name;
    const phaseReqs = requirements
      .filter((req) => matchPhaseDef(req) === phase)
      .slice()
      .sort((a, b) => String(a.id || '').localeCompare(String(b.id || ''), 'pt-PT'));
    const approved = phaseReqs.filter((entry) => doneStatuses.has(String(entry.status || '').toLowerCase())).length;
    const pending = phaseReqs.length - approved;
    const durationWeeks = Number(phase?.durationWeeks || 0);
    const durationLabel = Number.isFinite(durationWeeks) && durationWeeks > 0 ? `${durationWeeks}sem` : '—';
    const objective = escapeHtml(shortText(String(phase?.objective || '').trim() || '—', 100));
    const highPri = phaseReqs
      .filter((e) => e.priority === 'high' && !doneStatuses.has(String(e.status || '').toLowerCase()))
      .slice(0, 3)
      .map((e) => `<span class="ip-tag ip-tag--high">${escapeHtml(e.id)}</span>`)
      .join('');

    return `
      <tr class="ip-phase-row">
        <td class="ip-phase-name">${escapeHtml(formatPhaseLabel(index, phaseName))}</td>
        <td class="ip-phase-dur">${durationLabel}</td>
        <td class="ip-phase-reqs">${phaseReqs.length}</td>
        <td class="ip-phase-done"><span class="ip-pill ip-pill--ok">${approved} ok</span> <span class="ip-pill ip-pill--pend">${pending} pend.</span></td>
        <td class="ip-phase-obj">${objective}</td>
        <td class="ip-phase-high">${highPri || '<span class="ip-muted">—</span>'}</td>
      </tr>
    `;
  }).join('');

  // Requisitos por fase — mesma fonte de verdade (req.phase) que a página de
  // requisitos, centralizada aqui para gerir as fases.
  const ipEditable = canEdit() && !implPhasesEditing;
  const planPhaseOptions = phaseDefs
    .map((p, idx) => `<option value="${escapeHtml(p.name)}">${escapeHtml(formatPhaseLabel(idx, p.name))}</option>`)
    .join('');

  function renderIpReqChip(req, { warn = false, showAssign = false } = {}) {
    const drag = ipEditable ? ' draggable="true"' : '';
    const assign = showAssign && ipEditable ? `
      <select class="ip-req-assign" data-assign-req-phase="${escapeHtml(req.id)}" aria-label="Atribuir fase">
        <option value="">→ fase</option>
        ${planPhaseOptions}
      </select>` : '';
    return `
      <span class="ip-req-chip-wrap">
        <button type="button" class="ip-req-chip${warn ? ' ip-req-chip--warn' : ''}${ipEditable ? ' ip-req-chip--draggable' : ''}"${drag}
          data-req-id="${escapeHtml(req.id)}" data-open-req-chip="${escapeHtml(req.id)}"
          title="${escapeHtml(req.title || '')}">
          <span class="ip-req-chip-id">${escapeHtml(req.id)}</span>
          ${escapeHtml(shortText(req.title || req.shall || '', 48))}
        </button>${assign}
      </span>`;
  }

  const phaseBreakdown = phaseDefs.map((phase, index) => {
    const phaseReqsAll = requirements
      .filter((req) => matchPhaseDef(req) === phase)
      .slice()
      .sort((a, b) => String(a.id || '').localeCompare(String(b.id || ''), 'pt-PT'));
    const perPhaseLimit = state.listLimits?.implPlanReqsPerPhase || 30;
    const phaseReqs = phaseReqsAll.length > perPhaseLimit ? phaseReqsAll.slice(0, perPhaseLimit) : phaseReqsAll;
    const hiddenCount = phaseReqsAll.length - phaseReqs.length;
    const chips = phaseReqs.length
      ? phaseReqs.map((req) => renderIpReqChip(req)).join('')
      : `<span class="ip-muted">${ipEditable ? 'Arraste requisitos para aqui.' : 'Sem requisitos nesta fase.'}</span>`;
    const moreBtn = hiddenCount > 0
      ? `<button type="button" class="btn tiny ghost" data-ip-load-more="${escapeHtml(phase.name)}">+${hiddenCount} mais</button>`
      : '';
    const objSnippet = phase.objective ? `<span class="ip-muted ip-phase-obj-snippet">${escapeHtml(shortText(phase.objective, 80))}</span>` : '';
    return `
      <div class="ip-phase-group" data-ip-phase-group="${escapeHtml(phase.name)}">
        <div class="ip-phase-group-head">
          <strong>${escapeHtml(formatPhaseLabel(index, phase.name))}</strong>
          <span class="ip-muted">${phaseReqsAll.length} req.</span>
        </div>
        ${objSnippet}
        <div class="ip-req-chips ip-phase-dropzone" data-ip-phase="${escapeHtml(phase.name)}">${chips}${moreBtn}</div>
      </div>
    `;
  }).join('');
  const unassignedChips = outOfPlan.length
    ? outOfPlan
      .slice()
      .sort((a, b) => String(a.id || '').localeCompare(String(b.id || ''), 'pt-PT'))
      .map((req) => renderIpReqChip(req, { warn: true, showAssign: true }))
      .join('')
    : '';

  const nextActions = [
    ...pendingRequirements
      .filter((entry) => entry.priority === 'high')
      .slice(0, 5)
      .map((entry) => `<li>${escapeHtml(entry.id)} — ${escapeHtml(shortText(entry.title, 70))}</li>`),
    ...(outOfPlan.length ? [`<li class="ip-warn">${outOfPlan.length} requisito(s) sem fase atribuída</li>`] : []),
    ...(smartMissing.length ? [`<li class="ip-warn">${smartMissing.length} lacuna(s) SMART por fechar</li>`] : []),
  ].slice(0, 7);

  const moduleInsights = collectModules(project).map((moduleName) => {
    const moduleReqs = requirements.filter((entry) => {
      const tags = Array.isArray(entry.moduleTags) && entry.moduleTags.length
        ? entry.moduleTags
        : [normalizeModuleName(entry.module)].filter(Boolean);
      return tags.includes(moduleName);
    });
    const high = moduleReqs.filter((entry) => entry.priority === 'high').length;
    const blocked = moduleReqs.filter((entry) => blockedStatuses.has(String(entry.status || '').toLowerCase())).length;
    return `<tr><td>${escapeHtml(moduleName)}</td><td>${moduleReqs.length}</td><td>${high}</td><td>${blocked}</td></tr>`;
  });

  const stackHighlights = Array.isArray(technicalApproach?.stack) ? technicalApproach.stack.slice(0, 6) : [];
  const integrationHighlights = integrations.slice(0, 6).map((e) => {
    const name = String(e?.name || 'Integração').trim();
    const phase = String(e?.phase || '').trim();
    return `<span class="ip-tag">${escapeHtml(name)}${phase ? ` · ${escapeHtml(phase)}` : ''}</span>`;
  });

  els.implementationPlanView.innerHTML = `
    <div class="ip-kpi-row">
      <div class="ip-kpi"><span>${requirements.length}</span><small>Requisitos</small></div>
      <div class="ip-kpi"><span>${pendingRequirements.length}</span><small>Pendentes</small></div>
      <div class="ip-kpi"><span>${blockedRequirements.length}</span><small>Bloqueados</small></div>
      <div class="ip-kpi"><span>${unresolvedQuestions.length}</span><small>Questões</small></div>
      <div class="ip-kpi"><span>${smartMissing.length}</span><small>SMART gaps</small></div>
      <div class="ip-kpi"><span>${risks.length}</span><small>Riscos</small></div>
    </div>

    <details class="ip-section" open>
      <summary>Fases de Implementação</summary>
      <div class="ip-section-actions">
        ${implPhasesEditing
          ? ''
          : (canEdit() ? `
            <button type="button" class="btn tiny ghost" data-sync-req-phases title="Alinhar requisitos Fase 1/F1… ao plano">Sincronizar requisitos</button>
            <button type="button" class="btn tiny ghost" data-edit-phases>Editar fases</button>
          ` : '')}
      </div>
      ${!implPhasesEditing && phaseDefs.length ? `<p class="ip-muted">Ao guardar, o <button type="button" class="btn link inline-link-btn" data-goto-tab="deliveryos" data-set-stage="roadmap">roadmap</button> na Linha de Entrega é criado ou actualizado automaticamente.</p>` : ''}
      ${implPhasesEditing
        ? buildImplementationPhasesEditorHtml()
        : (phaseDefs.length ? `
        <div class="ip-table-wrap">
          <table class="ip-table">
            <thead><tr><th>Fase</th><th>Duração</th><th>Req.</th><th>Estado</th><th>Objetivo</th><th>Alta prioridade</th></tr></thead>
            <tbody>${phaseRows}</tbody>
          </table>
        </div>
      ` : '<p class="ip-empty">Sem fases definidas.</p>')}
    </details>

    ${implPhasesEditing ? '' : `
    <details class="ip-section" open>
      <summary>Requisitos por fase</summary>
      ${ipEditable ? '<p class="ip-muted ip-dnd-hint">Arraste requisitos entre fases para reclassificar. Clique num requisito para editar.</p>' : ''}
      <div class="ip-phase-breakdown">${phaseBreakdown || '<p class="ip-empty">Sem fases.</p>'}</div>
      ${unassignedChips ? `<div class="ip-phase-group ip-phase-group--warn" data-ip-phase-group="unassigned">
        <div class="ip-phase-group-head"><strong>Sem fase atribuída</strong><span class="ip-muted">${outOfPlan.length} req.</span></div>
        <div class="ip-req-chips">${unassignedChips}</div>
      </div>` : ''}
    </details>`}

    <details class="ip-section">
      <summary>Próximos Passos</summary>
      ${nextActions.length ? `<ul class="ip-list">${nextActions.join('')}</ul>` : '<p class="ip-empty">Sem ações prioritárias pendentes.</p>'}
    </details>

    <details class="ip-section">
      <summary>Módulos de Arquitetura</summary>
      ${moduleInsights.length ? `
        <div class="ip-table-wrap">
          <table class="ip-table">
            <thead><tr><th>Módulo</th><th>Req.</th><th>Alta prior.</th><th>Bloqueados</th></tr></thead>
            <tbody>${moduleInsights.join('')}</tbody>
          </table>
        </div>
      ` : '<p class="ip-empty">Sem módulos classificados.</p>'}
    </details>

    <details class="ip-section">
      <summary>Stack e Integrações</summary>
      <div class="ip-two-col">
        <div>
          <p class="ip-label">Stack técnica</p>
          <div class="ip-tag-list">${stackHighlights.length ? stackHighlights.map((s) => `<span class="ip-tag">${escapeHtml(s)}</span>`).join('') : '<span class="ip-muted">Não definida.</span>'}</div>
        </div>
        <div>
          <p class="ip-label">Integrações previstas</p>
          <div class="ip-tag-list">${integrationHighlights.length ? integrationHighlights.join('') : '<span class="ip-muted">Nenhuma definida.</span>'}</div>
        </div>
      </div>
    </details>
  `;

  wireImplementationPlanEvents();
}

function renderRequirements(project) {
  if (project && canEdit() && window.PhaseSync?.needsRequirementsPhaseSync?.(project)) {
    ensurePhasesSynced(project).then((synced) => {
      if (synced && window.RequirementsUI?.renderGroupedRequirements) {
        window.RequirementsUI.renderGroupedRequirements(synced);
      }
    });
  }
  if (window.RequirementsUI?.renderGroupedRequirements) {
    window.RequirementsUI.renderGroupedRequirements(project);
    return;
  }
  const items = Array.isArray(project.requirements) ? project.requirements : [];
  const filtered = getFilteredRequirements(items);
  const prepared = filtered;
  const tbody = els.requirementsTable.querySelector('tbody');

  if (!prepared.length) {
    tbody.innerHTML = `<tr><td colspan="3">${items.length ? 'Nenhum requisito corresponde ao filtro.' : 'Sem requisitos ainda.'}</td></tr>`;
    els.requirementsMeta.textContent = `0 requisitos no filtro atual (de ${items.length} totais).`;
    state.selectedRequirementId = null;
    renderRequirementDetailEditor(project);
    return;
  }

  const statuses = statusOptions();
  tbody.innerHTML = prepared.map((req) => {
    const locked = !canEdit();
    const disabled = locked ? 'disabled' : '';
    const title = escapeHtml(req.title || '');
    const phase = escapeHtml(req.phase || 'Backlog');
    const moduleName = escapeHtml(formatModuleLabel(req));
    const relations = splitRequirementIds(req.relatedRequirementIds);
    const relationsText = relations.length ? `${relations.slice(0, 2).join(', ')}${relations.length > 2 ? ` +${relations.length - 2}` : ''}` : '-';
    const summaryLine = shortText(req.need || req.shall || req.description || req.businessValue, 120);
    const summaryMeta = `${req.phase || 'Backlog'} • ${formatModuleLabel(req)}`;
    const smartInfo = req.type === 'functional'
      ? (req.smartIsValid
        ? '<span class="smart-ok">OK</span>'
        : `<span class="smart-issue">Falta: ${escapeHtml((req.smartValidationErrors || []).join(', '))}</span>`)
      : '-';

    return `
      <tr data-requirement-id="${escapeHtml(req.id)}" ${state.selectedRequirementId === req.id ? 'class="selected-row"' : ''}>
        <td>${escapeHtml(req.id)}</td>
        <td>${escapeHtml(req.type)}</td>
        <td class="req-summary">
          <p>${escapeHtml(summaryLine)}</p>
          <small>${escapeHtml(summaryMeta)}</small>
        </td>
      </tr>
    `;
  }).join('');

  prepared.forEach((req) => {
    const row = tbody.querySelector(`tr[data-requirement-id="${req.id}"]`);
    if (!row) return;
    const statusSelect = row.querySelector('select[data-field="status"]');
    if (statusSelect) {
      statusSelect.value = req.status || 'draft';
    }
  });

  const selectedInFiltered = prepared.some((entry) => entry.id === state.selectedRequirementId);
  if (!selectedInFiltered) {
    state.selectedRequirementId = prepared[0]?.id || null;
  }

  const functional = items.filter((entry) => entry.type === 'functional');
  const smartMissing = functional.filter((entry) => !entry.smartIsValid).length;
  const moduleCount = new Set(items.map((entry) => normalizeModuleName(entry.module))).size;
  const submoduleCount = new Set(items.map((entry) => `${normalizeModuleName(entry.module)}::${normalizeSubmoduleName(entry.submodule) || 'General'}`)).size;
  els.requirementsMeta.textContent = `${prepared.length} requisitos no filtro atual (de ${items.length} totais) • Módulos: ${moduleCount} • Submódulos: ${submoduleCount} • Funcionais com lacunas SMART: ${smartMissing}`;

  renderRequirementDetailEditor(project);
}

function renderGenerated(project) {
  if (!els.generatedLinks) return;
  const historySection = els.generatedLinks.closest('.section-panel')?.querySelector('.subsection-label');
  const canSeeHistory = typeof isSuperAdmin === 'function' && isSuperAdmin();
  if (historySection) {
    historySection.classList.toggle('hidden', !canSeeHistory);
  }
  if (!canSeeHistory) {
    els.generatedLinks.innerHTML = '';
    els.generatedLinks.classList.add('hidden');
    return;
  }
  els.generatedLinks.classList.remove('hidden');
  if (window.ProposalDownloads?.renderGeneratedList) {
    els.generatedLinks.innerHTML = window.ProposalDownloads.renderGeneratedList(project, {
      commercialOnly: true,
      showDelete: true,
    });
    return;
  }

  const generated = Array.isArray(project.generated) ? project.generated : [];
  if (!generated.length) {
    els.generatedLinks.innerHTML = '<div class="simple-item"><small>Nenhum pacote gerado ainda.</small></div>';
    return;
  }

  const latest = generated[0];
  const outputs = latest.outputs || {};
  const links = Object.entries(outputs)
    .filter(([, value]) => value)
    .map(([key, value]) => `<a href="${escapeHtml(value)}" target="_blank" rel="noopener">${escapeHtml(key)}</a>`)
    .join(' • ');

  els.generatedLinks.innerHTML = `
    <div class="simple-item">
      <strong>Última geração (${escapeHtml(latest.mode)})</strong>
      <small>${new Date(latest.generatedAt).toLocaleString('pt-PT')}</small>
      <small>Módulos: ${latest.selectedModules?.length ? escapeHtml(latest.selectedModules.join(', ')) : 'todos'}</small>
      <div>${links || '<small>Sem ficheiros disponíveis</small>'}</div>
    </div>
  `;
}

function renderRequirementDetailEditor(project) {
  const req = getSelectedRequirement(project);
  if (!req) {
    els.requirementDetailEmpty.classList.remove('hidden');
    els.requirementQuickView.classList.add('hidden');
    els.requirementDetailForm.classList.add('hidden');
    return;
  }

  els.requirementDetailEmpty.classList.add('hidden');
  els.requirementQuickView.classList.remove('hidden');
  els.requirementDetailForm.classList.remove('hidden');

  els.requirementQuickView.innerHTML = `
    <h4>Leitura rápida: ${escapeHtml(req.id || '')} - ${escapeHtml(req.title || '')}</h4>
    <p><strong>Módulo:</strong> ${escapeHtml(formatModuleLabel(req))}</p>
    <p><strong>Need:</strong> ${escapeHtml(shortText(req.need || req.description, 220))}</p>
    <p><strong>Shall:</strong> ${escapeHtml(shortText(req.shall || req.description, 240))}</p>
    <p><strong>Condition + Measure:</strong> ${escapeHtml(shortText(`${req.condition || 'N/A'} | ${req.measure || 'N/A'}`, 260))}</p>
    <p><strong>Relações:</strong> ${escapeHtml(joinRequirementIds(req.relatedRequirementIds) || 'N/A')}</p>
    <p><strong>Status:</strong> ${escapeHtml(req.status || 'draft')} • <strong>Prioridade:</strong> ${escapeHtml(req.priority || 'medium')} • <strong>Fase:</strong> ${escapeHtml(req.phase || 'Backlog')}</p>
  `;

  els.detailReqId.value = req.id || '';
  els.detailReqType.value = req.type || '';
  els.detailReqStatus.value = req.status || 'draft';
  els.detailReqPriority.value = req.priority || 'medium';
  els.detailReqPhase.value = req.phase || 'Backlog';
  els.detailReqModule.value = normalizeModuleName(req.module);
  els.detailReqSubmodule.value = normalizeSubmoduleName(req.submodule);
  els.detailReqVersion.value = req.versionRevision || '1.0';
  els.detailReqTitle.value = req.title || '';
  els.detailReqNeed.value = req.need || '';
  els.detailReqShall.value = req.shall || '';
  els.detailReqCondition.value = req.condition || '';
  els.detailReqMeasure.value = req.measure || '';
  els.detailReqRationale.value = req.rationale || '';
  els.detailReqVerification.value = req.verification || '';
  els.detailReqAssumption.value = req.assumption || '';
  els.detailReqStakeholderLink.value = req.stakeholderRequirementLink || '';
  els.detailReqLinkedFunctionalRequirement.value = req.linkedFunctionalRequirement || '';
  els.detailReqBusinessValue.value = req.businessValue || req.reason || '';
  els.detailReqTarget.value = req.target || '';
  els.detailReqRelatedIds.value = joinRequirementIds(req.relatedRequirementIds);
  els.detailReqNotes.value = req.notes || '';

  const detailSubmodules = collectSubmodules(project, els.detailReqModule.value);
  els.submoduleSuggestions.innerHTML = detailSubmodules
    .map((submoduleName) => `<option value="${escapeHtml(submoduleName)}"></option>`)
    .join('');
}

function renderRiskAssumptionView(project) {
  const risks = Array.isArray(project.risks) ? project.risks : [];
  const assumptions = Array.isArray(project.assumptions) ? project.assumptions : [];
  const phases = Array.isArray(project.phases) ? project.phases : [];

  const topRisks = risks.slice(0, 5);
  const topAssumptions = assumptions.slice(0, 5);
  const phaseHighlights = phases.slice(0, 3).map((phase) => `${phase.name || 'Fase'} (${phase.durationWeeks || 'n/d'} semanas)`);

  els.riskAssumptionView.innerHTML = `
    <article class="read-card">
      <h4>Riscos Prioritários</h4>
      ${topRisks.length ? `<ul>${topRisks.map((risk) => `<li>${escapeHtml(risk)}</li>`).join('')}</ul>` : '<p>N/A</p>'}
      <small>Total: ${risks.length}</small>
    </article>
    <article class="read-card">
      <h4>Assunções do Projeto</h4>
      ${topAssumptions.length ? `<ul>${topAssumptions.map((assumption) => `<li>${escapeHtml(assumption)}</li>`).join('')}</ul>` : '<p>N/A</p>'}
      <small>Total: ${assumptions.length}</small>
    </article>
    <article class="read-card">
      <h4>Fases em Destaque</h4>
      ${phaseHighlights.length ? `<ul>${phaseHighlights.map((entry) => `<li>${escapeHtml(entry)}</li>`).join('')}</ul>` : '<p>N/A</p>'}
    </article>
    <article class="read-card">
      <h4>Integrações Planeadas</h4>
      <p>${(project.integrations || []).length} integração(ões) registadas.</p>
    </article>
  `;
}

async function loadConfig() {
  state.config = await apiRequest('/config');
  els.reqStatus.innerHTML = statusOptions();
  els.detailReqStatus.innerHTML = statusOptions();
  els.reqFilterStatus.innerHTML = `<option value="">Todos os status</option>${statusOptions()}`;
  els.questionStatus.innerHTML = questionStatusOptions();
  els.questionFilterStatus.innerHTML = `<option value="">Todos os status</option>${questionStatusOptions()}`;
  els.questionTargetRole.innerHTML = questionTargetOptions();
  els.questionFilterTargetRole.innerHTML = `<option value="">Todos os destinos</option>${questionTargetOptions()}`;
  els.questionCategory.innerHTML = questionCategoryOptions();
  els.questionStatus.value = 'open';
  els.questionTargetRole.value = 'client';
}

async function loadCurrentUser() {
  const payload = await apiRequest('/auth/me');
  state.user = payload.user;
}

async function loadUsers() {
  if (!isSuperAdmin()) {
    state.users = [state.user];
    return;
  }
  const payload = await apiRequest('/users');
  state.users = payload.users || [];
}

async function loadProjects(selectId) {
  const payload = await apiRequest('/projects');
  state.projects = payload.projects || [];
  renderProjects();

  if (selectId) {
    state.selectedProjectId = selectId;
  } else if (state.selectedProjectId && state.projects.some((p) => p.id === state.selectedProjectId)) {
    // keep current selection
  } else {
    state.selectedProjectId = null;
  }

  if (state.selectedProjectId) {
    await loadProjectById(state.selectedProjectId, { switchTab: false });
  } else {
    state.selectedProject = null;
    renderProjects();
    renderProjectDetails();
    switchToTab(state.activeTab || 'projetos');
  }
}

async function loadProjectById(projectId, options = {}) {
  state.selectedProjectId = projectId;
  const payload = await fetchProjectById(projectId);
  state.selectedProject = payload.project;
  if (!getSelectedRequirement(state.selectedProject)) {
    state.selectedRequirementId = state.selectedProject?.requirements?.[0]?.id || null;
  }
  const deepLink = window.DeliveryOsPlatform?.readUrlDeepLink?.() || {};
  if (deepLink.stage) {
    state.deliverySelectedStageId = deepLink.stage;
  }
  renderProjects();
  renderProjectDetails({ skipTab: true });
  if (options.switchTab !== false) {
    const tab = deepLink.tab || 'deliveryos';
    switchToTab(tab);
  } else {
    renderActiveTab(state.selectedProject, state.activeTab);
  }
  if (state.activeTab === 'atividade') {
    await loadActivity();
  }
  window.DeliveryOsPlatform?.refreshPlatformUi?.(state.selectedProject);
  window.ClientPortalUI?.refresh?.(state.selectedProject);
}

function stageLabel(stageId) {
  const focus = state.config?.stageFocus?.[stageId];
  if (focus) return focus.split('—')[0].trim();
  const flow = (state.config?.deliveryStageFlow || []).find((entry) => entry.id === stageId);
  return flow?.label || stageId;
}

function impactScopeLabel(scopeId) {
  const entry = (state.config?.meetingImpactScopes || []).find((item) => item.id === scopeId);
  return entry?.label || scopeId;
}

function renderSettingsAvailability() {
  const hasProject = Boolean(state.selectedProject);
  if (els.settingsProjectHint) {
    els.settingsProjectHint.classList.toggle('hidden', hasProject);
  }
  if (els.settingsProjectBody) {
    els.settingsProjectBody.classList.toggle('hidden', !hasProject);
  }
  const levelSelect = document.getElementById('deliveryLevelSelect');
  if (levelSelect && hasProject) {
    levelSelect.value = state.selectedProject.deliveryLevel || 'standard';
  }
}

function renderPhaseContextBar() {
  const bar = els.phaseContextBar;
  if (!bar) return;

  const hideBar = !state.selectedProject
    || state.activeTab === 'definicoes'
    || state.activeTab === 'projetos'
    || state.activeTab === 'deliveryos';

  if (hideBar) {
    bar.classList.add('hidden');
    bar.innerHTML = '';
    return;
  }

  const stageId = state.deliverySelectedStageId || 'requirements';
  const stageName = stageLabel(stageId);
  const hasStageFilter = Boolean(state.tabFilters?.deliveryStageId);

  bar.classList.remove('hidden');
  bar.innerHTML = `
    <div class="phase-context-strip">
      <div class="phase-context-strip-left">
        <span class="phase-context-pill">${escapeHtml(stageName)}</span>
        ${hasStageFilter ? '<span class="phase-context-tag">filtro activo</span>' : '<span class="phase-context-tag is-muted">fase seleccionada</span>'}
      </div>
      <button type="button" class="phase-context-go" data-goto-tab="deliveryos" data-set-stage="${escapeHtml(stageId)}">
        Ver conteúdo na Linha de Entrega
        <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M9 6l6 6-6 6" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg>
      </button>
    </div>
  `;
}

function navigateToRequirement(requirementId) {
  if (!requirementId || !state.selectedProject) return;
  state.selectedRequirementId = requirementId;
  switchToTab('requisitos');
  renderRequirements(state.selectedProject);
  if (window.RequirementsUI?.openRequirementModal) {
    window.RequirementsUI.openRequirementModal(requirementId, state.selectedProject);
    return;
  }
  const row = els.requirementsTable.querySelector(`tr[data-requirement-id="${requirementId}"]`);
  if (row) {
    row.classList.add('row-highlight');
    row.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
    row.click();
  }
}

function navigateToFilteredTab(tabId, filters = {}) {
  state.tabFilters = state.tabFilters || {};
  if (filters.deliveryStageId) {
    state.tabFilters.deliveryStageId = filters.deliveryStageId;
    state.deliverySelectedStageId = filters.deliveryStageId;
  }
  if (filters.module) {
    state.filters.module = filters.module;
    state.tabFilters.keepModule = true;
  }
  if (filters.phase) state.filters.phase = filters.phase;
  if (filters.contentView) {
    state.tabFilters.contentView = filters.contentView;
  } else if (filters.deliveryStageId && tabId !== 'documentos') {
    state.tabFilters.contentView = '';
  }
  if (filters.clearStage) {
    state.tabFilters.deliveryStageId = '';
  }
  if (tabId === 'perguntas') {
    state.questionFilters.byCurrentStage = Boolean(filters.deliveryStageId);
  }
  switchToTab(tabId);
}

function switchToTab(tabId) {
  const target = tabId || 'projetos';
  if (isNavPageRequiresProject(target) && !state.selectedProject) {
    showToast('Seleccione ou crie um projecto primeiro.', 'error');
    state.activeTab = 'projetos';
  } else {
    state.activeTab = target;
  }

  const activeId = state.activeTab;
  const tabs = document.getElementById('sectionTabs');
  tabs?.querySelectorAll('.tab-btn').forEach((b) => {
    b.classList.toggle('active', b.dataset.tab === activeId);
  });
  document.querySelectorAll('.tab-panel').forEach((p) => {
    p.classList.toggle('hidden', p.dataset.panel !== activeId);
  });

  els.noProject?.classList.toggle('hidden', state.selectedProject || activeId !== 'projetos');
  renderNavRail();
  renderSettingsAvailability();
  renderPhaseContextBar();
  applyClientTabVisibility();
  applyReadOnlyChrome();

  if (activeId === 'projetos') {
    renderProjectsPage();
  } else if (state.selectedProject) {
    renderActiveTab(state.selectedProject, activeId);
  }
}

window.switchToTab = switchToTab;
window.renderActiveTab = renderActiveTab;
window.navigateToRequirement = navigateToRequirement;
window.navigateToFilteredTab = navigateToFilteredTab;
window.renderPhaseContextBar = renderPhaseContextBar;

async function loadActivity() {
  const project = state.selectedProject;
  if (!project) {
    els.activityList.innerHTML = '<div class="simple-item"><small>Selecione um projeto.</small></div>';
    return;
  }

  const payload = await apiRequest(`/projects/${encodeURIComponent(project.id)}/activity`);
  const activity = payload.activity || [];
  const auditLog = payload.auditLog || [];
  const canRevert = canEdit();

  if (!activity.length && !auditLog.length) {
    els.activityList.innerHTML = '<div class="simple-item"><small>Sem atividade registada.</small></div>';
    return;
  }

  const auditHtml = auditLog.length ? `
    <section class="audit-log-section mb-12">
      <h4 class="panel-subheading">Registo auditável (reversível)</h4>
      ${auditLog.slice(0, 50).map((entry) => `
        <div class="simple-item audit-log-item">
          <strong>${escapeHtml(entry.summary || entry.action)}</strong>
          <small>${new Date(entry.at).toLocaleString('pt-PT')} • ${escapeHtml(entry.actorName || entry.actorUserId || '')}</small>
          ${entry.revertedAt ? '<span class="chip">revertido</span>' : ''}
          ${canRevert && entry.canRevert ? `<button type="button" class="btn tiny" data-revert-audit="${escapeHtml(entry.id)}">Reverter</button>` : ''}
        </div>
      `).join('')}
    </section>
  ` : '';

  const activityHtml = activity.length ? activity.slice(0, 80).map((entry) => {
    const details = entry.details ? JSON.stringify(entry.details) : '';
    return `
      <div class="simple-item">
        <strong>${escapeHtml(entry.action)}</strong>
        <small>${new Date(entry.at).toLocaleString('pt-PT')} • ${escapeHtml(entry.actorName || entry.actorUserId || '')}</small>
        ${details ? `<small>${escapeHtml(details)}</small>` : ''}
      </div>
    `;
  }).join('') : '';

  els.activityList.innerHTML = auditHtml + activityHtml;

  els.activityList.querySelectorAll('[data-revert-audit]').forEach((btn) => {
    btn.addEventListener('click', async () => {
      if (!confirm('Reverter esta acção? O projecto volta ao estado anterior.')) return;
      try {
        const res = await apiRequest(`/projects/${project.id}/audit-log/${btn.dataset.revertAudit}/revert`, { method: 'POST', body: {} });
        state.selectedProject = res.project;
        showToast('Acção revertida');
        applyProjectPatch(res.project, { tab: state.activeTab, renderDelivery: state.activeTab === 'deliveryos' });
        if (state.activeTab === 'atividade') await loadActivity();
      } catch (err) {
        showToast(err.message, 'error');
      }
    });
  });
}

function readProjectPatchFromForm() {
  return {
    name: els.projectName.value.trim(),
    clientName: els.projectClient.value.trim(),
    status: els.projectStatus.value,
    proposalCode: els.projectCode.value.trim(),
    currency: els.projectCurrency.value.trim() || 'EUR',
    language: els.projectLanguage.value.trim() || 'pt-PT',
    description: els.projectDescription.value,
    summary: {
      businessContext: els.summaryBusinessContext.value,
      goals: linesToArray(els.summaryGoals.value),
      scopeInPlainLanguage: els.summaryScope.value,
      solutionOverview: els.summarySolution.value,
    },
  };
}

function readAdvancedPatch() {
  return {
    integrations: safeParseJson(els.integrationsJson.value, 'Integrações JSON inválido'),
    risks: linesToArray(els.risksText.value),
    assumptions: linesToArray(els.assumptionsText.value),
    commercialTerms: {
      validityDays: Number(els.commercialValidityDays?.value || 30),
      warrantyDays: Number(els.commercialWarrantyDays?.value || 30),
      exclusions: linesToArray(els.commercialExclusions?.value),
      notes: linesToArray(els.commercialNotes?.value),
    },
    technicalApproach: safeParseJson(els.technicalApproachJson.value, 'Abordagem técnica JSON inválido'),
  };
}

function safeParseJson(text, errorMessage) {
  const trimmed = String(text || '').trim();
  if (!trimmed) return {};
  try {
    return JSON.parse(trimmed);
  } catch (error) {
    throw new Error(errorMessage);
  }
}

async function handleLogin(event) {
  event.preventDefault();
  clearLoginStatus();

  try {
    const payload = await apiRequest('/auth/login', {
      method: 'POST',
      body: {
        email: els.loginEmail.value.trim(),
        password: els.loginPassword.value,
      },
    });

    state.token = payload.token;
    localStorage.setItem(TOKEN_KEY, state.token);
    await bootstrapAppAfterLogin();
  } catch (error) {
    setLoginStatus(error.message, 'error');
  }
}

async function bootstrapAppAfterLogin() {
  window.state = state;
  await loadCurrentUser();
  await loadUsers();
  await loadProjects();

  els.userMenuInfo && renderUserMenuInfo();
  els.loginCard.classList.add('hidden');
  els.workspace.classList.remove('hidden');
  setReadonlyByRole();
  setMonetaryVisibilityByRole();
  syncBudgetAccessControl();
  applyClientTabVisibility();
  applyReadOnlyChrome();
  renderUsersPanel();
  window.PdosUI?.wirePdosEvents();
  window.PdosUI?.wireTraceEvents();
  initNavRail();
  switchToTab(state.selectedProject ? state.activeTab : 'projetos');
}

async function handleLogout() {
  setUserMenuOpen(false);
  try {
    if (state.token) {
      await apiRequest('/auth/logout', { method: 'POST' });
    }
  } catch {
    // ignore
  }

  state.token = '';
  state.user = null;
  state.projects = [];
  state.selectedProject = null;
  state.selectedProjectId = null;
  state.selectedMinuteIds = [];
  state.generationModulesSelected = [];
  state.questionFilters.status = '';
  state.questionFilters.targetRole = '';
  localStorage.removeItem(TOKEN_KEY);
  els.workspace.classList.add('hidden');
  els.loginCard.classList.remove('hidden');
  showToast('Sessão terminada.', 'ok');
}

async function handleCreateProject(event) {
  event.preventDefault();
  try {
    const payload = await apiRequest('/projects', {
      method: 'POST',
      body: {
        name: document.getElementById('newProjectName').value.trim(),
        clientName: document.getElementById('newProjectClient').value.trim(),
        currency: document.getElementById('newProjectCurrency').value.trim() || 'EUR',
      },
    });

    showToast('Projeto criado com sucesso.', 'ok');
    event.target.reset();
    await loadProjects(payload.project.id);
  } catch (error) {
    showToast(error.message, 'error');
  }
}

async function handleCreateUser(event) {
  event.preventDefault();
  try {
    await apiRequest('/users', {
      method: 'POST',
      body: {
        name: document.getElementById('newUserName').value.trim(),
        email: document.getElementById('newUserEmail').value.trim(),
        role: document.getElementById('newUserRole').value,
        canViewBudget: document.getElementById('newUserRole').value === 'partner' && Boolean(els.newUserCanViewBudget?.checked),
        password: document.getElementById('newUserPassword').value,
      },
    });

    showToast('Utilizador criado.', 'ok');
    event.target.reset();
    syncBudgetAccessControl();
    await loadUsers();
    renderUsersPanel();
  } catch (error) {
    showToast(error.message, 'error');
  }
}

async function handleSaveProject() {
  if (!state.selectedProject) return;
  try {
    await apiRequest(`/projects/${encodeURIComponent(state.selectedProject.id)}`, {
      method: 'PATCH',
      body: readProjectPatchFromForm(),
    });

    showToast('Projeto atualizado.', 'ok');
    await loadProjects(state.selectedProject.id);
  } catch (error) {
    showToast(error.message, 'error');
  }
}

async function handleSaveAdvanced() {
  if (!state.selectedProject) return;
  try {
    const patch = readAdvancedPatch();
    await apiRequest(`/projects/${encodeURIComponent(state.selectedProject.id)}`, {
      method: 'PATCH',
      body: patch,
    });

    showToast('Dados avançados guardados.', 'ok');
    await refreshSelectedProject();
  } catch (error) {
    showToast(error.message, 'error');
  }
}

async function handleSaveSourceText() {
  if (!state.selectedProject) return;
  try {
    await apiRequest(`/projects/${encodeURIComponent(state.selectedProject.id)}/source-text`, {
      method: 'POST',
      body: { sourceText: document.getElementById('sourceText')?.value || '' },
    });
    showToast('Texto base guardado.', 'ok');
    await refreshSelectedProject();
  } catch (error) {
    showToast(error.message, 'error');
  }
}

async function handleBuildPrompt() {
  if (!state.selectedProject) return;
  try {
    await handleSaveSourceText();
    const payload = await apiRequest(`/projects/${encodeURIComponent(state.selectedProject.id)}/build-prompt`, {
      method: 'POST',
      body: { extraInstructions: '' },
    });

    const promptEl = document.getElementById('aiPrompt');
    if (promptEl) promptEl.value = payload.prompt || '';
    showToast('Pre-prompt gerado.', 'ok');
  } catch (error) {
    showToast(error.message, 'error');
  }
}

async function handleImportAi() {
  if (!state.selectedProject) return;
  try {
    await apiRequest(`/projects/${encodeURIComponent(state.selectedProject.id)}/import-ai`, {
      method: 'POST',
      body: { aiJson: document.getElementById('aiJson')?.value || '' },
    });

    showToast('Estrutura AI importada com sucesso.', 'ok');
    await refreshSelectedProject();
  } catch (error) {
    showToast(error.message, 'error');
  }
}

async function handleUploadDocument(event) {
  event.preventDefault();
  if (!state.selectedProject) return;
  const fileInput = document.getElementById('docFile');
  if (!fileInput?.files?.length) {
    showToast('Selecione um ficheiro.', 'error');
    return;
  }

  try {
    const formData = new FormData();
    formData.append('document', fileInput.files[0]);

    await apiRequest(`/projects/${encodeURIComponent(state.selectedProject.id)}/documents/upload`, {
      method: 'POST',
      body: formData,
      isForm: true,
    });

    showToast('Documento carregado.', 'ok');
    event.target.reset();
    await refreshSelectedProject();
  } catch (error) {
    showToast(error.message, 'error');
  }
}

async function handleAddMeetingMinute(event) {
  event.preventDefault();
  if (window.MinutesUI) return;
  if (!state.selectedProject) return;
  try {
    await apiRequest(`/projects/${encodeURIComponent(state.selectedProject.id)}/meeting-minutes`, {
      method: 'POST',
      body: {
        meetingDate: document.getElementById('meetingMinuteDate')?.value,
        title: document.getElementById('meetingMinuteTitle')?.value,
        rawText: document.getElementById('meetingMinuteRaw')?.value,
        impactScope: document.getElementById('meetingMinuteImpactScope')?.value || 'requirements',
      },
    });
    showToast('Ata guardada.', 'ok');
    await refreshSelectedProject();
  } catch (error) {
    showToast(error.message, 'error');
  }
}

function syncSelectedMinutesFromList() {
  if (window.MinutesUI?.syncSelectedMinutesFromList) {
    return window.MinutesUI.syncSelectedMinutesFromList();
  }
  return state.selectedMinuteIds || [];
}

async function handleBuildMinutesPrompt() {
  if (window.MinutesUI) return;
  if (!state.selectedProject) return;
  try {
    const minuteIds = syncSelectedMinutesFromList();
    const payload = await apiRequest(`/projects/${encodeURIComponent(state.selectedProject.id)}/build-minutes-prompt`, {
      method: 'POST',
      body: {
        minuteIds,
        objective: document.getElementById('minutesPromptObjective')?.value,
        extraInstructions: document.getElementById('minutesPromptExtraInstructions')?.value,
      },
    });
    const out = document.getElementById('minutesPromptOutput');
    if (out) out.value = payload.prompt || '';
    showToast('Pre-prompt gerado.', 'ok');
    if (payload.project) {
      state.selectedProject = payload.project;
      renderProjectDetails();
    }
  } catch (error) {
    showToast(error.message, 'error');
  }
}

async function handleImportRequirementChanges() {
  if (window.MinutesUI) return;
  if (!state.selectedProject) return;
  try {
    const payload = await apiRequest(`/projects/${encodeURIComponent(state.selectedProject.id)}/import-requirement-changes`, {
      method: 'POST',
      body: { changeJson: document.getElementById('requirementsChangeJson')?.value || '' },
    });
    const result = payload.result || {};
    showToast(`Alterações aplicadas: +${result.added || 0}, atualizados ${result.updated || 0}.`, 'ok');
    const jsonEl = document.getElementById('requirementsChangeJson');
    if (jsonEl) jsonEl.value = '';
    await refreshSelectedProject();
  } catch (error) {
    showToast(error.message, 'error');
  }
}

window.handleUploadDocument = handleUploadDocument;
window.handleSaveSourceText = handleSaveSourceText;
window.handleBuildPrompt = handleBuildPrompt;
window.handleImportAi = handleImportAi;

async function handleAddQuestion(event) {
  event.preventDefault();
  if (!state.selectedProject) return;

  try {
    await apiRequest(`/projects/${encodeURIComponent(state.selectedProject.id)}/questions`, {
      method: 'POST',
      body: {
        question: els.questionText.value,
        context: els.questionContext.value,
        targetRole: els.questionTargetRole.value,
        category: els.questionCategory.value,
        priority: els.questionPriority.value,
        status: els.questionStatus.value || 'open',
        deliveryStageId: els.questionDeliveryStage?.value || state.deliverySelectedStageId || 'requirements',
        dueDate: els.questionDueDate.value,
        linkedRequirementIds: splitRequirementIds(els.questionLinkedRequirementIds.value),
      },
    });

    showToast('Pergunta de clarificação guardada.', 'ok');
    event.target.reset();
    els.questionStatus.value = 'open';
    els.questionTargetRole.value = 'client';
    await refreshSelectedProject();
  } catch (error) {
    showToast(error.message, 'error');
  }
}

function readQuestionPatchFromRow(row) {
  return {
    question: row.querySelector('[data-field="question"]')?.value || '',
    context: row.querySelector('[data-field="context"]')?.value || '',
    targetRole: row.querySelector('[data-field="targetRole"]')?.value || 'client',
    status: row.querySelector('[data-field="status"]')?.value || 'open',
    priority: row.querySelector('[data-field="priority"]')?.value || 'medium',
    category: row.querySelector('[data-field="category"]')?.value || 'other',
    deliveryStageId: row.querySelector('[data-field="deliveryStageId"]')?.value || 'requirements',
    dueDate: row.querySelector('[data-field="dueDate"]')?.value || '',
    linkedRequirementIds: splitRequirementIds(row.querySelector('[data-field="linkedRequirementIds"]')?.value || ''),
    answer: row.querySelector('[data-field="answer"]')?.value || '',
  };
}

async function handleQuestionsTableClick(event) {
  if (!state.selectedProject || !canEdit()) return;
  const button = event.target.closest('button[data-action]');
  if (!button) return;
  const row = event.target.closest('tr[data-question-id]');
  if (!row) return;
  const questionId = row.getAttribute('data-question-id');
  if (!questionId) return;

  if (button.dataset.action === 'delete-question') {
    if (!confirm(`Apagar pergunta ${questionId}?`)) return;
    try {
      await apiRequest(`/projects/${encodeURIComponent(state.selectedProject.id)}/questions/${encodeURIComponent(questionId)}`, {
        method: 'DELETE',
      });
      showToast('Pergunta removida.', 'ok');
      await refreshSelectedProject();
    } catch (error) {
      showToast(error.message, 'error');
    }
    return;
  }

  if (button.dataset.action === 'save-question') {
    try {
      await apiRequest(`/projects/${encodeURIComponent(state.selectedProject.id)}/questions/${encodeURIComponent(questionId)}`, {
        method: 'PATCH',
        body: readQuestionPatchFromRow(row),
      });
      showToast('Pergunta atualizada.', 'ok');
      await refreshSelectedProject();
    } catch (error) {
      showToast(error.message, 'error');
    }
  }
}

async function handleQuestionsTableKeydown(event) {
  if (!state.selectedProject || !canEdit()) return;
  if (!(event.ctrlKey || event.metaKey) || event.key !== 'Enter') return;
  const row = event.target.closest('tr[data-question-id]');
  if (!row) return;
  const saveButton = row.querySelector('button[data-action="save-question"]');
  if (!saveButton) return;
  event.preventDefault();
  saveButton.click();
}

async function handleAddRequirement(event) {
  event.preventDefault();
  if (!state.selectedProject) return;

  try {
    await apiRequest(`/projects/${encodeURIComponent(state.selectedProject.id)}/requirements`, {
      method: 'POST',
      body: {
        type: els.reqType.value,
        title: els.reqTitle.value,
        status: els.reqStatus.value || 'draft',
        priority: els.reqPriority.value,
        phase: window.RequirementsUI?.readPhaseSelectValue?.(document.getElementById('reqPhase')) || document.getElementById('reqPhase')?.value || 'Backlog',
        module: normalizeModuleName(els.reqModule.value),
        submodule: normalizeSubmoduleName(els.reqSubmodule.value),
        relatedRequirementIds: splitRequirementIds(els.reqRelatedIds.value),
        description: els.reqDescription.value,
      },
    });

    showToast('Requisito adicionado.', 'ok');
    event.target.reset();
    await refreshSelectedProject();
  } catch (error) {
    showToast(error.message, 'error');
  }
}

async function handleClearAllRequirements() {
  if (!state.selectedProject) return;
  const count = (state.selectedProject.requirements || []).length;
  if (!count) {
    showToast('Não há requisitos para limpar.', 'ok');
    return;
  }
  const confirmed = window.confirm(`Apagar TODOS os ${count} requisitos deste projeto? Esta ação não pode ser desfeita e serve para recomeçar o processo de requisitos.`);
  if (!confirmed) return;
  try {
    await apiRequest(`/projects/${encodeURIComponent(state.selectedProject.id)}/requirements`, { method: 'DELETE' });
    showToast('Todos os requisitos foram apagados.', 'ok');
    await refreshSelectedProject();
  } catch (error) {
    showToast(error.message, 'error');
  }
}

async function handleRequirementsTableClick(event) {
  if (!state.selectedProject) return;
  const button = event.target.closest('button[data-action]');
  const row = event.target.closest('tr[data-requirement-id]');
  if (!row) return;
  const requirementId = row.getAttribute('data-requirement-id');

  if (!button) {
    if (state.selectedRequirementId !== requirementId) {
      state.selectedRequirementId = requirementId;
      renderRequirements(state.selectedProject);
    }
    return;
  }

  if (button.dataset.action === 'edit-req') {
    state.selectedRequirementId = requirementId;
    renderRequirements(state.selectedProject);
    els.requirementDetailPanel.scrollIntoView({ behavior: 'smooth', block: 'start' });
    return;
  }

  if (!canEdit()) {
    return;
  }

  if (button.dataset.action === 'delete-req') {
    if (!confirm(`Apagar requisito ${requirementId}?`)) {
      return;
    }

    try {
      await apiRequest(`/projects/${encodeURIComponent(state.selectedProject.id)}/requirements/${encodeURIComponent(requirementId)}`, {
        method: 'DELETE',
      });

      showToast('Requisito removido.', 'ok');
      await refreshSelectedProject();
    } catch (error) {
      showToast(error.message, 'error');
    }
    return;
  }

  if (button.dataset.action === 'save-req') {
    const title = row.querySelector('input[data-field="title"]')?.value || '';
    const status = row.querySelector('select[data-field="status"]')?.value || 'draft';
    const priority = row.querySelector('select[data-field="priority"]')?.value || 'medium';
    const phase = row.querySelector('input[data-field="phase"]')?.value || 'Backlog';

    try {
      await apiRequest(`/projects/${encodeURIComponent(state.selectedProject.id)}/requirements/${encodeURIComponent(requirementId)}`, {
        method: 'PATCH',
        body: { title, status, priority, phase },
      });

      showToast('Requisito atualizado.', 'ok');
      await refreshSelectedProject();
    } catch (error) {
      showToast(error.message, 'error');
    }
  }
}

async function handleAssignMember(event) {
  event.preventDefault();
  if (!state.selectedProject) return;

  try {
    await apiRequest(`/projects/${encodeURIComponent(state.selectedProject.id)}/members`, {
      method: 'POST',
      body: {
        userId: els.assignUserId.value,
        role: document.getElementById('assignMemberRole').value,
      },
    });

    showToast('Membro associado.', 'ok');
    await refreshSelectedProject();
  } catch (error) {
    showToast(error.message, 'error');
  }
}

async function handleRemoveMemberClick(event) {
  const button = event.target.closest('button[data-action="remove-member"]');
  if (!button || !state.selectedProject || !canEdit()) return;

  const userId = button.dataset.userId;
  try {
    await apiRequest(`/projects/${encodeURIComponent(state.selectedProject.id)}/members/${encodeURIComponent(userId)}`, {
      method: 'DELETE',
    });

    showToast('Membro removido.', 'ok');
    await refreshSelectedProject();
  } catch (error) {
    showToast(error.message, 'error');
  }
}

function getSelectedModulesForGeneration() {
  const checkboxes = Array.from(els.generationModules.querySelectorAll('input[type="checkbox"][data-module-generate]'));
  const selected = checkboxes
    .filter((node) => node.checked)
    .map((node) => node.getAttribute('data-module-generate'))
    .filter(Boolean);
  state.generationModulesSelected = selected;
  return selected;
}

async function handleOpenCommercialProposal() {
  if (!state.selectedProject) return;
  if (window.ProposalConfigurator?.open) {
    await window.ProposalConfigurator.open(state.selectedProject.id, {
      onGenerated: async () => {
        await refreshSelectedProject();
      },
    });
    return;
  }
  showToast('Configurador de proposta indisponível.', 'error');
}

async function handleGenerate(mode) {
  if (!state.selectedProject) return;

  try {
    const selectedModules = getSelectedModulesForGeneration();
    const payload = await apiRequest(`/projects/${encodeURIComponent(state.selectedProject.id)}/generate`, {
      method: 'POST',
      body: {
        mode,
        dryRun: els.dryRunToggle.checked,
        selectedModules,
      },
    });

    showToast('Bundle gerado com sucesso.', 'ok');

    if (mode === 'technical') {
      const outputs = payload.outputs || {};
      const list = Object.entries(outputs)
        .filter(([, value]) => value)
        .map(([key, value]) => `<a href="${escapeHtml(value)}" target="_blank" rel="noopener">${escapeHtml(key)}</a>`)
        .join(' • ');
      els.generatedLinks.innerHTML = `<div class="simple-item"><strong>Resultado</strong><div>${list || 'Sem links.'}</div></div>`;
    }

    await refreshSelectedProject();
  } catch (error) {
    showToast(error.message, 'error');
  }
}

function readRequirementDetailPatch() {
  return {
    title: els.detailReqTitle.value,
    need: els.detailReqNeed.value,
    shall: els.detailReqShall.value,
    condition: els.detailReqCondition.value,
    measure: els.detailReqMeasure.value,
    rationale: els.detailReqRationale.value,
    verification: els.detailReqVerification.value,
    assumption: els.detailReqAssumption.value,
    stakeholderRequirementLink: els.detailReqStakeholderLink.value,
    priority: els.detailReqPriority.value,
    status: els.detailReqStatus.value,
    phase: els.detailReqPhase.value,
    module: normalizeModuleName(els.detailReqModule.value),
    submodule: normalizeSubmoduleName(els.detailReqSubmodule.value),
    versionRevision: els.detailReqVersion.value,
    linkedFunctionalRequirement: els.detailReqLinkedFunctionalRequirement.value,
    businessValue: els.detailReqBusinessValue.value,
    target: els.detailReqTarget.value,
    relatedRequirementIds: splitRequirementIds(els.detailReqRelatedIds.value),
    reason: els.detailReqBusinessValue.value,
    notes: els.detailReqNotes.value,
  };
}

async function handleSaveRequirementDetails() {
  if (!state.selectedProject || !state.selectedRequirementId || !canEdit()) return;

  try {
    const res = await apiRequest(`/projects/${encodeURIComponent(state.selectedProject.id)}/requirements/${encodeURIComponent(state.selectedRequirementId)}`, {
      method: 'PATCH',
      body: readRequirementDetailPatch(),
    });

    showToast('Requisito atualizado com framework completo.', 'ok');
    applyProjectPatch(res.project, { tab: 'requisitos' });
  } catch (error) {
    showToast(error.message, 'error');
  }
}

async function handleDeleteRequirementDetails() {
  if (!state.selectedProject || !state.selectedRequirementId || !canEdit()) return;
  if (!confirm(`Apagar requisito ${state.selectedRequirementId}?`)) return;

  try {
    const res = await apiRequest(`/projects/${encodeURIComponent(state.selectedProject.id)}/requirements/${encodeURIComponent(state.selectedRequirementId)}`, {
      method: 'DELETE',
    });
    state.selectedRequirementId = null;
    showToast('Requisito removido.', 'ok');
    applyProjectPatch(res.project, { tab: 'requisitos' });
  } catch (error) {
    showToast(error.message, 'error');
  }
}

const THEME_KEY = 'requirements_platform_theme';

function themeIconSvg(theme) {
  if (theme === 'light') {
    return '<svg class="theme-icon" viewBox="0 0 24 24" aria-hidden="true"><path d="M21 12.8A9 9 0 1 1 11.2 3a7 7 0 0 0 9.8 9.8z" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/></svg>';
  }
  return '<svg class="theme-icon" viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="4" fill="none" stroke="currentColor" stroke-width="1.8"/><path d="M12 2v3M12 19v3M2 12h3M19 12h3M4.9 4.9l2.1 2.1M17 17l2.1 2.1M4.9 19.1L7 17M17 7l2.1-2.1" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/></svg>';
}

function applyThemeLogos(theme) {
  const logoMode = theme === 'light' ? 'light' : 'dark';
  [els.loginLogo, els.workspaceLogo].forEach((logoEl) => {
    if (!logoEl) return;
    const logoDark = logoEl.getAttribute('data-logo-dark');
    const logoLight = logoEl.getAttribute('data-logo-light');
    const src = logoMode === 'light' ? logoLight : logoDark;
    if (src) logoEl.setAttribute('src', src);
  });
}

function applyTheme(theme) {
  document.documentElement.setAttribute('data-theme', theme);
  if (els.themeToggleBtn) els.themeToggleBtn.innerHTML = themeIconSvg(theme);
  applyThemeLogos(theme);
  localStorage.setItem(THEME_KEY, theme);
}

function toggleTheme() {
  const current = document.documentElement.getAttribute('data-theme') || 'dark';
  applyTheme(current === 'dark' ? 'light' : 'dark');
}

function wireEvents() {
  window.HelpUI?.wireHelpEvents?.();
  els.loginForm.addEventListener('submit', handleLogin);
  els.logoutBtn.addEventListener('click', handleLogout);
  els.themeToggleBtn.addEventListener('click', toggleTheme);
  els.refreshProjectsBtn.addEventListener('click', () => loadProjects(state.selectedProjectId).catch((e) => showToast(e.message, 'error')));
  els.openSettingsBtn?.addEventListener('click', () => {
    setUserMenuOpen(false);
    switchToTab('definicoes');
  });
  els.currentProjectSwitchBtn?.addEventListener('click', () => switchToTab('projetos'));
  els.userMenuBtn?.addEventListener('click', (event) => {
    event.stopPropagation();
    const open = els.userMenuPopover?.classList.contains('hidden') === false;
    setUserMenuOpen(!open);
  });
  document.addEventListener('click', (event) => {
    if (!event.target.closest('.topbar-user-menu')) {
      setUserMenuOpen(false);
    }
  });
  document.addEventListener('click', (event) => {
    const filterBtn = event.target.closest('[data-goto-filter-tab]');
    if (filterBtn && !filterBtn.disabled) {
      event.preventDefault();
      navigateToFilteredTab(filterBtn.getAttribute('data-goto-filter-tab'), {
        deliveryStageId: filterBtn.getAttribute('data-goto-filter-stage'),
      });
      return;
    }
    const gotoBtn = event.target.closest('[data-goto-tab]');
    if (gotoBtn) {
      event.preventDefault();
      const tabId = gotoBtn.getAttribute('data-goto-tab');
      const stageId = gotoBtn.getAttribute('data-set-stage');
      if (stageId) state.deliverySelectedStageId = stageId;
      switchToTab(tabId);
      if (state.selectedProject && window.PdosUI?.renderAll) {
        window.PdosUI.renderAll(state.selectedProject);
      }
      return;
    }
    const reqLink = event.target.closest('[data-goto-requirement]');
    if (reqLink) {
      event.preventDefault();
      navigateToRequirement(reqLink.getAttribute('data-goto-requirement'));
    }
  });
  els.createProjectForm.addEventListener('submit', handleCreateProject);
  els.createUserForm.addEventListener('submit', handleCreateUser);
  els.newUserRole?.addEventListener('change', syncBudgetAccessControl);
  els.saveProjectBtn.addEventListener('click', handleSaveProject);
  els.saveAdvancedBtn.addEventListener('click', handleSaveAdvanced);
  els.addQuestionForm.addEventListener('submit', handleAddQuestion);
  els.addRequirementForm.addEventListener('submit', handleAddRequirement);
  els.clearAllRequirementsBtn?.addEventListener('click', handleClearAllRequirements);
  els.assignMemberForm.addEventListener('submit', handleAssignMember);
  els.generateTechnicalBtn.addEventListener('click', () => handleGenerate('technical'));
  els.generateCommercialBtn.addEventListener('click', handleOpenCommercialProposal);
  els.refreshActivityBtn.addEventListener('click', () => loadActivity().catch((e) => showToast(e.message, 'error')));
  els.saveRequirementDetailsBtn.addEventListener('click', handleSaveRequirementDetails);
  els.deleteRequirementDetailsBtn.addEventListener('click', handleDeleteRequirementDetails);

  els.projectList?.addEventListener('click', (event) => {
    const item = event.target.closest('[data-project-id]');
    if (!item) return;
    const projectId = item.getAttribute('data-project-id');
    loadProjectById(projectId).catch((error) => showToast(error.message, 'error'));
  });

  els.projectsPageGrid?.addEventListener('click', (event) => {
    const card = event.target.closest('[data-project-id]');
    if (!card) return;
    const projectId = card.getAttribute('data-project-id');
    loadProjectById(projectId).catch((error) => showToast(error.message, 'error'));
  });

  els.projectMembers.addEventListener('click', handleRemoveMemberClick);
  els.requirementsTable.addEventListener('click', handleRequirementsTableClick);
  els.questionsTable.addEventListener('click', handleQuestionsTableClick);
  els.questionsTable.addEventListener('keydown', handleQuestionsTableKeydown);
  els.generationModules.addEventListener('change', () => {
    state.generationModulesSelected = getSelectedModulesForGeneration();
  });
  els.reqModule.addEventListener('change', () => {
    if (!state.selectedProject) return;
    const submodules = collectSubmodules(state.selectedProject, els.reqModule.value);
    els.submoduleSuggestions.innerHTML = submodules
      .map((submoduleName) => `<option value="${escapeHtml(submoduleName)}"></option>`)
      .join('');
  });
  els.detailReqModule.addEventListener('change', () => {
    if (!state.selectedProject) return;
    const submodules = collectSubmodules(state.selectedProject, els.detailReqModule.value);
    els.submoduleSuggestions.innerHTML = submodules
      .map((submoduleName) => `<option value="${escapeHtml(submoduleName)}"></option>`)
      .join('');
  });

  const refreshRequirementsWithFilters = () => {
    state.filters.search = els.reqSearch.value || '';
    state.filters.type = els.reqFilterType.value || '';
    state.filters.status = els.reqFilterStatus.value || '';
    state.filters.module = els.reqFilterModule.value || '';
    state.filters.onlySmartIssues = Boolean(els.reqOnlySmartIssues.checked);
    if (state.selectedProject) {
      renderRequirements(state.selectedProject);
    }
  };

  els.reqSearch.addEventListener('input', refreshRequirementsWithFilters);
  els.reqFilterType.addEventListener('change', refreshRequirementsWithFilters);
  els.reqFilterStatus.addEventListener('change', refreshRequirementsWithFilters);
  els.reqFilterModule.addEventListener('change', refreshRequirementsWithFilters);
  els.reqOnlySmartIssues.addEventListener('change', refreshRequirementsWithFilters);
  els.questionFilterStatus.addEventListener('change', () => {
    state.questionFilters.status = els.questionFilterStatus.value || '';
    if (state.selectedProject) renderClarificationQuestions(state.selectedProject);
  });
  els.questionFilterTargetRole.addEventListener('change', () => {
    state.questionFilters.targetRole = els.questionFilterTargetRole.value || '';
    if (state.selectedProject) renderClarificationQuestions(state.selectedProject);
  });

  document.addEventListener('input', (event) => {
    const target = event.target;
    if (target && target.tagName === 'TEXTAREA') {
      autoResizeTextarea(target);
    }
  });

  document.addEventListener('focusin', (event) => {
    const target = event.target;
    if (!target || !target.matches('input, textarea, select')) return;
    if (window.innerWidth > 860) return;
    setTimeout(() => {
      target.scrollIntoView({ block: 'center', behavior: 'smooth' });
    }, 120);
  });
}

async function bootstrap() {
  // Restore saved theme before anything renders
  applyTheme(localStorage.getItem(THEME_KEY) || 'dark');

  wireEvents();

  try {
    await loadConfig();
  } catch (error) {
    setLoginStatus(`Falha ao carregar configuração: ${error.message}`, 'error');
    return;
  }

  if (!state.token) {
    return;
  }

  try {
    await bootstrapAppAfterLogin();
  } catch (error) {
    state.token = '';
    localStorage.removeItem(TOKEN_KEY);
    setLoginStatus(`Sessão inválida: ${error.message}`, 'error');
  }
}

bootstrap();
