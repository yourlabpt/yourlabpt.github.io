// Merge lead columns + wizard_json so resume keeps AI/HTML edits over stale publishes.

const DEMO_STEP_INDEX = 4;
const DEMO_WEBSITE_SUBSTEP = 1;

const DEMO_CLEAR_KEYS = [
    'demo',
    'demoHtml',
    'demoHtmlCustom',
    'demoRaw',
    'demoPrompt',
    'demoVisual',
    'demoHtmlSource',
    'demoSeeded',
    'demoIdentityStamp',
    'htmlChangeNote',
    'identidade',
    'colorPrompt'
];

function hasHero(demo) {
    return Boolean(demo && demo.hero && demo.hero.titulo);
}

function isBoilerplateHtml(html) {
    return /data-dp-boilerplate\s*=/i.test(String(html || ''));
}

function isBlankValue(value) {
    if (value == null) return true;
    if (typeof value === 'string') return !value.trim();
    if (Array.isArray(value)) return value.length === 0;
    if (typeof value === 'object') return Object.keys(value).length === 0;
    return false;
}

function hasDemoContent(source) {
    const w = source && typeof source === 'object' ? source : {};
    return hasHero(w.demo)
        || Boolean(String(w.demoHtml || '').trim())
        || Boolean(String(w.demoHtmlCustom || '').trim())
        || Boolean(String(w.demoRaw || '').trim());
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
 * Incoming non-empty fields win; blank incoming never deletes a stored ficha value.
 */
function mergeDadosPreserve(existing, incoming) {
    const out = { ...(existing && typeof existing === 'object' ? existing : {}) };
    Object.entries(incoming && typeof incoming === 'object' ? incoming : {}).forEach(([key, value]) => {
        if (isBlankValue(value)) return;
        out[key] = value;
    });
    return out;
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
        demoHtmlSource: customHtml
            ? (w.demoHtmlSource && w.demoHtmlSource !== 'boilerplate' ? w.demoHtmlSource : 'ai')
            : (w.demoHtmlSource || '')
    };
}

function resumeHasDemo(wizard, extras = {}) {
    if (extras.hasDemo === true) return true;
    return hasDemoContent(wizard);
}

/**
 * Do not drop a resumed lead on "tipo de negócio" — a mis-tap there wipes the demo.
 */
function resumeWizardPosition(wizard, extras = {}) {
    const w = wizard && typeof wizard === 'object' ? wizard : {};
    let step = Number(w._wizardStep);
    let substep = Number(w._wizardSubstep);
    if (!Number.isFinite(step) || step < 0) step = 0;
    else step = Math.floor(step);
    if (!Number.isFinite(substep) || substep < 0) substep = 0;
    else substep = Math.floor(substep);

    const hasDemo = resumeHasDemo(w, extras);
    const hasType = extras.hasType === true
        || Boolean(extras.businessTypeId)
        || Boolean(w.businessType && w.businessType.id);
    const hasDados = extras.hasDados === true
        || Boolean(w.dados && w.dados.nome_negocio);

    if (step === 0 && (hasDemo || hasType || hasDados)) {
        if (hasDemo) {
            return {
                suggestedStep: DEMO_STEP_INDEX,
                suggestedSubstep: Math.max(substep, DEMO_WEBSITE_SUBSTEP)
            };
        }
        return { suggestedStep: 1, suggestedSubstep: 0 };
    }
    return { suggestedStep: step, suggestedSubstep: substep };
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
    const incomingHtml = demoHtml == null ? '' : String(demoHtml).trim();
    if (incomingHtml && !isBoilerplateHtml(incomingHtml)) {
        base.demoHtml = incomingHtml;
    } else if (!String(base.demoHtml || '').trim() && custom) {
        base.demoHtml = custom;
    }
    if (demoRaw != null && String(demoRaw).trim()) base.demoRaw = String(demoRaw);
    if (demoVisual) base.demoVisual = String(demoVisual);
    if (demoHtmlSource != null && String(demoHtmlSource) !== 'boilerplate') {
        base.demoHtmlSource = String(demoHtmlSource);
    } else if (custom) {
        base.demoHtmlSource = 'ai';
    }
    return base;
}

function applyClearDemo(existing, incoming) {
    const next = { ...existing, ...incoming };
    DEMO_CLEAR_KEYS.forEach((key) => {
        if (incoming[key] == null || incoming[key] === '') delete next[key];
        else next[key] = incoming[key];
    });
    delete next._clearDemo;
    return next;
}

/**
 * Draft saves must not replace wizard_json wholesale: an empty snapshot after a
 * mis-tap would delete the published demo and the ficha backup.
 */
function mergeWizardSnapshot(existingWizard, incoming) {
    const existing = existingWizard && typeof existingWizard === 'object' ? { ...existingWizard } : {};
    const inc = incoming && typeof incoming === 'object' ? incoming : {};
    if (inc._clearDemo === true) return applyClearDemo(existing, inc);

    const merged = mergeDemoIntoWizardJson(existing, inc);
    Object.keys({ ...existing, ...inc }).forEach((key) => {
        if (key === '_clearDemo') return;
        if (['demo', 'demoHtml', 'demoHtmlCustom', 'demoRaw', 'demoHtmlSource', 'demoVisual'].includes(key)) {
            return;
        }
        if (key === 'dados') {
            merged.dados = mergeDadosPreserve(existing.dados, inc.dados);
            return;
        }
        if (!isBlankValue(inc[key])) merged[key] = inc[key];
        else if (!isBlankValue(existing[key]) && merged[key] == null) merged[key] = existing[key];
    });
    delete merged._clearDemo;
    return merged;
}

module.exports = {
    mergeDemoForResume,
    resumeWizardPosition,
    mergeDemoIntoWizardJson,
    mergeDadosPreserve,
    mergeWizardSnapshot,
    hasDemoContent,
    hasHero,
    isBoilerplateHtml,
    isBlankValue,
    pickCustomHtml,
    persistableCustomHtml,
    DEMO_STEP_INDEX
};
