// Merge lead columns + wizard_json so resume keeps AI/HTML edits over stale publishes.

function hasHero(demo) {
    return Boolean(demo && demo.hero && demo.hero.titulo);
}

function isBoilerplateHtml(html) {
    return /data-dp-boilerplate\s*=/i.test(String(html || ''));
}

function pickCustomHtml(columnHtml, wizard) {
    const w = wizard && typeof wizard === 'object' ? wizard : {};
    const column = String(columnHtml || '').trim();
    if (column && !isBoilerplateHtml(column)) return column;
    const custom = String(w.demoHtmlCustom || '').trim();
    if (custom && !isBoilerplateHtml(custom)) return custom;
    const wizardHtml = String(w.demoHtml || '').trim();
    if (wizardHtml && !isBoilerplateHtml(wizardHtml) && w.demoHtmlSource !== 'boilerplate') {
        return wizardHtml;
    }
    return '';
}

function persistableCustomHtml({
    demoHtml = '',
    demoHtmlCustom = '',
    demoHtmlSource = '',
    existingWizard = {}
} = {}) {
    const incomingCustom = String(demoHtmlCustom || '').trim();
    if (incomingCustom && !isBoilerplateHtml(incomingCustom)) return incomingCustom;
    const incomingHtml = String(demoHtml || '').trim();
    if (incomingHtml && !isBoilerplateHtml(incomingHtml) && String(demoHtmlSource || '') !== 'boilerplate') {
        return incomingHtml;
    }
    return pickCustomHtml('', existingWizard);
}

/**
 * Priority:
 * 1. custom HTML: published demo_html if it is not a boilerplate, else wizard.demoHtmlCustom
 * 2. demo JSON: if wizard.demoRaw (AI edit) → wizard.demo;
 *              else if lead.demo_json.hero → lead.demo_json;
 *              else wizard.demo
 * 3. demoRaw / demoPrompt / demoSeeded / demoIdentityStamp from wizard
 */
function mergeDemoForResume({ leadDemo, leadDemoHtml, wizard }) {
    const w = wizard && typeof wizard === 'object' ? wizard : {};
    const wizardDemo = w.demo;
    const wizardRaw = String(w.demoRaw || '').trim();
    const customHtml = pickCustomHtml(leadDemoHtml, w);

    const demoHtml = customHtml
        || (isBoilerplateHtml(leadDemoHtml) ? '' : String(leadDemoHtml || '').trim())
        || String(w.demoHtml || '').trim()
        || '';

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
        demoHtmlCustom: customHtml,
        demoRaw: w.demoRaw || '',
        demoPrompt: w.demoPrompt || '',
        demoSeeded: w.demoSeeded === true,
        demoIdentityStamp: w.demoIdentityStamp || '',
        htmlChangeNote: w.htmlChangeNote || undefined,
        demoVisual: customHtml ? 'personalizada' : (w.demoVisual || ''),
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
function mergeDemoIntoWizardJson(existingWizard, {
    demo,
    demoHtml,
    demoRaw,
    demoVisual,
    demoHtmlSource,
    demoHtmlCustom
} = {}) {
    const base = existingWizard && typeof existingWizard === 'object' ? { ...existingWizard } : {};
    if (demo && typeof demo === 'object') base.demo = demo;
    const custom = persistableCustomHtml({
        demoHtml,
        demoHtmlCustom,
        demoHtmlSource,
        existingWizard: base
    });
    if (custom) base.demoHtmlCustom = custom;
    if (demoHtml != null && !isBoilerplateHtml(demoHtml)) base.demoHtml = String(demoHtml);
    if (demoRaw != null && String(demoRaw).trim()) base.demoRaw = String(demoRaw);
    if (demoVisual) base.demoVisual = String(demoVisual);
    if (demoHtmlSource != null && String(demoHtmlSource) !== 'boilerplate') {
        base.demoHtmlSource = String(demoHtmlSource);
    } else if (custom) {
        base.demoHtmlSource = 'ai';
    }
    return base;
}

module.exports = {
    mergeDemoForResume,
    resumeWizardPosition,
    mergeDemoIntoWizardJson,
    hasHero,
    isBoilerplateHtml,
    pickCustomHtml,
    persistableCustomHtml
};
