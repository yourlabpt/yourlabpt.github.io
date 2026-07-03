(function () {
  function ensureArray(value) {
    return Array.isArray(value) ? value : [];
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

  function parsePhaseNumber(value) {
    const raw = String(value || '').trim();
    if (!raw) return null;

    let match = raw.match(/^F(\d{1,2})$/i);
    if (match) return Number(match[1]);

    match = raw.match(/^phase[_-]?(\d{1,2})(?:\b|$)/i);
    if (match) return Number(match[1]);

    match = raw.match(/\b(?:fase|phase)\s*(\d{1,2})\b/i);
    if (match) return Number(match[1]);

    if (/^\d{1,2}$/.test(raw)) return Number(raw);

    return null;
  }

  function planPhaseName(phase) {
    return String(phase?.name || '').trim();
  }

  function buildPlanPhaseLookup(planPhases) {
    const byOrder = new Map();
    const byName = new Map();
    const byId = new Map();

    ensureArray(planPhases).forEach((phase, index) => {
      const orderNum = index + 1;
      const name = planPhaseName(phase);
      const id = String(phase?.id || '').trim();

      byOrder.set(orderNum, phase);
      if (name) byName.set(normalizeForCompare(name), phase);

      if (id) {
        byId.set(normalizeForCompare(id), phase);
        const idNum = parsePhaseNumber(id);
        if (idNum && !byOrder.has(idNum)) byOrder.set(idNum, phase);
      }

      const nameNum = parsePhaseNumber(name);
      if (nameNum && !byOrder.has(nameNum)) byOrder.set(nameNum, phase);
    });

    return { byOrder, byName, byId };
  }

  function resolveRequirementPhase(req, planPhases) {
    const plan = ensureArray(planPhases);
    if (!plan.length) return null;

    const current = String(req?.phase || '').trim();
    if (!current) return null;

    const { byOrder, byName, byId } = buildPlanPhaseLookup(plan);
    const token = normalizeForCompare(current);

    if (byName.has(token)) return planPhaseName(byName.get(token));
    if (byId.has(token)) return planPhaseName(byId.get(token));

    const num = parsePhaseNumber(current);
    if (num && byOrder.has(num)) return planPhaseName(byOrder.get(num));

    return null;
  }

  function effectiveRequirementPhase(req, project) {
    return resolveRequirementPhase(req, project?.phases)
      || String(req?.phase || 'Backlog').trim()
      || 'Backlog';
  }

  function needsRequirementsPhaseSync(project) {
    const plan = ensureArray(project?.phases);
    if (!plan.length) return false;

    for (const req of ensureArray(project?.requirements)) {
      const resolved = resolveRequirementPhase(req, plan);
      if (!resolved) continue;
      const current = String(req?.phase || '').trim();
      if (normalizeForCompare(current) !== normalizeForCompare(resolved)) return true;
    }
    return false;
  }

  function planPhaseNames(project) {
    const names = ensureArray(project?.phases)
      .map((phase) => planPhaseName(phase))
      .filter(Boolean);
    return names.length ? names : ['Backlog'];
  }

  window.PhaseSync = {
    parsePhaseNumber,
    resolveRequirementPhase,
    effectiveRequirementPhase,
    needsRequirementsPhaseSync,
    planPhaseNames,
    normalizeForCompare,
  };
})();
