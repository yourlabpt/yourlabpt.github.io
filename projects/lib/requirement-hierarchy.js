/**
 * V-cycle requirement hierarchy: stakeholder-driven decomposition tree.
 */
const crypto = require('crypto');

const V_LEVELS = [
  { id: 'stakeholder', label: 'Stakeholder', level: 0, prefix: 'STK' },
  { id: 'functional', label: 'Funcional', level: 1, prefix: 'FR' },
  { id: 'non_functional', label: 'Não funcional', level: 2, prefix: 'RNF' },
  { id: 'test_case', label: 'Teste / Aceite', level: 3, prefix: 'TC' },
];

const LINK_TYPES = {
  decomposes_from: 'decomposes_from',
  constrains: 'constrains',
  verified_by: 'verified_by',
  peer: 'peer',
};

const STAKEHOLDER_CHILD_TYPES = new Set(['functional', 'non_functional', 'undefined', 'out_of_scope']);
const REQUIRES_STK = new Set(['functional', 'non_functional', 'test_case', 'undefined']);

function textOr(value, fallback = '') {
  const v = value === null || value === undefined ? '' : String(value).trim();
  return v || fallback;
}

function ensureArray(value) {
  return Array.isArray(value) ? value : [];
}

function normalizeRequirementType(type) {
  const value = String(type || '').trim().toLowerCase();
  if (value === 'functional' || value === 'functional_requirement' || value === 'fr') return 'functional';
  if (value === 'non_functional' || value === 'nonfunctional' || value === 'non-functional' || value === 'nfr') return 'non_functional';
  if (value === 'stakeholder' || value === 'stakeholder_requirement' || value === 'sr') return 'stakeholder';
  if (value === 'test_case' || value === 'testcase' || value === 'test-case') return 'test_case';
  if (value === 'undefined') return 'undefined';
  if (value === 'out_of_scope' || value === 'out-of-scope') return 'out_of_scope';
  return null;
}

function normalizeRequirementIdToken(value) {
  return String(value || '').trim().replace(/\s+/g, '').toUpperCase();
}

function vLevelForType(type) {
  const t = normalizeRequirementType(type) || type;
  const row = V_LEVELS.find((entry) => entry.id === t);
  if (row) return row.level;
  if (t === 'undefined' || t === 'out_of_scope') return 1;
  return 1;
}

function prefixForType(type) {
  const t = normalizeRequirementType(type) || 'functional';
  return V_LEVELS.find((entry) => entry.id === t)?.prefix || 'REQ';
}

function buildIdIndex(requirements) {
  const byId = new Map();
  const aliasToId = new Map();
  for (const req of ensureArray(requirements)) {
    const id = normalizeRequirementIdToken(req?.id);
    if (!id) continue;
    byId.set(id, req);
    aliasToId.set(id, id);
    // SR-001 -> also match STK-01 style
    const m = id.match(/^(STK|SR|FR|RNF|TC|UQ|OOS)-(\d+)$/i);
    if (m) {
      const num = String(Number(m[2]));
      aliasToId.set(`${m[1]}-${m[2]}`, id);
      aliasToId.set(`${m[1]}-${num.padStart(2, '0')}`, id);
      if (m[1].toUpperCase() === 'SR') {
        aliasToId.set(`STK-${m[2]}`, id);
        aliasToId.set(`STK-${num.padStart(2, '0')}`, id);
      }
      if (m[1].toUpperCase() === 'STK') {
        aliasToId.set(`SR-${m[2]}`, id);
        aliasToId.set(`SR-${num.padStart(2, '0')}`, id);
      }
    }
  }
  return { byId, aliasToId };
}

function resolveRequirementId(rawId, index) {
  const token = normalizeRequirementIdToken(rawId);
  if (!token) return '';
  if (index.byId.has(token)) return token;
  if (index.aliasToId.has(token)) return index.aliasToId.get(token);
  return token;
}

function normalizeHierarchyLink(raw) {
  if (!raw || typeof raw !== 'object') return null;
  const targetId = normalizeRequirementIdToken(raw.targetId);
  if (!targetId) return null;
  const linkType = textOr(raw.linkType, raw.role === 'parent' ? LINK_TYPES.decomposes_from : LINK_TYPES.peer);
  return {
    role: textOr(raw.role, linkType === LINK_TYPES.peer ? 'peer' : 'parent'),
    targetId,
    linkType,
  };
}

function inferParentLinkType(childType, parentIdToken) {
  const t = normalizeRequirementType(childType) || 'functional';
  const prefix = String(parentIdToken || '').replace(/-.*$/, '').toUpperCase();
  if (t === 'test_case') return LINK_TYPES.verified_by;
  if (t === 'non_functional') {
    if (prefix === 'FR') return LINK_TYPES.constrains;
    return LINK_TYPES.decomposes_from;
  }
  return LINK_TYPES.decomposes_from;
}

function hierarchyLinksFromLegacy(req) {
  const type = normalizeRequirementType(req?.type) || 'functional';
  const links = ensureArray(req?.hierarchyLinks).map(normalizeHierarchyLink).filter(Boolean);

  const parentStk = textOr(req?.stakeholderRequirementLink);
  const parentFr = textOr(req?.linkedFunctionalRequirement);
  const rawParentId = textOr(req?.parentId);

  const pushParent = (targetId, linkType) => {
    const token = normalizeRequirementIdToken(targetId);
    if (!token) return;
    if (links.some((l) => l.role === 'parent' && l.targetId === token)) return;
    links.push({ role: 'parent', targetId: token, linkType });
  };

  if (parentStk) {
    pushParent(parentStk, LINK_TYPES.decomposes_from);
  }
  if (parentFr && type === 'test_case') {
    pushParent(parentFr, LINK_TYPES.verified_by);
  }
  if (parentFr && type === 'non_functional') {
    pushParent(parentFr, LINK_TYPES.constrains);
  }
  if (rawParentId) {
    pushParent(rawParentId, inferParentLinkType(type, rawParentId));
  }

  const seen = new Set();
  const deduped = [];
  for (const link of links) {
    const key = `${link.role}:${link.linkType}:${link.targetId}`;
    if (seen.has(key)) continue;
    seen.add(key);
    deduped.push(link);
  }
  return deduped;
}

function parentLinkForType(links, type) {
  const t = normalizeRequirementType(type) || type;
  if (t === 'test_case') {
    return links.find((l) => l.role === 'parent' && l.linkType === LINK_TYPES.verified_by)
      || links.find((l) => l.role === 'parent');
  }
  if (t === 'non_functional') {
    return links.find((l) => l.role === 'parent' && l.linkType === LINK_TYPES.constrains)
      || links.find((l) => l.role === 'parent' && l.linkType === LINK_TYPES.decomposes_from)
      || links.find((l) => l.role === 'parent');
  }
  return links.find((l) => l.role === 'parent' && l.linkType === LINK_TYPES.decomposes_from)
    || links.find((l) => l.role === 'parent');
}

function peerIdsFromRelated(relatedIds, parentIds) {
  const parentSet = new Set(parentIds.map(normalizeRequirementIdToken));
  return ensureArray(relatedIds)
    .map(normalizeRequirementIdToken)
    .filter((id) => id && !parentSet.has(id));
}

function syncRequirementHierarchyFields(req, index) {
  const type = normalizeRequirementType(req?.type) || 'functional';
  let links = hierarchyLinksFromLegacy(req).map((link) => ({
    ...link,
    targetId: resolveRequirementId(link.targetId, index) || link.targetId,
  }));

  const parent = parentLinkForType(links, type);
  const parentIds = links.filter((l) => l.role === 'parent').map((l) => l.targetId);
  const peers = peerIdsFromRelated(req?.relatedRequirementIds, [
    ...parentIds,
    textOr(req?.stakeholderRequirementLink),
    textOr(req?.linkedFunctionalRequirement),
  ]);

  links = [
    ...links.filter((l) => l.role === 'parent'),
    ...peers.map((targetId) => ({ role: 'peer', targetId, linkType: LINK_TYPES.peer })),
  ];

  const stakeholderRequirementLink = type === 'functional' || type === 'non_functional' || type === 'undefined'
    ? (links.find((l) => l.role === 'parent' && l.linkType === LINK_TYPES.decomposes_from)?.targetId || '')
    : textOr(req?.stakeholderRequirementLink);
  const linkedFunctionalRequirement = type === 'test_case'
    ? (links.find((l) => l.role === 'parent' && l.linkType === LINK_TYPES.verified_by)?.targetId || '')
    : type === 'non_functional'
      ? (links.find((l) => l.role === 'parent' && l.linkType === LINK_TYPES.constrains)?.targetId || textOr(req?.linkedFunctionalRequirement))
      : textOr(req?.linkedFunctionalRequirement);

  const relatedRequirementIds = [
    ...peers,
    ...(stakeholderRequirementLink ? [stakeholderRequirementLink] : []),
    ...(linkedFunctionalRequirement ? [linkedFunctionalRequirement] : []),
  ].filter((id, i, arr) => arr.indexOf(id) === i && normalizeRequirementIdToken(id) !== normalizeRequirementIdToken(req?.id));

  return {
    ...req,
    type,
    hierarchyLinks: links,
    stakeholderRequirementLink,
    linkedFunctionalRequirement,
    relatedRequirementIds,
    vLevel: vLevelForType(type),
    parentId: parent?.targetId || '',
    parentLinkType: parent?.linkType || '',
  };
}

function getStakeholderAncestorId(req, index, depth = 0) {
  if (depth > 8) return '';
  const type = normalizeRequirementType(req?.type);
  if (type === 'stakeholder') return normalizeRequirementIdToken(req?.id);
  const links = hierarchyLinksFromLegacy(req);
  const parent = parentLinkForType(links, type);
  if (!parent?.targetId) return '';
  const parentReq = index.byId.get(resolveRequirementId(parent.targetId, index));
  if (!parentReq) return '';
  const pType = normalizeRequirementType(parentReq.type);
  if (pType === 'stakeholder') return normalizeRequirementIdToken(parentReq.id);
  if (pType === 'functional' && type === 'test_case') {
    return getStakeholderAncestorId(parentReq, index, depth + 1);
  }
  if (pType === 'functional' && type === 'non_functional') {
    return getStakeholderAncestorId(parentReq, index, depth + 1);
  }
  return getStakeholderAncestorId(parentReq, index, depth + 1);
}

function analyzeRequirementHierarchy(project) {
  const requirements = ensureArray(project?.requirements);
  const index = buildIdIndex(requirements);
  const synced = requirements.map((req) => syncRequirementHierarchyFields(req, index));

  for (const req of synced) {
    index.byId.set(normalizeRequirementIdToken(req.id), req);
  }

  const stats = {
    stakeholder: 0,
    functional: 0,
    non_functional: 0,
    test_case: 0,
    other: 0,
    withStakeholderRoot: 0,
    orphans: 0,
  };

  const orphans = [];
  const invalidLinks = [];
  const nodes = [];

  for (const req of synced) {
    const type = normalizeRequirementType(req.type) || 'other';
    if (stats[type] !== undefined) stats[type] += 1;
    else stats.other += 1;

    const stkRoot = getStakeholderAncestorId(req, index);
    const needsStk = REQUIRES_STK.has(type);
    if (needsStk && !stkRoot) {
      stats.orphans += 1;
      orphans.push({
        id: req.id,
        type: req.type,
        title: req.title,
        reason: type === 'test_case' && !req.linkedFunctionalRequirement
          ? 'missing_functional_or_stakeholder_parent'
          : 'missing_stakeholder_parent',
      });
    } else if (stkRoot) {
      stats.withStakeholderRoot += 1;
    }

    for (const link of ensureArray(req.hierarchyLinks)) {
      const resolved = resolveRequirementId(link.targetId, index);
      if (!index.byId.has(resolved)) {
        invalidLinks.push({ requirementId: req.id, targetId: link.targetId, resolved, linkType: link.linkType });
      }
    }

    nodes.push({
      id: req.id,
      type: req.type,
      vLevel: req.vLevel,
      title: req.title,
      status: req.status,
      parentId: req.parentId,
      parentLinkType: req.parentLinkType,
      stakeholderRootId: stkRoot,
      moduleTags: req.moduleTags || [],
      hierarchyLinks: req.hierarchyLinks,
    });
  }

  const suggestedStakeholders = orphans
    .filter((o) => o.type !== 'stakeholder')
    .map((o) => suggestStakeholderForOrphan(synced.find((r) => r.id === o.id), project, index));

  const coveragePct = requirements.length
    ? Math.round((stats.withStakeholderRoot / requirements.length) * 100)
    : 100;

  return {
    stats: { ...stats, total: requirements.length, coveragePct },
    nodes,
    orphans,
    invalidLinks,
    suggestedStakeholders,
    levels: V_LEVELS,
  };
}

function suggestStakeholderForOrphan(req, project, index) {
  if (!req) return null;
  const requirements = ensureArray(project?.requirements);
  const prefix = 'STK';
  let max = 0;
  for (const r of requirements) {
    const id = String(r?.id || '');
    if (!id.startsWith(`${prefix}-`)) continue;
    const n = Number(id.split('-')[1]);
    if (Number.isFinite(n)) max = Math.max(max, n);
  }
  const newId = `${prefix}-${String(max + 1).padStart(2, '0')}`;
  const title = textOr(req.need, req.title, req.shall, `Obrigação de sistema para ${req.id}`);
  return {
    draftId: newId,
    forRequirementId: req.id,
    synthesized: true,
    record: {
      id: newId,
      type: 'stakeholder',
      title: title.slice(0, 120),
      need: textOr(req.need, title),
      shall: textOr(req.shall, `The system shall address: ${textOr(req.title, req.id)}`),
      status: 'draft',
      priority: req.priority || 'medium',
      phase: req.phase || 'Backlog',
      synthesized: true,
      synthesizedForRequirementId: req.id,
    },
  };
}

function buildHierarchyTree(project, options = {}) {
  const analysis = getCachedHierarchyAnalysis(project);
  const focusStakeholderId = textOr(options.focusStakeholderId);
  const focusRequirementId = textOr(options.focusRequirementId);
  const byLevel = {};
  for (const level of V_LEVELS) {
    byLevel[level.id] = [];
  }
  byLevel.other = [];

  let nodes = analysis.nodes;
  if (focusStakeholderId) {
    const focus = normalizeRequirementIdToken(focusStakeholderId);
    nodes = nodes.filter((n) => n.stakeholderRootId === focus || n.id === focus);
  }
  if (focusRequirementId) {
    const focus = normalizeRequirementIdToken(focusRequirementId);
    const allowed = new Set([focus]);
    for (const n of analysis.nodes) {
      if (n.parentId === focus) allowed.add(n.id);
    }
    nodes = nodes.filter((n) => allowed.has(n.id) || n.parentId === focus);
  }

  for (const node of nodes) {
    const type = normalizeRequirementType(node.type);
    if (byLevel[type]) byLevel[type].push(node);
    else byLevel.other.push(node);
  }

  return { ...analysis, byLevel, tree: nodes };
}

function applyHierarchyMove(requirement, patch, project) {
  const requirements = ensureArray(project?.requirements);
  const index = buildIdIndex(requirements);
  const type = normalizeRequirementType(patch.type || requirement.type) || normalizeRequirementType(requirement.type);
  let parentId = textOr(patch.parentId);
  if (patch.parentId === null) parentId = '';

  const resolvedParent = parentId ? resolveRequirementId(parentId, index) : '';
  const parentReq = resolvedParent ? index.byId.get(resolvedParent) : null;

  if (parentId && !parentReq) {
    throw new Error(`Requisito pai "${parentId}" não encontrado.`);
  }

  const links = [];
  if (type === 'test_case' && parentReq) {
    const pType = normalizeRequirementType(parentReq.type);
    if (pType !== 'functional') {
      throw new Error('Casos de teste devem ligar a um requisito funcional (FR).');
    }
    links.push({ role: 'parent', targetId: resolvedParent, linkType: LINK_TYPES.verified_by });
  } else if (parentReq && normalizeRequirementType(parentReq.type) === 'stakeholder') {
    links.push({ role: 'parent', targetId: resolvedParent, linkType: LINK_TYPES.decomposes_from });
  } else if (parentReq && type === 'non_functional') {
    const pType = normalizeRequirementType(parentReq.type);
    links.push({
      role: 'parent',
      targetId: resolvedParent,
      linkType: pType === 'stakeholder' ? LINK_TYPES.constrains : LINK_TYPES.decomposes_from,
    });
  } else if (parentReq && normalizeRequirementType(parentReq.type) === 'functional' && type === 'non_functional') {
    links.push({ role: 'parent', targetId: resolvedParent, linkType: LINK_TYPES.decomposes_from });
  }

  const peerLinks = ensureArray(requirement.hierarchyLinks)
    .filter((l) => l.role === 'peer')
    .map(normalizeHierarchyLink)
    .filter(Boolean);

  const merged = {
    ...requirement,
    type,
    hierarchyLinks: [...links, ...peerLinks],
    stakeholderRequirementLink: type !== 'stakeholder' && links.find((l) => l.linkType === LINK_TYPES.decomposes_from)
      ? links.find((l) => l.linkType === LINK_TYPES.decomposes_from).targetId
      : '',
    linkedFunctionalRequirement: type === 'test_case' && links.find((l) => l.linkType === LINK_TYPES.verified_by)
      ? links.find((l) => l.linkType === LINK_TYPES.verified_by).targetId
      : '',
  };

  return syncRequirementHierarchyFields(merged, index);
}

function repairHierarchyOrphans(project, selections = []) {
  const requirements = ensureArray(project?.requirements).slice();
  const index = buildIdIndex(requirements);
  const analysis = analyzeRequirementHierarchy({ ...project, requirements });
  const toApply = selections.length
    ? analysis.suggestedStakeholders.filter((s) => selections.includes(s.forRequirementId))
    : analysis.suggestedStakeholders;

  const created = [];
  const undo = { created: [], unlinked: [] };
  for (const suggestion of toApply) {
    if (!suggestion?.record) continue;
    const orphan = requirements.find((r) => r.id === suggestion.forRequirementId);
    if (!orphan) continue;
    if (requirements.some((r) => r.id === suggestion.draftId)) continue;

    undo.unlinked.push({
      requirementId: orphan.id,
      stakeholderRequirementLink: textOr(orphan.stakeholderRequirementLink),
      hierarchyLinks: ensureArray(orphan.hierarchyLinks).map((link) => ({ ...link })),
      parentId: textOr(orphan.parentId),
    });

    const stk = {
      ...suggestion.record,
      id: suggestion.draftId,
      hierarchyLinks: [],
      relatedRequirementIds: [],
      synthesized: true,
      synthesizedForRequirementId: orphan.id,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };
    requirements.push(stk);
    index.byId.set(stk.id, stk);
    created.push(stk.id);
    undo.created.push(stk.id);

    const idx = requirements.findIndex((r) => r.id === orphan.id);
    if (idx >= 0) {
      requirements[idx] = applyHierarchyMove(orphan, {
        type: orphan.type,
        parentId: stk.id,
      }, { ...project, requirements });
    }
  }

  return { requirements, created, repaired: toApply.length, undo };
}

function collectRepairCreatedStakeholderIds(project, activityLog = []) {
  const projectId = textOr(project?.id);
  const created = new Set();
  for (const act of ensureArray(activityLog)) {
    if (textOr(act?.projectId) !== projectId) continue;
    if (textOr(act?.action) !== 'requirement_hierarchy_repaired') continue;
    for (const id of ensureArray(act?.details?.created)) {
      const token = normalizeRequirementIdToken(id);
      if (token) created.add(token);
    }
    for (const id of ensureArray(act?.details?.undo?.created)) {
      const token = normalizeRequirementIdToken(id);
      if (token) created.add(token);
    }
  }
  for (const req of ensureArray(project?.requirements)) {
    if (normalizeRequirementType(req?.type) !== 'stakeholder') continue;
    if (req?.synthesized || textOr(req?.synthesizedForRequirementId)) {
      created.add(normalizeRequirementIdToken(req.id));
    }
  }
  return created;
}

function unlinkRequirementFromStakeholders(req, stakeholderIds, index) {
  const stkSet = stakeholderIds instanceof Set ? stakeholderIds : new Set(stakeholderIds);
  const filteredLinks = ensureArray(req?.hierarchyLinks).filter((link) => {
    if (textOr(link?.role) !== 'parent') return true;
    const targetId = normalizeRequirementIdToken(link?.targetId);
    if (textOr(link?.linkType) === LINK_TYPES.decomposes_from && stkSet.has(targetId)) return false;
    return true;
  });
  const stakeholderRequirementLink = stkSet.has(normalizeRequirementIdToken(req?.stakeholderRequirementLink))
    ? ''
    : textOr(req?.stakeholderRequirementLink);
  return syncRequirementHierarchyFields({
    ...req,
    hierarchyLinks: filteredLinks,
    stakeholderRequirementLink,
  }, index);
}

function revertStakeholderRepairs(project, options = {}) {
  const requirements = ensureArray(project?.requirements).slice();
  let stakeholderIds = options.stakeholderIds;
  if (!stakeholderIds?.length) {
    stakeholderIds = [...collectRepairCreatedStakeholderIds(project, options.activity || [])];
  }
  stakeholderIds = stakeholderIds.map(normalizeRequirementIdToken).filter(Boolean);
  const stkSet = new Set(stakeholderIds);
  if (!stkSet.size) {
    return { requirements, removed: [], unlinked: [] };
  }

  const unlinked = [];
  let index = buildIdIndex(requirements);
  for (let i = 0; i < requirements.length; i += 1) {
    const req = requirements[i];
    if (stkSet.has(normalizeRequirementIdToken(req.id))) continue;
    const before = normalizeRequirementIdToken(req.stakeholderRequirementLink);
    const updated = unlinkRequirementFromStakeholders(req, stkSet, index);
    const after = normalizeRequirementIdToken(updated.stakeholderRequirementLink);
    if (before !== after || JSON.stringify(req.hierarchyLinks) !== JSON.stringify(updated.hierarchyLinks)) {
      unlinked.push(req.id);
      requirements[i] = updated;
    }
  }

  index = buildIdIndex(requirements);
  const filtered = requirements.filter((req) => !stkSet.has(normalizeRequirementIdToken(req.id)));
  return { requirements: filtered, removed: [...stkSet], unlinked };
}

function getRevertableStakeholderRepairs(project, activityLog = []) {
  const ids = collectRepairCreatedStakeholderIds(project, activityLog);
  const index = buildIdIndex(ensureArray(project?.requirements));
  const existing = [...ids].filter((id) => index.byId.has(id));
  return {
    count: existing.length,
    stakeholderIds: existing,
    canRevert: existing.length > 0,
  };
}

function nextRequirementNumber(requirements, prefix) {
  let max = 0;
  for (const req of ensureArray(requirements)) {
    const id = String(req?.id || '');
    if (!id.startsWith(`${prefix}-`)) continue;
    const parsed = Number(id.split('-')[1]);
    if (Number.isFinite(parsed)) max = Math.max(max, parsed);
  }
  return max + 1;
}

function requirementPrefixForType(type) {
  const normalized = normalizeRequirementType(type);
  const row = V_LEVELS.find((entry) => entry.id === normalized);
  if (row) return row.prefix;
  if (normalized === 'undefined') return 'UQ';
  if (normalized === 'out_of_scope') return 'OOS';
  return 'REQ';
}

function parseRequirementSerial(id, prefix) {
  const token = normalizeRequirementIdToken(id);
  const m = token.match(new RegExp(`^${prefix}-(\\d+)$`));
  return m ? Number(m[1]) : null;
}

function normalizeReqTextKey(value) {
  return String(value || '').toLowerCase()
    .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
}

function normalizeReqDedupeKey(req) {
  const type = normalizeRequirementType(req?.type) || 'other';
  const title = normalizeReqTextKey(req?.title);
  const shall = normalizeReqTextKey(req?.shall);
  const need = normalizeReqTextKey(req?.need);
  const primary = title || shall || need || normalizeReqTextKey(req?.description);
  return primary ? `${type}::${primary}` : '';
}

function replaceRequirementIdReferences(requirements, idMap) {
  if (!idMap?.size) return requirements;
  const remap = (id) => {
    const token = normalizeRequirementIdToken(id);
    return idMap.get(token) || token;
  };

  for (let i = 0; i < requirements.length; i += 1) {
    const req = requirements[i];
    const next = { ...req };
    let changed = false;

    const selfToken = normalizeRequirementIdToken(req.id);
    if (idMap.has(selfToken)) {
      next.id = idMap.get(selfToken);
      changed = true;
    }

    if (next.stakeholderRequirementLink) {
      const mapped = remap(next.stakeholderRequirementLink);
      if (mapped !== next.stakeholderRequirementLink) {
        next.stakeholderRequirementLink = mapped;
        changed = true;
      }
    }
    if (next.linkedFunctionalRequirement) {
      const mapped = remap(next.linkedFunctionalRequirement);
      if (mapped !== next.linkedFunctionalRequirement) {
        next.linkedFunctionalRequirement = mapped;
        changed = true;
      }
    }
    if (next.synthesizedForRequirementId) {
      const mapped = remap(next.synthesizedForRequirementId);
      if (mapped !== next.synthesizedForRequirementId) {
        next.synthesizedForRequirementId = mapped;
        changed = true;
      }
    }
    if (ensureArray(next.relatedRequirementIds).length) {
      next.relatedRequirementIds = [...new Set(
        next.relatedRequirementIds.map(remap).filter(Boolean)
      )];
      changed = true;
    }
    if (ensureArray(next.hierarchyLinks).length) {
      next.hierarchyLinks = next.hierarchyLinks.map((link) => ({
        ...link,
        targetId: remap(link.targetId),
      }));
      changed = true;
    }

    if (changed) {
      requirements[i] = syncRequirementHierarchyFields(next, buildIdIndex(requirements));
    }
  }
  return requirements;
}

function renumberRequirementInProject(project, requirementId, targetSlot) {
  const requirements = ensureArray(project?.requirements).slice();
  const index = buildIdIndex(requirements);
  const reqId = resolveRequirementId(requirementId, index);
  const requirement = index.byId.get(reqId);
  if (!requirement) throw new Error(`Requisito "${requirementId}" não encontrado.`);

  const type = normalizeRequirementType(requirement.type);
  const prefix = requirementPrefixForType(type);
  if (!['STK', 'FR', 'RNF', 'TC'].includes(prefix)) {
    throw new Error('Só requisitos STK, FR, RNF e TC podem ser renumerados.');
  }

  const peers = requirements
    .filter((r) => normalizeRequirementType(r.type) === type && parseRequirementSerial(r.id, prefix) !== null)
    .sort((a, b) => parseRequirementSerial(a.id, prefix) - parseRequirementSerial(b.id, prefix));

  if (!peers.some((r) => r.id === reqId)) {
    throw new Error(`O ID ${reqId} não segue o formato ${prefix}-NN.`);
  }

  const slot = Math.max(1, Math.min(Number(targetSlot) || 1, peers.length));
  const ordered = peers.filter((r) => r.id !== reqId);
  ordered.splice(slot - 1, 0, requirement);

  const idMap = new Map();
  ordered.forEach((entry, idx) => {
    const newId = `${prefix}-${String(idx + 1).padStart(2, '0')}`;
    const oldToken = normalizeRequirementIdToken(entry.id);
    if (entry.id !== newId) idMap.set(oldToken, newId);
  });

  if (!idMap.size) {
    return { requirements, idMap, changedId: reqId };
  }

  for (let i = 0; i < requirements.length; i += 1) {
    const token = normalizeRequirementIdToken(requirements[i].id);
    if (idMap.has(token)) {
      requirements[i] = {
        ...requirements[i],
        id: idMap.get(token),
        updatedAt: new Date().toISOString(),
      };
    }
  }
  replaceRequirementIdReferences(requirements, idMap);
  const changedId = idMap.get(normalizeRequirementIdToken(reqId)) || reqId;
  return { requirements, idMap, changedId };
}

function mergeRequirementsByDedupe(existingRequirements, incomingRaw, type, normalizeRecord) {
  const normalizedType = normalizeRequirementType(type);
  const merged = ensureArray(existingRequirements).slice();
  const byDedupe = new Map();
  const byId = new Map();

  for (const req of merged) {
    byId.set(String(req.id), req);
    const key = normalizeReqDedupeKey(req);
    if (key) byDedupe.set(key, req);
  }

  let added = 0;
  let updated = 0;
  let skipped = 0;
  const prefix = requirementPrefixForType(normalizedType);

  for (const raw of ensureArray(incomingRaw)) {
    const entry = typeof raw === 'string' ? { title: raw, description: raw } : (raw || {});
    const candidate = normalizeRecord({
      ...entry,
      type: normalizedType,
      id: textOr(entry.id),
    });
    const dedupeKey = normalizeReqDedupeKey(candidate);
    const idToken = normalizeRequirementIdToken(candidate.id);
    const match = (idToken && byId.get(idToken))
      || (dedupeKey && byDedupe.get(dedupeKey))
      || null;

    if (match) {
      Object.keys(candidate).forEach((key) => {
        if (['id', 'createdAt', 'type'].includes(key)) return;
        const val = candidate[key];
        const isEmpty = val == null || val === '' || (Array.isArray(val) && val.length === 0);
        if (!isEmpty) match[key] = val;
      });
      match.updatedAt = new Date().toISOString();
      updated += 1;
      continue;
    }

    const nextNum = nextRequirementNumber(merged, prefix);
    candidate.id = `${prefix}-${String(nextNum).padStart(2, '0')}`;
    candidate.createdAt = candidate.createdAt || new Date().toISOString();
    candidate.updatedAt = new Date().toISOString();
    merged.push(candidate);
    byId.set(String(candidate.id), candidate);
    if (dedupeKey) byDedupe.set(dedupeKey, candidate);
    added += 1;
  }

  return { requirements: merged, added, updated, skipped };
}

function ensureFunctionalParentForChain(requirements, focusStakeholderId, project) {
  const focus = normalizeRequirementIdToken(focusStakeholderId);
  const chain = chainNodesForStakeholder({ requirements }, focus);
  const existingFr = chain.find((n) => n.type === 'functional');
  if (existingFr) return existingFr.id;

  const stkId = focus || chain.find((n) => n.type === 'stakeholder')?.id;
  if (!stkId) throw new Error('Crie ou seleccione um stakeholder (L0) antes de adicionar TC.');

  const frId = `FR-${String(nextRequirementNumber(requirements, 'FR')).padStart(2, '0')}`;
  let frReq = {
    id: frId,
    type: 'functional',
    title: 'Requisito funcional (suporte V-cycle)',
    need: '',
    shall: '',
    status: 'draft',
    priority: 'medium',
    phase: 'Backlog',
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };
  frReq = applyHierarchyMove(frReq, { type: 'functional', parentId: stkId }, { ...project, requirements });
  requirements.push(frReq);
  return frId;
}

function unlinkRequirementFromHierarchy(requirement, project) {
  if (normalizeRequirementType(requirement.type) === 'stakeholder') {
    throw new Error('Stakeholders (L0) não podem ser desligados da cadeia V.');
  }
  const index = buildIdIndex(project?.requirements);
  return syncRequirementHierarchyFields({
    ...requirement,
    hierarchyLinks: ensureArray(requirement.hierarchyLinks).filter((link) => link.role === 'peer'),
    stakeholderRequirementLink: '',
    linkedFunctionalRequirement: '',
    parentId: '',
  }, index);
}

function createRequirementInLayer(project, options = {}) {
  const layerType = normalizeRequirementType(options.layerType);
  if (!layerType || !['stakeholder', 'functional', 'non_functional', 'test_case'].includes(layerType)) {
    throw new Error('Camada inválida.');
  }

  const focusStakeholderId = normalizeRequirementIdToken(options.focusStakeholderId);
  const title = textOr(options.title, `${V_LEVELS.find((v) => v.id === layerType)?.label || layerType} novo`);
  let requirements = ensureArray(project?.requirements).slice();
  let parentId = '';

  if (layerType === 'functional') {
    parentId = focusStakeholderId;
    if (!parentId) {
      const stk = requirements.find((r) => normalizeRequirementType(r.type) === 'stakeholder');
      if (!stk) throw new Error('Crie um STK (L0) primeiro.');
      parentId = stk.id;
    }
  } else if (layerType !== 'stakeholder') {
    if (!focusStakeholderId) throw new Error('Seleccione um STK em foco para adicionar a esta camada.');
    parentId = layerType === 'test_case'
      ? ensureFunctionalParentForChain(requirements, focusStakeholderId, project)
      : (findDefaultParentForZone({ requirements }, layerType, focusStakeholderId)
        || focusStakeholderId);
  }

  const prefix = requirementPrefixForType(layerType);
  const newId = `${prefix}-${String(nextRequirementNumber(requirements, prefix)).padStart(2, '0')}`;
  let newReq = {
    id: newId,
    type: layerType,
    title,
    status: 'draft',
    priority: 'medium',
    phase: 'Backlog',
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };

  if (layerType === 'stakeholder') {
    requirements.push(syncRequirementHierarchyFields(newReq, buildIdIndex(requirements)));
  } else {
    newReq = applyHierarchyMove(newReq, { type: layerType, parentId }, { ...project, requirements });
    requirements.push(newReq);
  }

  if (options.targetSlot) {
    const renumbered = renumberRequirementInProject({ requirements }, newReq.id, options.targetSlot);
    requirements = renumbered.requirements;
    newReq = requirements.find((r) => r.id === renumbered.changedId) || newReq;
  }

  return { requirements, requirement: newReq, createdId: newReq.id };
}

function chainNodesForStakeholder(project, focusStakeholderId) {
  const focus = normalizeRequirementIdToken(focusStakeholderId);
  if (!focus) return [];
  const analysis = analyzeRequirementHierarchy(project);
  return analysis.nodes.filter((n) => n.stakeholderRootId === focus || n.id === focus);
}

function findDefaultParentForZone(project, zoneType, focusStakeholderId) {
  const focus = normalizeRequirementIdToken(focusStakeholderId);
  if (zoneType === 'stakeholder') return focus || '';
  const chain = chainNodesForStakeholder(project, focus);
  const frs = chain.filter((n) => n.type === 'functional');
  if (zoneType === 'functional') return focus;
  if (zoneType === 'non_functional') return frs[0]?.id || focus;
  if (zoneType === 'test_case') return frs[0]?.id || '';
  return focus;
}

function normalizeTypeForZoneDrop(sourceType, zoneType) {
  const src = normalizeRequirementType(sourceType) || sourceType;
  if (zoneType === 'functional') {
    if (src === 'undefined') return 'functional';
    if (['functional', 'non_functional'].includes(src)) return src;
  }
  if (zoneType === 'non_functional' && src === 'undefined') return 'non_functional';
  if (zoneType === 'test_case') return 'test_case';
  return src;
}

function canLinkRequirements(source, target) {
  const sourceType = normalizeRequirementType(source?.type);
  const targetType = normalizeRequirementType(target?.type);
  if (!sourceType || !targetType) return false;
  if (targetType === 'stakeholder') {
    return STAKEHOLDER_CHILD_TYPES.has(sourceType) || sourceType === 'functional' || sourceType === 'non_functional';
  }
  if (targetType === 'functional' && sourceType === 'test_case') return true;
  if (targetType === 'functional' && sourceType === 'non_functional') return true;
  if (targetType === 'stakeholder' && sourceType === 'test_case') return false;
  return false;
}

function createStakeholderForOrphan(orphan, project, requirements, index) {
  const suggestion = suggestStakeholderForOrphan(orphan, { ...project, requirements }, index);
  const stkNum = nextRequirementNumber(requirements, 'STK');
  const stkId = `STK-${String(stkNum).padStart(2, '0')}`;
  const stk = {
    ...(suggestion?.record || {}),
    id: stkId,
    type: 'stakeholder',
    hierarchyLinks: [],
    relatedRequirementIds: [],
    synthesized: true,
    synthesizedForRequirementId: orphan.id,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };
  requirements.push(stk);
  index.byId.set(stk.id, stk);
  return stkId;
}

function applyHierarchyDrop(project, requirementId, drop = {}) {
  const requirements = ensureArray(project?.requirements).slice();
  let index = buildIdIndex(requirements);
  const reqId = resolveRequirementId(requirementId, index);
  const requirement = index.byId.get(reqId);
  if (!requirement) throw new Error(`Requisito "${requirementId}" não encontrado.`);

  const zoneType = normalizeRequirementType(drop.zoneType) || textOr(drop.zoneType);
  const targetRequirementId = textOr(drop.targetRequirementId);
  const focusStakeholderId = normalizeRequirementIdToken(drop.focusStakeholderId);
  let createdStakeholderId = '';

  if (normalizeRequirementType(requirement.type) === 'stakeholder') {
    if (zoneType !== 'stakeholder') {
      throw new Error('Requisitos stakeholder (L0) só podem ser colocados na coluna STK.');
    }
    return { requirements, createdStakeholderId: '', movedRequirementId: reqId };
  }

  if (targetRequirementId) {
    const targetId = resolveRequirementId(targetRequirementId, index);
    const target = index.byId.get(targetId);
    if (!target) throw new Error(`Alvo "${targetRequirementId}" não encontrado.`);
    if (!canLinkRequirements(requirement, target)) {
      throw new Error('Ligação inválida entre estes tipos.');
    }
    const idx = requirements.findIndex((r) => r.id === reqId);
    requirements[idx] = applyHierarchyMove(requirement, {
      type: requirement.type,
      parentId: targetId,
    }, { ...project, requirements });
    return { requirements, createdStakeholderId: '', movedRequirementId: reqId };
  }

  if (!zoneType) throw new Error('Zona de destino inválida.');

  let parentId = findDefaultParentForZone({ ...project, requirements }, zoneType, focusStakeholderId);
  const needsNewStakeholder = zoneType === 'stakeholder' && !parentId;

  if (needsNewStakeholder) {
    createdStakeholderId = createStakeholderForOrphan(requirement, project, requirements, index);
    parentId = createdStakeholderId;
    index = buildIdIndex(requirements);
  } else if (!parentId && zoneType === 'test_case' && focusStakeholderId) {
    parentId = ensureFunctionalParentForChain(requirements, focusStakeholderId, project);
    index = buildIdIndex(requirements);
  } else if (!parentId) {
    throw new Error('Não foi possível determinar o requisito pai. Arraste sobre um cartão ou escolha um STK.');
  }

  const nextType = normalizeTypeForZoneDrop(requirement.type, zoneType);
  const idx = requirements.findIndex((r) => r.id === reqId);
  requirements[idx] = applyHierarchyMove(requirement, {
    type: nextType,
    parentId,
  }, { ...project, requirements });

  return { requirements, createdStakeholderId, movedRequirementId: reqId };
}

const hierarchyAnalysisCache = new Map();
const HIERARCHY_CACHE_MAX = 24;

function hierarchyCacheKey(project) {
  const requirements = ensureArray(project?.requirements);
  return `${textOr(project?.id)}:${textOr(project?.updatedAt)}:${requirements.length}`;
}

function getCachedHierarchyAnalysis(project) {
  const key = hierarchyCacheKey(project);
  if (hierarchyAnalysisCache.has(key)) {
    return hierarchyAnalysisCache.get(key);
  }
  const analysis = analyzeRequirementHierarchy(project);
  hierarchyAnalysisCache.set(key, analysis);
  if (hierarchyAnalysisCache.size > HIERARCHY_CACHE_MAX) {
    const first = hierarchyAnalysisCache.keys().next().value;
    hierarchyAnalysisCache.delete(first);
  }
  return analysis;
}

function clearHierarchyAnalysisCache(projectId) {
  if (!projectId) {
    hierarchyAnalysisCache.clear();
    return;
  }
  const prefix = `${projectId}:`;
  for (const key of hierarchyAnalysisCache.keys()) {
    if (key.startsWith(prefix)) hierarchyAnalysisCache.delete(key);
  }
}

function buildHierarchySummary(project, options = {}) {
  const analysis = getCachedHierarchyAnalysis(project);
  const stakeholders = analysis.nodes
    .filter((n) => normalizeRequirementType(n.type) === 'stakeholder')
    .map((n) => ({ id: n.id, title: n.title, status: n.status }));

  const summary = {
    stats: analysis.stats,
    levels: analysis.levels,
    byLevel: { stakeholder: stakeholders },
    stakeholderCount: stakeholders.length,
    orphanCount: analysis.orphans.length,
    suggestedCount: analysis.suggestedStakeholders.length,
    invalidLinkCount: analysis.invalidLinks.length,
  };

  if (options.includeRevertable) {
    summary.revertableRepairs = getRevertableStakeholderRepairs(project, options.activityLog || []);
  }

  return summary;
}

module.exports = {
  V_LEVELS,
  LINK_TYPES,
  normalizeRequirementType,
  normalizeRequirementIdToken,
  vLevelForType,
  buildIdIndex,
  resolveRequirementId,
  syncRequirementHierarchyFields,
  analyzeRequirementHierarchy,
  getCachedHierarchyAnalysis,
  clearHierarchyAnalysisCache,
  buildHierarchySummary,
  buildHierarchyTree,
  suggestStakeholderForOrphan,
  applyHierarchyMove,
  applyHierarchyDrop,
  repairHierarchyOrphans,
  revertStakeholderRepairs,
  getRevertableStakeholderRepairs,
  collectRepairCreatedStakeholderIds,
  hierarchyLinksFromLegacy,
  getStakeholderAncestorId,
  nextRequirementNumber,
  requirementPrefixForType,
  parseRequirementSerial,
  replaceRequirementIdReferences,
  renumberRequirementInProject,
  mergeRequirementsByDedupe,
  normalizeReqDedupeKey,
  ensureFunctionalParentForChain,
  unlinkRequirementFromHierarchy,
  createRequirementInLayer,
};
