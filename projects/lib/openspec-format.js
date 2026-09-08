/**
 * The OpenSpec markdown convention: read it, write it, round-trip it.
 *
 *   openspec/project.md
 *   openspec/specs/<capability>/spec.md
 *   openspec/changes/<change-id>/{proposal.md,tasks.md,design.md,specs/<cap>/spec.md}
 *
 * A spec.md holds requirements and the scenarios that verify them:
 *
 *   ## Requirements
 *   ### Requirement: <title>
 *   The system SHALL ...
 *   #### Scenario: <name>
 *   - **WHEN** ...
 *   - **THEN** ...
 *
 * Platform identity travels in an HTML comment under each heading. It is invisible in
 * rendered markdown but survives a round-trip, which is what makes two-way sync safe:
 * without a stable id every pull would look like "delete everything, add everything".
 */

const SPEC_ROOT = 'openspec';
const DELTA_SECTIONS = ['ADDED', 'MODIFIED', 'REMOVED', 'RENAMED'];

function text(value, fallback = '') {
  const result = value === null || value === undefined ? '' : String(value).trim();
  return result || fallback;
}

function slugify(value, fallback = 'capability') {
  const slug = text(value)
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 60);
  return slug || fallback;
}

function specPath(capability) {
  return `${SPEC_ROOT}/specs/${slugify(capability)}/spec.md`;
}

function changePath(changeId, file) {
  return `${SPEC_ROOT}/changes/${slugify(changeId, 'change')}/${file}`;
}

/** `<!-- yourlab: key=value; key=value -->` */
function serializeMeta(meta = {}) {
  const pairs = Object.entries(meta)
    .filter(([, value]) => text(value))
    .map(([key, value]) => `${key}=${String(value).replace(/[;>]/g, ' ').trim()}`);
  return pairs.length ? `<!-- yourlab: ${pairs.join('; ')} -->` : '';
}

function parseMeta(line) {
  const match = String(line || '').match(/^<!--\s*yourlab:\s*(.+?)\s*-->$/);
  if (!match) return null;
  const meta = {};
  for (const pair of match[1].split(';')) {
    const index = pair.indexOf('=');
    if (index === -1) continue;
    const key = pair.slice(0, index).trim();
    const value = pair.slice(index + 1).trim();
    if (key) meta[key] = value;
  }
  return meta;
}

/**
 * Scenario bodies are bullet lists of WHEN/THEN/AND. Returns the parts separately so
 * the platform can map them onto a test case's condition and expected result.
 */
function parseScenarioBody(lines) {
  const when = [];
  const then = [];
  const rest = [];
  for (const line of lines) {
    const bullet = line.replace(/^\s*[-*]\s*/, '');
    const keyword = bullet.match(/^\*\*(WHEN|THEN|AND|GIVEN)\*\*\s*(.*)$/i);
    if (!keyword) {
      if (text(line)) rest.push(text(line));
      continue;
    }
    const word = keyword[1].toUpperCase();
    const value = text(keyword[2]);
    if (!value) continue;
    if (word === 'WHEN' || word === 'GIVEN') when.push(value);
    else if (word === 'THEN') then.push(value);
    else (then.length ? then : when).push(value);
  }
  return {
    when: when.join(' e '),
    then: then.join(' e '),
    notes: rest.join('\n'),
  };
}

function serializeScenario(scenario) {
  const lines = [`#### Scenario: ${text(scenario.title, 'Cenario')}`];
  const meta = serializeMeta({ id: scenario.id, requirementId: scenario.requirementId });
  if (meta) lines.push(meta);
  if (text(scenario.when)) lines.push(`- **WHEN** ${text(scenario.when)}`);
  if (text(scenario.then)) lines.push(`- **THEN** ${text(scenario.then)}`);
  if (!text(scenario.when) && !text(scenario.then) && text(scenario.notes)) {
    lines.push(`- ${text(scenario.notes)}`);
  }
  return lines.join('\n');
}

function serializeRequirement(requirement) {
  const lines = [`### Requirement: ${text(requirement.title, 'Requisito')}`];
  const meta = serializeMeta({
    id: requirement.id,
    type: requirement.type,
    priority: requirement.priority,
    module: requirement.module,
  });
  if (meta) lines.push(meta);
  const statement = text(requirement.shall);
  if (statement) lines.push('', statement);
  if (text(requirement.rationale)) lines.push('', `_Porque:_ ${text(requirement.rationale)}`);
  for (const scenario of requirement.scenarios || []) {
    lines.push('', serializeScenario(scenario));
  }
  return lines.join('\n');
}

/**
 * Serializes one capability into a spec.md.
 */
function serializeSpec(spec) {
  const lines = [`# ${text(spec.title, text(spec.capability, 'Capacidade'))} Specification`];
  const meta = serializeMeta({ capability: spec.capability, module: spec.module });
  if (meta) lines.push(meta);
  lines.push('', '## Purpose', '', text(spec.purpose, 'Por definir.'), '', '## Requirements');
  for (const requirement of spec.requirements || []) {
    lines.push('', serializeRequirement(requirement));
  }
  return `${lines.join('\n').replace(/\n{3,}/g, '\n\n')}\n`;
}

/**
 * Parses a spec.md back into capability + requirements + scenarios.
 * Tolerant by design: hand-edited files must not throw, they lose only the metadata
 * the author did not write.
 */
function parseSpec(markdown, { capability = '' } = {}) {
  const lines = String(markdown || '').split(/\r?\n/);
  const spec = {
    capability: slugify(capability),
    title: '',
    module: '',
    purpose: '',
    requirements: [],
  };

  let section = '';
  let requirement = null;
  let scenario = null;
  let purposeLines = [];
  let bodyLines = [];
  let scenarioLines = [];

  const closeScenario = () => {
    if (!scenario || !requirement) return;
    const parsed = parseScenarioBody(scenarioLines);
    requirement.scenarios.push({ ...scenario, ...parsed });
    scenario = null;
    scenarioLines = [];
  };
  const closeRequirement = () => {
    closeScenario();
    if (!requirement) return;
    const body = bodyLines.join('\n').trim();
    const rationaleMatch = body.match(/_Porque:_\s*(.+)/);
    requirement.shall = body.replace(/_Porque:_\s*.+/, '').trim();
    requirement.rationale = rationaleMatch ? text(rationaleMatch[1]) : '';
    spec.requirements.push(requirement);
    requirement = null;
    bodyLines = [];
  };

  for (const line of lines) {
    const meta = parseMeta(line.trim());
    if (meta) {
      if (scenario) Object.assign(scenario, meta);
      else if (requirement) Object.assign(requirement, meta);
      else {
        if (meta.capability) spec.capability = slugify(meta.capability);
        if (meta.module) spec.module = meta.module;
      }
      continue;
    }

    const h1 = line.match(/^#\s+(.+?)(?:\s+Specification)?\s*$/);
    if (h1 && !spec.title) { spec.title = text(h1[1]); continue; }

    const h2 = line.match(/^##\s+(.+)$/);
    if (h2) {
      closeRequirement();
      section = text(h2[1]).toLowerCase();
      continue;
    }

    const h3 = line.match(/^###\s+Requirement:\s*(.+)$/i);
    if (h3) {
      closeRequirement();
      requirement = {
        id: '', type: 'functional', priority: '', module: '',
        title: text(h3[1]), shall: '', rationale: '', scenarios: [],
      };
      continue;
    }

    const h4 = line.match(/^####\s+Scenario:\s*(.+)$/i);
    if (h4 && requirement) {
      closeScenario();
      scenario = { id: '', title: text(h4[1]) };
      continue;
    }

    if (scenario) scenarioLines.push(line);
    else if (requirement) bodyLines.push(line);
    else if (section.startsWith('purpose')) purposeLines.push(line);
  }
  closeRequirement();

  spec.purpose = purposeLines.join('\n').trim();
  if (!spec.title) spec.title = spec.capability;
  return spec;
}

/**
 * A change proposal's spec delta, grouped by operation.
 */
function serializeDelta(capability, delta = {}) {
  const lines = [`## ${text(delta.capabilityTitle, capability)} delta`];
  for (const section of DELTA_SECTIONS) {
    const entries = delta[section.toLowerCase()] || [];
    if (!entries.length) continue;
    lines.push('', `## ${section} Requirements`);
    for (const requirement of entries) lines.push('', serializeRequirement(requirement));
  }
  return `${lines.join('\n').replace(/\n{3,}/g, '\n\n')}\n`;
}

function parseDelta(markdown) {
  const lines = String(markdown || '').split(/\r?\n/);
  const result = { added: [], modified: [], removed: [], renamed: [] };
  let current = '';
  let buffer = [];
  const flush = () => {
    if (!current || !buffer.length) { buffer = []; return; }
    const parsed = parseSpec(`# delta\n\n## Requirements\n${buffer.join('\n')}`);
    result[current].push(...parsed.requirements);
    buffer = [];
  };
  for (const line of lines) {
    const header = line.match(/^##\s+(ADDED|MODIFIED|REMOVED|RENAMED)\s+Requirements/i);
    if (header) {
      flush();
      current = header[1].toLowerCase();
      continue;
    }
    if (current) buffer.push(line);
  }
  flush();
  return result;
}

function serializeProjectDoc(project) {
  return [
    `# ${text(project.name, 'Projecto')}`,
    '',
    serializeMeta({ projectId: project.id, stage: project.deliveryStageId }),
    '',
    '## Contexto',
    '',
    text(project.description, 'Por definir.'),
    '',
    '## Como este repositorio esta organizado',
    '',
    '- `openspec/specs/` — o que o sistema faz hoje, uma pasta por capacidade.',
    '- `openspec/changes/` — propostas de alteracao ainda nao integradas.',
    '',
    'Cada requisito tem pelo menos um cenario WHEN/THEN executavel. Um requisito sem',
    'cenario nao esta pronto para desenvolvimento.',
    '',
    '## Fluxo',
    '',
    '1. UX aprova os ecras e fluxos.',
    '2. Product Owner escreve os requisitos e criterios de aceitacao aqui.',
    '3. Module Architect parte em modulos; Orchestrator fixa os contratos.',
    '4. Developer implementa um modulo; Tester valida contra os cenarios.',
    '',
  ].join('\n');
}

function serializeProposal(change) {
  return [
    `# ${text(change.title, 'Proposta de alteracao')}`,
    '',
    serializeMeta({ id: change.id, projectId: change.projectId }),
    '',
    '## Porque',
    '',
    text(change.why, 'Por definir.'),
    '',
    '## O que muda',
    '',
    ...(change.whatChanges?.length
      ? change.whatChanges.map((entry) => `- ${text(entry)}`)
      : ['- Por definir.']),
    '',
    '## Impacto',
    '',
    ...(change.affectedCapabilities?.length
      ? change.affectedCapabilities.map((entry) => `- \`${slugify(entry)}\``)
      : ['- Por definir.']),
    '',
  ].join('\n');
}

function serializeTasks(tasks = []) {
  const lines = ['# Tarefas', ''];
  if (!tasks.length) lines.push('- [ ] Por definir.');
  for (const task of tasks) {
    lines.push(`- [${task.done ? 'x' : ' '}] ${text(task.title)}${task.module ? ` (\`${slugify(task.module)}\`)` : ''}`);
  }
  return `${lines.join('\n')}\n`;
}

function parseTasks(markdown) {
  return String(markdown || '')
    .split(/\r?\n/)
    .map((line) => line.match(/^\s*-\s*\[( |x|X)\]\s*(.+)$/))
    .filter(Boolean)
    .map((match) => ({
      done: match[1].toLowerCase() === 'x',
      title: text(match[2]).replace(/\s*\(`[^`]+`\)\s*$/, ''),
      module: (text(match[2]).match(/\(`([^`]+)`\)\s*$/) || [])[1] || '',
    }));
}

module.exports = {
  DELTA_SECTIONS,
  SPEC_ROOT,
  changePath,
  parseDelta,
  parseMeta,
  parseScenarioBody,
  parseSpec,
  parseTasks,
  serializeDelta,
  serializeMeta,
  serializeProjectDoc,
  serializeProposal,
  serializeRequirement,
  serializeSpec,
  serializeTasks,
  slugify,
  specPath,
};
