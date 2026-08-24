import { saveProvider } from './settings.js';

function el(tag, className, text) {
    const node = document.createElement(tag);
    if (className) node.className = className;
    if (text != null) node.textContent = text;
    return node;
}

function field(label, input) {
    const wrap = el('label', 'field');
    wrap.append(el('span', 'field-label', label), input);
    return wrap;
}

function inputEl(type, value, attrs = {}) {
    const input = document.createElement(type === 'select' ? 'select' : 'input');
    input.className = 'field-input';
    if (type !== 'select') input.type = type;
    if (type !== 'select') input.value = value == null ? '' : value;
    Object.entries(attrs).forEach(([k, v]) => input.setAttribute(k, v));
    return input;
}

function summaryText(provider) {
    const name = String((provider && provider.responsavel) || '').trim();
    return name
        ? `A enviar como ${name}, da YourLab.`
        : 'A enviar em nome da YourLab.';
}

function buildForm(provider, { toast, onUnauthorized, onSaved, onClose }) {
    const form = el('form', 'admin-form provider-editor-form');
    const nome = inputEl('text', provider.responsavel || '', {
        required: 'true',
        autocomplete: 'name',
        maxlength: '120'
    });
    nome.placeholder = 'Nome e apelido';
    const artigo = document.createElement('select');
    artigo.className = 'field-input';
    [
        { id: 'o', label: 'sou o …' },
        { id: 'a', label: 'sou a …' }
    ].forEach((opt) => {
        const o = document.createElement('option');
        o.value = opt.id;
        o.textContent = opt.label;
        if ((provider.artigo || 'o') === opt.id) o.selected = true;
        artigo.appendChild(o);
    });
    const telefone = inputEl('tel', provider.telefone || '', {
        autocomplete: 'tel',
        maxlength: '40'
    });
    const email = inputEl('email', provider.email || '', {
        autocomplete: 'email',
        maxlength: '160'
    });

    form.append(
        field('Nome', nome),
        field('No texto', artigo),
        field('Telefone nas mensagens', telefone),
        field('Email nas mensagens', email)
    );
    const save = el('button', 'btn-primary', 'Guardar quem envia');
    save.type = 'submit';
    form.appendChild(save);

    form.addEventListener('submit', async (event) => {
        event.preventDefault();
        save.disabled = true;
        try {
            const next = await saveProvider({
                responsavel: nome.value.trim(),
                artigo: artigo.value,
                telefone: telefone.value.trim(),
                email: email.value.trim()
            }, { onUnauthorized });
            if (typeof toast === 'function') {
                toast(`A enviar como ${next.responsavel}, da YourLab.`);
            }
            if (typeof onSaved === 'function') onSaved(next);
            if (typeof onClose === 'function') onClose();
        } catch (err) {
            if (typeof toast === 'function') {
                toast(err.message || 'Não foi possível guardar.', true);
            }
        } finally {
            save.disabled = false;
        }
    });

    return form;
}

/**
 * Who is writing emails / WhatsApp / new contracts as YourLab.
 * Company name stays YourLab; only the person changes.
 */
export function renderProviderEditor(host, {
    provider = {},
    toast,
    onUnauthorized,
    onSaved,
    compact = false
} = {}) {
    host.innerHTML = '';
    host.className = compact ? 'provider-editor is-compact' : 'provider-editor';

    if (compact) {
        let current = { ...provider };
        const summary = el('p', 'provider-editor-summary', summaryText(current));
        const toggle = el('button', 'btn-secondary provider-editor-toggle', 'Alterar');
        toggle.type = 'button';
        const header = el('div', 'provider-editor-compact-head');
        header.append(summary, toggle);
        const formWrap = el('div', 'provider-editor-compact-form');
        formWrap.hidden = true;

        const paint = (next) => {
            current = { ...current, ...(next || {}) };
            summary.textContent = summaryText(current);
        };
        const closeForm = () => {
            formWrap.hidden = true;
            formWrap.innerHTML = '';
            toggle.textContent = 'Alterar';
        };

        toggle.addEventListener('click', () => {
            if (!formWrap.hidden) {
                closeForm();
                return;
            }
            formWrap.hidden = false;
            toggle.textContent = 'Fechar';
            formWrap.innerHTML = '';
            formWrap.appendChild(buildForm(current, {
                toast,
                onUnauthorized,
                onSaved(next) {
                    paint(next);
                    if (typeof onSaved === 'function') onSaved(next);
                },
                onClose: closeForm
            }));
        });

        host.append(header, formWrap);
        return;
    }

    host.append(
        el('h2', 'provider-editor-title', 'Quem envia'),
        el(
            'p',
            'meta',
            'A empresa continua YourLab. Muda só a pessoa nos emails, WhatsApp e contratos novos.'
        ),
        buildForm(provider, { toast, onUnauthorized, onSaved })
    );
}
