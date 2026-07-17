const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const Database = require('better-sqlite3');
const { AgentConnectorStore, sha256 } = require('../lib/agent-connector-store');
const { validateAgentConnectionConfig } = require('../lib/agent-connection-mode');
const {
  CONTRACT_ID,
  assessCompatibility,
  buildFrozenTaskPackage,
  publicDispatch,
} = require('../lib/agent-connector-contract');
const { registerAgentConnectorRoutes } = require('../lib/agent-connector-routes');
const { resolveExecutionConfig } = require('../lib/agent-runtime-routes');

function signed(store, connectorId, privateKey, body = '{}', overrides = {}) {
  const method = 'POST';
  const path = '/api/projects/agent-connectors/heartbeat';
  const timestamp = String(Math.floor(Date.now() / 1000));
  const nonce = crypto.randomBytes(18).toString('base64url');
  const canonical = [method, path, timestamp, nonce, sha256(body)].join('\n');
  const signature = crypto.sign(null, Buffer.from(canonical), privateKey).toString('base64url');
  return store.authenticate({
    connectorId,
    method,
    path,
    timestamp,
    nonce,
    signature,
    rawBody: body,
    ...overrides,
  });
}

function fixture() {
  const db = new Database(':memory:');
  const store = new AgentConnectorStore(db);
  const keys = crypto.generateKeyPairSync('ed25519');
  const pairing = store.createPairingCode('admin');
  const connector = store.pair({
    code: pairing.code,
    name: 'Test Mac',
    publicKey: keys.publicKey.export({ type: 'spki', format: 'pem' }).toString(),
  });
  return { db, store, keys, connector, pairing };
}

function enqueue(store, overrides = {}) {
  return store.enqueue({
    projectId: 'p1',
    workItemId: 'w1',
    platformRunId: 'r1',
    agentJobId: `j_${crypto.randomUUID()}`,
    agentId: 'a1',
    package: { version: 1, prompt: 'frozen' },
    ...overrides,
  });
}

async function runRouteHandlers(handlers, req, res, index = 0) {
  if (!handlers[index]) return;
  await handlers[index](req, res, () => runRouteHandlers(handlers, req, res, index + 1));
}

describe('secure outbound agent connector', () => {
  it('enforces production pull mode and loopback-only local push', () => {
    assert.equal(validateAgentConnectionConfig({ NODE_ENV: 'production' }), 'remote_pull');
    assert.throws(() => validateAgentConnectionConfig({
      NODE_ENV: 'production',
      AGENT_CONNECTION_MODE: 'local_push',
      AGENT_RUNTIME_URL: 'http://127.0.0.1:3847',
    }), /proibido/);
    assert.throws(() => validateAgentConnectionConfig({
      NODE_ENV: 'development',
      AGENT_CONNECTION_MODE: 'local_push',
      AGENT_RUNTIME_URL: 'http://192.168.1.8:3847',
    }), /loopback/);
    assert.equal(validateAgentConnectionConfig({
      NODE_ENV: 'development',
      AGENT_CONNECTION_MODE: 'local_push',
      AGENT_RUNTIME_URL: 'http://[::1]:3847',
    }), 'local_push');
    assert.equal(validateAgentConnectionConfig({
      NODE_ENV: 'development',
      AGENT_CONNECTION_MODE: 'disabled',
    }), 'disabled');
  });

  it('freezes remote budgets and options from canonical approved state', () => {
    const request = {
      runtimeConfig: {
        options: { modelProfileId: 'medium', enableWebSearch: false },
        budget: { maxTokens: 80_000, maxWallClockMinutes: 30, maxSubtasks: 4 },
      },
    };
    const task = {
      executionSettings: {
        modelProfileId: 'large',
        maxTokens: 120_000,
        maxWallClockMinutes: 45,
        maxSubtasks: 8,
      },
    };
    const remote = resolveExecutionConfig(
      'remote_pull',
      request,
      task,
      { enableWebSearch: true, unapproved: true },
      { maxTokens: 999_999 }
    );
    assert.deepEqual(remote.budget, {
      maxTokens: 120_000,
      maxWallClockMinutes: 45,
      maxSubtasks: 8,
    });
    assert.equal(remote.options.modelProfileId, 'large');
    assert.equal(remote.options.enableWebSearch, false);
    assert.equal(remote.options.unapproved, undefined);

    const local = resolveExecutionConfig(
      'local_push',
      request,
      task,
      { enableWebSearch: true },
      { maxTokens: 999_999 }
    );
    assert.equal(local.options.enableWebSearch, true);
    assert.equal(local.budget.maxTokens, 999_999);
  });

  it('expires pairing codes and stores only hashes and public keys', () => {
    let clock = Date.now();
    const db = new Database(':memory:');
    const store = new AgentConnectorStore(db, { now: () => clock });
    const keys = crypto.generateKeyPairSync('ed25519');
    const pairing = store.createPairingCode('admin');
    assert.equal(Buffer.from(pairing.code, 'base64url').length, 16);
    const stored = db.prepare('SELECT * FROM agent_pairing_codes').get();
    assert.notEqual(stored.code_hash, pairing.code);
    assert.equal(stored.code_hash, sha256(pairing.code));
    clock += 10 * 60 * 1000;
    assert.throws(() => store.pair({
      code: pairing.code,
      name: 'Late Runtime',
      publicKey: keys.publicKey.export({ type: 'spki', format: 'pem' }).toString(),
    }), /expirado/);
    assert.equal(db.prepare('SELECT COUNT(*) AS count FROM agent_connectors').get().count, 0);
    db.close();
  });

  it('consumes a pairing code once and verifies signed requests', () => {
    const { db, store, keys, connector, pairing } = fixture();
    assert.equal(signed(store, connector.id, keys.privateKey).id, connector.id);
    assert.throws(() => store.pair({
      code: pairing.code,
      name: 'Replay',
      publicKey: keys.publicKey.export({ type: 'spki', format: 'pem' }).toString(),
    }), /invalido ou expirado/);
    assert.throws(() => signed(store, connector.id, keys.privateKey, '{"changed":true}', {
      rawBody: '{"tampered":true}',
    }), /Assinatura/);
    db.close();
  });

  it('prevents nonce replay and rejects revoked devices', () => {
    const { db, store, keys, connector } = fixture();
    const body = '{}';
    const timestamp = String(Math.floor(Date.now() / 1000));
    const nonce = crypto.randomBytes(18).toString('base64url');
    const path = '/api/projects/agent-connectors/heartbeat';
    const canonical = ['POST', path, timestamp, nonce, sha256(body)].join('\n');
    const signature = crypto.sign(null, Buffer.from(canonical), keys.privateKey).toString('base64url');
    const request = { connectorId: connector.id, method: 'POST', path, timestamp, nonce, signature, rawBody: body };
    store.authenticate(request);
    assert.throws(() => store.authenticate(request), /repetido/);
    store.revoke(connector.id);
    assert.throws(() => signed(store, connector.id, keys.privateKey), /revogado/);
    db.close();
  });

  it('rejects signed requests outside the timestamp window', () => {
    const { db, store, keys, connector } = fixture();
    assert.throws(() => signed(store, connector.id, keys.privateKey, '{}', {
      timestamp: String(Math.floor(Date.now() / 1000) - 61),
    }), /Timestamp/);
    db.close();
  });

  it('freezes, claims, fences, and idempotently completes a dispatch', () => {
    const { db, store, connector } = fixture();
    const queued = store.enqueue({
      projectId: 'p1',
      workItemId: 'w1',
      platformRunId: 'r1',
      agentJobId: 'j1',
      agentId: 'requirements-to-architecture',
      package: { prompt: 'frozen', version: 1 },
    });
    const claim = store.claim(connector.id);
    assert.equal(claim.id, queued.id);
    assert.equal(claim.packageHash, sha256(JSON.stringify({ prompt: 'frozen', version: 1 })));
    assert.throws(() => store.ack(connector.id, claim.id, 'wrong', 'local-1'), /Lease/);
    store.ack(connector.id, claim.id, claim.leaseToken, 'local-1');
    assert.throws(() => store.sync(connector.id, claim.id, claim.leaseToken, {
      status: 'running',
      events: Array.from({ length: 101 }, (_, id) => ({ id })),
    }), /100 eventos/);
    store.sync(connector.id, claim.id, claim.leaseToken, {
      status: 'running',
      events: [{ id: 1, type: 'planning' }, { id: 1, type: 'planning' }],
    });
    assert.equal(store.events(claim.id).length, 1);
    const first = store.complete(connector.id, claim.id, claim.leaseToken, {
      packageHash: claim.packageHash,
      rawOutput: '{"ok":true}',
    });
    store.markResultDelivered(claim.id, store.getDispatch(claim.id).resultHash);
    assert.throws(() => store.complete(connector.id, claim.id, 'wrong', {
      packageHash: claim.packageHash,
      rawOutput: '{"ok":true}',
    }), /Lease/);
    const second = store.complete(connector.id, claim.id, claim.leaseToken, {
      packageHash: claim.packageHash,
      rawOutput: '{"ok":true}',
    });
    assert.equal(first.duplicate, false);
    assert.equal(second.duplicate, true);
    db.close();
  });

  it('renews an active dispatch lease from heartbeat state', () => {
    let clock = Date.now();
    const db = new Database(':memory:');
    const store = new AgentConnectorStore(db, { now: () => clock });
    const keys = crypto.generateKeyPairSync('ed25519');
    const pairing = store.createPairingCode('admin');
    const connector = store.pair({
      code: pairing.code,
      name: 'Heartbeat Runtime',
      publicKey: keys.publicKey.export({ type: 'spki', format: 'pem' }).toString(),
    });
    const queued = enqueue(store);
    const claim = store.claim(connector.id);
    store.ack(connector.id, queued.id, claim.leaseToken, 'heartbeat-job');
    clock += 50_000;
    store.renewLease(connector.id, queued.id, claim.leaseToken, 'heartbeat-job');
    clock += 20_000;
    assert.equal(store.getDispatch(queued.id).status, 'running');
    clock += 41_000;
    assert.equal(store.getDispatch(queued.id).status, 'connection_lost');
    db.close();
  });

  it('fences an expired lease and lets the same device reconcile safely', () => {
    let clock = Date.now();
    const db = new Database(':memory:');
    const store = new AgentConnectorStore(db, { now: () => clock });
    const keys = crypto.generateKeyPairSync('ed25519');
    const pairing = store.createPairingCode('admin');
    const connector = store.pair({
      code: pairing.code,
      name: 'Recovery Mac',
      publicKey: keys.publicKey.export({ type: 'spki', format: 'pem' }).toString(),
    });
    const queued = store.enqueue({
      projectId: 'p1',
      workItemId: 'w1',
      platformRunId: 'r1',
      agentJobId: 'j1',
      agentId: 'a1',
      package: { version: 1, prompt: 'same package' },
    });
    const first = store.claim(connector.id);
    clock += 61_000;
    assert.equal(store.getDispatch(queued.id).status, 'connection_lost');
    assert.throws(() => store.ack(connector.id, queued.id, first.leaseToken, 'local'), /Lease/);
    const recovery = store.claim(connector.id);
    assert.equal(recovery.id, queued.id);
    assert.notEqual(recovery.leaseToken, first.leaseToken);
    db.close();
  });

  it('keeps offline work queued, freezes source data, and cancels it without a device', () => {
    let clock = Date.now();
    const db = new Database(':memory:');
    const store = new AgentConnectorStore(db, { now: () => clock });
    const source = {
      instructions: 'Use the approved snapshot.',
      context: { revision: 1, scope: ['approved'] },
    };
    const queued = enqueue(store, { package: source });
    source.instructions = 'Changed later.';
    source.context.revision = 2;
    source.context.scope.push('unapproved');
    clock += 24 * 60 * 60 * 1000;
    assert.equal(store.getDispatch(queued.id).status, 'queued');
    assert.deepEqual(store.getDispatch(queued.id).package, {
      instructions: 'Use the approved snapshot.',
      context: { revision: 1, scope: ['approved'] },
    });
    db.prepare('UPDATE agent_dispatches SET package_json = ? WHERE id = ?')
      .run('{"instructions":"tampered"}', queued.id);
    assert.throws(() => store.getDispatch(queued.id), /Integridade/);
    db.prepare('UPDATE agent_dispatches SET package_json = ? WHERE id = ?')
      .run(JSON.stringify({
        instructions: 'Use the approved snapshot.',
        context: { revision: 1, scope: ['approved'] },
      }), queued.id);
    const cancelled = store.setDesiredAction(queued.id, 'cancel');
    assert.equal(cancelled.status, 'cancelled');
    assert.equal(cancelled.desiredAction, null);
    db.close();
  });

  it('uses a versioned provider-neutral package and hides frozen internals from browser projections', () => {
    const taskPackage = buildFrozenTaskPackage({
      projectId: 'p1',
      workItemId: 'w1',
      agentRequestId: 'q1',
      platformRunId: 'r1',
      agentJobId: 'j1',
      requestVersion: 2,
      packageVersion: 3,
      agentId: 'architecture-agent',
      agentType: 'requirements_to_architecture',
      instructions: 'Produce architecture JSON.',
      requiredSkills: ['architecture'],
      allowedTools: ['docs.read'],
      outputContract: { targetOutput: 'architecture_v1', autoApply: true },
    });
    assert.equal(taskPackage.contract.id, CONTRACT_ID);
    assert.equal(taskPackage.outputContract.autoApply, false);
    assert.equal(taskPackage.outputContract.humanReviewRequired, true);
    assert.equal(taskPackage.outputContract.completionPolicy.selfReviewRequired, true);
    assert.deepEqual(Object.keys(taskPackage).sort(), [
      'agent',
      'budget',
      'context',
      'contextSnapshotHash',
      'contract',
      'frozenAt',
      'identifiers',
      'instructions',
      'outputContract',
      'requirements',
      'taskGraph',
      'versions',
    ].sort());
    assert.equal(Object.hasOwn(taskPackage, 'prompt'), false);
    assert.equal(Object.hasOwn(taskPackage, 'options'), false);
    assert.equal(Object.hasOwn(taskPackage, 'completionPolicy'), false);

    const projected = publicDispatch({
      id: 'd1',
      package: taskPackage,
      leaseToken: 'secret',
      packageHash: 'hash',
      status: 'queued',
    });
    assert.equal('package' in projected, false);
    assert.equal('leaseToken' in projected, false);
  });

  it('claims the oldest compatible package without blocking behind incompatible work', () => {
    const db = new Database(':memory:');
    const store = new AgentConnectorStore(db);
    const keys = crypto.generateKeyPairSync('ed25519');
    const pairing = store.createPairingCode('admin');
    const connector = store.pair({
      code: pairing.code,
      name: 'Portable Runtime',
      publicKey: keys.publicKey.export({ type: 'spki', format: 'pem' }).toString(),
      capabilities: {
        protocol: { id: CONTRACT_ID, versions: [1] },
        runtime: { kind: 'custom-agent-platform', version: '2.0.0' },
        agents: [{
          id: 'implementation-agent',
          taskTypes: ['implementation_tasks'],
          skills: ['software_delivery'],
          tools: ['repo.read', 'repo.write', 'tests.run'],
        }],
      },
    });
    const incompatible = enqueue(store, {
      agentId: 'research-agent',
      package: buildFrozenTaskPackage({
        projectId: 'p1',
        workItemId: 'research',
        platformRunId: 'research-run',
        agentJobId: 'research-job',
        agentId: 'research-agent',
        requiredSkills: ['web_research'],
      }),
    });
    const compatible = enqueue(store, {
      workItemId: 'implementation',
      agentId: 'implementation-agent',
      package: buildFrozenTaskPackage({
        projectId: 'p1',
        workItemId: 'implementation',
        platformRunId: 'implementation-run',
        agentJobId: 'implementation-job',
        agentId: 'implementation-agent',
        requiredSkills: ['software_delivery'],
        allowedTools: ['repo.write', 'tests.run'],
      }),
    });
    const claim = store.claim(connector.id);
    assert.equal(claim.id, compatible.id);
    assert.equal(store.getDispatch(incompatible.id).status, 'queued');
    assert.equal(store.compatibility(incompatible.id, connector.id).compatible, false);
    assert.equal(assessCompatibility({
      contract: { id: CONTRACT_ID, version: 1 },
      agentType: 'implementation_tasks',
      requiredSkills: ['software_delivery'],
      allowedMcpTools: ['repo.write'],
    }, connector.capabilities).compatible, true);
    assert.equal(assessCompatibility({
      contract: { id: CONTRACT_ID, version: 1 },
      agentId: 'missing-agent',
      agentType: 'implementation_tasks',
    }, connector.capabilities).compatible, false);
    db.close();
  });

  it('binds the local job once and validates runtime statuses', () => {
    const { db, store, connector } = fixture();
    const queued = enqueue(store);
    const claim = store.claim(connector.id);
    store.ack(connector.id, queued.id, claim.leaseToken, 'local-1');
    assert.throws(
      () => store.ack(connector.id, queued.id, claim.leaseToken, 'local-2'),
      /outro job local/
    );
    assert.throws(() => store.sync(connector.id, queued.id, claim.leaseToken, {
      localJobId: 'local-1',
      status: 'made_up_status',
    }), /Estado do runtime invalido/);
    assert.throws(() => store.sync(connector.id, queued.id, claim.leaseToken, {
      localJobId: 'local-1',
      status: 'running',
      events: [{ type: 'missing-id' }],
    }), /id inteiro/);
    db.close();
  });

  it('keeps paused work as the connector active dispatch', () => {
    const { db, store, connector } = fixture();
    const firstQueued = enqueue(store);
    const secondQueued = enqueue(store, { workItemId: 'w2', platformRunId: 'r2' });
    const first = store.claim(connector.id);
    store.ack(connector.id, firstQueued.id, first.leaseToken, 'local-paused');
    store.sync(connector.id, firstQueued.id, first.leaseToken, {
      localJobId: 'local-paused',
      status: 'paused',
    });
    const renewed = store.claim(connector.id);
    assert.equal(renewed.id, firstQueued.id);
    assert.equal(store.getDispatch(secondQueued.id).status, 'queued');
    db.close();
  });

  it('keeps cancellation pending offline and delivers it after reconnect', () => {
    let clock = Date.now();
    const db = new Database(':memory:');
    const store = new AgentConnectorStore(db, { now: () => clock });
    const keys = crypto.generateKeyPairSync('ed25519');
    const pairing = store.createPairingCode('admin');
    const connector = store.pair({
      code: pairing.code,
      name: 'Cancelable Runtime',
      publicKey: keys.publicKey.export({ type: 'spki', format: 'pem' }).toString(),
    });
    const queued = enqueue(store);
    const first = store.claim(connector.id);
    store.ack(connector.id, queued.id, first.leaseToken, 'local-1');
    store.setDesiredAction(queued.id, 'cancel');
    clock += 61_000;
    assert.equal(store.getDispatch(queued.id).status, 'connection_lost');
    assert.equal(store.getDispatch(queued.id).desiredAction, 'cancel');
    const recovered = store.claim(connector.id);
    assert.equal(recovered.desiredAction, 'cancel');
    const cancelled = store.sync(connector.id, queued.id, recovered.leaseToken, {
      localJobId: 'local-1',
      status: 'cancelled',
    });
    assert.equal(cancelled.status, 'cancelled');
    assert.equal(cancelled.desiredAction, null);
    db.close();
  });

  it('retries with an unchanged frozen package and rejects a different second result', () => {
    const { db, store, connector } = fixture();
    const original = enqueue(store, { package: { version: 1, immutable: { value: true } } });
    const retry = store.retry(original.id);
    assert.equal(retry.previousDispatchId, original.id);
    assert.equal(retry.attempt, 2);
    assert.equal(retry.packageHash, original.packageHash);
    assert.deepEqual(retry.package, original.package);

    const claim = store.claim(connector.id);
    store.ack(connector.id, claim.id, claim.leaseToken, 'local-result');
    store.complete(connector.id, claim.id, claim.leaseToken, {
      packageHash: claim.packageHash,
      rawOutput: '{"ok":true}',
    });
    assert.throws(() => store.complete(connector.id, claim.id, claim.leaseToken, {
      packageHash: claim.packageHash,
      rawOutput: '{"ok":false}',
    }), /resultado diferente/);
    db.close();
  });

  it('moves reviewed connector results to a terminal dispatch state', () => {
    const { db, store, connector } = fixture();
    const queued = enqueue(store);
    const claim = store.claim(connector.id);
    store.ack(connector.id, queued.id, claim.leaseToken, 'local-reviewed');
    const completed = store.complete(connector.id, queued.id, claim.leaseToken, {
      packageHash: claim.packageHash,
      rawOutput: '{"ok":true}',
    });
    store.markResultDelivered(queued.id, completed.dispatch.resultHash);
    assert.equal(store.getDispatch(queued.id).status, 'waiting_review');
    assert.equal(store.markReviewed(queued.platformRunId, 'approved').status, 'completed');
    const revision = enqueue(store, { platformRunId: 'revision-run' });
    const revisionClaim = store.claim(connector.id);
    store.ack(connector.id, revision.id, revisionClaim.leaseToken, 'local-revision');
    const revisionResult = store.complete(connector.id, revision.id, revisionClaim.leaseToken, {
      packageHash: revisionClaim.packageHash,
      rawOutput: '{"needs":"revision"}',
    });
    store.markResultDelivered(revision.id, revisionResult.dispatch.resultHash);
    assert.equal(store.markReviewed('revision-run', 'changes_requested').status, 'failed');
    db.close();
  });

  it('rejects an incorrect current password before creating a pairing code', async () => {
    const db = new Database(':memory:');
    const connectorStore = new AgentConnectorStore(db);
    const routes = [];
    const app = {
      use() {},
      get(path, ...handlers) { routes.push({ method: 'GET', path, handlers }); },
      post(path, ...handlers) { routes.push({ method: 'POST', path, handlers }); },
    };
    registerAgentConnectorRoutes(app, {
      authMiddleware: (_req, _res, next) => next(),
      requireRole: () => (_req, _res, next) => next(),
      sqliteStore: { getDb: () => db },
      connectorStore,
      verifyPassword: () => false,
      onResult: async () => {},
    });
    const route = routes.find((entry) => entry.path === '/api/projects/agent-connectors/pairing-codes');
    const req = { auth: { user: { id: 'admin', passwordHash: 'hash' } }, body: { password: 'wrong' } };
    let response;
    const res = {
      status(code) { response = { code }; return this; },
      json(body) { response.body = body; return this; },
    };
    await runRouteHandlers(route.handlers, req, res);
    assert.equal(response.code, 401);
    assert.equal(db.prepare('SELECT COUNT(*) AS count FROM agent_pairing_codes').get().count, 0);
    db.close();
  });

  it('validates a result before recording its content hash', async () => {
    const { db, store, keys, connector } = fixture();
    const queued = enqueue(store);
    const claim = store.claim(connector.id);
    store.ack(connector.id, queued.id, claim.leaseToken, 'local-validation');
    const routes = [];
    const app = {
      use() {},
      get(path, ...handlers) { routes.push({ method: 'GET', path, handlers }); },
      post(path, ...handlers) { routes.push({ method: 'POST', path, handlers }); },
    };
    registerAgentConnectorRoutes(app, {
      authMiddleware: (_req, _res, next) => next(),
      requireRole: () => (_req, _res, next) => next(),
      sqliteStore: { getDb: () => db },
      connectorStore: store,
      verifyPassword: () => true,
      onValidateResult: async () => { throw new Error('output contract rejected'); },
      onResult: async () => { throw new Error('must not run'); },
    });
    const route = routes.find((entry) => (
      entry.path === '/api/projects/agent-connectors/dispatches/:dispatchId/result'
    ));
    const path = `/api/projects/agent-connectors/dispatches/${queued.id}/result`;
    const rawBody = JSON.stringify({ packageHash: claim.packageHash, rawOutput: '{"invalid":true}' });
    const timestamp = String(Math.floor(Date.now() / 1000));
    const nonce = crypto.randomBytes(18).toString('base64url');
    const canonical = ['POST', path, timestamp, nonce, sha256(rawBody)].join('\n');
    const signature = crypto.sign(null, Buffer.from(canonical), keys.privateKey).toString('base64url');
    const req = {
      method: 'POST',
      originalUrl: path,
      path,
      ip: '127.0.0.1',
      headers: {
        'x-yl-connector-id': connector.id,
        'x-yl-timestamp': timestamp,
        'x-yl-nonce': nonce,
        'x-yl-signature': signature,
        'x-yl-lease-token': claim.leaseToken,
      },
      rawBody,
      params: { dispatchId: queued.id },
      body: { packageHash: claim.packageHash, rawOutput: '{"invalid":true}' },
    };
    let response = {};
    const res = {
      status(code) { response.code = code; return this; },
      json(body) { response.body = body; return this; },
    };
    await runRouteHandlers(route.handlers, req, res);
    assert.equal(response.code, 400);
    assert.match(response.body.message, /contract rejected/);
    assert.equal(store.getDispatch(queued.id).resultHash, null);
    db.close();
  });
});
