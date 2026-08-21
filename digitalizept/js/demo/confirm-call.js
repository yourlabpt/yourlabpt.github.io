export function confirmCallState(followup, now = new Date()) {
    const f = followup || {};
    if (f.callDoneAt) {
        return { status: 'done', dueAt: f.callDueAt || '', remainingMs: 0 };
    }
    if (!f.callDueAt) {
        return { status: 'none', dueAt: '', remainingMs: 0 };
    }
    const remainingMs = new Date(f.callDueAt).getTime() - now.getTime();
    if (Number.isNaN(remainingMs) || remainingMs <= 0) {
        return { status: 'due', dueAt: f.callDueAt, remainingMs: 0 };
    }
    return { status: 'waiting', dueAt: f.callDueAt, remainingMs };
}

export function formatCountdown(ms) {
    const total = Math.max(0, Math.floor(Number(ms) || 0));
    const s = Math.floor(total / 1000);
    const d = Math.floor(s / 86400);
    const h = Math.floor((s % 86400) / 3600);
    const m = Math.floor((s % 3600) / 60);
    const sec = s % 60;
    if (d > 0) return `${d}d ${h}h ${String(m).padStart(2, '0')}m`;
    if (h > 0) return `${h}h ${String(m).padStart(2, '0')}m`;
    return `${m}m ${String(sec).padStart(2, '0')}s`;
}

export function formatCallDue(iso) {
    if (!iso) return '';
    const d = new Date(iso);
    if (Number.isNaN(d.getTime())) return '';
    return d.toLocaleString('pt-PT', {
        weekday: 'short',
        day: 'numeric',
        month: 'short',
        hour: '2-digit',
        minute: '2-digit'
    });
}

export function callCopy(status) {
    if (status === 'due') {
        return 'Ligar agora — confirmar que receberam. Uma pessoa real da YourLab, não é spam.';
    }
    if (status === 'waiting') {
        return 'Nos próximos dias ligue a confirmar a receção — mostra que há alguém real por trás.';
    }
    if (status === 'done') {
        return 'Ligação de confirmação feita.';
    }
    return '';
}

export function askCallNotifyPermission() {
    if (typeof Notification === 'undefined' || Notification.permission !== 'default') {
        return Promise.resolve(typeof Notification === 'undefined' ? 'unsupported' : Notification.permission);
    }
    return Notification.requestPermission().catch(() => 'denied');
}

export function notifyConfirmCall({ nome, phone }) {
    if (typeof Notification === 'undefined' || Notification.permission !== 'granted') return false;
    try {
        const n = new Notification(`Ligar a ${nome || 'o cliente'}`, {
            body: phone
                ? `Confirmar que receberam. ${phone} — YourLab, uma pessoa real, não spam.`
                : 'Confirmar que receberam o email/WhatsApp. YourLab, uma pessoa real, não spam.',
            tag: `digitalizept-call-${nome || 'lead'}`,
            lang: 'pt'
        });
        n.onclick = () => {
            try { window.focus(); } catch (_) { /* ignore */ }
            n.close();
        };
        return true;
    } catch (_) {
        return false;
    }
}

const notifiedKeys = new Set();

export function maybeNotifyDueCall(lead) {
    const state = confirmCallState(lead);
    if (state.status !== 'due') return false;
    const key = `${lead.id || lead.nome || ''}:${lead.callDueAt || ''}`;
    if (!key || notifiedKeys.has(key)) return false;
    notifiedKeys.add(key);
    return notifyConfirmCall({ nome: lead.nome, phone: lead.telefone || lead.whatsapp });
}
