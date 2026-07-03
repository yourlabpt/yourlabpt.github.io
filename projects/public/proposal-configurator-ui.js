/**
 * Proposal Configurator modal — pre-fills from plan phases, collects amounts at generation time.
 */
(function initProposalConfigurator(global) {
  const state = {
    projectId: null,
    config: null,
    paymentPreview: null,
    onGenerated: null,
  };

  function $(id) {
    return document.getElementById(id);
  }

  function escapeHtml(value) {
    return String(value || '')
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  }

  function formatMoney(amount, currency) {
    const n = Number(amount);
    if (!Number.isFinite(n)) return '—';
    try {
      return new Intl.NumberFormat('pt-PT', { style: 'currency', currency: currency || 'EUR' }).format(n);
    } catch {
      return `${n.toFixed(2)} ${currency || 'EUR'}`;
    }
  }

  function linesToArray(text) {
    return String(text || '')
      .split('\n')
      .map((line) => line.trim())
      .filter(Boolean);
  }

  function readConfigFromForm() {
    const phases = Array.from(document.querySelectorAll('[data-proposal-phase-row]')).map((row, index) => ({
      order: index + 1,
      id: row.dataset.phaseId || `F${index + 1}`,
      name: row.dataset.phaseName || '',
      objective: row.dataset.phaseObjective || '',
      durationWeeks: Number(row.dataset.phaseWeeks || 0),
      amount: Math.max(0, Number(row.querySelector('[data-phase-amount]')?.value || 0)),
    }));

    return {
      ...state.config,
      phases,
      initialPercent: Math.max(0, Math.min(100, Number($('proposalInitialPercent')?.value || 30))),
      finalPercent: Math.max(0, Math.min(100, Number($('proposalFinalPercent')?.value || 20))),
      validityDays: Number($('proposalValidityDays')?.value || 30),
      warrantyDays: Number($('proposalWarrantyDays')?.value || 30),
      exclusions: linesToArray($('proposalExclusions')?.value),
      notes: linesToArray($('proposalNotes')?.value),
    };
  }

  function computeLocalPaymentPreview(config) {
    const phases = config.phases || [];
    const currency = config.currency || 'EUR';
    const total = phases.reduce((sum, p) => sum + Number(p.amount || 0), 0);
    const initialPercent = Number(config.initialPercent || 0);
    const finalPercent = Number(config.finalPercent || 0);
    const initialAmount = total * (initialPercent / 100);
    const finalAmount = total * (finalPercent / 100);
    const middleTotal = Math.max(0, total - initialAmount - finalAmount);
    const weightSum = phases.reduce((sum, p) => {
      const w = Number(p.amount || 0);
      return sum + (w > 0 ? w : Number(p.durationWeeks || 0));
    }, 0) || phases.length || 1;

    const milestones = [
      {
        label: 'Pagamento inicial',
        trigger: 'Adjudicação',
        amount: initialAmount,
        percent: initialPercent,
      },
    ];

    phases.forEach((phase, index) => {
      const w = Number(phase.amount || 0) > 0 ? Number(phase.amount) : Number(phase.durationWeeks || 0);
      const share = middleTotal * (w / weightSum);
      milestones.push({
        label: `Entrega — ${phase.name || `Fase ${index + 1}`}`,
        trigger: `Entrega da fase ${index + 1}`,
        amount: share,
        percent: total > 0 ? (share / total) * 100 : 0,
      });
    });

    milestones.push({
      label: 'Pagamento final',
      trigger: 'Aceitação / entrega definitiva',
      amount: finalAmount,
      percent: finalPercent,
    });

    return { total, currency, milestones };
  }

  function renderPaymentPreview() {
    const previewEl = $('proposalPaymentPreview');
    if (!previewEl) return;
    const config = readConfigFromForm();
    const payment = computeLocalPaymentPreview(config);
    const rows = payment.milestones.map((row) => `
      <tr>
        <td>${escapeHtml(row.label)}</td>
        <td>${escapeHtml(row.trigger)}</td>
        <td>${escapeHtml(formatMoney(row.amount, payment.currency))}</td>
        <td>${escapeHtml(row.percent.toFixed(1))}%</td>
      </tr>
    `).join('');

    previewEl.innerHTML = `
      <p class="muted-text">Total: <strong>${escapeHtml(formatMoney(payment.total, payment.currency))}</strong></p>
      <table class="proposal-config-table">
        <thead><tr><th>Marco</th><th>Gatilho</th><th>Valor</th><th>%</th></tr></thead>
        <tbody>${rows}</tbody>
      </table>
    `;
  }

  function renderPhaseRows(config) {
    const tbody = $('proposalPhaseRows');
    if (!tbody) return;
    const currency = config.currency || 'EUR';
    tbody.innerHTML = (config.phases || []).map((phase, index) => `
      <tr data-proposal-phase-row
          data-phase-id="${escapeHtml(phase.id)}"
          data-phase-name="${escapeHtml(phase.name)}"
          data-phase-objective="${escapeHtml(phase.objective)}"
          data-phase-weeks="${Number(phase.durationWeeks || 0)}">
        <td>#${index + 1}</td>
        <td>${escapeHtml(phase.name)}</td>
        <td>${Number(phase.durationWeeks || 0) || '—'}</td>
        <td class="proposal-phase-objective">${escapeHtml(phase.objective || '—')}</td>
        <td>
          <input type="number" min="0" step="0.01" data-phase-amount
            value="${Number(phase.amount || 0)}"
            aria-label="Valor fase ${index + 1} (${currency})" />
        </td>
      </tr>
    `).join('');

    tbody.querySelectorAll('[data-phase-amount]').forEach((input) => {
      input.addEventListener('input', () => {
        renderTotals();
        renderPaymentPreview();
      });
    });
  }

  function renderTotals() {
    const config = readConfigFromForm();
    const total = (config.phases || []).reduce((sum, p) => sum + Number(p.amount || 0), 0);
    const totalEl = $('proposalPhaseTotal');
    if (totalEl) {
      totalEl.textContent = formatMoney(total, config.currency || 'EUR');
    }
  }

  function populateForm(config) {
    $('proposalConfigProjectName').textContent = config.projectName || '—';
    $('proposalConfigClientName').textContent = config.clientName || '—';
    $('proposalConfigCode').textContent = config.proposalCode || '—';
    $('proposalConfigCurrency').textContent = config.currency || 'EUR';
    $('proposalInitialPercent').value = config.initialPercent ?? 30;
    $('proposalFinalPercent').value = config.finalPercent ?? 20;
    $('proposalValidityDays').value = config.validityDays ?? 30;
    $('proposalWarrantyDays').value = config.warrantyDays ?? 30;
    $('proposalExclusions').value = (config.exclusions || []).join('\n');
    $('proposalNotes').value = (config.notes || []).join('\n');
    renderPhaseRows(config);
    renderTotals();
    renderPaymentPreview();
  }

  function openModal() {
    const modal = $('proposalConfiguratorModal');
    if (!modal) return;
    modal.classList.remove('hidden');
    modal.setAttribute('aria-hidden', 'false');
  }

  function closeModal() {
    const modal = $('proposalConfiguratorModal');
    if (!modal) return;
    modal.classList.add('hidden');
    modal.setAttribute('aria-hidden', 'true');
  }

  async function apiRequest(path, options = {}) {
    if (typeof global.apiRequest === 'function') {
      return global.apiRequest(path, options);
    }
    throw new Error('apiRequest indisponível.');
  }

  async function open(projectId, { onGenerated } = {}) {
    if (!projectId) return;
    state.projectId = projectId;
    state.onGenerated = onGenerated || null;

    const generateBtn = $('proposalConfiguratorGenerateBtn');
    if (generateBtn) {
      generateBtn.disabled = true;
      generateBtn.textContent = 'A carregar…';
    }

    try {
      const payload = await apiRequest(`/projects/${encodeURIComponent(projectId)}/proposal-config`);
      state.config = payload.config;
      state.paymentPreview = payload.paymentPreview;
      populateForm(payload.config);
      openModal();
    } catch (error) {
      if (typeof global.showToast === 'function') {
        global.showToast(error.message, 'error');
      }
    } finally {
      if (generateBtn) {
        generateBtn.disabled = false;
        generateBtn.textContent = 'Gerar proposta';
      }
    }
  }

  async function handleGenerate() {
    if (!state.projectId) return;
    const generateBtn = $('proposalConfiguratorGenerateBtn');
    const config = readConfigFromForm();
    const total = (config.phases || []).reduce((sum, p) => sum + Number(p.amount || 0), 0);
    if (total <= 0) {
      if (typeof global.showToast === 'function') {
        global.showToast('Defina valores superiores a zero para pelo menos uma fase.', 'error');
      }
      return;
    }
    if (config.initialPercent + config.finalPercent > 100) {
      if (typeof global.showToast === 'function') {
        global.showToast('A soma dos percentuais inicial e final não pode exceder 100%.', 'error');
      }
      return;
    }

    if (generateBtn) {
      generateBtn.disabled = true;
      generateBtn.textContent = 'A gerar…';
    }

    try {
      const dryRunToggle = document.getElementById('dryRunToggle');
      const res = await apiRequest(`/projects/${encodeURIComponent(state.projectId)}/generate`, {
        method: 'POST',
        body: {
          mode: 'commercial',
          proposalConfig: config,
          dryRun: dryRunToggle?.checked || false,
        },
      });

      closeModal();
      if (typeof global.showToast === 'function') {
        global.showToast('Proposta gerada. Use Ver HTML ou Download na barra superior.', 'ok');
      }

      if (typeof state.onGenerated === 'function') {
        await state.onGenerated(res);
      } else if (typeof global.loadProjectById === 'function' && global.state?.selectedProject?.id) {
        await global.loadProjectById(global.state.selectedProject.id);
      }
    } catch (error) {
      if (typeof global.showToast === 'function') {
        global.showToast(error.message, 'error');
      }
    } finally {
      if (generateBtn) {
        generateBtn.disabled = false;
        generateBtn.textContent = 'Gerar proposta';
      }
    }
  }

  function wireEvents() {
    $('proposalConfiguratorClose')?.addEventListener('click', closeModal);
    $('proposalConfiguratorCancel')?.addEventListener('click', closeModal);
    $('proposalConfiguratorGenerateBtn')?.addEventListener('click', handleGenerate);
    $('proposalConfiguratorModal')?.querySelector('[data-close-proposal-config]')?.addEventListener('click', closeModal);

    ['proposalInitialPercent', 'proposalFinalPercent'].forEach((id) => {
      $(id)?.addEventListener('input', renderPaymentPreview);
    });
  }

  wireEvents();

  global.ProposalConfigurator = {
    open,
    close: closeModal,
  };
})(window);
