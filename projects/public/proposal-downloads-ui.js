/**
 * Download / view controls for generated commercial proposals (any tab).
 */
(function initProposalDownloads(global) {
  const TOKEN_KEY = 'requirements_platform_token';

  function escapeHtml(value) {
    return String(value || '')
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  }

  function canViewProposalHistory() {
    try {
      return typeof isSuperAdmin === 'function' && isSuperAdmin();
    } catch {
      return false;
    }
  }

  function findLatestCommercial(project) {
    const generated = Array.isArray(project?.generated) ? project.generated : [];
    return generated.find((entry) => entry.mode === 'commercial') || null;
  }

  function findLatestAny(project) {
    const generated = Array.isArray(project?.generated) ? project.generated : [];
    return generated[0] || null;
  }

  function apiBase(projectId, genId) {
    return `/api/projects/projects/${encodeURIComponent(projectId)}/generated/${encodeURIComponent(genId)}`;
  }

  function authHeaders() {
    const token = localStorage.getItem(TOKEN_KEY);
    return token ? { Authorization: `Bearer ${token}` } : {};
  }

  async function fetchProposalFormat(projectId, genId, format, { download = false } = {}) {
    const suffix = download ? '?download=1' : '';
    const res = await fetch(`${apiBase(projectId, genId)}/${format}${suffix}`, {
      headers: authHeaders(),
    });
    if (!res.ok) {
      const payload = await res.json().catch(() => ({}));
      throw new Error(payload.message || `Falha ao obter ${format.toUpperCase()}.`);
    }
    return res;
  }

  async function downloadProposal(projectId, genId, format) {
    const res = await fetchProposalFormat(projectId, genId, format, { download: true });
    const blob = await res.blob();
    const slug = format === 'html' ? 'proposta.html' : 'proposta.md';
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement('a');
    anchor.href = url;
    anchor.download = slug;
    anchor.click();
    URL.revokeObjectURL(url);
  }

  async function viewProposalHtml(projectId, genId, preOpenedTab = null) {
    const res = await fetchProposalFormat(projectId, genId, 'html');
    const html = await res.text();
    if (!html.trim()) {
      throw new Error('A proposta HTML veio vazia.');
    }

    const blob = new Blob([html], { type: 'text/html;charset=utf-8' });
    const url = URL.createObjectURL(blob);

    if (preOpenedTab && !preOpenedTab.closed) {
      preOpenedTab.location.href = url;
      setTimeout(() => URL.revokeObjectURL(url), 120000);
      return preOpenedTab;
    }

    const tab = window.open(url, '_blank', 'noopener,noreferrer');
    if (!tab) {
      URL.revokeObjectURL(url);
      throw new Error('Pop-up bloqueado. Permita pop-ups ou use Download HTML.');
    }
    setTimeout(() => URL.revokeObjectURL(url), 120000);
    return tab;
  }

  function renderActions(projectId, entry, { compact = false, showDelete = false } = {}) {
    if (!canViewProposalHistory()) return '';
    if (!projectId || !entry?.id) return '';

    const dateLabel = entry.generatedAt
      ? new Date(entry.generatedAt).toLocaleString('pt-PT')
      : '';
    const cls = compact ? 'btn tiny' : 'btn tiny ghost';

    return `
      <div class="proposal-download-actions${compact ? ' is-compact' : ''}" data-proposal-gen="${escapeHtml(entry.id)}">
        ${dateLabel ? `<span class="proposal-download-meta muted-text">${escapeHtml(dateLabel)}</span>` : ''}
        <button type="button" class="${cls}" data-proposal-action="view-html" data-project-id="${escapeHtml(projectId)}" data-gen-id="${escapeHtml(entry.id)}">Ver HTML</button>
        <button type="button" class="${cls}" data-proposal-action="download-html" data-project-id="${escapeHtml(projectId)}" data-gen-id="${escapeHtml(entry.id)}">Download HTML</button>
        <button type="button" class="${cls}" data-proposal-action="download-md" data-project-id="${escapeHtml(projectId)}" data-gen-id="${escapeHtml(entry.id)}">Download MD</button>
        ${showDelete && entry.mode === 'commercial' ? `<button type="button" class="${cls} ghost danger" data-proposal-action="delete" data-project-id="${escapeHtml(projectId)}" data-gen-id="${escapeHtml(entry.id)}">Eliminar</button>` : ''}
      </div>
    `;
  }

  function renderBar(project) {
    if (!project?.id) return '';
    const entry = findLatestCommercial(project);
    if (!entry) return '';

    return `
      <div class="proposal-download-bar-inner">
        <div class="proposal-download-bar-copy">
          <strong>Proposta comercial</strong>
          <span class="muted-text">Última geração — descarregue ou visualize em qualquer página do projecto.</span>
        </div>
        ${renderActions(project.id, entry, { compact: true })}
      </div>
    `;
  }

  function renderGeneratedList(project, options = {}) {
    const { commercialOnly = false, showDelete = false } = options;
    if (!canViewProposalHistory()) {
      return '';
    }
    let generated = Array.isArray(project?.generated) ? project.generated : [];
    if (commercialOnly) {
      generated = generated.filter((entry) => entry.mode === 'commercial');
    }
    if (!generated.length) {
      return `<div class="simple-item"><small>${commercialOnly ? 'Nenhuma proposta comercial gerada ainda.' : 'Nenhum pacote gerado ainda.'}</small></div>`;
    }

    return generated.slice(0, 20).map((entry) => `
      <div class="simple-item proposal-generated-item" data-gen-id="${escapeHtml(entry.id)}">
        <strong>${escapeHtml(entry.mode === 'commercial' ? 'Proposta comercial' : (entry.mode || 'bundle'))} · ${entry.generatedAt ? new Date(entry.generatedAt).toLocaleString('pt-PT') : ''}</strong>
        ${entry.mode !== 'commercial' ? `<small>Módulos: ${entry.selectedModules?.length ? escapeHtml(entry.selectedModules.join(', ')) : 'todos'}</small>` : ''}
        ${renderActions(project.id, entry, { showDelete })}
      </div>
    `).join('');
  }

  async function deleteGeneratedProposal(projectId, genId) {
    if (typeof apiRequest === 'function') {
      return apiRequest(
        `/projects/${encodeURIComponent(projectId)}/generated/${encodeURIComponent(genId)}`,
        { method: 'DELETE' }
      );
    }
    const res = await fetch(apiBase(projectId, genId), {
      method: 'DELETE',
      headers: authHeaders(),
    });
    const payload = await res.json().catch(() => ({}));
    if (!res.ok) {
      throw new Error(payload.message || 'Nao foi possivel eliminar a proposta.');
    }
    return payload;
  }

  async function reloadProjectAfterChange(projectId) {
    if (typeof loadProjectById === 'function') {
      await loadProjectById(projectId, { switchTab: false });
      return;
    }
    if (typeof renderProjectDetails === 'function') renderProjectDetails();
    if (global.PdosUI?.renderAll && global.state?.selectedProject) {
      global.PdosUI.renderAll(global.state.selectedProject);
    }
  }

  function mountBar() {
    const bar = document.getElementById('proposalDownloadBar');
    if (!bar) return;
    bar.classList.add('hidden');
    bar.innerHTML = '';
  }

  async function handleActionClick(event) {
    const btn = event.target.closest('[data-proposal-action]');
    if (!btn) return;
    event.preventDefault();

    const projectId = btn.getAttribute('data-project-id');
    const genId = btn.getAttribute('data-gen-id');
    const action = btn.getAttribute('data-proposal-action');
    if (!projectId || !genId || !action) return;

    const original = btn.textContent;
    btn.disabled = true;
    btn.textContent = 'A preparar…';

    let previewTab = null;
    if (action === 'view-html') {
      previewTab = window.open('about:blank', '_blank');
    }

    try {
      if (action === 'view-html') {
        await viewProposalHtml(projectId, genId, previewTab);
      } else if (action === 'download-html') {
        await downloadProposal(projectId, genId, 'html');
      } else if (action === 'download-md') {
        await downloadProposal(projectId, genId, 'markdown');
      } else if (action === 'delete') {
        if (!global.confirm('Eliminar esta proposta comercial? Os ficheiros gerados serão removidos.')) {
          return;
        }
        btn.textContent = 'A eliminar…';
        await deleteGeneratedProposal(projectId, genId);
        await reloadProjectAfterChange(projectId);
        if (typeof global.showToast === 'function') {
          global.showToast('Proposta eliminada.', 'ok');
        }
        return;
      }
      if (typeof global.showToast === 'function') {
        global.showToast(action === 'view-html' ? 'Proposta aberta num novo separador.' : 'Download iniciado.', 'ok');
      }
    } catch (error) {
      if (previewTab && !previewTab.closed) {
        previewTab.close();
      }
      if (typeof global.showToast === 'function') {
        global.showToast(error.message, 'error');
      }
    } finally {
      btn.disabled = false;
      btn.textContent = original;
    }
  }

  document.addEventListener('click', handleActionClick);

  global.ProposalDownloads = {
    canViewProposalHistory,
    findLatestCommercial,
    findLatestAny,
    renderActions,
    renderBar,
    renderGeneratedList,
    mountBar,
    deleteGeneratedProposal,
    downloadProposal,
    viewProposalHtml,
  };
})(window);
