/**
 * Minimal REST client for the Git hosts the platform can provision repositories on.
 *
 * Only the operations the delivery pipeline needs: prove the token works, create or
 * read a repository, and observe what the agents pushed into it.
 */
const PROVIDERS = {
  github: { id: 'github', label: 'GitHub', defaultApiBaseUrl: 'https://api.github.com' },
  gitlab: { id: 'gitlab', label: 'GitLab', defaultApiBaseUrl: 'https://gitlab.com/api/v4' },
};

const REQUEST_TIMEOUT_MS = 15000;

function normalizeProviderId(value) {
  const id = String(value || '').trim().toLowerCase();
  return PROVIDERS[id] ? id : 'github';
}

function apiBaseUrlFor(providerId, configured = '') {
  const provider = PROVIDERS[normalizeProviderId(providerId)];
  const trimmed = String(configured || '').trim().replace(/\/+$/, '');
  return trimmed || provider.defaultApiBaseUrl;
}

function text(value, fallback = '') {
  const result = value === null || value === undefined ? '' : String(value).trim();
  return result || fallback;
}

/**
 * Owner/name from any of the forms an operator might paste: an https URL, an SSH
 * remote, or a bare "owner/name".
 */
function parseRepositoryRef(value) {
  const raw = text(value);
  if (!raw) return null;
  const sshMatch = raw.match(/^git@[^:]+:(.+?)(?:\.git)?$/i);
  const candidate = sshMatch
    ? sshMatch[1]
    : raw.replace(/^https?:\/\/[^/]+\//i, '').replace(/\.git$/i, '');
  const parts = candidate.split('/').map((part) => part.trim()).filter(Boolean);
  if (parts.length < 2) return null;
  return { owner: parts.slice(0, -1).join('/'), name: parts[parts.length - 1] };
}

function providerError(providerId, status, payload) {
  const message = text(payload?.message)
    || text(payload?.error_description)
    || text(payload?.error)
    || `HTTP ${status}`;
  if (status === 401) return new Error('Token rejeitado pelo fornecedor (401). Verifique a credencial.');
  if (status === 403) return new Error(`Sem permissao (403): ${message}`);
  if (status === 404) return new Error('Nao encontrado (404). Verifique o repositorio e o acesso do token.');
  if (status === 422) return new Error(`Pedido rejeitado (422): ${message}`);
  return new Error(`${PROVIDERS[providerId]?.label || providerId}: ${message}`);
}

function createGitProviderClient({ provider, token, apiBaseUrl } = {}) {
  const providerId = normalizeProviderId(provider);
  const baseUrl = apiBaseUrlFor(providerId, apiBaseUrl);
  const secret = text(token);
  if (!secret) throw new Error('Token do fornecedor Git em falta.');

  async function request(pathname, options = {}) {
    const headers = providerId === 'github'
      ? {
        Accept: 'application/vnd.github+json',
        'X-GitHub-Api-Version': '2022-11-28',
        Authorization: `Bearer ${secret}`,
        'User-Agent': 'yourlab-delivery-os',
      }
      : { 'PRIVATE-TOKEN': secret };
    if (options.body) headers['Content-Type'] = 'application/json';

    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
    let response;
    try {
      response = await fetch(`${baseUrl}${pathname}`, {
        method: options.method || 'GET',
        headers,
        body: options.body ? JSON.stringify(options.body) : undefined,
        signal: controller.signal,
      });
    } catch (error) {
      if (error?.name === 'AbortError') throw new Error('O fornecedor Git nao respondeu a tempo.');
      throw new Error(`Falha de rede ao contactar o fornecedor Git: ${error.message}`);
    } finally {
      clearTimeout(timer);
    }

    const payload = await response.json().catch(() => null);
    if (!response.ok) throw providerError(providerId, response.status, payload);
    return payload;
  }

  function normalizeRepository(raw) {
    if (providerId === 'github') {
      return {
        provider: providerId,
        owner: text(raw?.owner?.login),
        name: text(raw?.name),
        fullName: text(raw?.full_name),
        url: text(raw?.html_url),
        cloneUrl: text(raw?.clone_url),
        sshUrl: text(raw?.ssh_url),
        defaultBranch: text(raw?.default_branch, 'main'),
        visibility: raw?.private ? 'private' : 'public',
        projectId: text(raw?.id),
      };
    }
    const namespace = text(raw?.namespace?.full_path) || text(raw?.path_with_namespace).split('/').slice(0, -1).join('/');
    return {
      provider: providerId,
      owner: namespace,
      name: text(raw?.path),
      fullName: text(raw?.path_with_namespace),
      url: text(raw?.web_url),
      cloneUrl: text(raw?.http_url_to_repo),
      sshUrl: text(raw?.ssh_url_to_repo),
      defaultBranch: text(raw?.default_branch, 'main'),
      visibility: text(raw?.visibility, 'private'),
      projectId: text(raw?.id),
    };
  }

  function encodedProjectPath(owner, name) {
    return encodeURIComponent(`${owner}/${name}`);
  }

  return {
    provider: providerId,
    baseUrl,

    /** Confirms the token works and reports who it belongs to and what it can do. */
    async verify() {
      if (providerId === 'github') {
        const user = await request('/user');
        return {
          provider: providerId,
          account: text(user?.login),
          name: text(user?.name),
          accountUrl: text(user?.html_url),
        };
      }
      const user = await request('/user');
      return {
        provider: providerId,
        account: text(user?.username),
        name: text(user?.name),
        accountUrl: text(user?.web_url),
      };
    },

    /** Organisations/groups the token can create repositories in, besides the user. */
    async listOwners() {
      if (providerId === 'github') {
        const orgs = await request('/user/orgs').catch(() => []);
        return (Array.isArray(orgs) ? orgs : []).map((org) => ({
          id: text(org?.login), label: text(org?.login), kind: 'organization',
        }));
      }
      const groups = await request('/groups?min_access_level=30&per_page=100').catch(() => []);
      return (Array.isArray(groups) ? groups : []).map((group) => ({
        id: text(group?.full_path), label: text(group?.full_path), kind: 'group',
      }));
    },

    async getRepository(owner, name) {
      const raw = providerId === 'github'
        ? await request(`/repos/${encodeURIComponent(owner)}/${encodeURIComponent(name)}`)
        : await request(`/projects/${encodedProjectPath(owner, name)}`);
      return normalizeRepository(raw);
    },

    /**
     * `owner` empty means the authenticated account's own namespace.
     */
    async createRepository({ owner = '', name, description = '', visibility = 'private', autoInit = true }) {
      const repoName = text(name);
      if (!repoName) throw new Error('Nome do repositorio em falta.');
      const isPrivate = visibility !== 'public';

      if (providerId === 'github') {
        const body = {
          name: repoName,
          description: text(description).slice(0, 350),
          private: isPrivate,
          auto_init: autoInit !== false,
        };
        const raw = text(owner)
          ? await request(`/orgs/${encodeURIComponent(owner)}/repos`, { method: 'POST', body })
          : await request('/user/repos', { method: 'POST', body });
        return normalizeRepository(raw);
      }

      const body = {
        name: repoName,
        path: repoName,
        description: text(description).slice(0, 350),
        visibility: isPrivate ? 'private' : 'public',
        initialize_with_readme: autoInit !== false,
      };
      if (text(owner)) {
        const groups = await request(`/groups?search=${encodeURIComponent(owner)}`).catch(() => []);
        const group = (Array.isArray(groups) ? groups : [])
          .find((entry) => text(entry?.full_path) === text(owner));
        if (!group) throw new Error(`Grupo GitLab nao encontrado: ${owner}`);
        body.namespace_id = group.id;
      }
      return normalizeRepository(await request('/projects', { method: 'POST', body }));
    },

    async listBranches(owner, name) {
      const raw = providerId === 'github'
        ? await request(`/repos/${encodeURIComponent(owner)}/${encodeURIComponent(name)}/branches?per_page=100`)
        : await request(`/projects/${encodedProjectPath(owner, name)}/repository/branches?per_page=100`);
      return (Array.isArray(raw) ? raw : []).map((branch) => ({
        name: text(branch?.name),
        sha: text(branch?.commit?.sha || branch?.commit?.id),
      }));
    },

    async listCommits(owner, name, { branch = '', limit = 20 } = {}) {
      const perPage = Math.min(100, Math.max(1, Number(limit) || 20));
      const raw = providerId === 'github'
        ? await request(`/repos/${encodeURIComponent(owner)}/${encodeURIComponent(name)}/commits?per_page=${perPage}${branch ? `&sha=${encodeURIComponent(branch)}` : ''}`)
        : await request(`/projects/${encodedProjectPath(owner, name)}/repository/commits?per_page=${perPage}${branch ? `&ref_name=${encodeURIComponent(branch)}` : ''}`);
      return (Array.isArray(raw) ? raw : []).map((commit) => (providerId === 'github'
        ? {
          sha: text(commit?.sha),
          message: text(commit?.commit?.message).split('\n')[0],
          author: text(commit?.commit?.author?.name),
          committedAt: text(commit?.commit?.author?.date),
          url: text(commit?.html_url),
        }
        : {
          sha: text(commit?.id),
          message: text(commit?.title),
          author: text(commit?.author_name),
          committedAt: text(commit?.committed_date),
          url: text(commit?.web_url),
        }));
    },

    async listOpenChangeRequests(owner, name) {
      const raw = providerId === 'github'
        ? await request(`/repos/${encodeURIComponent(owner)}/${encodeURIComponent(name)}/pulls?state=open&per_page=50`)
        : await request(`/projects/${encodedProjectPath(owner, name)}/merge_requests?state=opened&per_page=50`);
      return (Array.isArray(raw) ? raw : []).map((entry) => (providerId === 'github'
        ? {
          number: Number(entry?.number) || 0,
          title: text(entry?.title),
          author: text(entry?.user?.login),
          branch: text(entry?.head?.ref),
          url: text(entry?.html_url),
          draft: entry?.draft === true,
          updatedAt: text(entry?.updated_at),
        }
        : {
          number: Number(entry?.iid) || 0,
          title: text(entry?.title),
          author: text(entry?.author?.username),
          branch: text(entry?.source_branch),
          url: text(entry?.web_url),
          draft: entry?.draft === true || entry?.work_in_progress === true,
          updatedAt: text(entry?.updated_at),
        }));
    },

    /** Lists file paths under a directory at a ref. Empty when the tree is absent. */
    async listTree(owner, name, prefix = '', ref = '') {
      try {
        if (providerId === 'github') {
          const branch = ref || (await this.getRepository(owner, name)).defaultBranch;
          const raw = await request(`/repos/${encodeURIComponent(owner)}/${encodeURIComponent(name)}/git/trees/${encodeURIComponent(branch)}?recursive=1`);
          return (Array.isArray(raw?.tree) ? raw.tree : [])
            .filter((entry) => entry?.type === 'blob' && String(entry.path || '').startsWith(prefix))
            .map((entry) => text(entry.path));
        }
        const raw = await request(`/projects/${encodedProjectPath(owner, name)}/repository/tree?recursive=true&per_page=100${prefix ? `&path=${encodeURIComponent(prefix)}` : ''}${ref ? `&ref=${encodeURIComponent(ref)}` : ''}`);
        return (Array.isArray(raw) ? raw : [])
          .filter((entry) => entry?.type === 'blob')
          .map((entry) => text(entry.path));
      } catch (error) {
        if (/404/.test(error.message)) return [];
        throw error;
      }
    },

    async createBranch(owner, name, branch, fromRef = '') {
      if (providerId === 'github') {
        const base = fromRef || (await this.getRepository(owner, name)).defaultBranch;
        const head = await request(`/repos/${encodeURIComponent(owner)}/${encodeURIComponent(name)}/git/ref/heads/${encodeURIComponent(base)}`);
        return request(`/repos/${encodeURIComponent(owner)}/${encodeURIComponent(name)}/git/refs`, {
          method: 'POST',
          body: { ref: `refs/heads/${branch}`, sha: text(head?.object?.sha) },
        });
      }
      return request(`/projects/${encodedProjectPath(owner, name)}/repository/branches`, {
        method: 'POST',
        body: { branch, ref: fromRef || (await this.getRepository(owner, name)).defaultBranch },
      });
    },

    /** Creates the file, or updates it in place when it already exists. */
    async writeFile(owner, name, filePath, content, { branch = '', message = 'chore: update' } = {}) {
      const encoded = Buffer.from(String(content), 'utf8').toString('base64');
      if (providerId === 'github') {
        const target = `/repos/${encodeURIComponent(owner)}/${encodeURIComponent(name)}/contents/${filePath.split('/').map(encodeURIComponent).join('/')}`;
        let sha = '';
        try {
          const existing = await request(`${target}${branch ? `?ref=${encodeURIComponent(branch)}` : ''}`);
          sha = text(existing?.sha);
        } catch (error) {
          if (!/404/.test(error.message)) throw error;
        }
        return request(target, {
          method: 'PUT',
          body: { message, content: encoded, ...(branch ? { branch } : {}), ...(sha ? { sha } : {}) },
        });
      }
      const target = `/projects/${encodedProjectPath(owner, name)}/repository/files/${encodeURIComponent(filePath)}`;
      const body = {
        branch: branch || (await this.getRepository(owner, name)).defaultBranch,
        content: String(content),
        commit_message: message,
      };
      try {
        return await request(target, { method: 'POST', body });
      } catch (error) {
        // GitLab rejects a create for a path that exists; update it instead.
        if (!/400|already exists/i.test(error.message)) throw error;
        return request(target, { method: 'PUT', body });
      }
    },

    async createChangeRequest(owner, name, { title, body = '', head, base = '' }) {
      if (providerId === 'github') {
        const target = base || (await this.getRepository(owner, name)).defaultBranch;
        const raw = await request(`/repos/${encodeURIComponent(owner)}/${encodeURIComponent(name)}/pulls`, {
          method: 'POST',
          body: { title, body, head, base: target },
        });
        return { number: Number(raw?.number) || 0, url: text(raw?.html_url), branch: head };
      }
      const target = base || (await this.getRepository(owner, name)).defaultBranch;
      const raw = await request(`/projects/${encodedProjectPath(owner, name)}/merge_requests`, {
        method: 'POST',
        body: { title, description: body, source_branch: head, target_branch: target },
      });
      return { number: Number(raw?.iid) || 0, url: text(raw?.web_url), branch: head };
    },

    /** Reads one file at a ref; returns null when it does not exist. */
    async readFile(owner, name, filePath, ref = '') {
      try {
        if (providerId === 'github') {
          const raw = await request(`/repos/${encodeURIComponent(owner)}/${encodeURIComponent(name)}/contents/${filePath.split('/').map(encodeURIComponent).join('/')}${ref ? `?ref=${encodeURIComponent(ref)}` : ''}`);
          if (!raw?.content) return null;
          return Buffer.from(raw.content, 'base64').toString('utf8');
        }
        const raw = await request(`/projects/${encodedProjectPath(owner, name)}/repository/files/${encodeURIComponent(filePath)}?ref=${encodeURIComponent(ref || 'HEAD')}`);
        if (!raw?.content) return null;
        return Buffer.from(raw.content, 'base64').toString('utf8');
      } catch (error) {
        if (/404/.test(error.message)) return null;
        throw error;
      }
    },
  };
}

module.exports = {
  PROVIDERS,
  apiBaseUrlFor,
  createGitProviderClient,
  normalizeProviderId,
  parseRepositoryRef,
};
