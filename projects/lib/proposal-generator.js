/**
 * Commercial proposal generation: config defaults, V-map grouping, payment milestones, MD/HTML.
 */
const phaseSync = require('./phase-sync');
const reqHierarchy = require('./requirement-hierarchy');

function ensureArray(value) {
  return Array.isArray(value) ? value : [];
}

function textOr(value, fallback = '') {
  const v = value === null || value === undefined ? '' : String(value).trim();
  return v || fallback;
}

function numberOr(value, fallback = 0) {
  const n = Number(value);
  return Number.isFinite(n) ? n : fallback;
}

function normalizeStringArray(value) {
  return ensureArray(value).map((entry) => String(entry || '').trim()).filter(Boolean);
}

function escapeHtml(value) {
  return String(value || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function truncateText(value, max = 4000) {
  const text = String(value || '').trim();
  if (text.length <= max) return text;
  return `${text.slice(0, max).trim()}…`;
}

function formatMoney(amount, currency = 'EUR') {
  const n = numberOr(amount, 0);
  try {
    return new Intl.NumberFormat('pt-PT', { style: 'currency', currency: currency || 'EUR' }).format(n);
  } catch {
    return `${n.toFixed(2)} ${currency || 'EUR'}`;
  }
}

function normalizeSummary(summary) {
  return {
    businessContext: textOr(summary?.businessContext),
    goals: normalizeStringArray(summary?.goals),
    scopeInPlainLanguage: textOr(summary?.scopeInPlainLanguage),
    solutionOverview: textOr(summary?.solutionOverview),
  };
}

function normalizeCommercialTermsNonPrice(raw) {
  return {
    validityDays: numberOr(raw?.validityDays, 30),
    warrantyDays: numberOr(raw?.warrantyDays, 30),
    exclusions: normalizeStringArray(raw?.exclusions),
    notes: normalizeStringArray(raw?.notes),
  };
}

function normalizePlanPhases(phases) {
  return ensureArray(phases)
    .map((phase, idx) => ({
      id: String(phase?.id || `F${idx + 1}`).trim(),
      name: String(phase?.name || `Fase ${idx + 1}`).trim(),
      objective: String(phase?.objective || phase?.description || '').trim(),
      durationWeeks: numberOr(phase?.durationWeeks, 0),
      deliverables: normalizeStringArray(phase?.deliverables),
      acceptanceCriteria: normalizeStringArray(phase?.acceptanceCriteria),
      assumptions: normalizeStringArray(phase?.assumptions),
    }))
    .filter((phase) => phase.name);
}

function defaultPlanPhases() {
  return [
    {
      id: 'F1',
      name: 'Fase 1 - MVP validavel',
      objective: 'Criar fluxo principal e validar valor com utilizadores reais.',
      durationWeeks: 3,
      deliverables: ['Fluxo principal operacional', 'Painel de acompanhamento inicial'],
      acceptanceCriteria: ['Fluxo principal testado ponta a ponta'],
      assumptions: ['Escopo controlado para MVP'],
    },
    {
      id: 'F2',
      name: 'Fase 2 - Operacao e relatorios',
      objective: 'Melhorar rastreabilidade, operacao e visibilidade para decisao.',
      durationWeeks: 2,
      deliverables: ['Relatorios principais', 'Refino de requisitos'],
      acceptanceCriteria: ['Indicadores por fase e status'],
      assumptions: ['Feedback da fase 1 ja recolhido'],
    },
    {
      id: 'F3',
      name: 'Fase 3 - Integracoes finais',
      objective: 'Preparar e conectar integracoes de maior valor.',
      durationWeeks: 3,
      deliverables: ['Camada de integracao', 'Testes integrados'],
      acceptanceCriteria: ['Integracoes prioritarias homologadas'],
      assumptions: ['APIs externas disponiveis'],
    },
  ];
}

function effectivePhaseName(req, planPhases) {
  return phaseSync.resolveRequirementPhase(req, planPhases)
    || String(req?.phase || 'Backlog').trim()
    || 'Backlog';
}

function reqSummaryLine(req) {
  return textOr(req?.shall, req?.need, req?.description, req?.title, '—');
}

function buildProposalConfigDefaults(project) {
  const planPhases = normalizePlanPhases(project?.phases);
  const phases = (planPhases.length ? planPhases : defaultPlanPhases()).map((phase, index) => ({
    order: index + 1,
    id: phase.id,
    name: phase.name,
    objective: phase.objective,
    durationWeeks: phase.durationWeeks,
    amount: 0,
  }));

  const commercial = normalizeCommercialTermsNonPrice(project?.commercialTerms);

  return {
    projectName: textOr(project?.name, 'Projeto'),
    clientName: textOr(project?.clientName, 'Cliente'),
    proposalCode: textOr(project?.proposalCode),
    subtitle: textOr(project?.subtitle, 'Proposta Comercial e Tecnica'),
    currency: textOr(project?.currency, 'EUR'),
    date: new Date().toISOString().slice(0, 10),
    summary: normalizeSummary(project?.summary),
    customerRequestExcerpt: truncateText(project?.sourceText || project?.summary?.scopeInPlainLanguage, 3500),
    phases,
    initialPercent: 30,
    finalPercent: 20,
    validityDays: commercial.validityDays,
    warrantyDays: commercial.warrantyDays,
    exclusions: commercial.exclusions,
    notes: commercial.notes,
  };
}

function normalizeProposalConfig(raw, project) {
  const defaults = buildProposalConfigDefaults(project);
  const phases = ensureArray(raw?.phases).length
    ? ensureArray(raw.phases).map((phase, index) => ({
      order: numberOr(phase?.order, index + 1),
      id: textOr(phase?.id, `F${index + 1}`),
      name: textOr(phase?.name, `Fase ${index + 1}`),
      objective: textOr(phase?.objective),
      durationWeeks: numberOr(phase?.durationWeeks, 0),
      amount: Math.max(0, numberOr(phase?.amount, 0)),
    }))
    : defaults.phases;

  return {
    projectName: textOr(raw?.projectName, defaults.projectName),
    clientName: textOr(raw?.clientName, defaults.clientName),
    proposalCode: textOr(raw?.proposalCode, defaults.proposalCode),
    subtitle: textOr(raw?.subtitle, defaults.subtitle),
    currency: textOr(raw?.currency, defaults.currency),
    date: textOr(raw?.date, defaults.date),
    summary: {
      businessContext: textOr(raw?.summary?.businessContext, defaults.summary.businessContext),
      goals: normalizeStringArray(raw?.summary?.goals?.length ? raw.summary.goals : defaults.summary.goals),
      scopeInPlainLanguage: textOr(raw?.summary?.scopeInPlainLanguage, defaults.summary.scopeInPlainLanguage),
      solutionOverview: textOr(raw?.summary?.solutionOverview, defaults.summary.solutionOverview),
    },
    customerRequestExcerpt: textOr(raw?.customerRequestExcerpt, defaults.customerRequestExcerpt),
    phases,
    initialPercent: Math.max(0, Math.min(100, numberOr(raw?.initialPercent, defaults.initialPercent))),
    finalPercent: Math.max(0, Math.min(100, numberOr(raw?.finalPercent, defaults.finalPercent))),
    validityDays: numberOr(raw?.validityDays, defaults.validityDays),
    warrantyDays: numberOr(raw?.warrantyDays, defaults.warrantyDays),
    exclusions: normalizeStringArray(raw?.exclusions?.length ? raw.exclusions : defaults.exclusions),
    notes: normalizeStringArray(raw?.notes?.length ? raw.notes : defaults.notes),
  };
}

function validateProposalConfig(config) {
  const errors = [];
  const phases = ensureArray(config?.phases);
  if (!phases.length) errors.push('Defina pelo menos uma fase.');
  const total = phases.reduce((sum, p) => sum + numberOr(p.amount, 0), 0);
  if (total <= 0) errors.push('O valor total deve ser superior a zero.');
  const initial = numberOr(config?.initialPercent, 0);
  const final = numberOr(config?.finalPercent, 0);
  if (initial + final > 100) errors.push('A soma dos percentuais inicial e final nao pode exceder 100%.');
  if (initial < 0 || final < 0) errors.push('Percentuais invalidos.');
  const seen = new Set();
  for (const phase of phases) {
    const token = phaseSync.normalizeForCompare(phase.name);
    if (seen.has(token)) errors.push(`Nome de fase duplicado: ${phase.name}`);
    seen.add(token);
  }
  return { valid: !errors.length, errors, total };
}

function computePaymentMilestones(config) {
  const phases = ensureArray(config?.phases);
  const currency = textOr(config?.currency, 'EUR');
  const total = phases.reduce((sum, p) => sum + numberOr(p.amount, 0), 0);
  const initialPercent = numberOr(config?.initialPercent, 30);
  const finalPercent = numberOr(config?.finalPercent, 20);
  const middlePercent = Math.max(0, 100 - initialPercent - finalPercent);

  const initialAmount = Math.round((total * initialPercent) / 100 * 100) / 100;
  const finalAmount = Math.round((total * finalPercent) / 100 * 100) / 100;
  const middlePool = Math.max(0, Math.round((total * middlePercent) / 100 * 100) / 100);

  const weights = phases.map((p) => {
    const amount = numberOr(p.amount, 0);
    if (amount > 0) return amount;
    return Math.max(numberOr(p.durationWeeks, 0), 1);
  });
  const weightSum = weights.reduce((a, b) => a + b, 0) || phases.length || 1;

  const milestones = [
    {
      key: 'initial',
      label: 'Pagamento inicial (adjudicacao)',
      trigger: 'Assinatura do contrato',
      percent: initialPercent,
      amount: initialAmount,
    },
  ];

  let allocatedMiddle = 0;
  phases.forEach((phase, index) => {
    const share = weightSum ? (weights[index] / weightSum) : (1 / (phases.length || 1));
    let amount = Math.round(middlePool * share * 100) / 100;
    if (index === phases.length - 1) {
      amount = Math.round((middlePool - allocatedMiddle) * 100) / 100;
    }
    allocatedMiddle += amount;
    milestones.push({
      key: `phase_${phase.order || index + 1}`,
      label: `Entrega — #${phase.order || index + 1} ${phase.name}`,
      trigger: `Conclusao e aceitacao da fase ${phase.order || index + 1}`,
      percent: total ? Math.round((amount / total) * 1000) / 10 : 0,
      amount,
      phaseOrder: phase.order || index + 1,
    });
  });

  milestones.push({
    key: 'final',
    label: 'Pagamento final',
    trigger: 'Entrega definitiva e aceitacao final do projecto',
    percent: finalPercent,
    amount: finalAmount,
  });

  const milestoneTotal = milestones.reduce((sum, m) => sum + numberOr(m.amount, 0), 0);
  const roundingDelta = Math.round((total - milestoneTotal) * 100) / 100;
  if (milestones.length && roundingDelta !== 0) {
    milestones[milestones.length - 1].amount = Math.round((milestones[milestones.length - 1].amount + roundingDelta) * 100) / 100;
  }

  return { total, currency, milestones, initialPercent, finalPercent, middlePercent };
}

function groupRequirementsByPhaseAndVMap(project) {
  const planPhases = normalizePlanPhases(project?.phases);
  const phases = planPhases.length ? planPhases : defaultPlanPhases();
  const requirements = ensureArray(project?.requirements);
  const hierarchy = reqHierarchy.analyzeRequirementHierarchy(project);
  const nodeById = new Map(hierarchy.nodes.map((n) => [reqHierarchy.normalizeRequirementIdToken(n.id), n]));
  const reqById = new Map(requirements.map((r) => [reqHierarchy.normalizeRequirementIdToken(r.id), r]));

  return phases.map((planPhase, index) => {
    const phaseName = planPhase.name;
    const phaseReqs = requirements.filter((req) => {
      const effective = effectivePhaseName(req, phases);
      return phaseSync.normalizeForCompare(effective) === phaseSync.normalizeForCompare(phaseName);
    });

    const phaseReqIds = new Set(phaseReqs.map((r) => reqHierarchy.normalizeRequirementIdToken(r.id)));
    const stkIds = new Set();

    for (const req of phaseReqs) {
      const type = reqHierarchy.normalizeRequirementType(req.type);
      if (type === 'stakeholder') {
        stkIds.add(reqHierarchy.normalizeRequirementIdToken(req.id));
        continue;
      }
      const node = nodeById.get(reqHierarchy.normalizeRequirementIdToken(req.id));
      if (node?.stakeholderRootId) stkIds.add(node.stakeholderRootId);
    }

    const trees = [];
    const orphanReqs = [];

    for (const stkId of [...stkIds].sort()) {
      const stkReq = reqById.get(stkId);
      const stkNode = nodeById.get(stkId);
      if (!stkReq && !stkNode) continue;

      const functional = [];
      for (const req of phaseReqs) {
        if (reqHierarchy.normalizeRequirementType(req.type) !== 'functional') continue;
        const node = nodeById.get(reqHierarchy.normalizeRequirementIdToken(req.id));
        const root = node?.stakeholderRootId || '';
        const parentId = node?.parentId || '';
        if (root === stkId || parentId === stkId || reqHierarchy.normalizeRequirementIdToken(req.id) === stkId) {
          const frId = reqHierarchy.normalizeRequirementIdToken(req.id);
          const rnfs = phaseReqs.filter((r) => {
            if (reqHierarchy.normalizeRequirementType(r.type) !== 'non_functional') return false;
            const n = nodeById.get(reqHierarchy.normalizeRequirementIdToken(r.id));
            return n?.parentId === frId || n?.stakeholderRootId === stkId;
          });
          const tcs = phaseReqs.filter((r) => {
            if (reqHierarchy.normalizeRequirementType(r.type) !== 'test_case') return false;
            const n = nodeById.get(reqHierarchy.normalizeRequirementIdToken(r.id));
            return n?.parentId === frId;
          });
          functional.push({ fr: req, rnfs, tcs });
        }
      }

      const orphanFrs = phaseReqs.filter((req) => {
        if (reqHierarchy.normalizeRequirementType(req.type) !== 'functional') return false;
        const node = nodeById.get(reqHierarchy.normalizeRequirementIdToken(req.id));
        return !node?.stakeholderRootId && !node?.parentId;
      });

      trees.push({
        stk: stkReq || { id: stkId, title: stkNode?.title || stkId, type: 'stakeholder' },
        functional,
        orphanFrs,
      });
    }

    for (const req of phaseReqs) {
      const id = reqHierarchy.normalizeRequirementIdToken(req.id);
      if (phaseReqIds.has(id)) {
        const type = reqHierarchy.normalizeRequirementType(req.type);
        const node = nodeById.get(id);
        const inTree = type === 'stakeholder' && stkIds.has(id);
        const inFunctional = trees.some((t) => t.functional.some((f) => reqHierarchy.normalizeRequirementIdToken(f.fr.id) === id));
        if (!inTree && !inFunctional && (type === 'undefined' || type === 'out_of_scope' || !node?.stakeholderRootId)) {
          orphanReqs.push(req);
        }
      }
    }

    return {
      phaseOrder: index + 1,
      phaseName,
      objective: planPhase.objective,
      durationWeeks: planPhase.durationWeeks,
      deliverables: planPhase.deliverables,
      trees,
      orphans: orphanReqs,
      requirementCount: phaseReqs.length,
    };
  });
}

function buildProposalContent(project, config) {
  const payment = computePaymentMilestones(config);
  const phaseGroups = groupRequirementsByPhaseAndVMap(project);
  return { payment, phaseGroups };
}

function renderListMarkdown(items, empty = 'N/A') {
  const list = normalizeStringArray(items);
  if (!list.length) return `- ${empty}`;
  return list.map((item) => `- ${item}`).join('\n');
}

function renderRequirementMd(req, indent = '') {
  const title = textOr(req?.title, req?.id);
  const line = `${indent}- **${textOr(req?.id)} — ${title}**`;
  const detail = reqSummaryLine(req);
  const measure = textOr(req?.measure);
  const parts = [line];
  if (detail) parts.push(`${indent}  - ${detail}`);
  if (measure) parts.push(`${indent}  - Criterios: ${measure}`);
  return parts.join('\n');
}

function renderProposalMarkdown(project, config) {
  const content = buildProposalContent(project, config);
  const { payment, phaseGroups } = content;
  const summary = config.summary || {};
  const lines = [];

  lines.push(`# ${config.projectName}`);
  lines.push('');
  lines.push(`**${config.subtitle}**`);
  lines.push('');
  lines.push(`- Cliente: ${config.clientName}`);
  lines.push(`- Data: ${config.date}`);
  if (config.proposalCode) lines.push(`- Codigo: ${config.proposalCode}`);
  lines.push('');

  lines.push('## Objetivo e contexto');
  lines.push(textOr(summary.businessContext, 'Nao informado.'));
  lines.push('');
  lines.push('### Objetivos');
  lines.push(renderListMarkdown(summary.goals, 'Sem objetivos definidos.'));
  lines.push('');
  if (summary.solutionOverview) {
    lines.push('### Visao da solucao');
    lines.push(summary.solutionOverview);
    lines.push('');
  }

  lines.push('## Pedido do cliente');
  lines.push(textOr(config.customerRequestExcerpt, textOr(summary.scopeInPlainLanguage, 'Nao informado.')));
  lines.push('');

  lines.push('## Plano de implementacao');
  lines.push('| Fase | Nome | Semanas | Objetivo |');
  lines.push('| --- | --- | ---: | --- |');
  for (const phase of config.phases) {
    lines.push(`| #${phase.order} | ${phase.name} | ${phase.durationWeeks || '—'} | ${textOr(phase.objective, '—')} |`);
  }
  lines.push('');

  lines.push('## Requisitos por fase (V-cycle)');
  for (const group of phaseGroups) {
    lines.push(`### #${group.phaseOrder} — ${group.phaseName} (${group.durationWeeks || 0} sem.)`);
    if (group.objective) lines.push(`*Objetivo:* ${group.objective}`);
    lines.push('');
    if (!group.requirementCount) {
      lines.push('_Sem requisitos nesta fase._');
      lines.push('');
      continue;
    }
    for (const tree of group.trees) {
      lines.push(`#### ${tree.stk.id} — ${textOr(tree.stk.title, tree.stk.id)}`);
      lines.push(renderRequirementMd(tree.stk, ''));
      for (const { fr, rnfs, tcs } of tree.functional) {
        lines.push(renderRequirementMd(fr, '  '));
        for (const rnf of rnfs) lines.push(renderRequirementMd(rnf, '    '));
        for (const tc of tcs) lines.push(renderRequirementMd(tc, '    '));
      }
      for (const fr of tree.orphanFrs || []) lines.push(renderRequirementMd(fr, '  '));
      lines.push('');
    }
    if (group.orphans.length) {
      lines.push('#### A classificar');
      for (const req of group.orphans) lines.push(renderRequirementMd(req, ''));
      lines.push('');
    }
  }

  lines.push('## Investimento');
  lines.push('| Fase | Semanas | Valor |');
  lines.push('| --- | ---: | ---: |');
  for (const phase of config.phases) {
    lines.push(`| #${phase.order} ${phase.name} | ${phase.durationWeeks || '—'} | ${formatMoney(phase.amount, payment.currency)} |`);
  }
  lines.push(`| **Total** | | **${formatMoney(payment.total, payment.currency)}** |`);
  lines.push('');

  lines.push('## Condicoes de pagamento');
  lines.push('| Marco | Gatilho | Valor | % |');
  lines.push('| --- | --- | ---: | ---: |');
  for (const m of payment.milestones) {
    lines.push(`| ${m.label} | ${m.trigger} | ${formatMoney(m.amount, payment.currency)} | ${m.percent}% |`);
  }
  lines.push('');

  lines.push('## Termos');
  lines.push(`- Validade da proposta: ${config.validityDays} dias`);
  lines.push(`- Garantia: ${config.warrantyDays} dias`);
  lines.push('');
  lines.push('### Exclusoes');
  lines.push(renderListMarkdown(config.exclusions, 'Nenhuma exclusao listada.'));
  lines.push('');
  lines.push('### Notas');
  lines.push(renderListMarkdown(config.notes, 'Sem notas adicionais.'));
  lines.push('');

  return { markdown: lines.join('\n'), content };
}

function renderListHtml(items, empty) {
  const list = normalizeStringArray(items);
  if (!list.length) return `<p class="meta">${escapeHtml(empty)}</p>`;
  return `<ul>${list.map((item) => `<li>${escapeHtml(item)}</li>`).join('')}</ul>`;
}

function renderProposalHtml(project, config) {
  const { markdown, content } = renderProposalMarkdown(project, config);
  const { payment, phaseGroups } = content;
  const summary = config.summary || {};

  const phasePlanRows = config.phases.map((phase) => `
    <tr>
      <td>#${phase.order}</td>
      <td>${escapeHtml(phase.name)}</td>
      <td>${phase.durationWeeks || '—'}</td>
      <td>${escapeHtml(textOr(phase.objective, '—'))}</td>
    </tr>
  `).join('');

  const investmentRows = config.phases.map((phase) => `
    <tr>
      <td>#${phase.order} ${escapeHtml(phase.name)}</td>
      <td>${phase.durationWeeks || '—'}</td>
      <td>${escapeHtml(formatMoney(phase.amount, payment.currency))}</td>
    </tr>
  `).join('');

  const milestoneRows = payment.milestones.map((m) => `
    <tr>
      <td>${escapeHtml(m.label)}</td>
      <td>${escapeHtml(m.trigger)}</td>
      <td>${escapeHtml(formatMoney(m.amount, payment.currency))}</td>
      <td>${escapeHtml(String(m.percent))}%</td>
    </tr>
  `).join('');

  let vmapHtml = '';
  for (const group of phaseGroups) {
    vmapHtml += `<article class="card full"><h2>#${group.phaseOrder} — ${escapeHtml(group.phaseName)}</h2>`;
    if (group.objective) vmapHtml += `<p class="meta">${escapeHtml(group.objective)} · ${group.durationWeeks || 0} semanas · ${group.requirementCount} req.</p>`;
    if (!group.requirementCount) {
      vmapHtml += '<p class="meta">Sem requisitos nesta fase.</p></article>';
      continue;
    }
    for (const tree of group.trees) {
      vmapHtml += `<h3>${escapeHtml(tree.stk.id)} — ${escapeHtml(textOr(tree.stk.title, tree.stk.id))}</h3><ul>`;
      for (const { fr, rnfs, tcs } of tree.functional) {
        vmapHtml += `<li><strong>${escapeHtml(fr.id)}</strong> — ${escapeHtml(textOr(fr.title, fr.id))}<br/><span class="small">${escapeHtml(reqSummaryLine(fr))}</span>`;
        if (rnfs.length || tcs.length) {
          vmapHtml += '<ul>';
          for (const rnf of rnfs) vmapHtml += `<li><span class="pill">RNF</span> ${escapeHtml(rnf.id)} — ${escapeHtml(textOr(rnf.title, rnf.id))}</li>`;
          for (const tc of tcs) vmapHtml += `<li><span class="pill">TC</span> ${escapeHtml(tc.id)} — ${escapeHtml(textOr(tc.title, tc.id))}</li>`;
          vmapHtml += '</ul>';
        }
        vmapHtml += '</li>';
      }
      vmapHtml += '</ul>';
    }
    if (group.orphans.length) {
      vmapHtml += '<h3>A classificar</h3><ul>';
      for (const req of group.orphans) {
        vmapHtml += `<li>${escapeHtml(req.id)} — ${escapeHtml(textOr(req.title, req.id))}</li>`;
      }
      vmapHtml += '</ul>';
    }
    vmapHtml += '</article>';
  }

  const html = `<!DOCTYPE html>
<html lang="pt-PT">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>${escapeHtml(config.projectName)} — Proposta Comercial</title>
  <link rel="preconnect" href="https://fonts.googleapis.com" />
  <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin />
  <link href="https://fonts.googleapis.com/css2?family=Manrope:wght@400;500;600;700&display=swap" rel="stylesheet" />
  <style>
    :root { --bg: #1b1b1b; --surface: #242424; --surface2: #2a2a2a; --ink: #eeede9; --muted: #a09e9b; --line: #333333; --accent: #d4af37; --accent-soft: #e8d5b7; }
    * { box-sizing: border-box; }
    body { margin: 0; font-family: 'Manrope', sans-serif; background: var(--bg); color: var(--ink); line-height: 1.55; }
    .wrap { max-width: 1100px; margin: 0 auto; padding: 24px; }
    .cover { background: linear-gradient(165deg, #111111, #1f1f1f); border: 1px solid #2e2e2e; border-radius: 14px; padding: 36px; margin-bottom: 18px; }
    .cover h1 { margin: 0 0 8px; font-size: 34px; color: var(--accent-soft); }
    .cover p { margin: 4px 0; color: var(--muted); }
    .card { background: var(--surface); border: 1px solid var(--line); border-radius: 12px; padding: 18px; margin-bottom: 14px; }
    .card h2 { margin: 0 0 12px; font-size: 18px; color: var(--accent-soft); }
    .card h3 { margin: 14px 0 8px; font-size: 14px; color: var(--accent); }
    .full { margin-top: 0; }
    .meta { color: var(--muted); font-size: 13px; }
    .small { font-size: 12px; color: var(--muted); }
    ul { margin: 8px 0 0 18px; }
    li { margin-bottom: 6px; }
    table { width: 100%; border-collapse: collapse; margin-top: 8px; }
    th, td { border-bottom: 1px solid var(--line); padding: 9px 10px; text-align: left; vertical-align: top; font-size: 13px; }
    th { color: var(--accent); background: var(--surface2); font-size: 11px; text-transform: uppercase; letter-spacing: 0.06em; }
    td:nth-child(3), td:nth-child(4), th:nth-child(3), th:nth-child(4) { text-align: right; }
    .pill { display: inline-block; border-radius: 999px; background: rgba(212,175,55,0.15); border: 1px solid rgba(212,175,55,0.35); color: var(--accent-soft); padding: 2px 8px; font-size: 10px; font-weight: 600; }
    .total-row td { font-weight: 700; color: var(--accent-soft); }
    .customer-request-body { display: flex; flex-direction: column; gap: 10px; }
    .customer-request-heading { margin: 20px 0 8px; font-size: 18px; font-weight: 700; color: var(--accent-soft); line-height: 1.35; }
    .customer-request-heading:first-child { margin-top: 0; }
    .customer-request-heading--l2 { font-size: 19px; }
    .customer-request-heading--l3 { font-size: 17px; }
    .customer-request-heading--l4 { font-size: 15px; color: var(--accent); }
    .customer-request-subheading { margin: 14px 0 6px; font-size: 15px; font-weight: 600; color: var(--accent); line-height: 1.4; }
    .customer-request-label { margin: 10px 0 4px; font-size: 13px; font-weight: 600; color: var(--accent-soft); letter-spacing: 0.02em; }
    .customer-request-paragraph { margin: 0; line-height: 1.7; font-size: 14px; color: var(--ink); white-space: pre-wrap; word-break: break-word; }
    .customer-request-list { margin: 4px 0 8px; padding-left: 1.35rem; line-height: 1.65; }
    .customer-request-list li { margin-bottom: 8px; }
    .customer-request-divider { border: 0; border-top: 1px solid var(--line); margin: 12px 0; }
  </style>
</head>
<body>
  <main class="wrap">
    <section class="cover">
      <h1>${escapeHtml(config.projectName)}</h1>
      <p>${escapeHtml(config.subtitle)}</p>
      <p>Cliente: ${escapeHtml(config.clientName)} · Data: ${escapeHtml(config.date)}</p>
      ${config.proposalCode ? `<p>Codigo: ${escapeHtml(config.proposalCode)}</p>` : ''}
    </section>

    <article class="card">
      <h2>Objetivo e contexto</h2>
      <p>${escapeHtml(textOr(summary.businessContext, 'Nao informado.'))}</p>
      <h3>Objetivos</h3>
      ${renderListHtml(summary.goals, 'Sem objetivos definidos.')}
      ${summary.solutionOverview ? `<h3>Visao da solucao</h3><p>${escapeHtml(summary.solutionOverview)}</p>` : ''}
    </article>

    <article class="card">
      <h2>Pedido do cliente</h2>
      ${formatCustomerRequestHtml(textOr(config.customerRequestExcerpt, textOr(summary.scopeInPlainLanguage, 'Nao informado.')))}
    </article>

    <article class="card">
      <h2>Plano de implementacao</h2>
      <table>
        <thead><tr><th>#</th><th>Fase</th><th>Sem.</th><th>Objetivo</th></tr></thead>
        <tbody>${phasePlanRows}</tbody>
      </table>
    </article>

    ${vmapHtml}

    <article class="card">
      <h2>Investimento</h2>
      <table>
        <thead><tr><th>Fase</th><th>Semanas</th><th>Valor</th></tr></thead>
        <tbody>${investmentRows}<tr class="total-row"><td colspan="2">Total</td><td>${escapeHtml(formatMoney(payment.total, payment.currency))}</td></tr></tbody>
      </table>
    </article>

    <article class="card">
      <h2>Condicoes de pagamento</h2>
      <table>
        <thead><tr><th>Marco</th><th>Gatilho</th><th>Valor</th><th>%</th></tr></thead>
        <tbody>${milestoneRows}</tbody>
      </table>
    </article>

    <article class="card">
      <h2>Termos</h2>
      <p class="meta">Validade: ${config.validityDays} dias · Garantia: ${config.warrantyDays} dias</p>
      <h3>Exclusoes</h3>
      ${renderListHtml(config.exclusions, 'Nenhuma exclusao listada.')}
      <h3>Notas</h3>
      ${renderListHtml(config.notes, 'Sem notas adicionais.')}
    </article>
  </main>
</body>
</html>`;

  return { html, markdown, content, payment };
}

function formatCustomerRequestHtml(rawText) {
  const text = textOr(rawText, 'Nao informado.');
  if (text === 'Nao informado.') {
    return '<p class="meta">Nao informado.</p>';
  }

  const normalized = text.replace(/\r\n/g, '\n').trim();
  const lines = normalized.split('\n');
  const parts = [];
  let paragraphBuffer = [];
  let listBuffer = [];
  let inImplicitList = false;

  const flushParagraph = () => {
    if (!paragraphBuffer.length) return;
    parts.push(`<p class="customer-request-paragraph">${paragraphBuffer.map(formatCustomerRequestInline).join('<br/>')}</p>`);
    paragraphBuffer = [];
  };

  const flushList = () => {
    if (!listBuffer.length) return;
    parts.push(`<ul class="customer-request-list">${listBuffer.map((item) => `<li>${formatCustomerRequestInline(item)}</li>`).join('')}</ul>`);
    listBuffer = [];
    inImplicitList = false;
  };

  const flushAll = () => {
    flushList();
    flushParagraph();
  };

  const isSectionHeading = (line) => /^\d+\.\s+/.test(line) && !/^\d+\.\d+/.test(line);
  const isSubSectionHeading = (line) => /^\d+\.\d+\.?\s+/.test(line);

  for (const rawLine of lines) {
    const line = rawLine.trim();

    if (!line) {
      flushParagraph();
      flushList();
      continue;
    }

    if (/^---+$/.test(line)) {
      flushAll();
      inImplicitList = false;
      parts.push('<hr class="customer-request-divider" />');
      continue;
    }

    const md = line.match(/^(#{1,6})\s+(.+)$/);
    if (md) {
      flushAll();
      inImplicitList = false;
      const level = Math.min(Number(md[1].length) + 1, 4);
      parts.push(`<h${level} class="customer-request-heading customer-request-heading--l${level}">${formatCustomerRequestInline(md[2])}</h${level}>`);
      continue;
    }

    if (isSectionHeading(line)) {
      flushAll();
      inImplicitList = false;
      parts.push(`<h3 class="customer-request-heading">${formatCustomerRequestInline(line)}</h3>`);
      continue;
    }

    if (isSubSectionHeading(line)) {
      flushAll();
      inImplicitList = false;
      parts.push(`<h4 class="customer-request-subheading">${formatCustomerRequestInline(line)}</h4>`);
      continue;
    }

    if (/^[-*•]\s+/.test(line)) {
      flushParagraph();
      inImplicitList = false;
      listBuffer.push(line.replace(/^[-*•]\s+/, ''));
      continue;
    }

    if (/^[\p{L}0-9][^:]{0,200}:$/u.test(line)) {
      flushAll();
      parts.push(`<p class="customer-request-label">${formatCustomerRequestInline(line)}</p>`);
      inImplicitList = true;
      continue;
    }

    if (inImplicitList && line.length <= 220 && !isSectionHeading(line) && !isSubSectionHeading(line)) {
      flushParagraph();
      listBuffer.push(line);
      continue;
    }

    inImplicitList = false;
    flushList();
    paragraphBuffer.push(line);
  }

  flushAll();
  return `<div class="customer-request-body">${parts.join('')}</div>`;
}

function formatCustomerRequestInline(value) {
  const parts = String(value || '').split(/(\*\*.+?\*\*)/g);
  return parts.map((part) => {
    if (part.startsWith('**') && part.endsWith('**')) {
      return `<strong>${escapeHtml(part.slice(2, -2))}</strong>`;
    }
    return escapeHtml(part);
  }).join('');
}

async function writeCommercialProposalBundle({ project, config, outputDir, slug }) {
  const { html, markdown, content, payment } = renderProposalHtml(project, config);
  const fs = require('fs').promises;
  const path = require('path');

  const markdownPath = path.join(outputDir, `${slug}_proposta_completa.md`);

  await fs.writeFile(markdownPath, markdown, 'utf-8');

  return {
    markdownPath,
    html,
    payment,
    content,
  };
}

function stripBudgetFromProject(project) {
  if (!project || typeof project !== 'object') return project;
  delete project.hourlyRate;
  delete project.targetBudgetMin;
  delete project.targetBudgetMax;
  if (project.proposal && typeof project.proposal === 'object') {
    project.proposal = {
      ...project.proposal,
      totalValue: 0,
      phases: ensureArray(project.proposal.phases).map((p) => ({ ...p, value: 0 })),
    };
  }
  project.phases = normalizePlanPhases(project.phases);
  if (!project.phases.length) project.phases = defaultPlanPhases();
  return project;
}

module.exports = {
  buildProposalConfigDefaults,
  normalizeProposalConfig,
  validateProposalConfig,
  computePaymentMilestones,
  groupRequirementsByPhaseAndVMap,
  buildProposalContent,
  renderProposalMarkdown,
  renderProposalHtml,
  writeCommercialProposalBundle,
  formatCustomerRequestHtml,
  normalizePlanPhases,
  defaultPlanPhases,
  stripBudgetFromProject,
  normalizeCommercialTermsNonPrice,
};
