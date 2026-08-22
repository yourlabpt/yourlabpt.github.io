// Merge lead columns + wizard_json so resume keeps AI/HTML edits over stale publishes.

function hasHero(demo) {
    return Boolean(demo && demo.hero && demo.hero.titulo);
}

/**
 * Priority:
 * 1. demoHtml: lead.demo_html || wizard.demoHtml (always, even with demo_slug)
 * 2. demo JSON: if wizard.demoRaw (AI edit) → wizard.demo;
 *              else if lead.demo_json.hero → lead.demo_json;
 *              else wizard.demo
 * 3. demoRaw / demoPrompt / demoSeeded / demoIdentityStamp from wizard
 */
function mergeDemoForResume({ leadDemo, leadDemoHtml, wizard }) {
    const w = wizard && typeof wizard === 'object' ? wizard : {};
    const wizardDemo = w.demo;
    const wizardRaw = String(w.demoRaw || '').trim();
    const wizardHtml = String(w.demoHtml || '').trim();
    const columnHtml = String(leadDemoHtml || '').trim();

    const demoHtml = columnHtml || wizardHtml || '';

    let demo;
    if (wizardRaw && hasHero(wizardDemo)) {
        demo = wizardDemo;
    } else if (hasHero(leadDemo)) {
        demo = leadDemo;
    } else if (hasHero(wizardDemo)) {
        demo = wizardDemo;
    } else {
        demo = undefined;
    }

    return {
        demo,
        demoHtml,
        demoRaw: w.demoRaw || '',
        demoPrompt: w.demoPrompt || '',
        demoSeeded: w.demoSeeded === true,
        demoIdentityStamp: w.demoIdentityStamp || '',
        htmlChangeNote: w.htmlChangeNote || undefined,
        demoVisual: w.demoVisual || '',
        demoHtmlSource: w.demoHtmlSource || ''
    };
}

function resumeWizardPosition(wizard) {
    const w = wizard && typeof wizard === 'object' ? wizard : {};
    const step = Number(w._wizardStep);
    const substep = Number(w._wizardSubstep);
    return {
        suggestedStep: Number.isFinite(step) && step >= 0 ? Math.floor(step) : 0,
        suggestedSubstep: Number.isFinite(substep) && substep >= 0 ? Math.floor(substep) : 0
    };
}

/**
 * Merge published demo fields into an existing wizard_json object.
 */
function mergeDemoIntoWizardJson(existingWizard, { demo, demoHtml, demoRaw, demoVisual, demoHtmlSource }) {
    const base = existingWizard && typeof existingWizard === 'object' ? { ...existingWizard } : {};
    if (demo && typeof demo === 'object') base.demo = demo;
    if (demoHtml != null) base.demoHtml = String(demoHtml);
    if (demoRaw != null && String(demoRaw).trim()) base.demoRaw = String(demoRaw);
    if (demoVisual) base.demoVisual = String(demoVisual);
    if (demoHtmlSource != null) base.demoHtmlSource = String(demoHtmlSource);
    return base;
}

module.exports = {
    mergeDemoForResume,
    resumeWizardPosition,
    mergeDemoIntoWizardJson,
    hasHero
};
