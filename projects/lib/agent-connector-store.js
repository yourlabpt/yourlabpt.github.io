const crypto = require('crypto');
const {
  assessCompatibility,
  normalizeCapabilities,
  normalizeConnectorStatus,
} = require('./agent-connector-contract');

const PAIRING_TTL_MS = 10 * 60 * 1000;
const REQUEST_MAX_AGE_SECONDS = 60;
const NONCE_TTL_MS = 5 * 60 * 1000;
const LEASE_TTL_MS = 60 * 1000;
const ACTIVE_LEASE_STATUSES = [
  'claimed',
  'running',
  'planning',
  'executing',
  'self_review',
  'verifying',
  'paused',
  'cancel_requested',
];

function sha256(value) {
  return crypto.createHash('sha256').update(value).digest('hex');
}

function json(value, fallback = null) {
  try {
    return value ? JSON.parse(value) : fallback;
  } catch {
    return fallback;
  }
}

function nowIso(now = Date.now()) {
  return new Date(now).toISOString();
}

function publicConnector(row, now = Date.now()) {
  if (!row) return null;
  const lastSeenMs = row.last_seen_at ? Date.parse(row.last_seen_at) : 0;
  return {
    id: row.id,
    name: row.name,
    status: row.status,
    runtimeVersion: row.runtime_version || '',
    capabilities: normalizeCapabilities(json(row.capabilities_json, {})),
    createdAt: row.created_at,
    lastSeenAt: row.last_seen_at || null,
    revokedAt: row.revoked_at || null,
    online: row.status === 'active' && lastSeenMs > now - 30_000,
  };
}

class AgentConnectorStore {
  constructor(database, options = {}) {
    this.db = database;
    this.now = options.now || (() => Date.now());
    this.initSchema();
  }

  initSchema() {
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS agent_connectors (
        id TEXT PRIMARY KEY,
        name TEXT NOT NULL,
        public_key TEXT NOT NULL,
        status TEXT NOT NULL,
        runtime_version TEXT,
        capabilities_json TEXT NOT NULL DEFAULT '{}',
        created_by TEXT NOT NULL,
        created_at TEXT NOT NULL,
        last_seen_at TEXT,
        revoked_at TEXT
      );
      CREATE TABLE IF NOT EXISTS agent_pairing_codes (
        code_hash TEXT PRIMARY KEY,
        created_by TEXT NOT NULL,
        expires_at TEXT NOT NULL,
        consumed_at TEXT,
        created_at TEXT NOT NULL
      );
      CREATE TABLE IF NOT EXISTS agent_connector_nonces (
        connector_id TEXT NOT NULL,
        nonce_hash TEXT NOT NULL,
        expires_at TEXT NOT NULL,
        PRIMARY KEY (connector_id, nonce_hash)
      );
      CREATE TABLE IF NOT EXISTS agent_dispatches (
        id TEXT PRIMARY KEY,
        project_id TEXT NOT NULL,
        work_item_id TEXT NOT NULL,
        agent_request_id TEXT,
        platform_run_id TEXT NOT NULL,
        agent_job_id TEXT NOT NULL UNIQUE,
        agent_id TEXT NOT NULL,
        package_json TEXT NOT NULL,
        package_hash TEXT NOT NULL,
        status TEXT NOT NULL,
        desired_action TEXT,
        connector_id TEXT,
        lease_hash TEXT,
        lease_expires_at TEXT,
        local_job_id TEXT,
        attempt INTEGER NOT NULL DEFAULT 1,
        previous_dispatch_id TEXT,
        result_hash TEXT,
        result_json TEXT,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL
      );
      CREATE TABLE IF NOT EXISTS agent_dispatch_events (
        dispatch_id TEXT NOT NULL,
        local_event_id INTEGER NOT NULL,
        event_json TEXT NOT NULL,
        created_at TEXT NOT NULL,
        PRIMARY KEY (dispatch_id, local_event_id)
      );
      CREATE INDEX IF NOT EXISTS idx_agent_dispatch_queue
        ON agent_dispatches(status, created_at);
      CREATE INDEX IF NOT EXISTS idx_agent_dispatch_platform_run
        ON agent_dispatches(platform_run_id);
    `);
  }

  createPairingCode(createdBy) {
    const code = crypto.randomBytes(16).toString('base64url');
    const now = this.now();
    this.db.prepare(`
      INSERT INTO agent_pairing_codes (code_hash, created_by, expires_at, created_at)
      VALUES (?, ?, ?, ?)
    `).run(sha256(code), createdBy, nowIso(now + PAIRING_TTL_MS), nowIso(now));
    return { code, expiresAt: nowIso(now + PAIRING_TTL_MS) };
  }

  pair({ code, name, publicKey, runtimeVersion = '', capabilities = {} }) {
    const now = this.now();
    const codeHash = sha256(String(code || ''));
    return this.db.transaction(() => {
      const row = this.db.prepare('SELECT * FROM agent_pairing_codes WHERE code_hash = ?').get(codeHash);
      if (!row || row.consumed_at || Date.parse(row.expires_at) <= now) {
        throw new Error('Codigo de emparelhamento invalido ou expirado');
      }
      const active = this.db.prepare(`SELECT id FROM agent_connectors WHERE status = 'active' LIMIT 1`).get();
      if (active) throw new Error('Ja existe um Agent Runtime activo; revogue-o antes de emparelhar outro');
      const key = crypto.createPublicKey(publicKey);
      if (key.asymmetricKeyType !== 'ed25519') throw new Error('A chave do dispositivo deve ser Ed25519');
      const id = `connector_${crypto.randomUUID()}`;
      this.db.prepare(`
        INSERT INTO agent_connectors (
          id, name, public_key, status, runtime_version, capabilities_json,
          created_by, created_at, last_seen_at
        ) VALUES (?, ?, ?, 'active', ?, ?, ?, ?, ?)
      `).run(id, String(name || 'Local Agent Runtime').slice(0, 120), publicKey,
        String(runtimeVersion).slice(0, 40), JSON.stringify(normalizeCapabilities(capabilities)),
        row.created_by, nowIso(now), nowIso(now));
      this.db.prepare('UPDATE agent_pairing_codes SET consumed_at = ? WHERE code_hash = ?')
        .run(nowIso(now), codeHash);
      return publicConnector(this.db.prepare('SELECT * FROM agent_connectors WHERE id = ?').get(id), now);
    })();
  }

  listConnectors() {
    const now = this.now();
    return this.db.prepare('SELECT * FROM agent_connectors ORDER BY created_at DESC').all()
      .map((row) => publicConnector(row, now));
  }

  getConnector(id) {
    return publicConnector(this.db.prepare('SELECT * FROM agent_connectors WHERE id = ?').get(id), this.now());
  }

  revoke(id) {
    const at = nowIso(this.now());
    this.db.transaction(() => {
      this.db.prepare(`UPDATE agent_connectors SET status = 'revoked', revoked_at = ? WHERE id = ?`).run(at, id);
      this.db.prepare(`
        UPDATE agent_dispatches
        SET status = CASE
              WHEN status IN ('claimed','running','planning','executing','self_review','verifying','paused','cancel_requested')
                THEN 'connection_lost'
              ELSE status
            END,
            lease_hash = NULL, lease_expires_at = NULL, updated_at = ?
        WHERE connector_id = ? AND status NOT IN ('waiting_review','completed','failed','cancelled')
      `).run(at, id);
    })();
    return this.getConnector(id);
  }

  authenticate({ connectorId, method, path, timestamp, nonce, signature, rawBody }) {
    const connector = this.db.prepare('SELECT * FROM agent_connectors WHERE id = ?').get(connectorId);
    if (!connector || connector.status !== 'active') throw new Error('Dispositivo desconhecido ou revogado');
    const now = this.now();
    const ts = Number(timestamp);
    if (!/^\d{9,12}$/.test(String(timestamp || ''))
      || !Number.isSafeInteger(ts)
      || Math.abs(now / 1000 - ts) > REQUEST_MAX_AGE_SECONDS) {
      throw new Error('Timestamp do conector expirado');
    }
    if (!/^[A-Za-z0-9_-]{16,128}$/.test(String(nonce || ''))) throw new Error('Nonce invalido');
    const nonceHash = sha256(nonce);
    this.db.prepare('DELETE FROM agent_connector_nonces WHERE expires_at <= ?').run(nowIso(now));
    try {
      this.db.prepare(`
        INSERT INTO agent_connector_nonces (connector_id, nonce_hash, expires_at)
        VALUES (?, ?, ?)
      `).run(connectorId, nonceHash, nowIso(now + NONCE_TTL_MS));
    } catch {
      throw new Error('Pedido repetido');
    }
    const canonical = [
      String(method || '').toUpperCase(),
      path,
      String(timestamp),
      nonce,
      sha256(rawBody || ''),
    ].join('\n');
    const valid = crypto.verify(null, Buffer.from(canonical), connector.public_key, Buffer.from(String(signature || ''), 'base64url'));
    if (!valid) {
      this.db.prepare('DELETE FROM agent_connector_nonces WHERE connector_id = ? AND nonce_hash = ?').run(connectorId, nonceHash);
      throw new Error('Assinatura do conector invalida');
    }
    return publicConnector(connector, now);
  }

  heartbeat(id, { runtimeVersion = '', capabilities = {} }) {
    const at = nowIso(this.now());
    this.db.prepare(`
      UPDATE agent_connectors
      SET last_seen_at = ?, runtime_version = ?, capabilities_json = ?
      WHERE id = ? AND status = 'active'
    `).run(at, String(runtimeVersion).slice(0, 40), JSON.stringify(normalizeCapabilities(capabilities)), id);
    return this.getConnector(id);
  }

  renewLease(connectorId, dispatchId, leaseToken, localJobId = '') {
    const leased = this.assertLease(connectorId, dispatchId, leaseToken);
    const normalizedLocalJobId = String(localJobId || leased.local_job_id || '').trim();
    if (leased.local_job_id && normalizedLocalJobId && leased.local_job_id !== normalizedLocalJobId) {
      throw new Error('O job local nao corresponde ao dispatch');
    }
    const now = this.now();
    this.db.prepare(`
      UPDATE agent_dispatches
      SET lease_expires_at = ?, updated_at = ?
      WHERE id = ?
    `).run(nowIso(now + LEASE_TTL_MS), nowIso(now), dispatchId);
    return this.getDispatch(dispatchId);
  }

  activeConnector() {
    const row = this.db.prepare(`
      SELECT * FROM agent_connectors WHERE status = 'active' ORDER BY created_at ASC LIMIT 1
    `).get();
    return publicConnector(row, this.now());
  }

  enqueue(input) {
    const at = nowIso(this.now());
    const packageJson = JSON.stringify(input.package);
    const packageHash = sha256(packageJson);
    const record = {
      id: input.id || `dispatch_${crypto.randomUUID()}`,
      packageHash,
    };
    this.db.prepare(`
      INSERT INTO agent_dispatches (
        id, project_id, work_item_id, agent_request_id, platform_run_id,
        agent_job_id, agent_id, package_json, package_hash, status,
        attempt, previous_dispatch_id, created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 'queued', ?, ?, ?, ?)
    `).run(record.id, input.projectId, input.workItemId, input.agentRequestId || null,
      input.platformRunId, input.agentJobId, input.agentId, packageJson, packageHash,
      input.attempt || 1, input.previousDispatchId || null, at, at);
    return this.getDispatch(record.id);
  }

  getDispatch(id) {
    this.expireLeases();
    const row = this.db.prepare('SELECT * FROM agent_dispatches WHERE id = ?').get(id);
    return row ? this.toDispatch(row) : null;
  }

  findDispatch(runId) {
    this.expireLeases();
    const row = this.db.prepare(`
      SELECT * FROM agent_dispatches
      WHERE id = ? OR agent_job_id = ? OR platform_run_id = ?
      ORDER BY created_at DESC LIMIT 1
    `).get(runId, runId, runId);
    return row ? this.toDispatch(row) : null;
  }

  claim(connectorId) {
    this.expireLeases();
    const now = this.now();
    return this.db.transaction(() => {
      const connector = this.db.prepare(`
        SELECT * FROM agent_connectors WHERE id = ? AND status = 'active'
      `).get(connectorId);
      if (!connector) throw new Error('Dispositivo desconhecido ou revogado');
      const capabilities = json(connector.capabilities_json, {});
      const existing = this.db.prepare(`
        SELECT * FROM agent_dispatches
        WHERE connector_id = ?
          AND status IN ('claimed','running','planning','executing','self_review','verifying','paused','cancel_requested','connection_lost')
        ORDER BY created_at ASC LIMIT 1
      `).get(connectorId);
      const queued = this.db.prepare(`
        SELECT * FROM agent_dispatches WHERE status = 'queued' ORDER BY created_at ASC
      `).all();
      const row = existing || queued.find((candidate) => (
        assessCompatibility(json(candidate.package_json, {}), capabilities).compatible
      ));
      if (!row) return null;
      const leaseToken = crypto.randomBytes(32).toString('base64url');
      const status = row.status === 'queued' ? 'claimed' : row.status === 'connection_lost' ? 'claimed' : row.status;
      this.db.prepare(`
        UPDATE agent_dispatches
        SET connector_id = ?, status = ?, lease_hash = ?, lease_expires_at = ?, updated_at = ?
        WHERE id = ?
      `).run(connectorId, status, sha256(leaseToken), nowIso(now + LEASE_TTL_MS), nowIso(now), row.id);
      return { ...this.getDispatch(row.id), leaseToken };
    })();
  }

  expireLeases() {
    const at = nowIso(this.now());
    this.db.prepare(`
      UPDATE agent_dispatches
      SET status = 'connection_lost', updated_at = ?
      WHERE status IN ('claimed','running','planning','executing','self_review','verifying','paused','cancel_requested')
        AND lease_expires_at IS NOT NULL
        AND lease_expires_at <= ?
    `).run(at, at);
  }

  assertLease(connectorId, dispatchId, leaseToken) {
    const row = this.db.prepare('SELECT * FROM agent_dispatches WHERE id = ?').get(dispatchId);
    if (!row || row.connector_id !== connectorId || !row.lease_hash
      || sha256(String(leaseToken || '')) !== row.lease_hash
      || !row.lease_expires_at
      || Date.parse(row.lease_expires_at) <= this.now()) {
      throw new Error('Lease invalido ou substituido');
    }
    return row;
  }

  ack(connectorId, dispatchId, leaseToken, localJobId) {
    const leased = this.assertLease(connectorId, dispatchId, leaseToken);
    const normalizedLocalJobId = String(localJobId || '').trim();
    if (!normalizedLocalJobId) throw new Error('localJobId e obrigatorio');
    if (leased.local_job_id && leased.local_job_id !== normalizedLocalJobId) {
      throw new Error('Este dispatch ja esta associado a outro job local');
    }
    const now = this.now();
    this.db.prepare(`
      UPDATE agent_dispatches
      SET local_job_id = COALESCE(local_job_id, ?), status = 'running',
          lease_expires_at = ?, updated_at = ?
      WHERE id = ?
    `).run(normalizedLocalJobId, nowIso(now + LEASE_TTL_MS), nowIso(now), dispatchId);
    return this.getDispatch(dispatchId);
  }

  sync(connectorId, dispatchId, leaseToken, input) {
    const leased = this.assertLease(connectorId, dispatchId, leaseToken);
    const now = this.now();
    const localJobId = String(input.localJobId || leased.local_job_id || '').trim();
    const events = input.events === undefined
      ? []
      : Array.isArray(input.events)
        ? input.events
        : null;
    if (!events || events.length > 100) {
      throw new Error('Cada sincronizacao aceita no maximo 100 eventos');
    }
    if (leased.local_job_id && localJobId && leased.local_job_id !== localJobId) {
      throw new Error('O job local nao corresponde ao dispatch');
    }
    const insert = this.db.prepare(`
      INSERT OR IGNORE INTO agent_dispatch_events
        (dispatch_id, local_event_id, event_json, created_at)
      VALUES (?, ?, ?, ?)
    `);
    this.db.transaction(() => {
      for (const event of events) {
        const localEventId = Number(event?.id);
        if (!Number.isSafeInteger(localEventId) || localEventId < 0) {
          throw new Error('Cada evento deve ter um id inteiro nao negativo');
        }
        insert.run(dispatchId, localEventId, JSON.stringify(event), nowIso(now));
      }
      const localStatus = normalizeConnectorStatus(input.status);
      const acknowledgedAction = String(input.acknowledgedAction || '').trim();
      const status = leased.desired_action === 'cancel' && localStatus !== 'cancelled'
        ? 'cancel_requested'
        : localStatus;
      const desiredAction = (
        (acknowledgedAction && acknowledgedAction === leased.desired_action)
        ||
        (leased.desired_action === 'cancel' && localStatus === 'cancelled')
        || (leased.desired_action === 'pause' && localStatus === 'paused')
        || (leased.desired_action === 'resume' && localStatus !== 'paused')
        || (leased.desired_action === 'finish_partial' && localStatus !== 'paused')
      ) ? null : leased.desired_action;
      this.db.prepare(`
        UPDATE agent_dispatches
        SET status = ?, desired_action = ?,
            lease_expires_at = ?, updated_at = ?
        WHERE id = ?
      `).run(status, desiredAction, nowIso(now + LEASE_TTL_MS), nowIso(now), dispatchId);
    })();
    return this.getDispatch(dispatchId);
  }

  setDesiredAction(runId, action) {
    const dispatch = this.findDispatch(runId);
    if (!dispatch) return null;
    if (!['cancel', 'pause', 'resume', 'finish_partial'].includes(action)) {
      throw new Error('Acao de controlo do agente invalida');
    }
    if (action === 'pause' && ['queued', 'paused'].includes(dispatch.status)) {
      throw new Error(dispatch.status === 'queued'
        ? 'A execução ainda está na fila; cancele-a ou aguarde que o agente inicie.'
        : 'A execução já está em pausa.');
    }
    if (['resume', 'finish_partial'].includes(action) && dispatch.status !== 'paused') {
      throw new Error('A execução tem de estar em pausa para continuar ou enviar o progresso.');
    }
    const cancelImmediately = action === 'cancel' && dispatch.status === 'queued';
    const status = cancelImmediately ? 'cancelled'
      : action === 'cancel' ? 'cancel_requested' : dispatch.status;
    this.db.prepare(`
      UPDATE agent_dispatches SET desired_action = ?, status = ?, updated_at = ? WHERE id = ?
    `).run(cancelImmediately ? null : action, status, nowIso(this.now()), dispatch.id);
    return this.getDispatch(dispatch.id);
  }

  retry(runId) {
    const previous = this.findDispatch(runId);
    if (!previous) return null;
    const attempt = Number(previous.attempt || 1) + 1;
    const retried = this.enqueue({
      projectId: previous.projectId,
      workItemId: previous.workItemId,
      agentRequestId: previous.agentRequestId,
      platformRunId: previous.platformRunId,
      agentJobId: `${previous.agentJobId}:attempt:${attempt}`,
      agentId: previous.agentId,
      package: previous.package,
      attempt,
      previousDispatchId: previous.id,
    });
    this.db.prepare(`
      INSERT OR IGNORE INTO agent_dispatch_events
        (dispatch_id, local_event_id, event_json, created_at)
      SELECT ?, local_event_id, event_json, created_at
      FROM agent_dispatch_events
      WHERE dispatch_id = ?
    `).run(retried.id, previous.id);
    return retried;
  }

  compatibility(dispatchId, connectorId) {
    const dispatch = this.db.prepare('SELECT * FROM agent_dispatches WHERE id = ?').get(dispatchId);
    const connector = this.db.prepare('SELECT * FROM agent_connectors WHERE id = ?').get(connectorId);
    if (!dispatch || !connector) return { compatible: false, reasons: ['not-found'] };
    return assessCompatibility(json(dispatch.package_json, {}), json(connector.capabilities_json, {}));
  }

  complete(connectorId, dispatchId, leaseToken, { packageHash, rawOutput }) {
    const resultHash = sha256(String(rawOutput || ''));
    const existing = this.db.prepare('SELECT * FROM agent_dispatches WHERE id = ?').get(dispatchId);
    if (existing?.result_hash) {
      const leased = this.assertLease(connectorId, dispatchId, leaseToken);
      if (leased.package_hash !== packageHash
        || existing.result_hash !== resultHash) {
        throw new Error('Ja existe um resultado diferente para este dispatch');
      }
      return { dispatch: this.toDispatch(existing), duplicate: true };
    }
    const row = this.assertLease(connectorId, dispatchId, leaseToken);
    if (packageHash !== row.package_hash) throw new Error('O resultado nao corresponde ao pacote congelado');
    if (!['claimed', 'running', 'planning', 'executing', 'self_review', 'verifying', 'paused'].includes(row.status)) {
      throw new Error('O dispatch ja nao aceita resultados');
    }
    this.db.prepare(`
      UPDATE agent_dispatches
      SET result_hash = ?, result_json = ?, status = 'result_received',
          desired_action = NULL, updated_at = ?
      WHERE id = ?
    `).run(resultHash, JSON.stringify({ rawOutput }), nowIso(this.now()), dispatchId);
    return { dispatch: this.getDispatch(dispatchId), duplicate: false };
  }

  markResultDelivered(dispatchId, resultHash) {
    this.db.prepare(`
      UPDATE agent_dispatches
      SET status = 'waiting_review', updated_at = ?
      WHERE id = ? AND result_hash = ?
    `).run(nowIso(this.now()), dispatchId, resultHash);
    return this.getDispatch(dispatchId);
  }

  markReviewed(runId, action) {
    const dispatch = this.findDispatch(runId);
    if (!dispatch || dispatch.status !== 'waiting_review') return dispatch;
    const status = action === 'approved' ? 'completed' : 'failed';
    this.db.prepare(`
      UPDATE agent_dispatches
      SET status = ?, updated_at = ?
      WHERE id = ? AND status = 'waiting_review'
    `).run(status, nowIso(this.now()), dispatch.id);
    return this.getDispatch(dispatch.id);
  }

  events(dispatchId, afterId = 0) {
    return this.db.prepare(`
      SELECT event_json FROM agent_dispatch_events
      WHERE dispatch_id = ? AND local_event_id > ?
      ORDER BY local_event_id ASC LIMIT 500
    `).all(dispatchId, afterId).map((row) => json(row.event_json, {}));
  }

  recentEvents(dispatchId, limit = 200) {
    return this.db.prepare(`
      SELECT event_json FROM (
        SELECT local_event_id, event_json
        FROM agent_dispatch_events
        WHERE dispatch_id = ?
        ORDER BY local_event_id DESC LIMIT ?
      )
      ORDER BY local_event_id ASC
    `).all(dispatchId, Math.max(1, Math.min(500, Number(limit) || 200)))
      .map((row) => json(row.event_json, {}));
  }

  lastEventId(dispatchId) {
    const row = this.db.prepare(`
      SELECT MAX(local_event_id) AS last_event_id
      FROM agent_dispatch_events
      WHERE dispatch_id = ?
    `).get(dispatchId);
    return Math.max(0, Number(row?.last_event_id) || 0);
  }

  toDispatch(row) {
    if (sha256(row.package_json) !== row.package_hash) {
      throw new Error(`Integridade do pacote congelado invalida para ${row.id}`);
    }
    return {
      id: row.id,
      projectId: row.project_id,
      workItemId: row.work_item_id,
      agentRequestId: row.agent_request_id,
      platformRunId: row.platform_run_id,
      agentJobId: row.agent_job_id,
      agentId: row.agent_id,
      package: json(row.package_json, {}),
      packageHash: row.package_hash,
      status: row.status,
      desiredAction: row.desired_action || null,
      connectorId: row.connector_id || null,
      localJobId: row.local_job_id || null,
      attempt: row.attempt,
      previousDispatchId: row.previous_dispatch_id || null,
      resultHash: row.result_hash || null,
      createdAt: row.created_at,
      updatedAt: row.updated_at,
      leaseExpiresAt: row.lease_expires_at || null,
    };
  }
}

module.exports = {
  AgentConnectorStore,
  LEASE_TTL_MS,
  NONCE_TTL_MS,
  PAIRING_TTL_MS,
  REQUEST_MAX_AGE_SECONDS,
  ACTIVE_LEASE_STATUSES,
  sha256,
};
