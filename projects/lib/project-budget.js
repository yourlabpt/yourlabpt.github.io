/**
 * Per-project execution budget: money and hours.
 *
 * The budget belongs to the project, not to a persona or a run — the chain crosses
 * personas and the cap must not reset when it does. The clock accumulates only while
 * work is actually running, so time spent waiting for a human answer costs nothing.
 */

function num(value, fallback = 0) {
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed >= 0 ? parsed : fallback;
}

function text(value, fallback = '') {
  const result = value === null || value === undefined ? '' : String(value).trim();
  return result || fallback;
}

function normalizeProjectBudget(raw = {}) {
  const src = raw && typeof raw === 'object' ? raw : {};
  return {
    // 0 means no cap on that dimension.
    maxCostUsd: num(src.maxCostUsd),
    maxHours: num(src.maxHours),
    spentUsd: num(src.spentUsd),
    // Completed running time. The in-flight segment is added at read time.
    elapsedSeconds: num(src.elapsedSeconds),
    startedAt: text(src.startedAt),
    // Non-empty only while the clock is running.
    runningSince: text(src.runningSince),
    currency: text(src.currency, 'USD'),
  };
}

/** Seconds counted so far, including the segment currently in flight. */
function elapsedSeconds(budget, now = Date.now()) {
  const value = normalizeProjectBudget(budget);
  if (!value.runningSince) return value.elapsedSeconds;
  const since = Date.parse(value.runningSince);
  if (!Number.isFinite(since)) return value.elapsedSeconds;
  return value.elapsedSeconds + Math.max(0, Math.floor((now - since) / 1000));
}

function startClock(budget, now = Date.now()) {
  const value = normalizeProjectBudget(budget);
  if (value.runningSince) return value;
  const iso = new Date(now).toISOString();
  return { ...value, runningSince: iso, startedAt: value.startedAt || iso };
}

/**
 * Banks the in-flight segment and stops counting. Called whenever the chain stops for
 * a human — that wait must not consume the hour budget.
 */
function stopClock(budget, now = Date.now()) {
  const value = normalizeProjectBudget(budget);
  if (!value.runningSince) return value;
  return {
    ...value,
    elapsedSeconds: elapsedSeconds(value, now),
    runningSince: '',
  };
}

function recordSpend(budget, costUsd) {
  const value = normalizeProjectBudget(budget);
  return { ...value, spentUsd: value.spentUsd + num(costUsd) };
}

/**
 * Whether the project may start more work, and what stopped it.
 * A cap of 0 on either dimension means that dimension is unlimited.
 */
function budgetState(budget, now = Date.now()) {
  const value = normalizeProjectBudget(budget);
  const seconds = elapsedSeconds(value, now);
  const hours = seconds / 3600;
  const costExhausted = value.maxCostUsd > 0 && value.spentUsd >= value.maxCostUsd;
  const timeExhausted = value.maxHours > 0 && hours >= value.maxHours;
  const reasons = [];
  if (costExhausted) reasons.push(`custo: ${value.spentUsd.toFixed(2)} de ${value.maxCostUsd.toFixed(2)} USD`);
  if (timeExhausted) reasons.push(`tempo: ${hours.toFixed(2)}h de ${value.maxHours}h`);
  return {
    ...value,
    elapsedSeconds: seconds,
    hours,
    running: Boolean(value.runningSince),
    costExhausted,
    timeExhausted,
    exhausted: costExhausted || timeExhausted,
    reason: reasons.join(' · '),
    remainingUsd: value.maxCostUsd > 0 ? Math.max(0, value.maxCostUsd - value.spentUsd) : null,
    remainingHours: value.maxHours > 0 ? Math.max(0, value.maxHours - hours) : null,
  };
}

module.exports = {
  budgetState,
  elapsedSeconds,
  normalizeProjectBudget,
  recordSpend,
  startClock,
  stopClock,
};
