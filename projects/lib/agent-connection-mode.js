const LOOPBACK_HOSTS = new Set(['localhost', '127.0.0.1', '::1', '[::1]']);

function normalizeMode(value, nodeEnv = process.env.NODE_ENV) {
  const raw = String(value || '').trim().toLowerCase().replace(/-/g, '_');
  if (raw) {
    if (!['local_push', 'remote_pull', 'disabled'].includes(raw)) {
      throw new Error(`AGENT_CONNECTION_MODE invalido: ${value}`);
    }
    return raw;
  }
  return nodeEnv === 'production' ? 'remote_pull' : 'local_push';
}

function validateAgentConnectionConfig(env = process.env) {
  const mode = normalizeMode(env.AGENT_CONNECTION_MODE, env.NODE_ENV);
  if (env.NODE_ENV === 'production' && mode === 'local_push') {
    throw new Error('local_push e proibido em producao; use remote_pull ou disabled');
  }
  if (mode === 'local_push') {
    const runtimeUrl = new URL(String(env.AGENT_RUNTIME_URL || 'http://127.0.0.1:3847'));
    if (!LOOPBACK_HOSTS.has(runtimeUrl.hostname)) {
      throw new Error('local_push so permite um AGENT_RUNTIME_URL de loopback');
    }
    if (!['http:', 'https:'].includes(runtimeUrl.protocol)) {
      throw new Error('AGENT_RUNTIME_URL deve usar HTTP ou HTTPS');
    }
    if (runtimeUrl.username || runtimeUrl.password || runtimeUrl.search || runtimeUrl.hash || !['', '/'].includes(runtimeUrl.pathname)) {
      throw new Error('AGENT_RUNTIME_URL deve conter apenas a origem');
    }
  }
  return mode;
}

function validatePlatformOrigin(value, mode) {
  const url = new URL(String(value || ''));
  if (url.username || url.password || url.search || url.hash || !['', '/'].includes(url.pathname)) {
    throw new Error('PLATFORM_BASE_URL deve conter apenas a origem, sem /projects');
  }
  if (mode === 'remote_pull' && url.protocol !== 'https:') {
    throw new Error('remote_pull exige PLATFORM_BASE_URL com HTTPS');
  }
  return url.origin;
}

module.exports = {
  LOOPBACK_HOSTS,
  normalizeMode,
  validateAgentConnectionConfig,
  validatePlatformOrigin,
};
