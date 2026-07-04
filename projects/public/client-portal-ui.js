(function () {
  function $(id) {
    return document.getElementById(id);
  }

  function escapeHtml(value) {
    return String(value ?? '')
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  }

  function apiRequest(path, options) {
    return window.apiRequest(path, options);
  }

  function showToast(msg, type) {
    window.showToast?.(msg, type);
  }

  const STAGE_LABELS = {
    idea: 'Ideia',
    discovery: 'Descoberta',
    requirements: 'Requisitos',
    architecture: 'Arquitectura',
    roadmap: 'Roadmap',
    implementation: 'Implementação',
    validation: 'Validação',
    delivery: 'Entrega',
    operations: 'Operação',
  };

  function stageLabel(id) {
    return STAGE_LABELS[id] || id;
  }

  async function loadClientPortal(projectId) {
    try {
      return await apiRequest(`/projects/${projectId}/client-portal`);
    } catch {
      return null;
    }
  }

  function isSuperAdminViewer() {
    return window.state?.user?.role === 'super_admin';
  }

  function renderClientPortal(project, portal) {
    const el = $('pdosClientPortal');
    if (!el || !project) return;

    const isClient = window.isClientUser?.() === true;
    if (!isClient && !isSuperAdminViewer()) {
      el.classList.add('hidden');
      return;
    }

    if (isClient) {
      el.classList.remove('hidden');
    }

    const data = portal || {};
    const milestones = data.milestones || [];
    const questions = data.openQuestions || [];
    const approvals = data.pendingApprovals || [];
    const deliverables = data.deliverables || [];

    el.innerHTML = `
      <section class="client-portal-shell">
        <header class="client-portal-head">
          <h3>Portal do cliente</h3>
          <p class="muted-text">Marcos, perguntas e aprovações — sem complexidade técnica.</p>
          ${data.deliveryConfidence != null ? `<span class="client-confidence">Confiança: <strong>${data.deliveryConfidence}%</strong></span>` : ''}
        </header>

        <div class="client-portal-grid">
          <article class="client-portal-card">
            <h4>Marcos do projecto</h4>
            <ul class="client-milestones">
              ${milestones.map((m) => `
                <li class="milestone-${escapeHtml(m.status)}">
                  <span class="milestone-label">${escapeHtml(stageLabel(m.id))}</span>
                  <span class="chip">${escapeHtml(m.status)}</span>
                  ${m.requiresHumanApproval && m.status !== 'approved' ? '<span class="milestone-gate" title="Aguarda aprovação">⏸</span>' : ''}
                </li>
              `).join('')}
            </ul>
          </article>

          <article class="client-portal-card">
            <h4>Perguntas para si (${questions.length})</h4>
            ${questions.length
    ? `<ul class="client-questions">${questions.slice(0, 5).map((q) => `
                <li><p>${escapeHtml(q.question || q.text || '')}</p></li>
              `).join('')}</ul>`
    : '<p class="muted-text">Sem perguntas pendentes.</p>'}
          </article>

          <article class="client-portal-card">
            <h4>Aprovações pendentes (${approvals.length})</h4>
            ${approvals.length
    ? `<ul class="client-approvals">${approvals.map((a) => `
                <li>
                  <span>${escapeHtml(stageLabel(a.stageId) || a.stageId)}</span>
                  <span class="chip">${escapeHtml(a.status)}</span>
                </li>
              `).join('')}</ul>`
    : '<p class="muted-text">Nada a aprovar de momento.</p>'}
          </article>

          <article class="client-portal-card">
            <h4>Entregáveis</h4>
            ${deliverables.length
    ? `<ul class="client-deliverables">${deliverables.slice(0, 6).map((d) => `
                <li>${escapeHtml(d.name)} <span class="chip">${escapeHtml(d.status)}</span></li>
              `).join('')}</ul>`
    : '<p class="muted-text">Sem entregáveis visíveis.</p>'}
          </article>
        </div>
      </section>
    `;

    el.querySelectorAll('[data-goto-tab]').forEach((btn) => {
      btn.addEventListener('click', () => window.switchToTab?.(btn.dataset.gotoTab));
    });
  }

  let clientPortalInflight = null;
  let lastClientPortalKey = '';

  async function refresh(project, options = {}) {
    if (!project?.id) return;
    const key = `${project.id}:${project.updatedAt || ''}`;
    if (!options.force && lastClientPortalKey === key && clientPortalInflight) {
      return clientPortalInflight;
    }
    clientPortalInflight = (async () => {
      const portal = await loadClientPortal(project.id);
      renderClientPortal(project, portal);
      lastClientPortalKey = key;
    })();
    try {
      await clientPortalInflight;
    } finally {
      clientPortalInflight = null;
    }
  }

  window.ClientPortalUI = {
    refresh,
    renderClientPortal,
    loadClientPortal,
  };
})();
