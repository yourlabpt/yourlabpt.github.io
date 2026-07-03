(function () {
  const mapState = {
    focusStakeholderId: '',
    focusRequirementId: '',
    stkList: [],
    showOrphans: true,
    showVOverlay: true,
    showEdges: true,
    hierarchyCache: null,
    hierarchyFull: null,
    dragReqId: null,
    dragSourceColumn: '',
    edgesObserver: null,
    scrollHandler: null,
    scrollEl: null,
  };

  const V_COLUMNS = [
    { id: 'stakeholder', label: 'Stakeholder', short: 'STK', type: 'stakeholder', layer: 0 },
    { id: 'functional', label: 'Funcional', short: 'FR', type: 'functional', layer: 1 },
    { id: 'non_functional', label: 'Não funcional', short: 'RNF', type: 'non_functional', layer: 2 },
    { id: 'test_case', label: 'Teste / Aceite', short: 'TC', type: 'test_case', layer: 3 },
  ];

  function $(id) {
    return document.getElementById(id);
  }

  function canEditMap() {
    return typeof canEdit === 'function' && canEdit();
  }

  function cleanupEdgeListeners() {
    if (mapState.edgesObserver) {
      mapState.edgesObserver.disconnect();
      mapState.edgesObserver = null;
    }
    if (mapState.scrollEl && mapState.scrollHandler) {
      mapState.scrollEl.removeEventListener('scroll', mapState.scrollHandler);
    }
    mapState.scrollEl = null;
    mapState.scrollHandler = null;
  }

  async function fetchHierarchy(project, options = {}) {
    if (!project?.id) return null;
    const params = new URLSearchParams();
    const stkFocus = options.focusStakeholderId ?? mapState.focusStakeholderId;
    const frFocus = options.focusRequirementId ?? mapState.focusRequirementId;
    if (stkFocus && options.applyStkFocus !== false) {
      params.set('focusStakeholderId', stkFocus);
    }
    if (frFocus) {
      params.set('focusRequirementId', frFocus);
    }
    const qs = params.toString();
    const payload = await apiRequest(
      `/projects/${encodeURIComponent(project.id)}/requirements/hierarchy${qs ? `?${qs}` : ''}`
    );
    if (options.storeAsFull) {
      mapState.hierarchyFull = payload;
    } else {
      mapState.hierarchyCache = payload;
    }
    return payload;
  }

  function getStkList(hierarchy, project) {
    const fromNodes = (hierarchy?.byLevel?.stakeholder || []).map((n) => ({
      id: n.id,
      title: n.title || n.id,
    }));
    if (fromNodes.length) return fromNodes;
    return (project?.requirements || [])
      .filter((r) => r.type === 'stakeholder')
      .map((r) => ({ id: r.id, title: r.title || r.id }));
  }

  function ensureActiveStk(hierarchy, project) {
    mapState.stkList = getStkList(hierarchy, project);
    if (!mapState.stkList.length) {
      mapState.focusStakeholderId = '';
      return -1;
    }
    const valid = mapState.stkList.some((s) => s.id === mapState.focusStakeholderId);
    if (!valid) mapState.focusStakeholderId = mapState.stkList[0].id;
    return mapState.stkList.findIndex((s) => s.id === mapState.focusStakeholderId);
  }

  function stepActiveStk(delta) {
    const idx = mapState.stkList.findIndex((s) => s.id === mapState.focusStakeholderId);
    const next = mapState.stkList[idx + delta];
    if (next) mapState.focusStakeholderId = next.id;
  }

  function filterHierarchyToStk(hierarchy, stkId) {
    if (!stkId || !hierarchy) return hierarchy;
    const nodes = (hierarchy.nodes || []).filter(
      (n) => n.id === stkId || n.stakeholderRootId === stkId
    );
    const byLevel = { other: [] };
    for (const col of V_COLUMNS) byLevel[col.type] = [];
    for (const node of nodes) {
      const type = node.type;
      if (byLevel[type]) byLevel[type].push(node);
      else byLevel.other.push(node);
    }
    return { ...hierarchy, nodes, byLevel, tree: nodes };
  }

  function stkChainStats(hierarchy) {
    const by = hierarchy?.byLevel || {};
    return {
      fr: (by.functional || []).length,
      rnf: (by.non_functional || []).length,
      tc: (by.test_case || []).length,
    };
  }

  function reqById(project, id) {
    return (project.requirements || []).find((r) => r.id === id);
  }

  function renderMapCard(req, project, extra = {}) {
    const orphan = extra.orphan;
    const hero = extra.hero;
    const summary = shortText(req.shall || req.need || req.title, 80);
    const stkRoot = req.stakeholderRootId || req.parentId || '';
    const modTags = Array.isArray(req.moduleTags) ? req.moduleTags.filter(Boolean) : [];
    const modBadge = modTags[0]
      ? `<span class="req-mod-badge">${escapeHtml(modTags[0])}</span>`
      : '';
    const stkBadge = stkRoot && req.type !== 'stakeholder' && !hero
      ? `<span class="req-card-stk" title="Stakeholder raiz">↑ ${escapeHtml(stkRoot)}</span>`
      : '';
    const status = escapeHtml(req.status || 'draft');
    const canUnlink = canEditMap() && !hero && !orphan && req.type !== 'stakeholder';
    const actions = canUnlink ? `
        <div class="req-map-card-actions">
          <button type="button" class="btn tiny ghost req-map-unlink-btn" data-unlink-req="${escapeHtml(req.id)}" title="Remover da cadeia V (torna-se órfão)">Desligar</button>
        </div>
      ` : '';
    return `
      <article class="req-map-card req-map-card--${escapeHtml(req.type || 'other')} ${orphan ? 'is-orphan' : ''} ${hero ? 'is-l0-hero' : ''}"
        draggable="${canEditMap() && !hero ? 'true' : 'false'}"
        data-req-id="${escapeHtml(req.id)}"
        data-req-type="${escapeHtml(req.type)}">
        <button type="button" class="req-map-card-main" data-open-req="${escapeHtml(req.id)}">
          <div class="req-map-card-top">
            <span class="req-map-card-id">${escapeHtml(req.id)}</span>
            ${hero ? '<span class="req-map-l0-badge">L0 · Stakeholder</span>' : `<span class="req-map-card-status">${status}</span>`}
          </div>
          <strong class="req-map-card-title">${escapeHtml(req.title || summary)}</strong>
          ${hero && summary ? `<p class="req-map-card-summary">${escapeHtml(summary)}</p>` : ''}
          <div class="req-map-card-foot">
            ${stkBadge}
            ${modBadge}
          </div>
        </button>
        ${actions}
      </article>
    `;
  }

  function nextStkPreview(project) {
    let max = 0;
    for (const r of (project?.requirements || [])) {
      if (r.type !== 'stakeholder') continue;
      const m = String(r.id || '').match(/^STK-(\d+)$/i);
      if (m) max = Math.max(max, Number(m[1]));
    }
    return `STK-${String(max + 1).padStart(2, '0')}`;
  }

  function renderStkNavigator(project, hierarchy) {
    const idx = mapState.stkList.findIndex((s) => s.id === mapState.focusStakeholderId);
    const total = mapState.stkList.length;
    const current = idx >= 0 ? mapState.stkList[idx] : null;
    const stkNode = (hierarchy?.byLevel?.stakeholder || [])[0]
      || hierarchy?.nodes?.find((n) => n.id === mapState.focusStakeholderId);
    const title = stkNode?.title || current?.title || mapState.focusStakeholderId || '—';
    const chain = stkChainStats(hierarchy);
    const stats = mapState.hierarchyFull?.stats || hierarchy?.stats || {};
    const orphanCount = collectOrphansForPanel(hierarchy).length;

    if (!total) {
      return `
        <div class="req-map-stk-nav req-map-stk-nav--empty">
          <p class="muted-text">Sem requisitos stakeholder (L0). Crie STK ou use reparar órfãos.</p>
        </div>
      `;
    }

    return `
      <div class="req-map-toolbar req-map-toolbar--single-stk">
        <div class="req-map-stk-header">
          <div class="req-map-stk-pager" aria-label="Navegar stakeholders">
            <button type="button" class="req-map-stk-step btn" id="reqMapStkPrev" ${idx <= 0 ? 'disabled' : ''} title="Stakeholder anterior" aria-label="Stakeholder anterior">←</button>
            <button type="button" class="req-map-stk-step btn" id="reqMapStkNext" ${idx >= total - 1 ? 'disabled' : ''} title="Próximo stakeholder" aria-label="Próximo stakeholder">→</button>
          </div>
          <div class="req-map-stk-identity">
            <div class="req-map-stk-headline">
              <span class="req-map-stk-index">${idx + 1} / ${total}</span>
              <strong class="req-map-stk-id">${escapeHtml(mapState.focusStakeholderId)}</strong>
              <span class="req-map-stk-title">${escapeHtml(shortText(title, 80))}</span>
            </div>
            <div class="req-map-stk-chain-stats">
              <span class="req-map-chain-pill req-map-chain-pill--fr">${chain.fr} FR</span>
              <span class="req-map-chain-pill req-map-chain-pill--rnf">${chain.rnf} RNF</span>
              <span class="req-map-chain-pill req-map-chain-pill--tc">${chain.tc} TC</span>
            </div>
          </div>
          <label class="req-map-stk-jump-wrap">
            <span class="req-map-stk-jump-label">Ir para</span>
            <select id="reqMapStkJump" class="req-map-select req-map-stk-jump" title="Ir para stakeholder">
              ${mapState.stkList.map((s, i) => `
                <option value="${escapeHtml(s.id)}" ${s.id === mapState.focusStakeholderId ? 'selected' : ''}>
                  ${i + 1}. ${escapeHtml(s.id)} — ${escapeHtml(shortText(s.title, 36))}
                </option>
              `).join('')}
            </select>
          </label>
        </div>
        <div class="req-map-toolbar-actions">
          <div class="req-map-stat-pill">
            <span class="req-map-stat-label">Cobertura V</span>
            <strong class="req-map-stat-value">${stats.coveragePct ?? 0}%</strong>
          </div>
          ${orphanCount ? `
            <button type="button" class="req-map-orphans-toggle btn tiny ghost is-active" id="reqMapToggleOrphans" title="Órfãos visíveis na secção inferior">
              Órfãos (${orphanCount})
            </button>
          ` : ''}
          <label class="req-map-toggle-edges checkline">
            <input type="checkbox" id="reqMapShowEdges" ${mapState.showEdges ? 'checked' : ''} />
            Ligações
          </label>
        </div>
        <p class="req-map-dnd-hint muted-text">Camadas V-cycle: L0 STK → L1 FR → L2 RNF → L3 TC. Use «+ Adicionar» em cada coluna ou arraste órfãos entre camadas.</p>
      </div>
    `;
  }

  function renderVMapToolbar(project, hierarchy) {
    return renderStkNavigator(project, hierarchy);
  }

  function collectOrphansForPanel(hierarchy) {
    const full = mapState.hierarchyFull || hierarchy;
    const list = [...(full?.orphans || [])];
    const seen = new Set(list.map((o) => o.id));
    for (const node of (full?.byLevel?.other || [])) {
      if (!node?.id || seen.has(node.id)) continue;
      seen.add(node.id);
      list.push({
        id: node.id,
        type: node.type,
        title: node.title,
        reason: 'unclassified_type',
      });
    }
    return list;
  }

  function renderVMapColumns(project, hierarchy) {
    const fullOrphans = collectOrphansForPanel(hierarchy);
    const orphanIds = new Set(fullOrphans.map((o) => o.id));
    const filteredReqs = window.RequirementsUI?.getFilteredForUi
      ? window.RequirementsUI.getFilteredForUi(project)
      : (project.requirements || []);
    const allowed = new Set(filteredReqs.map((r) => r.id));

    const columnsHtml = V_COLUMNS.map((col) => {
      const nodes = (hierarchy?.byLevel?.[col.type] || []).filter((n) => allowed.has(n.id) && !orphanIds.has(n.id));
      const isStkCol = col.type === 'stakeholder';
      return `
        <div class="req-map-column req-map-column--${escapeHtml(col.type)}" data-v-column="${escapeHtml(col.type)}">
          <div class="req-map-column-head">
            <span class="req-map-layer-badge" title="Camada V-cycle ${col.layer}">L${col.layer}</span>
            <span class="req-map-level-badge">${escapeHtml(col.short)}</span>
            <strong>${escapeHtml(col.label)}</strong>
            ${canEditMap() ? `
              <button type="button" class="req-map-add-layer btn tiny ghost" data-add-layer="${escapeHtml(col.type)}" title="Adicionar requisito na camada L${col.layer}">
                + Adicionar
              </button>
            ` : ''}
            <span class="req-count-badge">${nodes.length}</span>
          </div>
          <div class="req-map-column-body req-map-dropzone" data-drop-type="${escapeHtml(col.type)}" data-v-drop-column="${escapeHtml(col.type)}">
            ${nodes.length
              ? nodes.map((n) => {
                const req = reqById(project, n.id) || n;
                return renderMapCard({ ...req, stakeholderRootId: n.stakeholderRootId, parentId: n.parentId }, project, {
                  orphan: orphanIds.has(n.id),
                  hero: isStkCol && n.id === mapState.focusStakeholderId,
                });
              }).join('')
              : `<p class="muted-text req-map-empty">${isStkCol ? 'Sem L0' : 'Sem requisitos'}</p>`}
          </div>
        </div>
      `;
    }).join('');

    const orphanCol = fullOrphans;
    const hasOrphans = orphanCol.length > 0;

    const orphanHtml = hasOrphans ? `
      <div class="req-map-orphans is-open">
        <div class="req-map-orphans-head">
          <div>
            <strong>Órfãos — sem ligação V-cycle</strong>
            <p class="muted-text">Arraste cada cartão para L0–L3 para o ligar à cadeia V-cycle. Permanecem visíveis até serem ligados.</p>
          </div>
          <span class="req-count-badge is-warn">${orphanCol.length}</span>
        </div>
        <div class="req-map-orphan-list">
          ${orphanCol.map((o) => {
              const req = reqById(project, o.id) || o;
              return `
                <div class="req-map-orphan-item">
                  ${renderMapCard(req, project, { orphan: true })}
                </div>
              `;
            }).join('')}
        </div>
      </div>
    ` : '';

    const hasStk = mapState.stkList.length > 0;
    const emptyStkColumn = `
      <div class="req-map-column req-map-column--stakeholder" data-v-column="stakeholder">
        <div class="req-map-column-head">
          <span class="req-map-layer-badge">L0</span>
          <span class="req-map-level-badge">STK</span>
          <strong>Stakeholder</strong>
          <span class="req-count-badge">0</span>
        </div>
        <div class="req-map-column-body req-map-dropzone req-map-dropzone--create-stk" data-drop-type="stakeholder" data-v-drop-column="stakeholder">
          <p class="muted-text req-map-empty">Arraste um órfão aqui para criar o primeiro STK (L0)</p>
        </div>
      </div>
    `;

    return `
      <div class="req-map-shell req-map-shell--single-stk">
        ${renderVMapToolbar(project, hierarchy)}
        <div class="req-map-viewport req-map-viewport--single-stk" id="reqMapViewport">
          <div class="req-map-board req-map-board-v req-map-board-v--single-stk" id="reqMapBoard">
            ${hasStk ? columnsHtml : emptyStkColumn}
            <svg class="req-map-edges" id="reqMapEdges" aria-hidden="true"></svg>
          </div>
        </div>
        ${orphanHtml}
      </div>
    `;
  }

  function buildImplGroups(project, filtered) {
    const index = new Map();
    const caps = Array.isArray(project?.capabilities) ? project.capabilities : [];
    const clusters = Array.isArray(project?.requirementClusters) ? project.requirementClusters : [];
    for (const cap of caps) {
      if (!index.has(cap.id)) {
        index.set(cap.id, { cap, clusters: new Map(), reqs: [] });
      }
      for (const rid of (cap.requirementIds || [])) {
        index.get(cap.id).reqs.push(rid);
      }
    }
    for (const cl of clusters) {
      const capId = cl.capabilityId || '_none';
      if (!index.has(capId)) {
        index.set(capId, { cap: caps.find((c) => c.id === capId) || { name: 'Sem funcionalidade', id: capId }, clusters: new Map(), reqs: [] });
      }
      const entry = index.get(capId);
      if (!entry.clusters.has(cl.id)) entry.clusters.set(cl.id, { cluster: cl, reqs: [] });
      for (const rid of (cl.requirementIds || [])) {
        entry.clusters.get(cl.id).reqs.push(rid);
        if (!entry.reqs.includes(rid)) entry.reqs.push(rid);
      }
    }
    const allowed = new Set(filtered.map((r) => r.id));
    return [...index.values()].map((entry) => ({
      cap: entry.cap,
      clusters: [...entry.clusters.values()].map(({ cluster, reqs }) => ({
        cluster,
        requirements: reqs.filter((id) => allowed.has(id)).map((id) => filtered.find((r) => r.id === id)).filter(Boolean),
      })).filter((c) => c.requirements.length),
      unclustered: entry.reqs
        .filter((id) => allowed.has(id))
        .filter((id) => !clusters.some((cl) => (cl.requirementIds || []).includes(id)))
        .map((id) => filtered.find((r) => r.id === id))
        .filter(Boolean),
    })).filter((g) => g.clusters.length || g.unclustered.length);
  }

  function renderImplMap(project, hierarchy) {
    const filtered = window.RequirementsUI?.getFilteredForUi
      ? window.RequirementsUI.getFilteredForUi(project)
      : (project.requirements || []);
    const groups = buildImplGroups(project, filtered);
    const overlay = mapState.showVOverlay;

    return `
      <div class="req-map-shell">
        <div class="req-map-toolbar">
          <div class="req-map-toolbar-left">
            <span class="muted-text">Capabilities e clusters — editável via Linha de Entrega / agrupamento IA</span>
          </div>
          <label class="checkline">
            <input type="checkbox" id="reqMapVOverlay" ${overlay ? 'checked' : ''} />
            Sobrepor ligações V
          </label>
        </div>
        <div class="req-map-viewport req-map-viewport-impl">
          <div class="req-map-board req-map-board-impl">
            ${groups.length ? groups.map(({ cap, clusters, unclustered }) => `
              <section class="req-impl-cap">
                <h4 class="req-impl-cap-title">${escapeHtml(cap.name || cap.id)}</h4>
                ${clusters.map(({ cluster, requirements }) => `
                  <details class="req-impl-cluster" open>
                    <summary>${escapeHtml(cluster.name || cluster.id)} <span class="req-count-badge">${requirements.length}</span></summary>
                    <div class="req-impl-reqs">
                      ${requirements.map((req) => renderImplReqChip(req, overlay, hierarchy)).join('')}
                    </div>
                  </details>
                `).join('')}
                ${unclustered.length ? `
                  <details class="req-impl-cluster" open>
                    <summary>Sem cluster <span class="req-count-badge">${unclustered.length}</span></summary>
                    <div class="req-impl-reqs">
                      ${unclustered.map((req) => renderImplReqChip(req, overlay, hierarchy)).join('')}
                    </div>
                  </details>
                ` : ''}
              </section>
            `).join('') : '<p class="muted-text req-map-empty-state">Sem funcionalidades agrupadas. Use «Agrupar com IA» na Linha de Entrega.</p>'}
          </div>
        </div>
      </div>
    `;
  }

  function renderImplReqChip(req, overlay, hierarchy) {
    const tags = Array.isArray(req.moduleTags) ? req.moduleTags : [];
    const mod = tags[0] || normalizeModuleName(req.module) || '—';
    const node = (hierarchy?.nodes || []).find((n) => n.id === req.id);
    const stk = node?.stakeholderRootId || req.stakeholderRootId || '';
    return `
      <button type="button" class="req-impl-chip mod-${escapeHtml(String(mod).toLowerCase())}" data-open-req="${escapeHtml(req.id)}" title="${escapeHtml(req.title || '')}">
        <span class="req-impl-chip-id">${escapeHtml(req.id)}</span>
        <span class="req-impl-chip-mod">${escapeHtml(mod)}</span>
        ${overlay && stk ? `<span class="req-impl-chip-stk">↑${escapeHtml(stk)}</span>` : ''}
      </button>
    `;
  }

  function cardAnchor(card, board, side) {
    const cr = card.getBoundingClientRect();
    const br = board.getBoundingClientRect();
    const y = cr.top - br.top + cr.height / 2;
    if (side === 'left') {
      return { x: cr.left - br.left, y };
    }
    return { x: cr.right - br.left, y };
  }

  function bezierPath(from, to) {
    const dx = Math.max(40, Math.abs(to.x - from.x) * 0.45);
    const c1x = from.x - dx;
    const c2x = to.x + dx;
    return `M ${from.x} ${from.y} C ${c1x} ${from.y}, ${c2x} ${to.y}, ${to.x} ${to.y}`;
  }

  function drawVEdges(container, hierarchy) {
    const svg = container.querySelector('#reqMapEdges');
    const board = container.querySelector('#reqMapBoard');
    if (!svg || !board) return;

    svg.innerHTML = '';
    if (!mapState.showEdges) return;

    const w = board.scrollWidth;
    const h = board.scrollHeight;
    svg.setAttribute('width', String(w));
    svg.setAttribute('height', String(h));
    svg.setAttribute('viewBox', `0 0 ${w} ${h}`);

    const visibleIds = new Set(
      [...board.querySelectorAll('.req-map-card[data-req-id]')].map((el) => el.dataset.reqId)
    );

    for (const node of (hierarchy?.nodes || [])) {
      if (!node.parentId || !visibleIds.has(node.id) || !visibleIds.has(node.parentId)) continue;

      const childEl = board.querySelector(`.req-map-card[data-req-id="${CSS.escape(node.id)}"]`);
      const parentEl = board.querySelector(`.req-map-card[data-req-id="${CSS.escape(node.parentId)}"]`);
      if (!childEl || !parentEl) continue;

      const from = cardAnchor(childEl, board, 'left');
      const to = cardAnchor(parentEl, board, 'right');
      if (from.x <= to.x + 8) continue;

      const path = document.createElementNS('http://www.w3.org/2000/svg', 'path');
      path.setAttribute('d', bezierPath(from, to));
      path.setAttribute('class', `req-map-edge req-map-edge--${node.parentLinkType || 'parent'}`);
      svg.appendChild(path);
    }
  }

  function scheduleDrawEdges(container, hierarchy) {
    cleanupEdgeListeners();
    const draw = () => drawVEdges(container, hierarchy);
    requestAnimationFrame(() => {
      draw();
      const board = container.querySelector('#reqMapBoard');
      const viewport = container.querySelector('#reqMapViewport');
      if (!board) return;

      mapState.scrollHandler = draw;
      if (viewport) {
        mapState.scrollEl = viewport;
        viewport.addEventListener('scroll', draw, { passive: true });
      }

      if (typeof ResizeObserver !== 'undefined') {
        mapState.edgesObserver = new ResizeObserver(draw);
        mapState.edgesObserver.observe(board);
        board.querySelectorAll('.req-map-column-body').forEach((col) => {
          mapState.edgesObserver.observe(col);
        });
      }
    });
  }

  async function dropRequirementHierarchy(project, reqId, dropPayload) {
    const res = await apiRequest(
      `/projects/${encodeURIComponent(project.id)}/requirements/hierarchy/drop`,
      { method: 'POST', body: dropPayload }
    );
    state.selectedProject = res.project;
    return res;
  }

  async function createRequirementInLayer(project, layerType, title = '') {
    const res = await apiRequest(
      `/projects/${encodeURIComponent(project.id)}/requirements/hierarchy/create`,
      {
        method: 'POST',
        body: {
          layerType,
          focusStakeholderId: mapState.focusStakeholderId,
          title: title || undefined,
        },
      }
    );
    state.selectedProject = res.project;
    return res;
  }

  async function unlinkRequirementFromChain(project, requirementId) {
    const res = await apiRequest(
      `/projects/${encodeURIComponent(project.id)}/requirements/${encodeURIComponent(requirementId)}/hierarchy/unlink`,
      { method: 'POST', body: {} }
    );
    state.selectedProject = res.project;
    return res;
  }

  async function repairOrphans(project, forRequirementIds = []) {
    const res = await apiRequest(
      `/projects/${encodeURIComponent(project.id)}/requirements/hierarchy/repair`,
      { method: 'POST', body: { forRequirementIds } }
    );
    state.selectedProject = res.project;
    return res.project;
  }

  async function revertStakeholderRepairs(project) {
    const res = await apiRequest(
      `/projects/${encodeURIComponent(project.id)}/requirements/hierarchy/repair/revert`,
      { method: 'POST', body: {} }
    );
    state.selectedProject = res.project;
    return res.project;
  }

  function resolveDropPayload(zone, reqId, project) {
    const source = reqById(state.selectedProject || project, reqId);
    if (!source) return null;

    if (zone.classList.contains('req-map-card')) {
      const targetType = zone.dataset.reqType;
      const targetId = zone.dataset.reqId;
      if (targetType === 'stakeholder' && source.type !== 'stakeholder') {
        return {
          requirementId: reqId,
          zoneType: 'stakeholder',
          targetRequirementId: targetId,
          focusStakeholderId: mapState.focusStakeholderId,
        };
      }
      return {
        requirementId: reqId,
        zoneType: targetType,
        targetRequirementId: targetId,
        focusStakeholderId: mapState.focusStakeholderId,
      };
    }

    const zoneType = zone.dataset.dropType;
    return {
      requirementId: reqId,
      zoneType,
      focusStakeholderId: mapState.focusStakeholderId,
    };
  }

  function wireMapEvents(project, mode) {
    const container = $('requirementsGroupedView');
    if (!container) return;

    container.querySelectorAll('[data-open-req]').forEach((btn) => {
      btn.addEventListener('click', (e) => {
        e.stopPropagation();
        window.RequirementsUI?.openRequirementModal?.(btn.dataset.openReq, state.selectedProject || project);
      });
    });

    $('reqMapStkPrev')?.addEventListener('click', async () => {
      stepActiveStk(-1);
      await renderRequirementsMap(state.selectedProject || project, mode);
    });

    $('reqMapStkNext')?.addEventListener('click', async () => {
      stepActiveStk(1);
      await renderRequirementsMap(state.selectedProject || project, mode);
    });

    $('reqMapStkJump')?.addEventListener('change', async (e) => {
      mapState.focusStakeholderId = e.target.value;
      mapState.focusRequirementId = '';
      await renderRequirementsMap(state.selectedProject || project, mode);
    });

    $('reqMapToggleOrphans')?.addEventListener('click', (e) => {
      e.preventDefault();
      const panel = container.querySelector('.req-map-orphans');
      if (panel) {
        panel.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
      }
    });

    container.querySelectorAll('[data-add-layer]').forEach((btn) => {
      btn.addEventListener('click', async (e) => {
        e.stopPropagation();
        const layerType = btn.dataset.addLayer;
        const col = V_COLUMNS.find((c) => c.type === layerType);
        if (!col) return;
        if (layerType !== 'stakeholder' && !mapState.focusStakeholderId) {
          showToast('Seleccione um STK (L0) antes de adicionar a esta camada.', 'error');
          return;
        }
        const defaultTitle = `${col.label} novo`;
        const title = window.prompt(`Título do requisito (L${col.layer} · ${col.short}):`, defaultTitle);
        if (title === null) return;
        try {
          const res = await createRequirementInLayer(state.selectedProject || project, layerType, title.trim() || defaultTitle);
          if (layerType === 'stakeholder' && res.requirement?.id) {
            mapState.focusStakeholderId = res.requirement.id;
          }
          showToast(`Criado ${res.requirement?.id || 'requisito'} na camada L${col.layer}.`, 'ok');
          await renderRequirementsMap(state.selectedProject, mode);
          if (typeof refreshHierarchyKpis === 'function') refreshHierarchyKpis(state.selectedProject);
        } catch (err) {
          showToast(err.message, 'error');
        }
      });
    });

    container.querySelectorAll('[data-unlink-req]').forEach((btn) => {
      btn.addEventListener('click', async (e) => {
        e.stopPropagation();
        const reqId = btn.dataset.unlinkReq;
        if (!reqId) return;
        if (!window.confirm(`Desligar ${reqId} da cadeia V-cycle?`)) return;
        try {
          await unlinkRequirementFromChain(state.selectedProject || project, reqId);
          mapState.showOrphans = true;
          showToast(`${reqId} desligado — aparece em Órfãos.`, 'ok');
          await renderRequirementsMap(state.selectedProject, mode);
          if (typeof refreshHierarchyKpis === 'function') refreshHierarchyKpis(state.selectedProject);
        } catch (err) {
          showToast(err.message, 'error');
        }
      });
    });

    $('reqMapShowEdges')?.addEventListener('change', (e) => {
      mapState.showEdges = e.target.checked;
      drawVEdges(container, mapState.hierarchyCache);
    });

    $('reqMapVOverlay')?.addEventListener('change', async (e) => {
      mapState.showVOverlay = e.target.checked;
      await renderRequirementsMap(state.selectedProject || project, mode);
    });

    if (!canEditMap() || mode !== 'vmap') return;

    container.querySelectorAll('.req-map-card[draggable="true"]').forEach((card) => {
      card.addEventListener('dragstart', (e) => {
        mapState.dragReqId = card.dataset.reqId;
        mapState.dragSourceColumn = card.dataset.reqType;
        e.dataTransfer.setData('text/plain', card.dataset.reqId);
        card.classList.add('is-dragging');
      });
      card.addEventListener('dragend', () => {
        card.classList.remove('is-dragging');
        mapState.dragReqId = null;
      });
    });

    container.querySelectorAll('.req-map-dropzone, .req-map-card').forEach((zone) => {
      zone.addEventListener('dragover', (e) => {
        e.preventDefault();
        zone.classList.add('is-drag-over');
        zone.closest('.req-map-column')?.classList.add('is-drop-active');
      });
      zone.addEventListener('dragleave', () => {
        zone.classList.remove('is-drag-over');
        zone.closest('.req-map-column')?.classList.remove('is-drop-active');
      });
      zone.addEventListener('drop', async (e) => {
        e.preventDefault();
        zone.classList.remove('is-drag-over');
        container.querySelectorAll('.req-map-column.is-drop-active').forEach((col) => col.classList.remove('is-drop-active'));
        const reqId = mapState.dragReqId || e.dataTransfer.getData('text/plain');
        if (!reqId) return;

        const payload = resolveDropPayload(zone, reqId, project);
        if (!payload) return;

        try {
          const res = await dropRequirementHierarchy(state.selectedProject || project, reqId, payload);
          const msg = res.createdStakeholderId
            ? `Criado ${res.createdStakeholderId} e ligado à cadeia V.`
            : 'Ligação actualizada na cadeia V.';
          showToast(msg, 'ok');
          if (res.createdStakeholderId) {
            mapState.focusStakeholderId = res.createdStakeholderId;
          }
          await renderRequirementsMap(state.selectedProject, 'vmap');
          if (typeof refreshHierarchyKpis === 'function') refreshHierarchyKpis(state.selectedProject);
        } catch (err) {
          showToast(err.message, 'error');
        }
      });
    });
  }

  async function renderRequirementsMap(project, mode) {
    const container = $('requirementsGroupedView');
    if (!container || !project) return;

    cleanupEdgeListeners();
    container.classList.add('req-map-container');
    container.innerHTML = '<p class="muted-text req-map-loading">A carregar mapa…</p>';

    try {
      if (mode === 'implmap') {
        const hierarchy = await fetchHierarchy(project, { applyStkFocus: false });
        container.innerHTML = renderImplMap(project, hierarchy);
      } else {
        const fullHierarchy = await fetchHierarchy(project, { applyStkFocus: false, storeAsFull: true });
        ensureActiveStk(fullHierarchy, project);
        let hierarchy = fullHierarchy;
        if (mapState.focusStakeholderId) {
          hierarchy = filterHierarchyToStk(fullHierarchy, mapState.focusStakeholderId);
        }
        mapState.hierarchyCache = hierarchy;
        container.innerHTML = renderVMapColumns(project, hierarchy);
        scheduleDrawEdges(container, hierarchy);
      }
      wireMapEvents(project, mode);
      window.RequirementsUI?.updateMeta?.(project, window.RequirementsUI.getFilteredForUi?.(project) || []);
    } catch (err) {
      container.innerHTML = `<p class="muted-text">Erro ao carregar mapa: ${escapeHtml(err.message)}</p>`;
    }
  }

  function setMapFocus(stakeholderId, requirementId, options = {}) {
    mapState.focusStakeholderId = stakeholderId || '';
    mapState.focusRequirementId = requirementId || '';
    if (!options.keepOrphansPanel) {
      mapState.showOrphans = true;
    }
  }

  function renderTraceLinkLists(upEl, downEl, upstream, downstream, traceMap) {
    if (!upEl || !downEl) return;
    const chip = (link, direction) => {
      const isUp = direction === 'upstream';
      const peerType = isUp ? link.targetType : link.sourceType;
      const peerId = isUp ? link.targetId : link.sourceId;
      const node = (traceMap?.nodes || []).find((n) => n.id === peerId);
      const title = node?.title || peerId;
      return `
        <button type="button" class="delivery-map-link-chip" data-trace-focus-type="${escapeHtml(peerType)}" data-trace-focus-id="${escapeHtml(peerId)}">
          <span class="delivery-map-rel">${escapeHtml(link.relationshipType || 'link')}</span>
          <span class="delivery-map-peer">${escapeHtml(peerType)}:${escapeHtml(peerId)}</span>
          <small>${escapeHtml(title)}</small>
        </button>
      `;
    };
    upEl.innerHTML = upstream.length
      ? upstream.map((l) => chip(l, 'upstream')).join('')
      : '<span class="muted-text">Sem upstream.</span>';
    downEl.innerHTML = downstream.length
      ? downstream.map((l) => chip(l, 'downstream')).join('')
      : '<span class="muted-text">Sem downstream.</span>';
  }

  window.RequirementsMapUI = {
    renderRequirementsMap,
    setMapFocus,
    fetchHierarchy,
    repairOrphans,
    revertStakeholderRepairs,
    renderTraceLinkLists,
  };
})();
