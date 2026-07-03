/**
 * In-memory store cache with debounced persistence for faster prompt-run paths.
 * Avoids blocking on full 20MB store.json writes during interactive AI workflows.
 */

function createProjectStoreLayer({ readJson, writeJson, storePath, withStoreLock, nowIso }) {
  let memoryStore = null;
  let storeInitialized = false;
  let persistTimer = null;
  let persistPending = false;
  let persistChain = Promise.resolve();

  async function loadStoreFromDisk() {
    const store = await readJson(storePath);
    memoryStore = store;
    return store;
  }

  async function ensureMemoryStore(ensureInitialized) {
    if (!storeInitialized) {
      await ensureInitialized();
      storeInitialized = true;
    }
    if (!memoryStore) {
      await loadStoreFromDisk();
    }
    return memoryStore;
  }

  function schedulePersist() {
    persistPending = true;
    if (persistTimer) clearTimeout(persistTimer);
    persistTimer = setTimeout(() => {
      persistTimer = null;
      if (!persistPending || !memoryStore) return;
      persistPending = false;
      const snapshot = memoryStore;
      persistChain = persistChain.then(async () => {
        await withStoreLock(async () => {
          snapshot.meta = snapshot.meta || {};
          snapshot.meta.updatedAt = nowIso();
          await writeJson(storePath, snapshot);
        });
      }).catch((err) => {
        console.error('Deferred store persist failed:', err.message);
      });
    }, 400);
  }

  async function readStore(ensureInitialized) {
    return ensureMemoryStore(ensureInitialized);
  }

  async function updateStore(mutator, ensureInitialized, options = {}) {
    const deferPersist = options.deferPersist === true;
    return withStoreLock(async () => {
      const store = await ensureMemoryStore(ensureInitialized);
      await mutator(store);
      store.meta = store.meta || {};
      store.meta.updatedAt = nowIso();
      memoryStore = store;
      if (deferPersist) {
        schedulePersist();
        return;
      }
      await writeJson(storePath, store);
      persistPending = false;
    });
  }

  async function flushStore() {
    if (persistTimer) {
      clearTimeout(persistTimer);
      persistTimer = null;
    }
    if (!persistPending || !memoryStore) return;
    persistPending = false;
    const snapshot = memoryStore;
    await withStoreLock(async () => {
      snapshot.meta = snapshot.meta || {};
      snapshot.meta.updatedAt = nowIso();
      await writeJson(storePath, snapshot);
    });
    await persistChain;
  }

  function invalidateCache() {
    memoryStore = null;
  }

  return {
    readStore,
    updateStore,
    flushStore,
    invalidateCache,
    markInitialized: () => { storeInitialized = true; },
    seedMemoryStore: (store) => { memoryStore = store; storeInitialized = true; },
  };
}

module.exports = { createProjectStoreLayer };
