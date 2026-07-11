/**
 * Lightweight markdown editor for work items — toolbar + write/preview.
 */
(function initWorkItemsMarkdown() {
  function escapeHtml(value) {
    return String(value ?? '')
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  }

  async function renderPreview(md, container, apiRequest) {
    if (!container) return;
    const text = String(md || '').trim();
    if (!text) {
      container.innerHTML = '<p class="ado-md-preview-empty">Nada para pré-visualizar.</p>';
      return;
    }
    try {
      const req = apiRequest || window.apiRequest;
      const res = await req('/markdown/render', { method: 'POST', body: { markdown: text } });
      container.innerHTML = res.html || '';
      container.classList.add('markdown-body');
    } catch {
      container.textContent = text;
    }
  }

  function lineRange(value, pos) {
    const start = value.lastIndexOf('\n', pos - 1) + 1;
    const endIdx = value.indexOf('\n', pos);
    const end = endIdx === -1 ? value.length : endIdx;
    return { start, end, line: value.slice(start, end) };
  }

  function selectedLines(value, start, end) {
    const blockStart = value.lastIndexOf('\n', start - 1) + 1;
    const endIdx = value.indexOf('\n', end);
    const blockEnd = endIdx === -1 ? value.length : endIdx;
    return { blockStart, blockEnd, text: value.slice(blockStart, blockEnd) };
  }

  function applyWrap(textarea, before, after, placeholder) {
    const value = textarea.value;
    const start = textarea.selectionStart;
    const end = textarea.selectionEnd;
    const selected = value.slice(start, end) || placeholder || 'texto';
    const next = value.slice(0, start) + before + selected + after + value.slice(end);
    textarea.value = next;
    const cursor = start + before.length + selected.length + after.length;
    textarea.setSelectionRange(start + before.length, start + before.length + selected.length);
    textarea.focus();
    return next;
  }

  function applyHeading(textarea, level) {
    const prefix = `${'#'.repeat(level)} `;
    const value = textarea.value;
    const start = textarea.selectionStart;
    const { start: lineStart, end: lineEnd, line } = lineRange(value, start);
    const stripped = line.replace(/^#{1,6}\s+/, '');
    const nextLine = stripped ? prefix + stripped : prefix;
    const next = value.slice(0, lineStart) + nextLine + value.slice(lineEnd);
    textarea.value = next;
    const cursor = lineStart + nextLine.length;
    textarea.setSelectionRange(cursor, cursor);
    textarea.focus();
    return next;
  }

  function applyList(textarea, ordered) {
    const value = textarea.value;
    const start = textarea.selectionStart;
    const end = textarea.selectionEnd;
    const { blockStart, blockEnd, text } = selectedLines(value, start, end);
    const lines = text.split('\n');
    const formatted = lines.map((line, idx) => {
      const trimmed = line.replace(/^(\d+\.\s+|-\s+)/, '');
      if (!trimmed.trim()) return line;
      return ordered ? `${idx + 1}. ${trimmed}` : `- ${trimmed}`;
    });
    const block = formatted.join('\n');
    const next = value.slice(0, blockStart) + block + value.slice(blockEnd);
    textarea.value = next;
    textarea.setSelectionRange(blockStart, blockStart + block.length);
    textarea.focus();
    return next;
  }

  function syncHidden(root) {
    const ta = root.querySelector('[data-ado-md-textarea]');
    const hidden = root.querySelector('[data-ado-md-input]');
    if (ta && hidden) hidden.value = ta.value;
  }

  function setMode(root, mode) {
    root.dataset.mode = mode;
    root.querySelectorAll('[data-ado-md-tab]').forEach((btn) => {
      btn.classList.toggle('is-active', btn.dataset.adoMdTab === mode);
    });
    const writePane = root.querySelector('[data-ado-md-write]');
    const previewPane = root.querySelector('[data-ado-md-preview]');
    const foot = root.querySelector('[data-ado-md-foot]');
    writePane?.classList.toggle('hidden', mode !== 'write');
    previewPane?.classList.toggle('hidden', mode !== 'preview');
    foot?.classList.toggle('hidden', mode !== 'write');
    if (mode === 'preview') {
      const ta = root.querySelector('[data-ado-md-textarea]');
      renderPreview(ta?.value, previewPane, root._apiRequest);
    }
  }

  function mount(root, options = {}) {
    if (!root) return null;
    const editable = options.editable !== false;
    const value = String(options.value || '');
    const fieldName = options.fieldName || 'descriptionMarkdown';
    const placeholder = options.placeholder || 'Escreva aqui…';
    const compact = Boolean(options.compact);
    const required = options.required !== false;
    const onChange = typeof options.onChange === 'function' ? options.onChange : () => {};
    root._apiRequest = options.apiRequest;
    root.classList.toggle('ado-md-compact', compact);

    root.innerHTML = `
      <input type="hidden" name="${escapeHtml(fieldName)}" data-ado-md-input value="${escapeHtml(value)}" />
      <div class="ado-md-head">
        <div class="ado-md-tabs" role="tablist">
          <button type="button" class="ado-md-tab is-active" data-ado-md-tab="write" role="tab">Escrever</button>
          <button type="button" class="ado-md-tab" data-ado-md-tab="preview" role="tab">Pré-visualizar</button>
        </div>
      </div>
      <div class="ado-md-panes">
        <div class="ado-md-write" data-ado-md-write>
          <textarea class="ado-editor-description ado-md-textarea" data-ado-md-textarea
            placeholder="${escapeHtml(placeholder)}"
            ${editable ? '' : 'readonly'} ${required ? 'required' : ''}>${escapeHtml(value)}</textarea>
        </div>
        <div class="ado-md-preview markdown-body hidden" data-ado-md-preview aria-live="polite"></div>
      </div>
      ${editable ? `
        <div class="ado-md-foot" data-ado-md-foot role="toolbar" aria-label="Formatação">
          <div class="ado-md-tool-group">
            <span class="ado-md-group-label">Texto</span>
            <div class="ado-md-tool-row">
              <button type="button" class="ado-md-tool" data-ado-md-action="bold" title="Negrito">B</button>
              <button type="button" class="ado-md-tool" data-ado-md-action="h1" title="Título grande">H1</button>
              <button type="button" class="ado-md-tool" data-ado-md-action="h2" title="Título médio">H2</button>
              <button type="button" class="ado-md-tool" data-ado-md-action="h3" title="Título pequeno">H3</button>
            </div>
          </div>
          <div class="ado-md-tool-group">
            <span class="ado-md-group-label">Listas</span>
            <div class="ado-md-tool-row">
              <button type="button" class="ado-md-tool" data-ado-md-action="ul" title="Lista com marcas">•</button>
              <button type="button" class="ado-md-tool" data-ado-md-action="ol" title="Lista numerada">1.</button>
            </div>
          </div>
        </div>
      ` : ''}
    `;

    root.dataset.mode = 'write';
    const textarea = root.querySelector('[data-ado-md-textarea]');

    const emitChange = () => {
      syncHidden(root);
      onChange(getValue(root));
    };

    root.addEventListener('click', (event) => {
      const tab = event.target.closest('[data-ado-md-tab]');
      if (tab) {
        setMode(root, tab.dataset.adoMdTab);
        return;
      }

      const tool = event.target.closest('[data-ado-md-action]');
      if (!tool || !editable || !textarea) return;

      const action = tool.dataset.adoMdAction;
      if (action === 'bold') applyWrap(textarea, '**', '**', 'texto');
      else if (action === 'h1') applyHeading(textarea, 1);
      else if (action === 'h2') applyHeading(textarea, 2);
      else if (action === 'h3') applyHeading(textarea, 3);
      else if (action === 'ul') applyList(textarea, false);
      else if (action === 'ol') applyList(textarea, true);
      emitChange();
    });

    textarea?.addEventListener('input', emitChange);

    let previewTimer = null;
    textarea?.addEventListener('input', () => {
      if (root.dataset.mode !== 'preview') return;
      clearTimeout(previewTimer);
      previewTimer = setTimeout(() => {
        renderPreview(textarea.value, root.querySelector('[data-ado-md-preview]'), root._apiRequest);
      }, 350);
    });

    return root;
  }

  function getValue(root) {
    const hidden = root?.querySelector('[data-ado-md-input]');
    if (hidden) return hidden.value;
    return root?.querySelector('[data-ado-md-textarea]')?.value || '';
  }

  function setValue(root, value) {
    const ta = root?.querySelector('[data-ado-md-textarea]');
    const hidden = root?.querySelector('[data-ado-md-input]');
    const next = String(value || '');
    if (ta) ta.value = next;
    if (hidden) hidden.value = next;
  }

  function focus(root) {
    root?.querySelector('[data-ado-md-textarea]')?.focus();
  }

  function resize(root, options = {}) {
    const ta = root?.querySelector('[data-ado-md-textarea]');
    if (!ta) return;
    const compact = root?.classList.contains('ado-md-compact');
    const min = options.minHeight || (compact ? 160 : Math.max(280, window.innerHeight - 520));
    ta.style.minHeight = `${min}px`;
  }

  window.WorkItemsMarkdown = { mount, getValue, setValue, focus, resize };
})();
