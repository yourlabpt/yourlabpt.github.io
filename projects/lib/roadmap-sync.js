/**
 * Liga project.phases (plano #1, #2 na aba Fases) ao roadmap de implementação.
 */
const phaseSync = require('./phase-sync');

function ensureArray(value) {
  return Array.isArray(value) ? value : [];
}

function textOr(value, fallback = '') {
  return String(value ?? fallback).trim() || fallback;
}

function getPlanPhases(project) {
  const proposalGenerator = require('./proposal-generator');
  const normalized = proposalGenerator.normalizePlanPhases(project?.phases);
  if (normalized.length) return normalized;
  return [];
}

function planPhaseId(planPhase, index) {
  return textOr(planPhase?.id, `F${index + 1}`);
}

function findRoadmapPhaseForPlan(planPhase, index, roadmapPhases) {
  const pid = planPhaseId(planPhase, index);
  const byPlan = ensureArray(roadmapPhases).find((p) => p.planPhaseId === pid);
  if (byPlan) return byPlan;
  return roadmapPhases[index] || null;
}

function defaultDeliverableFromPlan(planPhase) {
  const parts = ensureArray(planPhase?.deliverables);
  if (parts.length) {
    return parts.map((d) => `- ${d}`).join('\n');
  }
  if (planPhase?.objective) {
    return `Entrega alinhada ao objetivo: ${planPhase.objective}`;
  }
  return '';
}

function assignDatesFromPlan(phases, planPhases) {
  let cursor = new Date();
  cursor.setHours(0, 0, 0, 0);
  phases.forEach((phase, index) => {
    const weeks = Number(planPhases[index]?.durationWeeks) || 0;
    if (weeks <= 0) return;
    const start = new Date(cursor);
    cursor = new Date(cursor.getTime() + weeks * 7 * 24 * 60 * 60 * 1000);
    phase.startDate = start.toISOString().slice(0, 10);
    phase.endDate = cursor.toISOString().slice(0, 10);
  });
}

function assignDependencies(phases) {
  phases.forEach((phase, index) => {
    if (index === 0) {
      phase.dependsOn = [];
      return;
    }
    phase.dependsOn = [phases[index - 1].id];
  });
}

function distributeRequirementsToRoadmap(project, roadmapPhases, planPhases) {
  roadmapPhases.forEach((p) => { p.requirementIds = []; });
  const reqs = ensureArray(project?.requirements);
  if (!reqs.length) return;

  planPhases.forEach((planPhase, index) => {
    const roadmapPhase = roadmapPhases[index];
    if (!roadmapPhase) return;
    const canonicalName = textOr(planPhase.name);
    const ids = reqs
      .filter((req) => {
        const resolved = phaseSync.resolveRequirementPhase(req, planPhases);
        if (resolved && canonicalName) return resolved === canonicalName;
        const reqPhase = textOr(req.phase);
        if (!reqPhase) return false;
        return reqPhase === canonicalName
          || reqPhase === planPhaseId(planPhase, index)
          || reqPhase.toLowerCase() === `fase ${index + 1}`;
      })
      .map((req) => req.id);
    roadmapPhase.requirementIds = [...new Set(ids)];
  });
}

function roadmapPhaseFromPlan(planPhase, index, existing) {
  const pid = planPhaseId(planPhase, index);
  const id = existing?.id || `rmp_${pid.toLowerCase().replace(/[^a-z0-9]/g, '_')}`;
  return {
    id,
    planPhaseId: pid,
    order: index,
    name: textOr(planPhase.name, `Fase ${index + 1}`),
    goalMarkdown: textOr(existing?.goalMarkdown, planPhase.objective),
    deliverableMarkdown: textOr(existing?.deliverableMarkdown, defaultDeliverableFromPlan(planPhase)),
    requirementIds: ensureArray(existing?.requirementIds),
    moduleTags: ensureArray(existing?.moduleTags),
    designPattern: textOr(existing?.designPattern),
    dependsOn: ensureArray(existing?.dependsOn),
    startDate: textOr(existing?.startDate),
    endDate: textOr(existing?.endDate),
    status: textOr(existing?.status, 'planned'),
    milestones: ensureArray(existing?.milestones),
    tests: ensureArray(existing?.tests),
    risks: ensureArray(existing?.risks),
  };
}

/**
 * Cria ou actualiza o roadmap a partir de project.phases, preservando detalhe já enriquecido.
 */
function syncRoadmapFromPlanPhases(project, options = {}) {
  const planPhases = getPlanPhases(project);
  if (!planPhases.length) {
    return { changed: false, roadmap: project.roadmap || null, message: 'Sem fases no plano de implementação.' };
  }

  const existingPhases = ensureArray(project?.roadmap?.phases);
  const phases = planPhases.map((planPhase, index) => {
    const existing = findRoadmapPhaseForPlan(planPhase, index, existingPhases);
    return roadmapPhaseFromPlan(planPhase, index, existing);
  });

  distributeRequirementsToRoadmap(project, phases, planPhases);
  if (options.assignDates !== false) {
    assignDatesFromPlan(phases, planPhases);
  }
  assignDependencies(phases);

  const summaryMarkdown = textOr(
    project?.roadmap?.summaryMarkdown,
    `Roadmap alinhado às **${phases.length} fases** definidas no plano de implementação. Cada fase herda objectivo, duração e requisitos associados (campo Fase nos requisitos).`
  );

  return {
    changed: true,
    roadmap: {
      summaryMarkdown,
      phases,
      updatedAt: new Date().toISOString(),
    },
    planPhaseCount: planPhases.length,
  };
}

function buildPlanPhasesContext(project) {
  return getPlanPhases(project).map((phase, index) => ({
    order: index + 1,
    id: planPhaseId(phase, index),
    name: phase.name,
    objective: phase.objective,
    durationWeeks: phase.durationWeeks,
    deliverables: ensureArray(phase.deliverables),
    acceptanceCriteria: ensureArray(phase.acceptanceCriteria),
    requirementCount: ensureArray(project?.requirements).filter((req) => {
      const resolved = phaseSync.resolveRequirementPhase(req, getPlanPhases(project));
      return resolved === phase.name;
    }).length,
  }));
}

module.exports = {
  getPlanPhases,
  syncRoadmapFromPlanPhases,
  buildPlanPhasesContext,
  distributeRequirementsToRoadmap,
  roadmapPhaseFromPlan,
};
