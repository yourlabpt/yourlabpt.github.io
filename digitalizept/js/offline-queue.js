import { apiRequest } from './api.js';
import { getToken } from './auth.js';

const QUEUE_KEY = 'yourlab_digitalizept_deal_queue';

function readQueue() {
    try {
        const raw = localStorage.getItem(QUEUE_KEY);
        return raw ? JSON.parse(raw) : [];
    } catch (_) {
        return [];
    }
}

function writeQueue(items) {
    localStorage.setItem(QUEUE_KEY, JSON.stringify(items));
}

export function enqueueDeal(payload) {
    const items = readQueue();
    items.push({ payload, queuedAt: new Date().toISOString() });
    writeQueue(items);
}

export async function flushDealQueue() {
    const items = readQueue();
    if (!items.length) return [];
    const remaining = [];
    const sent = [];
    for (const item of items) {
        try {
            const { response, data } = await apiRequest('/api/digitalizept/deals', {
                method: 'POST',
                token: getToken(),
                body: item.payload
            });
            if (response.ok && data.ok) sent.push(data);
            else remaining.push(item);
        } catch (_) {
            remaining.push(item);
        }
    }
    writeQueue(remaining);
    return sent;
}

export function queuedDealCount() {
    return readQueue().length;
}
