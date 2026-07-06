const fs = require('fs');
const path = require('path');

const { createSqliteStore } = require('../lib/sqlite-store');
const reqHierarchy = require('../lib/requirement-hierarchy');

const projectId = 'prj_2b139f34-c3cd-4f6e-8794-da5f467a690a';
const dataDir = path.resolve(__dirname, '../data');
const projectPath = path.join(dataDir, 'projects', `${projectId}.json`);
const indexPath = path.join(dataDir, 'store-index.json');
const actor = 'codex_vmap_repair';
const now = new Date().toISOString();

function ensureArray(value) {
  return Array.isArray(value) ? value : [];
}

function textOr(...values) {
  for (const value of values) {
    const text = String(value || '').trim();
    if (text) return text;
  }
  return '';
}

function normalizeReqId(value) {
  return String(value || '').trim().replace(/\s+/g, '').toUpperCase();
}

function readJson(filePath) {
  return JSON.parse(fs.readFileSync(filePath, 'utf8'));
}

function writeJson(filePath, data) {
  fs.writeFileSync(filePath, `${JSON.stringify(data)}\n`, 'utf8');
}

function nextNumber(requirements, prefix) {
  let max = 0;
  for (const req of requirements) {
    const match = String(req?.id || '').match(new RegExp(`^${prefix}-(\\d+)$`, 'i'));
    if (match) max = Math.max(max, Number(match[1]));
  }
  return max + 1;
}

function classifyModules(seed, fallback = []) {
  const text = [
    seed?.id,
    seed?.title,
    seed?.need,
    seed?.shall,
    seed?.condition,
    seed?.measure,
    seed?.phase,
    seed?.submodule,
  ].join(' ').toLowerCase();
  const normalizeTag = (tag) => {
    const value = String(tag || '').trim();
    if (value === 'Integration') return 'Integrations';
    return value;
  };
  const tags = new Set(ensureArray(fallback).map(normalizeTag).filter(Boolean));
  const add = (tag) => tags.add(tag);

  if (/oauth|apple pay|google pay|mb\s?way|gateway|pagamento|payment|fornecedor|extern|integra|google|apple|mapa|geolocaliza|roteiro/.test(text)) {
    add('Integrations');
  }
  if (/transversal|sistema|system|seguran|fraude|auditor|performance|sla|disponibilidade|escala|compatib|conform|pci|rgpd|gdpr|integridade|idempot/.test(text)) {
    add('System');
  }
  if (/base de dados|database|dados|persist|sql|hist[oó]rico|reten/.test(text)) add('Database');
  if (/ecr[aã]|tela|interface|visual|frontend|ux|ui|p[aá]gina|dashboard|mobile|ios|android/.test(text)) add('Frontend');
  if (/api|backend|servi[cç]o|cupom|qr|valida|autentic|sess[aã]o|admin|parceiro|c[aá]lculo/.test(text)) add('Backend');

  if (!tags.size) add('Backend');
  const priority = ['System', 'Integrations', 'Database', 'Backend', 'Frontend'];
  return [...tags].sort((a, b) => {
    const ai = priority.includes(a) ? priority.indexOf(a) : priority.length;
    const bi = priority.includes(b) ? priority.indexOf(b) : priority.length;
    return ai - bi || a.localeCompare(b);
  });
}

function primaryModule(tags) {
  return ensureArray(tags)[0] || 'Backend';
}

function stakeholderTitle(req) {
  return String(req?.title || req?.need || req?.id || '')
    .replace(/^\[[^\]]+\]\[[^\]]+\]\s*/, '')
    .trim();
}

function compactTitle(value, fallback = 'requisito') {
  const text = String(value || fallback).trim();
  return text.length > 96 ? `${text.slice(0, 93)}...` : text;
}

function baseRecord({ id, type, title, parentId, stakeholderId, moduleTags, phase, shall, condition, measure, relatedRequirementIds = [] }) {
  const parentLinkType = type === 'test_case'
    ? 'verified_by'
    : type === 'non_functional'
      ? 'constrains'
      : 'decomposes_from';
  return {
    id,
    type,
    title,
    need: title,
    shall: shall || `O sistema deve ${title.charAt(0).toLowerCase()}${title.slice(1)}.`,
    condition: condition || '',
    measure: measure || '',
    rationale: '',
    verification: type === 'test_case' ? title : '',
    assumption: '',
    module: primaryModule(moduleTags),
    submodule: '',
    moduleTags,
    bodyMarkdown: '',
    description: shall || title,
    source: 'V-map repair',
    stakeholderRequirementLink: stakeholderId || '',
    priority: 'medium',
    status: 'draft',
    phase: phase || 'Backlog',
    versionRevision: '1.0',
    owner: '',
    riskComplexity: '',
    linkedFunctionalRequirement: type === 'test_case' || type === 'non_functional' ? parentId : '',
    hierarchyLinks: [{ role: 'parent', targetId: parentId, linkType: parentLinkType }],
    relatedRequirementIds: [...new Set([stakeholderId, parentId, ...relatedRequirementIds].filter(Boolean))],
    linkedDiagramIds: [],
    businessValue: '',
    target: '',
    reason: '',
    notes: 'Gerado para completar a cadeia V-cycle sem perder requisitos existentes.',
    deliveryStageId: 'requirements',
    movementHistory: [],
    createdAt: now,
    updatedAt: now,
    updatedBy: actor,
    synthesized: true,
    synthesizedForRequirementId: stakeholderId || '',
    vLevel: reqHierarchy.vLevelForType(type),
    parentId,
    parentLinkType,
  };
}

function makeLink(req, { type, parentId, stakeholderId, moduleTags, relatedRequirementIds = [] }) {
  const normalizedType = reqHierarchy.normalizeRequirementType(type || req.type) || req.type || 'functional';
  const parentLinkType = normalizedType === 'test_case'
    ? 'verified_by'
    : normalizedType === 'non_functional'
      ? 'constrains'
      : 'decomposes_from';
  const peerLinks = ensureArray(req.hierarchyLinks).filter((link) => link?.role === 'peer');
  req.type = normalizedType;
  req.parentId = parentId;
  req.parentLinkType = parentLinkType;
  req.hierarchyLinks = [
    { role: 'parent', targetId: parentId, linkType: parentLinkType },
    ...peerLinks,
  ];
  req.stakeholderRequirementLink = stakeholderId || req.stakeholderRequirementLink || '';
  req.linkedFunctionalRequirement = normalizedType === 'test_case' || normalizedType === 'non_functional'
    ? parentId
    : textOr(req.linkedFunctionalRequirement);
  req.relatedRequirementIds = [
    ...new Set([
      ...ensureArray(req.relatedRequirementIds),
      stakeholderId,
      parentId,
      ...relatedRequirementIds,
    ].filter((id) => id && normalizeReqId(id) !== normalizeReqId(req.id))),
  ];
  req.vLevel = reqHierarchy.vLevelForType(normalizedType);
  req.moduleTags = classifyModules(req, moduleTags || req.moduleTags);
  req.module = primaryModule(req.moduleTags);
  req.updatedAt = now;
  req.updatedBy = actor;
  req.notes = textOr(req.notes);
}

function ensureFunctional(requirements, byId, stakeholderId, title, tags) {
  const existing = requirements.find((req) =>
    reqHierarchy.normalizeRequirementType(req.type) === 'functional'
    && normalizeReqId(req.parentId || req.stakeholderRequirementLink) === stakeholderId
  );
  if (existing) return existing.id;

  const stakeholder = byId.get(stakeholderId);
  const id = `FR-${String(nextNumber(requirements, 'FR')).padStart(2, '0')}`;
  const moduleTags = classifyModules(stakeholder, tags || stakeholder?.moduleTags);
  const record = baseRecord({
    id,
    type: 'functional',
    title,
    parentId: stakeholderId,
    stakeholderId,
    moduleTags,
    phase: stakeholder?.phase || 'Backlog',
    shall: `O sistema deve disponibilizar suporte funcional para ${stakeholderTitle(stakeholder).toLowerCase()}.`,
  });
  requirements.push(record);
  byId.set(id, record);
  return id;
}

function ensureNonFunctional(requirements, byId, stakeholderId, functionalId) {
  const analysis = reqHierarchy.analyzeRequirementHierarchy({ requirements });
  const chain = analysis.chains.find((entry) => entry.stakeholderId === stakeholderId);
  if (chain?.non_functional > 0) return null;
  const stakeholder = byId.get(stakeholderId);
  const functional = byId.get(functionalId);
  const id = `RNF-${String(nextNumber(requirements, 'RNF')).padStart(2, '0')}`;
  const moduleTags = classifyModules(stakeholder, ['System', ...ensureArray(functional?.moduleTags)]);
  const title = `Qualidade operacional para ${compactTitle(stakeholderTitle(stakeholder))}`;
  const record = baseRecord({
    id,
    type: 'non_functional',
    title,
    parentId: functionalId,
    stakeholderId,
    moduleTags,
    phase: stakeholder?.phase || functional?.phase || 'Backlog',
    shall: `O sistema deve manter qualidade, segurança e consistência adequadas para ${stakeholderTitle(stakeholder).toLowerCase()}.`,
    condition: 'Durante a utilização normal da funcionalidade.',
    measure: 'Critérios de aceitação funcionais e não funcionais definidos para a cadeia são cumpridos sem regressões críticas.',
  });
  requirements.push(record);
  byId.set(id, record);
  return id;
}

function ensureTestCase(requirements, byId, stakeholderId, functionalId, relatedRequirementIds = []) {
  const analysis = reqHierarchy.analyzeRequirementHierarchy({ requirements });
  const chain = analysis.chains.find((entry) => entry.stakeholderId === stakeholderId);
  if (chain?.test_case > 0) return null;
  const stakeholder = byId.get(stakeholderId);
  const functional = byId.get(functionalId);
  const id = `TC-${String(nextNumber(requirements, 'TC')).padStart(2, '0')}`;
  const moduleTags = classifyModules(stakeholder, ['Tests', ...ensureArray(functional?.moduleTags)]);
  const title = `Validar ${compactTitle(stakeholderTitle(stakeholder))}`;
  const record = baseRecord({
    id,
    type: 'test_case',
    title,
    parentId: functionalId,
    stakeholderId,
    moduleTags,
    phase: stakeholder?.phase || functional?.phase || 'Backlog',
    shall: `Verificar que ${stakeholderTitle(stakeholder).toLowerCase()} funciona conforme os requisitos ligados.`,
    condition: 'Dado o fluxo principal da cadeia V-cycle.',
    measure: 'Passa quando o comportamento esperado é demonstrado e as restrições ligadas são cumpridas.',
    relatedRequirementIds,
  });
  requirements.push(record);
  byId.set(id, record);
  return id;
}

const project = readJson(projectPath);
const requirements = ensureArray(project.requirements);
const byId = new Map(requirements.map((req) => [normalizeReqId(req.id), req]));

const supportFr = {
  STK21: ensureFunctional(requirements, byId, 'STK-21', 'Autenticar com Google ou Apple', ['Frontend', 'Backend', 'Integrations']),
  STK22: ensureFunctional(requirements, byId, 'STK-22', 'Processar pagamentos integrados', ['Frontend', 'Backend', 'Integrations']),
  STK23: ensureFunctional(requirements, byId, 'STK-23', 'Reduzir fricção com autenticação e pagamentos', ['Frontend', 'System', 'Integrations']),
  STK28: ensureFunctional(requirements, byId, 'STK-28', 'Apresentar dashboard do parceiro', ['Frontend', 'Backend', 'Database']),
  STK29: ensureFunctional(requirements, byId, 'STK-29', 'Consultar histórico de validações do parceiro', ['Frontend', 'Backend', 'Database']),
  STK30: ensureFunctional(requirements, byId, 'STK-30', 'Listar cupons ativos ou recentes do parceiro', ['Frontend', 'Backend', 'Database']),
  STK31: ensureFunctional(requirements, byId, 'STK-31', 'Calcular valor gerado para o parceiro', ['System', 'Backend', 'Database']),
  STK42: ensureFunctional(requirements, byId, 'STK-42', 'Aplicar identidade visual premium transversal', ['System', 'Frontend']),
  STK43: ensureFunctional(requirements, byId, 'STK-43', 'Validar modelo básico transversal do City Pass', ['System', 'Frontend', 'Backend', 'Database']),
  STK44: ensureFunctional(requirements, byId, 'STK-44', 'Controlar segurança transversal da validação de cupons', ['System', 'Backend', 'Database']),
  STK45: ensureFunctional(requirements, byId, 'STK-45', 'Bloquear reutilização de cupom', ['System', 'Backend', 'Database']),
};

const rnfMap = {
  'RNF-01': ['FR-28', 'STK-15'],
  'RNF-02': [supportFr.STK43, 'STK-43'],
  'RNF-03': [supportFr.STK44, 'STK-44'],
  'RNF-04': [supportFr.STK22, 'STK-22'],
  'RNF-05': [supportFr.STK42, 'STK-42'],
  'RNF-06': [supportFr.STK44, 'STK-44'],
  'RNF-07': [supportFr.STK43, 'STK-43'],
  'RNF-08': [supportFr.STK43, 'STK-43'],
  'RNF-09': ['FR-75', 'STK-38'],
  'RNF-10': [supportFr.STK44, 'STK-44'],
  'RNF-11': [supportFr.STK44, 'STK-44'],
  'RNF-12': [supportFr.STK22, 'STK-22'],
  'RNF-13': ['FR-02', 'STK-01'],
  'RNF-15': ['FR-03', 'STK-01'],
  'RNF-16': ['FR-04', 'STK-02'],
  'RNF-17': ['FR-06', 'STK-04'],
  'RNF-18': ['FR-10', 'STK-06'],
  'RNF-19': ['FR-12', 'STK-07'],
  'RNF-20': [supportFr.STK45, 'STK-45'],
  'RNF-21': ['FR-29', 'STK-15'],
  'RNF-22': ['FR-31', 'STK-16'],
  'RNF-23': [supportFr.STK45, 'STK-45'],
  'RNF-24': ['FR-38', 'STK-26'],
  'RNF-25': ['FR-42', 'STK-32'],
  'RNF-26': [supportFr.STK44, 'STK-44'],
  'RNF-27': ['FR-55', 'STK-37'],
  'RNF-28': [supportFr.STK43, 'STK-43'],
  'RNF-29': ['FR-57', 'STK-18'],
  'RNF-30': ['FR-62', 'STK-18'],
  'RNF-31': ['FR-63', 'STK-19'],
  'RNF-32': [supportFr.STK21, 'STK-21'],
  'RNF-33': [supportFr.STK22, 'STK-22'],
  'RNF-34': [supportFr.STK28, 'STK-28'],
  'RNF-35': [supportFr.STK29, 'STK-29'],
};

for (const [id, [parentId, stakeholderId]] of Object.entries(rnfMap)) {
  const req = byId.get(id);
  if (!req || !parentId) continue;
  makeLink(req, {
    type: 'non_functional',
    parentId,
    stakeholderId,
    moduleTags: classifyModules(req, ensureArray(byId.get(stakeholderId)?.moduleTags)),
  });
}

const tcMap = {
  'TC-67': ['FR-28', 'STK-15', ['RNF-01']],
  'TC-68': [supportFr.STK43, 'STK-43', ['RNF-02']],
  'TC-69': [supportFr.STK44, 'STK-44', ['RNF-03']],
  'TC-70': [supportFr.STK22, 'STK-22', ['RNF-04', 'RNF-33']],
  'TC-72': [supportFr.STK44, 'STK-44', ['RNF-06']],
  'TC-73': [supportFr.STK43, 'STK-43', ['RNF-07']],
  'TC-74': [supportFr.STK43, 'STK-43', ['RNF-08']],
  'TC-75': ['FR-75', 'STK-38', ['RNF-09']],
  'TC-77': [supportFr.STK44, 'STK-44', ['RNF-11']],
  'TC-78': [supportFr.STK22, 'STK-22', ['RNF-12']],
};

for (const [id, [parentId, stakeholderId, related]] of Object.entries(tcMap)) {
  const req = byId.get(id);
  if (!req || !parentId) continue;
  makeLink(req, {
    type: 'test_case',
    parentId,
    stakeholderId,
    moduleTags: classifyModules(req, ['Tests', ...ensureArray(byId.get(parentId)?.moduleTags)]),
    relatedRequirementIds: related,
  });
}

// Ensure every stakeholder has at least one FR, RNF and TC so the V-map is complete and actionable.
let createdRnf = 0;
let createdTc = 0;
let createdFr = 0;
let changed = true;
while (changed) {
  changed = false;
  const analysis = reqHierarchy.analyzeRequirementHierarchy({ ...project, requirements });
  for (const chain of analysis.incompleteChains) {
    const stakeholder = byId.get(chain.stakeholderId);
    if (!stakeholder) continue;
    let functionalId = requirements.find((req) =>
      reqHierarchy.normalizeRequirementType(req.type) === 'functional'
      && normalizeReqId(req.parentId || req.stakeholderRequirementLink) === chain.stakeholderId
    )?.id;
    if (!functionalId) {
      functionalId = ensureFunctional(
        requirements,
        byId,
        chain.stakeholderId,
        `Implementar suporte para ${compactTitle(stakeholderTitle(stakeholder))}`,
        classifyModules(stakeholder, stakeholder.moduleTags),
      );
      createdFr += 1;
      changed = true;
    }
    if (chain.missing.includes('non_functional')) {
      const id = ensureNonFunctional(requirements, byId, chain.stakeholderId, functionalId);
      if (id) {
        createdRnf += 1;
        changed = true;
      }
    }
    if (chain.missing.includes('test_case')) {
      const related = requirements
        .filter((req) => normalizeReqId(req.parentId) === normalizeReqId(functionalId))
        .map((req) => req.id);
      const id = ensureTestCase(requirements, byId, chain.stakeholderId, functionalId, related);
      if (id) {
        createdTc += 1;
        changed = true;
      }
    }
  }
}

// Re-sync legacy hierarchy fields and refresh module primary values.
project.requirements = requirements.map((req) => {
  const tags = classifyModules(req, req.moduleTags);
  return reqHierarchy.syncRequirementHierarchyFields({
    ...req,
    moduleTags: tags,
    module: primaryModule(tags),
    updatedAt: req.updatedAt || now,
  }, reqHierarchy.buildIdIndex(requirements));
});

project.updatedAt = now;
project.storageHybrid = true;
project.requirementsInDb = true;
project.requirementCount = project.requirements.length;

writeJson(projectPath, project);

const index = readJson(indexPath);
index.meta = index.meta || {};
index.meta.updatedAt = now;
const entry = ensureArray(index.projects).find((item) => item.id === projectId);
if (entry) {
  entry.updatedAt = now;
  entry.requirementCount = project.requirements.length;
}
writeJson(indexPath, index);

const sqliteStore = createSqliteStore({ dataDir });
sqliteStore.saveRequirements(project.id, project.requirements);
const saved = sqliteStore.verifyRequirementsSaved(project.id, project.requirements);
sqliteStore.close();

const finalAnalysis = reqHierarchy.analyzeRequirementHierarchy(project);
console.log(JSON.stringify({
  projectId,
  totalRequirements: project.requirements.length,
  savedToSqlite: saved,
  createdFr,
  createdRnf,
  createdTc,
  stats: finalAnalysis.stats,
  orphanCount: finalAnalysis.orphans.length,
  invalidLinkCount: finalAnalysis.invalidLinks.length,
}, null, 2));
