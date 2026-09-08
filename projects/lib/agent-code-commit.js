/**
 * Turning an approved developer-agent result into a commit in the project's repository.
 *
 * The token never leaves the platform: the runtime returns file contents in its result,
 * a human approves, and only then does the platform write them to a branch and open a
 * change request. Nothing an agent produces reaches the default branch unreviewed.
 *
 * The developer persona's contract says it may only touch its own module. That promise
 * is enforced here, at the moment of writing, not merely asked for in the prompt.
 */
const openspecFormat = require('./openspec-format');

const MAX_FILES = 60;
const MAX_FILE_BYTES = 512 * 1024;

function text(value, fallback = '') {
  const result = value === null || value === undefined ? '' : String(value).trim();
  return result || fallback;
}

function ensureArray(value) {
  return Array.isArray(value) ? value : [];
}

/**
 * Rejects anything that would escape the repository root. A generated path is
 * untrusted input like any other.
 */
function normalizeRepoPath(value) {
  const raw = String(value ?? '').trim().replace(/\\/g, '/').replace(/^\.\//, '').replace(/^\/+/, '');
  if (!raw) return '';
  if (raw.includes('..')) return '';
  if (raw.includes('\0')) return '';
  if (/^[a-zA-Z]:/.test(raw)) return '';
  const segments = raw.split('/').filter((segment) => segment && segment !== '.');
  if (!segments.length) return '';
  if (segments[0] === '.git') return '';
  return segments.join('/');
}

/**
 * Agents phrase their file lists differently depending on the model. Accept the shapes
 * we actually see rather than forcing one and silently dropping the rest.
 */
function extractCodeChanges(parsed) {
  const source = parsed && typeof parsed === 'object' ? parsed : {};
  const candidates = [
    source.changedFiles,
    source.files,
    source.codeChanges,
    source.evidence?.changedFiles,
    source.result?.changedFiles,
    source.codeChangeEvidence?.changedFiles,
  ].find((entry) => Array.isArray(entry) && entry.length) || [];

  const files = [];
  const rejected = [];
  for (const entry of candidates) {
    const rawPath = typeof entry === 'string' ? '' : (entry?.path || entry?.file || entry?.filename);
    const path = normalizeRepoPath(rawPath);
    const operation = text(entry?.operation || entry?.action || entry?.type, 'update').toLowerCase();
    const content = entry?.content ?? entry?.contents ?? entry?.newContent ?? entry?.body;

    if (!path) {
      rejected.push({ path: text(rawPath, '(sem caminho)'), reason: 'caminho invalido' });
      continue;
    }
    if (operation === 'delete' || operation === 'deleted' || operation === 'remove') {
      // Deletions need a different provider call and a much higher bar for review;
      // surface them rather than silently ignoring or performing them.
      rejected.push({ path, reason: 'remocao de ficheiro nao e aplicada automaticamente' });
      continue;
    }
    if (typeof content !== 'string') {
      rejected.push({ path, reason: 'sem conteudo — apenas um diff nao chega para escrever o ficheiro' });
      continue;
    }
    if (Buffer.byteLength(content, 'utf8') > MAX_FILE_BYTES) {
      rejected.push({ path, reason: 'ficheiro demasiado grande' });
      continue;
    }
    files.push({ path, content, operation: operation === 'create' ? 'create' : 'update' });
  }

  return {
    files: files.slice(0, MAX_FILES),
    rejected: [
      ...rejected,
      ...files.slice(MAX_FILES).map((file) => ({ path: file.path, reason: 'acima do limite de ficheiros' })),
    ],
    summary: text(source.summary || source.description),
    tests: source.tests || source.testEvidence || null,
  };
}

/**
 * The paths a task is allowed to write. A developer task scoped to one module may
 * touch that module's paths and its own tests, nothing else.
 */
function buildScope({ modulePaths = [], moduleName = '', allowSpec = false } = {}) {
  const prefixes = ensureArray(modulePaths)
    .map((entry) => normalizeRepoPath(entry))
    .filter(Boolean);
  if (!prefixes.length && text(moduleName)) {
    const slug = openspecFormat.slugify(moduleName, '');
    if (slug) {
      prefixes.push(`src/${slug}`, `lib/${slug}`, `modules/${slug}`, `packages/${slug}`, `tests/${slug}`);
    }
  }
  return {
    prefixes,
    allowSpec,
    // No declared scope means the caller did not constrain this task; the persona
    // guardrail upstream decides whether that is acceptable.
    unrestricted: prefixes.length === 0,
  };
}

function isInScope(path, scope) {
  if (!scope || scope.unrestricted) return true;
  if (scope.allowSpec && path.startsWith(`${openspecFormat.SPEC_ROOT}/`)) return true;
  return scope.prefixes.some((prefix) => path === prefix || path.startsWith(`${prefix}/`));
}

/**
 * Splits an agent's files into what it was allowed to write and what it was not.
 * Out-of-scope files are never written — that is the "never modify another module"
 * rule, enforced.
 */
function partitionByScope(files, scope) {
  const allowed = [];
  const outOfScope = [];
  for (const file of ensureArray(files)) {
    if (isInScope(file.path, scope)) allowed.push(file);
    else outOfScope.push(file);
  }
  return { allowed, outOfScope };
}

function commitBranchName(task, moduleName = '') {
  const slug = openspecFormat.slugify(text(moduleName) || text(task?.title), 'tarefa');
  const shortId = text(task?.id).replace(/[^a-zA-Z0-9]/g, '').slice(-8) || 'task';
  return `agent/${slug}-${shortId}`;
}

function commitMessage(task, moduleName = '') {
  const scope = openspecFormat.slugify(moduleName, '');
  const title = text(task?.title, 'alteracao do agente').slice(0, 68);
  return scope ? `feat(${scope}): ${title}` : `feat: ${title}`;
}

function changeRequestBody({ task, summary, files, outOfScope, rejected, personaId, agentId }) {
  const lines = [
    `Gerado pelo agente \`${text(agentId, personaId || 'developer')}\` e aprovado por revisao humana.`,
    '',
    '## Resumo',
    '',
    text(summary, 'Sem resumo devolvido pelo agente.'),
    '',
    '## Ficheiros',
    '',
    ...files.map((file) => `- \`${file.path}\``),
  ];
  if (outOfScope.length) {
    lines.push(
      '',
      '## Fora do ambito — NAO escritos',
      '',
      'O agente tentou alterar ficheiros fora do seu modulo. Foram recusados:',
      '',
      ...outOfScope.map((file) => `- \`${file.path}\``)
    );
  }
  if (rejected.length) {
    lines.push(
      '',
      '## Ignorados',
      '',
      ...rejected.map((entry) => `- \`${entry.path}\` — ${entry.reason}`)
    );
  }
  if (task?.id) lines.push('', `Tarefa: \`${task.id}\``);
  return lines.join('\n');
}

/**
 * Writes the approved files onto a fresh branch and opens a change request.
 * Returns what was written and what was refused, so the caller can record both.
 */
async function commitApprovedChanges(client, repository, {
  task,
  parsedOutput,
  moduleName = '',
  modulePaths = [],
  personaId = 'developer',
  agentId = '',
  allowSpec = false,
  requireScope = false,
}) {
  const extracted = extractCodeChanges(parsedOutput);
  if (!extracted.files.length) {
    const reason = extracted.rejected.length
      ? `Nenhum ficheiro utilizavel no resultado (${extracted.rejected.length} ignorado(s)).`
      : 'O resultado do agente nao traz ficheiros para escrever.';
    return { committed: false, reason, ...extracted, outOfScope: [] };
  }

  const scope = buildScope({ modulePaths, moduleName, allowSpec });
  // A persona whose contract is "one module only" must never fall back to writing
  // anywhere. If the scope could not be determined, refuse rather than allow all.
  if (requireScope && scope.unrestricted) {
    return {
      committed: false,
      reason: 'Esta tarefa nao declara modulo nem caminhos. Um agente limitado a um modulo nao pode escrever sem ambito definido.',
      ...extracted,
      outOfScope: extracted.files,
    };
  }
  const { allowed, outOfScope } = partitionByScope(extracted.files, scope);
  if (!allowed.length) {
    return {
      committed: false,
      reason: 'Todos os ficheiros estao fora do ambito do modulo desta tarefa.',
      ...extracted,
      outOfScope,
    };
  }

  const branch = commitBranchName(task, moduleName);
  const base = repository.defaultBranch;
  await client.createBranch(repository.owner, repository.name, branch, base);
  const message = commitMessage(task, moduleName);
  for (const file of allowed) {
    await client.writeFile(repository.owner, repository.name, file.path, file.content, { branch, message });
  }
  const changeRequest = await client.createChangeRequest(repository.owner, repository.name, {
    title: message,
    body: changeRequestBody({
      task, summary: extracted.summary, files: allowed, outOfScope, rejected: extracted.rejected, personaId, agentId,
    }),
    head: branch,
    base,
  });

  return {
    committed: true,
    branch,
    base,
    changeRequest,
    files: allowed,
    outOfScope,
    rejected: extracted.rejected,
    summary: extracted.summary,
  };
}

module.exports = {
  MAX_FILES,
  MAX_FILE_BYTES,
  buildScope,
  changeRequestBody,
  commitApprovedChanges,
  commitBranchName,
  commitMessage,
  extractCodeChanges,
  isInScope,
  normalizeRepoPath,
  partitionByScope,
};
