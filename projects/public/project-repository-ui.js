/**
 * Per-project repository: link an existing one, create a new one, and see the work
 * the agents pushed into it.
 */
(function initProjectRepositoryUi() {
  const API = '/api/projects';
  const state = { projectId: '', data: null, activity: null, loading: false };

  function $(id) { return document.getElementById(id); }

  function escapeHtml(value) {
    return String(value ?? '')
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  }

  async function apiRequest(path, options = {}) {
    if (typeof window.apiRequest === 'function') return window.apiRequest(path, options);
    const headers = { ...(options.headers || {}) };
    if (options.body && !headers['Content-Type']) headers['Content-Type'] = 'application/json';
    const token = window.state?.token || localStorage.getItem('requirements_platform_token');
    if (token) headers.Authorization = `Bearer ${token}`;
    const response = await fetch(`${API}${path}`, {
      ...options,
      headers,
      body: options.body ? JSON.stringify(options.body) : undefined,
    });
    const payload = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(payload.message || `HTTP ${response.status}`);
    return payload;
  }

  function isSuperAdmin() {
    return typeof window.isSuperAdmin === 'function' ? window.isSuperAdmin() : false;
  }

  function renderUnlinked(data) {
    if (!data.providerReady) {
      return `
        <p class="muted-text">
          <span class="section-badge badge-gray">Sem conta Git</span>
          Configure a conta e o token em <strong>Agentes → Repositórios Git</strong> antes de ligar um repositório.
        </p>`;
    }
    if (!isSuperAdmin()) {
      return '<p class="muted-text">Ainda não há repositório ligado a este projecto.</p>';
    }
    return `
      <p class="muted-text">Ainda não há repositório ligado. Crie um novo ou ligue um que já exista.</p>
      <div class="form-grid compact mt-8">
        <label>Nome do novo repositório<input id="repoCreateName" value="${escapeHtml(data.suggestedName || '')}" /></label>
        <label>Dono<input id="repoCreateOwner" value="${escapeHtml(data.defaultOwner || '')}" placeholder="vazio = a sua conta" /></label>
        <label>Visibilidade
          <select id="repoCreateVisibility">
            <option value="private"${data.defaultVisibility !== 'public' ? ' selected' : ''}>Privado</option>
            <option value="public"${data.defaultVisibility === 'public' ? ' selected' : ''}>Público</option>
          </select>
        </label>
        <div class="settings-save-row"><button type="button" class="btn primary" id="repoCreateBtn">Criar repositório</button></div>
      </div>
      <hr class="mt-12" />
      <div class="form-grid compact mt-8">
        <label class="full">Ou ligar um repositório existente
          <input id="repoLinkRef" placeholder="dono/nome ou https://github.com/dono/nome" />
          <small class="field-help">A plataforma confirma o acesso com o token antes de guardar a ligação.</small>
        </label>
        <div class="settings-save-row"><button type="button" class="btn" id="repoLinkBtn">Ligar repositório</button></div>
      </div>`;
  }

  function renderActivity(activity) {
    if (!activity) {
      return '<p class="muted-text mt-8">Carregue o progresso para ver commits e ramos.</p>';
    }
    const commits = (activity.commits || []).slice(0, 8);
    const openspec = activity.openspec?.initialized
      ? '<span class="section-badge badge-green">OpenSpec presente</span>'
      : '<span class="section-badge badge-amber">Sem OpenSpec</span> ainda não existe <code>openspec/project.md</code>';
    return `
      <div class="mt-12">
        <p>${openspec}</p>
        <p class="muted-text">${(activity.branches || []).length} ramo(s) · ${(activity.changeRequests || []).length} pedido(s) de integração aberto(s)${activity.lastCommitAt ? ` · último commit ${new Date(activity.lastCommitAt).toLocaleString('pt-PT')}` : ''}</p>
        ${commits.length ? `<ul class="mt-8">${commits.map((commit) => `
          <li><code>${escapeHtml(commit.sha.slice(0, 7))}</code> ${escapeHtml(commit.message)} <span class="muted-text">— ${escapeHtml(commit.author)}</span></li>
        `).join('')}</ul>` : '<p class="muted-text mt-8">Sem commits ainda.</p>'}
        ${(activity.changeRequests || []).length ? `<ul class="mt-8">${activity.changeRequests.map((cr) => `
          <li><a href="${escapeHtml(cr.url)}" target="_blank" rel="noopener noreferrer">#${cr.number} ${escapeHtml(cr.title)}</a> <span class="muted-text">— ${escapeHtml(cr.branch)}${cr.draft ? ' (rascunho)' : ''}</span></li>
        `).join('')}</ul>` : ''}
      </div>`;
  }

  function renderLinked(repository, activity) {
    return `
      <div class="panel-title-row">
        <div>
          <strong><a href="${escapeHtml(repository.url)}" target="_blank" rel="noopener noreferrer">${escapeHtml(repository.fullName)}</a></strong>
          <p class="muted-text">
            ${escapeHtml(repository.providerLabel)} · ramo <code>${escapeHtml(repository.defaultBranch)}</code> ·
            ${repository.visibility === 'public' ? 'público' : 'privado'} ·
            ${repository.createdByPlatform ? 'criado pela plataforma' : 'ligado a um repositório existente'}
          </p>
        </div>
        <div class="ado-action-bar">
          <button type="button" class="btn tiny ghost" id="repoActivityBtn">Ver progresso</button>
          ${isSuperAdmin() ? '<button type="button" class="btn tiny ghost" id="repoUnlinkBtn">Desligar</button>' : ''}
        </div>
      </div>
      <p class="muted-text mt-8">Clonar: <code>${escapeHtml(repository.cloneUrl)}</code></p>
      ${renderActivity(activity)}`;
  }

  function paint() {
    const host = $('projectRepositoryPanel');
    if (!host) return;
    if (state.loading) {
      host.innerHTML = '<p class="muted-text">A carregar…</p>';
      return;
    }
    if (!state.data) {
      host.innerHTML = '<p class="muted-text">Seleccione um projecto.</p>';
      return;
    }
    host.innerHTML = state.data.repository
      ? renderLinked(state.data.repository, state.activity)
      : renderUnlinked(state.data);
  }

  async function load(projectId, { withActivity = false } = {}) {
    if (!projectId) return;
    state.projectId = projectId;
    state.loading = true;
    paint();
    try {
      const payload = await apiRequest(`/${encodeURIComponent(projectId)}/repository${withActivity ? '?activity=true' : ''}`);
      state.data = payload;
      if (withActivity) state.activity = payload.activity || null;
    } catch (error) {
      state.data = null;
      const host = $('projectRepositoryPanel');
      if (host) host.innerHTML = `<p class="muted-text">${escapeHtml(error.message)}</p>`;
      return;
    } finally {
      state.loading = false;
    }
    paint();
  }

  async function createRepository() {
    const payload = await apiRequest(`/${encodeURIComponent(state.projectId)}/repository/create`, {
      method: 'POST',
      body: {
        name: $('repoCreateName')?.value?.trim() || '',
        owner: $('repoCreateOwner')?.value?.trim() || '',
        visibility: $('repoCreateVisibility')?.value || 'private',
      },
    });
    window.showToast?.(`Repositório criado: ${payload.repository.fullName}`, 'ok');
    await load(state.projectId, { withActivity: true });
  }

  async function linkRepository() {
    const ref = $('repoLinkRef')?.value?.trim();
    if (!ref) throw new Error('Indique o repositório.');
    const payload = await apiRequest(`/${encodeURIComponent(state.projectId)}/repository/link`, {
      method: 'POST',
      body: { repository: ref },
    });
    window.showToast?.(`Repositório ligado: ${payload.repository.fullName}`, 'ok');
    await load(state.projectId, { withActivity: true });
  }

  async function unlinkRepository() {
    const name = state.data?.repository?.fullName || '';
    // Unlinking is reversible and never touches the remote, but it still surprises
    // people, so confirm which repository is being detached.
    if (!window.confirm(`Desligar ${name} deste projecto? O repositório em si não é alterado.`)) return;
    await apiRequest(`/${encodeURIComponent(state.projectId)}/repository`, { method: 'DELETE' });
    state.activity = null;
    window.showToast?.('Repositório desligado.', 'ok');
    await load(state.projectId);
  }

  function guard(fn) {
    return () => fn().catch((error) => window.showToast?.(error.message, 'error'));
  }

  document.addEventListener('click', (event) => {
    const id = event.target?.id;
    if (id === 'repoCreateBtn') guard(createRepository)();
    else if (id === 'repoLinkBtn') guard(linkRepository)();
    else if (id === 'repoUnlinkBtn') guard(unlinkRepository)();
    else if (id === 'repoActivityBtn') guard(() => load(state.projectId, { withActivity: true }))();
    else if (id === 'repoRefreshBtn') guard(() => load(state.projectId, { withActivity: Boolean(state.activity) }))();
  });

  window.ProjectRepositoryUI = {
    render(project) {
      if (!project?.id) return;
      if (project.id !== state.projectId) state.activity = null;
      load(project.id);
    },
  };
})();
