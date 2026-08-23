const DAY_ORDER = ['seg', 'ter', 'qua', 'qui', 'sex', 'sab', 'dom'];

const DAYS = [
    { id: 'seg', short: 'Seg', aliases: ['seg', 'segunda', 'segunda-feira', 'mo', 'mon', 'monday'] },
    { id: 'ter', short: 'Ter', aliases: ['ter', 'terca', 'terça', 'terca-feira', 'terça-feira', 'tu', 'tue', 'tuesday'] },
    { id: 'qua', short: 'Qua', aliases: ['qua', 'quarta', 'quarta-feira', 'we', 'wed', 'wednesday'] },
    { id: 'qui', short: 'Qui', aliases: ['qui', 'quinta', 'quinta-feira', 'th', 'thu', 'thursday'] },
    { id: 'sex', short: 'Sex', aliases: ['sex', 'sexta', 'sexta-feira', 'fr', 'fri', 'friday'] },
    { id: 'sab', short: 'Sáb', aliases: ['sab', 'sabado', 'sábado', 'sa', 'sat', 'saturday'] },
    { id: 'dom', short: 'Dom', aliases: ['dom', 'domingo', 'su', 'sun', 'sunday'] }
];

const DAY_BY_ALIAS = (() => {
    const map = {};
    DAYS.forEach((day) => {
        day.aliases.forEach((alias) => {
            map[fold(alias)] = day.id;
        });
        map[fold(day.short)] = day.id;
        map[day.id] = day.id;
    });
    return map;
})();

const WEEKDAYS = ['seg', 'ter', 'qua', 'qui', 'sex'];
const WEEK_PLUS_SAT = [...WEEKDAYS, 'sab'];
const PRESETS = [
    { id: 'semana', label: 'Seg–Sex', days: WEEKDAYS },
    { id: 'sabado', label: 'Seg–Sáb', days: WEEK_PLUS_SAT },
    { id: 'todos', label: 'Todos', days: [...DAY_ORDER] }
];

function fold(value) {
    return String(value || '')
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '')
        .toLowerCase()
        .trim();
}

function uniqueDays(ids) {
    const set = new Set(ids);
    return DAY_ORDER.filter((id) => set.has(id));
}

function padClock(hours, minutes) {
    const hh = Math.min(23, Math.max(0, Number(hours)));
    const mm = Math.min(59, Math.max(0, Number(minutes)));
    if (!Number.isFinite(hh) || !Number.isFinite(mm)) return '';
    return `${String(hh).padStart(2, '0')}:${String(mm).padStart(2, '0')}`;
}

export function parseClock(raw) {
    const s = String(raw || '')
        .trim()
        .toLowerCase()
        .replace(/\s/g, '')
        .replace('.', ':');
    if (!s) return '';
    let match = /^(\d{1,2})h(\d{2})?$/.exec(s);
    if (match) return padClock(match[1], match[2] || '00');
    match = /^(\d{1,2}):(\d{2})$/.exec(s);
    if (match) return padClock(match[1], match[2]);
    match = /^(\d{1,2})$/.exec(s);
    if (match) return padClock(match[1], '00');
    return '';
}

export function formatClock(hhmm) {
    const parsed = parseClock(hhmm);
    if (!parsed) return '';
    const [hours, minutes] = parsed.split(':');
    return minutes === '00' ? `${Number(hours)}h` : `${Number(hours)}h${minutes}`;
}

function dayShort(id) {
    return (DAYS.find((day) => day.id === id) || {}).short || id;
}

export function formatDaySpan(ids) {
    const selected = uniqueDays(ids);
    if (!selected.length) return '';
    if (selected.length === 7) return 'Todos os dias';
    const runs = [];
    let run = [selected[0]];
    for (let i = 1; i < selected.length; i += 1) {
        const prev = DAY_ORDER.indexOf(selected[i - 1]);
        const cur = DAY_ORDER.indexOf(selected[i]);
        if (cur === prev + 1) run.push(selected[i]);
        else {
            runs.push(run);
            run = [selected[i]];
        }
    }
    runs.push(run);
    return runs.map((chunk) => {
        if (chunk.length === 1) return dayShort(chunk[0]);
        return `${dayShort(chunk[0])}–${dayShort(chunk[chunk.length - 1])}`;
    }).join(', ');
}

function emptyRange() {
    return {
        days: [],
        open: '09:00',
        close: '19:00',
        pauseFrom: '',
        pauseTo: ''
    };
}

export function emptyHours() {
    return { ranges: [emptyRange()] };
}

function cloneRange(range) {
    const src = range && typeof range === 'object' ? range : {};
    return {
        days: uniqueDays(src.days || []),
        open: parseClock(src.open) || '09:00',
        close: parseClock(src.close) || '19:00',
        pauseFrom: parseClock(src.pauseFrom),
        pauseTo: parseClock(src.pauseTo)
    };
}

export function normalizeHours(spec) {
    const ranges = Array.isArray(spec && spec.ranges)
        ? spec.ranges.map(cloneRange)
        : [cloneRange(spec)];
    const cleaned = ranges.filter((range, index) => index === 0 || range.days.length);
    return { ranges: cleaned.length ? cleaned : [emptyRange()] };
}

function formatRangeHours(range) {
    const open = formatClock(range.open);
    const close = formatClock(range.close);
    if (!open || !close) return '';
    const pauseFrom = formatClock(range.pauseFrom);
    const pauseTo = formatClock(range.pauseTo);
    if (pauseFrom && pauseTo) return `${open}–${pauseFrom} e ${pauseTo}–${close}`;
    return `${open}–${close}`;
}

export function formatHours(spec) {
    const { ranges } = normalizeHours(spec);
    return ranges
        .map((range) => {
            const days = formatDaySpan(range.days);
            const hours = formatRangeHours(range);
            if (!days || !hours) return '';
            return `${days} ${hours}`;
        })
        .filter(Boolean)
        .join(' · ');
}

function expandDayRange(fromId, toId) {
    const from = DAY_ORDER.indexOf(fromId);
    const to = DAY_ORDER.indexOf(toId);
    if (from < 0 || to < 0) return fromId ? [fromId] : [];
    if (from <= to) return DAY_ORDER.slice(from, to + 1);
    return [...DAY_ORDER.slice(from), ...DAY_ORDER.slice(0, to + 1)];
}

function parseDayToken(token) {
    const clean = fold(token).replace(/-feira/g, '').replace(/feira/g, '').trim();
    if (!clean) return [];
    if (clean === 'todos' || clean === 'todos os dias') return [...DAY_ORDER];
    const rangeParts = clean.split(/\s*(?:[–-]|\ba\b|\bate\b)\s*/).map((part) => part.trim()).filter(Boolean);
    if (rangeParts.length === 2) {
        const from = DAY_BY_ALIAS[rangeParts[0]];
        const to = DAY_BY_ALIAS[rangeParts[1]];
        if (from && to) return expandDayRange(from, to);
    }
    const one = DAY_BY_ALIAS[clean];
    return one ? [one] : [];
}

function parseDays(raw) {
    const text = fold(raw);
    if (!text) return [];
    if (text === 'todos os dias' || text === 'todos') return [...DAY_ORDER];
    const chunks = String(raw || '')
        .split(/\s*(?:,|;| e )\s*/i)
        .map((part) => part.trim())
        .filter(Boolean);
    return uniqueDays(chunks.flatMap(parseDayToken));
}

const CLOCK_TOKEN = /\d{1,2}(?:h\d{2}|[:.]\d{2}|h)/i;

function parseIntervals(raw) {
    const text = String(raw || '');
    const tokens = text.match(new RegExp(CLOCK_TOKEN.source, 'gi')) || [];
    const clocks = tokens.map(parseClock).filter(Boolean);
    const intervals = [];
    for (let i = 0; i + 1 < clocks.length; i += 2) {
        intervals.push({ open: clocks[i], close: clocks[i + 1] });
    }
    return intervals;
}

function rangeFromIntervals(days, intervals) {
    if (!days.length || !intervals.length) return null;
    const first = intervals[0];
    const last = intervals[intervals.length - 1];
    const range = {
        days,
        open: first.open,
        close: last.close,
        pauseFrom: '',
        pauseTo: ''
    };
    if (intervals.length >= 2) {
        range.pauseFrom = first.close;
        range.pauseTo = intervals[1].open;
        range.close = last.close;
    }
    return range;
}

function parseOneClause(clause) {
    const text = String(clause || '').trim();
    if (!text) return null;
    const hit = CLOCK_TOKEN.exec(text);
    if (!hit) return null;
    const days = parseDays(text.slice(0, hit.index));
    const intervals = parseIntervals(text.slice(hit.index));
    return rangeFromIntervals(days, intervals);
}

export function parseHours(text) {
    const raw = String(text || '').trim();
    if (!raw) return emptyHours();
    const clauses = raw
        .split(/\s*(?:·|\||;)\s*/)
        .map((part) => part.replace(/\bdas\b/gi, '').replace(/\s+de\s+/gi, ' ').trim())
        .filter(Boolean);
    const ranges = clauses.map(parseOneClause).filter(Boolean);
    if (!ranges.length) return null;
    return normalizeHours({ ranges });
}

function sameDays(a, b) {
    return uniqueDays(a).join(',') === uniqueDays(b).join(',');
}

function el(tag, className, text) {
    const node = document.createElement(tag);
    if (className) node.className = className;
    if (text != null) node.textContent = text;
    return node;
}

function timeInput(value) {
    const input = el('input', 'field-input hours-time');
    input.type = 'time';
    input.step = '300';
    input.value = parseClock(value) || '';
    return input;
}

function paintDays(row, days) {
    const selected = new Set(uniqueDays(days));
    row.querySelectorAll('.hours-day').forEach((btn) => {
        btn.classList.toggle('on', selected.has(btn.dataset.day));
        btn.setAttribute('aria-pressed', selected.has(btn.dataset.day) ? 'true' : 'false');
    });
}

function paintPresets(row, days) {
    row.querySelectorAll('.hours-preset').forEach((btn) => {
        const preset = PRESETS.find((item) => item.id === btn.dataset.preset);
        btn.classList.toggle('on', preset && sameDays(preset.days, days));
    });
}

function mountRange(host, range, { title, onChange, removable, onRemove, simple }) {
    const box = el('div', 'hours-range');
    if (title) box.appendChild(el('p', 'hours-range-title', title));

    let presets = null;
    if (!simple) {
        presets = el('div', 'hours-presets');
        PRESETS.forEach((preset) => {
            const btn = el('button', 'hours-preset', preset.label);
            btn.type = 'button';
            btn.dataset.preset = preset.id;
            btn.addEventListener('click', () => {
                range.days = [...preset.days];
                notify();
            });
            presets.appendChild(btn);
        });
        box.appendChild(presets);
    }

    const days = el('div', 'hours-days');
    DAYS.forEach((day) => {
        const btn = el('button', 'hours-day', day.short);
        btn.type = 'button';
        btn.dataset.day = day.id;
        btn.setAttribute('aria-pressed', 'false');
        btn.addEventListener('click', () => {
            const set = new Set(range.days);
            if (set.has(day.id)) set.delete(day.id);
            else set.add(day.id);
            range.days = uniqueDays([...set]);
            notify();
        });
        days.appendChild(btn);
    });
    box.appendChild(days);

    const times = el('div', 'hours-times');
    const openWrap = el('label', 'hours-field');
    openWrap.append(el('span', 'hours-label', 'Abre'), timeInput(range.open));
    const closeWrap = el('label', 'hours-field');
    closeWrap.append(el('span', 'hours-label', 'Fecha'), timeInput(range.close));
    times.append(openWrap, closeWrap);
    box.appendChild(times);

    let pauseFromInput = null;
    let pauseToInput = null;
    if (!simple) {
        const pause = el('div', 'hours-times hours-pause');
        const pauseFromWrap = el('label', 'hours-field');
        pauseFromWrap.append(el('span', 'hours-label', 'Fecha ao almoço'), timeInput(range.pauseFrom));
        const pauseToWrap = el('label', 'hours-field');
        pauseToWrap.append(el('span', 'hours-label', 'Reabre'), timeInput(range.pauseTo));
        pause.append(pauseFromWrap, pauseToWrap);
        box.appendChild(el('p', 'hours-pause-hint', 'Pausa no meio do dia — deixe vazio se não fechar.'));
        box.appendChild(pause);
        pauseFromInput = pauseFromWrap.querySelector('input');
        pauseToInput = pauseToWrap.querySelector('input');
        pauseFromInput.addEventListener('input', () => {
            range.pauseFrom = parseClock(pauseFromInput.value);
            notify();
        });
        pauseToInput.addEventListener('input', () => {
            range.pauseTo = parseClock(pauseToInput.value);
            notify();
        });
    }

    if (removable) {
        const remove = el('button', 'hours-remove', 'Remover este horário');
        remove.type = 'button';
        remove.addEventListener('click', () => onRemove());
        box.appendChild(remove);
    }

    const openInput = openWrap.querySelector('input');
    const closeInput = closeWrap.querySelector('input');
    function sync() {
        paintDays(days, range.days);
        if (presets) paintPresets(presets, range.days);
        openInput.value = range.open || '';
        closeInput.value = range.close || '';
        if (pauseFromInput) pauseFromInput.value = range.pauseFrom || '';
        if (pauseToInput) pauseToInput.value = range.pauseTo || '';
    }

    function notify() {
        sync();
        onChange();
    }

    openInput.addEventListener('input', () => {
        range.open = parseClock(openInput.value) || range.open;
        notify();
    });
    closeInput.addEventListener('input', () => {
        range.close = parseClock(closeInput.value) || range.close;
        notify();
    });

    sync();
    host.appendChild(box);
    return { sync, box };
}

export function renderHoursPicker(container, {
    text = '',
    onChange,
    showNext = false,
    onNext
} = {}) {
    const root = el('div', 'hours-picker');
    const parsed = parseHours(text);
    const spec = parsed ? normalizeHours(parsed) : emptyHours();
    const original = String(text || '').trim();
    let usedOriginal = Boolean(original && !parsed);

    const unknown = el('p', 'hours-unknown');
    if (usedOriginal) {
        unknown.textContent = `Texto actual: ${original}`;
        root.appendChild(unknown);
    }

    const rangesHost = el('div', 'hours-ranges');
    root.appendChild(rangesHost);

    const preview = el('p', 'hours-preview');
    root.appendChild(preview);

    const extra = el('div', 'hours-extra');
    root.appendChild(extra);

    function emit() {
        const next = formatHours(spec);
        preview.textContent = next || 'Toque nos dias em que está aberto.';
        preview.classList.toggle('is-empty', !next);
        if (usedOriginal && next) {
            usedOriginal = false;
            unknown.remove();
        }
        if (typeof onChange === 'function') onChange(next || (usedOriginal ? original : ''));
    }

    function rebuild() {
        rangesHost.innerHTML = '';
        extra.innerHTML = '';
        spec.ranges.forEach((range, index) => {
            mountRange(rangesHost, range, {
                title: index === 0 ? '' : 'Outro horário',
                simple: index > 0,
                removable: index > 0,
                onRemove: () => {
                    spec.ranges.splice(index, 1);
                    rebuild();
                    emit();
                },
                onChange: emit
            });
        });
        if (spec.ranges.length < 2) {
            const add = el('button', 'hours-add', 'Outro horário (ex.: sábado)');
            add.type = 'button';
            add.addEventListener('click', () => {
                const taken = new Set(spec.ranges[0].days);
                const next = emptyRange();
                next.days = taken.has('sab') ? [] : ['sab'];
                next.open = '09:00';
                next.close = '13:00';
                spec.ranges.push(next);
                rebuild();
                emit();
            });
            extra.appendChild(add);
        }
        emit();
    }

    rebuild();

    if (showNext && typeof onNext === 'function') {
        const nextBtn = el('button', 'ask-next-btn', 'Seguinte');
        nextBtn.type = 'button';
        nextBtn.addEventListener('click', () => onNext());
        root.appendChild(nextBtn);
    }

    container.appendChild(root);
    return {
        getText: () => formatHours(spec) || (usedOriginal ? original : ''),
        setText: (value) => {
            const next = parseHours(value);
            spec.ranges = (next ? normalizeHours(next) : emptyHours()).ranges;
            usedOriginal = Boolean(String(value || '').trim() && !next);
            unknown.textContent = usedOriginal ? `Texto actual: ${value}` : '';
            if (usedOriginal && !unknown.isConnected) root.insertBefore(unknown, rangesHost);
            if (!usedOriginal) unknown.remove();
            rebuild();
        }
    };
}

export { DAYS, DAY_ORDER, PRESETS };
