const crypto = require('crypto');

const AGENT_ID_TO_PLATFORM_TYPE = {
  'idea-to-requirements': 'reverse_idea',
  'requirements-to-architecture': 'requirements_to_architecture',
  'architecture-to-roadmap': 'roadmap_plan',
  'roadmap-to-implementation': 'implementation_tasks',
  'delivery-os-full': 'pipeline',
};

const PLATFORM_TYPE_TO_AGENT_ID = Object.fromEntries(
  Object.entries(AGENT_ID_TO_PLATFORM_TYPE)
    .filter(([id]) => id !== 'delivery-os-full')
    .map(([id, type]) => [type, id])
);

function signRequest(secret, body) {
  const timestamp = String(Math.floor(Date.now() / 1000));
  const signature = crypto.createHmac('sha256', secret).update(`${timestamp}.${body}`).digest('hex');
  return { timestamp, signature };
}

function createAgentRuntimeClient() {
  const baseUrl = String(process.env.AGENT_RUNTIME_URL || 'http://127.0.0.1:3847').replace(/\/$/, '');
  const apiKey = String(process.env.AGENT_RUNTIME_API_KEY || '');
  const hmacSecret = String(process.env.AGENT_HMAC_SECRET || '');

  async function request(method, path, payload) {
    const body = payload ? JSON.stringify(payload) : '';
    const headers = {
      'Content-Type': 'application/json',
    };

    if (apiKey) {
      headers.Authorization = `Bearer ${apiKey}`;
    }

    if (hmacSecret) {
      const { timestamp, signature } = signRequest(hmacSecret, body);
      headers['X-YL-Timestamp'] = timestamp;
      headers['X-YL-Signature'] = signature;
    }

    const res = await fetch(`${baseUrl}${path}`, {
      method,
      headers,
      body: body || undefined,
    });

    const text = await res.text();
    let data = null;
    try {
      data = text ? JSON.parse(text) : null;
    } catch {
      data = { message: text };
    }

    if (!res.ok) {
      throw new Error(data?.message || `Agent runtime ${method} ${path} failed (${res.status})`);
    }

    return data;
  }

  return {
    request,
    createJob(payload) {
      return request('POST', '/v1/jobs', payload);
    },
    getJob(jobId) {
      return request('GET', `/v1/jobs/${encodeURIComponent(jobId)}`);
    },
    cancelJob(jobId) {
      return request('POST', `/v1/jobs/${encodeURIComponent(jobId)}/cancel`, {});
    },
    resumeJob(jobId, payload) {
      return request('POST', `/v1/jobs/${encodeURIComponent(jobId)}/resume`, payload || {});
    },
    getEventLog(jobId, afterId = 0) {
      return request('GET', `/v1/jobs/${encodeURIComponent(jobId)}/event-log?afterId=${afterId}`);
    },
    getAgent(agentId) {
      return request('GET', `/v1/agents/${encodeURIComponent(agentId)}`);
    },
    listAgents() {
      return request('GET', '/v1/agents');
    },
    health() {
      return request('GET', '/v1/health');
    },
    mapAgentId(agentId) {
      return AGENT_ID_TO_PLATFORM_TYPE[agentId] || agentId;
    },
    mapPlatformType(agentType) {
      return PLATFORM_TYPE_TO_AGENT_ID[agentType] || agentType || null;
    },
  };
}

module.exports = {
  AGENT_ID_TO_PLATFORM_TYPE,
  PLATFORM_TYPE_TO_AGENT_ID,
  createAgentRuntimeClient,
  signRequest,
};
