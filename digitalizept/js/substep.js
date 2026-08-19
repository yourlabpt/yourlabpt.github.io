// One-question layout used inside a main wizard step.
// The header still shows Passo X de 9; this is only the page body.

export function currentSubstep(state) {
    const n = Number(state.substep);
    return Number.isFinite(n) && n > 0 ? Math.floor(n) : 0;
}

export function renderAsk(body, { title, hint, index, total }) {
    const wrap = document.createElement('div');
    wrap.className = 'ask';

    if (typeof index === 'number' && typeof total === 'number' && total > 1) {
        const meta = document.createElement('p');
        meta.className = 'ask-index';
        meta.textContent = `${index + 1} de ${total}`;
        wrap.appendChild(meta);
    }

    const h = document.createElement('h2');
    h.className = 'ask-title';
    h.textContent = title;
    wrap.appendChild(h);

    if (hint) {
        const p = document.createElement('p');
        p.className = 'ask-hint';
        p.textContent = hint;
        wrap.appendChild(p);
    }

    const control = document.createElement('div');
    control.className = 'ask-control';
    wrap.appendChild(control);
    body.appendChild(wrap);
    return { wrap, control };
}

export function askText(control, { value, type, placeholder, rows, onChange, onEnter }) {
    const isLong = Number(rows) > 1;
    const input = document.createElement(isLong ? 'textarea' : 'input');
    input.className = 'field-input ask-input';
    input.value = value || '';
    if (placeholder) input.placeholder = placeholder;
    if (isLong) {
        input.rows = rows;
    } else {
        input.type = type || 'text';
    }
    input.addEventListener('input', () => onChange(input.value));
    if (!isLong && typeof onEnter === 'function') {
        input.addEventListener('keydown', (event) => {
            if (event.key === 'Enter') {
                event.preventDefault();
                onEnter();
            }
        });
    }
    control.appendChild(input);
    queueMicrotask(() => {
        try { input.focus(); } catch (_) { /* ignore */ }
    });
    return input;
}

// Auto-advance must wait out the synthetic click that mobile browsers fire
// on whatever sits under the finger after the DOM is replaced (~300ms).
// Otherwise Sim/Não on the last café extras (or "Agora não") lands on
// Continuar / the next step's first button and skips a whole phase.
const ADVANCE_DELAY_MS = 350;
let nextTimer = 0;

export function cancelScheduledGoNext() {
    if (!nextTimer) return;
    clearTimeout(nextTimer);
    nextTimer = 0;
}

export function scheduleGoNext(goNext, delayMs = ADVANCE_DELAY_MS) {
    if (typeof goNext !== 'function') return;
    cancelScheduledGoNext();
    nextTimer = setTimeout(() => {
        nextTimer = 0;
        goNext();
    }, delayMs);
}

export function askToggle(control, { value, options, onChange, goNext }) {
    const toggle = document.createElement('div');
    toggle.className = 'toggle';
    let current = value;
    (options || ['Sim', 'Não']).forEach((opt) => {
        const btn = document.createElement('button');
        btn.type = 'button';
        btn.className = `toggle-opt${value === opt ? ' active' : ''}`;
        btn.textContent = opt;
        btn.addEventListener('click', () => {
            if (opt === current) return;
            current = opt;
            toggle.querySelectorAll('.toggle-opt').forEach((b) => b.classList.remove('active'));
            btn.classList.add('active');
            onChange(opt);
            scheduleGoNext(goNext);
        });
        toggle.appendChild(btn);
    });
    control.appendChild(toggle);
    return toggle;
}

export function askChoices(control, items, { selected, onSelect, goNext, autoAdvance }) {
    const list = document.createElement('div');
    list.className = 'ask-choices';
    items.forEach((item) => {
        const btn = document.createElement('button');
        btn.type = 'button';
        const isOn = typeof selected === 'function' ? selected(item) : selected === item.id;
        btn.className = `ask-choice${isOn ? ' selected' : ''}`;
        const name = document.createElement('div');
        name.className = 'ask-choice-name';
        name.textContent = item.name;
        btn.appendChild(name);
        if (item.desc) {
            const desc = document.createElement('div');
            desc.className = 'ask-choice-desc';
            desc.textContent = item.desc;
            btn.appendChild(desc);
        }
        if (item.meta) {
            const meta = document.createElement('div');
            meta.className = 'ask-choice-meta';
            meta.textContent = item.meta;
            btn.appendChild(meta);
        }
        btn.addEventListener('click', () => {
            const result = onSelect(item);
            list.querySelectorAll('.ask-choice').forEach((el) => el.classList.remove('selected'));
            btn.classList.add('selected');
            if (autoAdvance !== false && typeof goNext === 'function' && result !== false) {
                scheduleGoNext(goNext);
            }
        });
        list.appendChild(btn);
    });
    control.appendChild(list);
    return list;
}
