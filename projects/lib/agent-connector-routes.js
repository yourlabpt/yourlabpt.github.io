const { AgentConnectorStore } = require('./agent-connector-store');
const { publicDispatch } = require('./agent-connector-contract');

function createWindowLimiter({ limit, windowMs }) {
  const buckets = new Map();
  return (key) => {
    const now = Date.now();
    const current = buckets.get(key);
    if (!current || current.resetAt <= now) {
      buckets.set(key, { count: 1, resetAt: now + windowMs });
      return true;
    }
    current.count += 1;
    return current.count <= limit;
  };
}

function registerAgentConnectorRoutes(app, deps) {
  const {
    authMiddleware,
    requireRole,
    sqliteStore,
    verifyPassword,
    onResult,
    onValidateResult,
    onSync,
  } = deps;
  const onAudit = typeof deps.onAudit === 'function' ? deps.onAudit : async () => {};
  const store = deps.connectorStore || new AgentConnectorStore(sqliteStore.getDb());
  const allowPair = createWindowLimiter({ limit: 5, windowMs: 60_000 });
  const allowConnector = createWindowLimiter({ limit: 300, windowMs: 60_000 });

  app.use('/api/projects/agent-connectors', (_req, res, next) => {
    res.setHeader('Cache-Control', 'no-store');
    if (process.env.NODE_ENV === 'production' && !_req.secure) {
      return res.status(400).json({ message: 'O conector exige HTTPS.' });
    }
    next();
  });

  function connectorAuth(req, res, next) {
    try {
      const connectorId = String(req.headers['x-yl-connector-id'] || '');
      if (!allowConnector(req.ip || 'unknown')) {
        return res.status(429).json({ message: 'Demasiados pedidos do conector.' });
      }
      req.agentConnector = store.authenticate({
        connectorId,
        method: req.method,
        path: req.originalUrl.split('?')[0],
        timestamp: String(req.headers['x-yl-timestamp'] || ''),
        nonce: String(req.headers['x-yl-nonce'] || ''),
        signature: String(req.headers['x-yl-signature'] || ''),
        rawBody: req.rawBody || '',
      });
      return next();
    } catch (error) {
      return res.status(401).json({ message: error.message });
    }
  }

  function lease(req) {
    return String(req.headers['x-yl-lease-token'] || '');
  }

  app.post(
    '/api/projects/agent-connectors/pairing-codes',
    authMiddleware,
    requireRole('super_admin'),
    async (req, res) => {
      if (!verifyPassword(req.auth.user.passwordHash, String(req.body?.password || ''))) {
        return res.status(401).json({ message: 'Password atual invalida.' });
      }
      const pairing = store.createPairingCode(req.auth.user.id);
      await onAudit('agent_connector_pairing_code_created', {
        actorUserId: req.auth.user.id,
        expiresAt: pairing.expiresAt,
      });
      return res.status(201).json(pairing);
    }
  );

  app.get(
    '/api/projects/agent-connectors',
    authMiddleware,
    requireRole('super_admin'),
    (_req, res) => res.json({ connectors: store.listConnectors() })
  );

  app.post(
    '/api/projects/agent-connectors/:connectorId/revoke',
    authMiddleware,
    requireRole('super_admin'),
    async (req, res) => {
      const connector = store.revoke(req.params.connectorId);
      if (!connector) return res.status(404).json({ message: 'Conector nao encontrado.' });
      await onAudit('agent_connector_revoked', {
        actorUserId: req.auth.user.id,
        connectorId: connector.id,
      });
      return res.json({ connector });
    }
  );

  app.post('/api/projects/agent-connectors/pair', async (req, res) => {
    try {
      if (!allowPair(req.ip || 'unknown')) {
        return res.status(429).json({ message: 'Demasiadas tentativas de emparelhamento.' });
      }
      if (String(req.body?.publicKey || '').length > 10_000 || String(req.body?.code || '').length > 256) {
        return res.status(413).json({ message: 'Pedido de emparelhamento demasiado grande.' });
      }
      const connector = store.pair({
        code: req.body?.code,
        name: req.body?.name,
        publicKey: req.body?.publicKey,
        runtimeVersion: req.body?.runtimeVersion,
        capabilities: req.body?.capabilities,
      });
      await onAudit('agent_connector_paired', {
        actorUserId: 'agent_connector',
        connectorId: connector.id,
        runtimeKind: connector.capabilities?.runtime?.kind || 'custom',
      });
      return res.status(201).json({ connector });
    } catch (error) {
      return res.status(400).json({ message: error.message });
    }
  });

  app.post('/api/projects/agent-connectors/heartbeat', connectorAuth, (req, res) => {
    try {
      const input = req.body || {};
      const dispatch = input.dispatchId
        ? store.renewLease(
          req.agentConnector.id,
          String(input.dispatchId),
          lease(req),
          String(input.localJobId || '')
        )
        : null;
      const connector = store.heartbeat(req.agentConnector.id, input);
      return res.json({ connector, dispatch: publicDispatch(dispatch) });
    } catch (error) {
      return res.status(409).json({ message: error.message });
    }
  });

  app.post('/api/projects/agent-connectors/claim', connectorAuth, async (req, res) => {
    try {
      const dispatch = store.claim(req.agentConnector.id);
      if (!dispatch) return res.status(204).end();
      const response = res.json({ dispatch });
      void onAudit('agent_dispatch_claimed', {
        actorUserId: 'agent_connector',
        connectorId: req.agentConnector.id,
        dispatchId: dispatch.id,
        projectId: dispatch.projectId,
      }).catch((error) => {
        console.error('[agent-connector] Failed to audit claimed dispatch:', error.message);
      });
      return response;
    } catch (error) {
      return res.status(409).json({ message: error.message });
    }
  });

  app.post('/api/projects/agent-connectors/dispatches/:dispatchId/ack', connectorAuth, (req, res) => {
    try {
      const dispatch = store.ack(
        req.agentConnector.id,
        req.params.dispatchId,
        lease(req),
        String(req.body?.localJobId || '')
      );
      return res.json({
        dispatch: publicDispatch(dispatch),
        acknowledgedEventId: store.lastEventId(dispatch.id),
      });
    } catch (error) {
      return res.status(409).json({ message: error.message });
    }
  });

  app.post('/api/projects/agent-connectors/dispatches/:dispatchId/sync', connectorAuth, async (req, res) => {
    try {
      if (Buffer.byteLength(JSON.stringify(req.body?.events || []), 'utf8') > 256 * 1024) {
        return res.status(413).json({ message: 'Lote de eventos demasiado grande.' });
      }
      const before = store.getDispatch(req.params.dispatchId);
      const dispatch = store.sync(
        req.agentConnector.id,
        req.params.dispatchId,
        lease(req),
        req.body || {}
      );
      if (typeof onSync === 'function' && (
        before?.status !== dispatch.status
        || before?.desiredAction !== dispatch.desiredAction
        || (Array.isArray(req.body?.events) && req.body.events.length)
      )) {
        await onSync(dispatch, req.body?.progress || {}, req.body?.events || []);
      }
      if (before?.status !== 'cancelled' && dispatch.status === 'cancelled') {
        await onAudit('agent_dispatch_cancelled', {
          actorUserId: 'agent_connector',
          connectorId: req.agentConnector.id,
          dispatchId: dispatch.id,
          projectId: dispatch.projectId,
        });
      }
      return res.json({
        dispatch: publicDispatch(dispatch),
        acknowledgedEventId: store.lastEventId(dispatch.id),
      });
    } catch (error) {
      return res.status(409).json({ message: error.message });
    }
  });

  app.post('/api/projects/agent-connectors/dispatches/:dispatchId/result', connectorAuth, async (req, res) => {
    try {
      if (Buffer.byteLength(String(req.body?.rawOutput || ''), 'utf8') > 10 * 1024 * 1024) {
        return res.status(413).json({ message: 'Resultado demasiado grande.' });
      }
      if (typeof onValidateResult === 'function') {
        await onValidateResult(
          store.getDispatch(req.params.dispatchId),
          String(req.body?.rawOutput || '')
        );
      }
      const result = store.complete(
        req.agentConnector.id,
        req.params.dispatchId,
        lease(req),
        {
          packageHash: String(req.body?.packageHash || ''),
          rawOutput: String(req.body?.rawOutput || ''),
        }
      );
      if (!result.duplicate || result.dispatch.status === 'result_received') {
        await onResult(result.dispatch, String(req.body?.rawOutput || ''));
        store.markResultDelivered(result.dispatch.id, result.dispatch.resultHash);
      }
      await onAudit('agent_dispatch_result_received', {
        actorUserId: 'agent_connector',
        connectorId: req.agentConnector.id,
        dispatchId: result.dispatch.id,
        projectId: result.dispatch.projectId,
        resultHash: result.dispatch.resultHash,
        duplicate: result.duplicate,
      });
      return res.json({
        dispatch: publicDispatch(store.getDispatch(req.params.dispatchId)),
        duplicate: result.duplicate,
      });
    } catch (error) {
      return res.status(400).json({ message: error.message });
    }
  });

  return store;
}

module.exports = { createWindowLimiter, registerAgentConnectorRoutes };
