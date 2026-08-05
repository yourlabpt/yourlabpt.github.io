/**
 * SignalProvider — the seam that makes the multi-source roadmap real.
 *
 * A provider takes domains + config and returns DomainRecords. Scoring and the
 * UI know nothing about where a record came from. LinkedIn (people moves),
 * BuiltWith (tech) and a news/M&A source all implement this same shape and drop
 * in behind the same scoring layer.
 *
 * If a new provider ever forces a change to lib/score.js, the interface is
 * wrong — fix the interface, not the scorer (see CLAUDE.md).
 *
 * DomainRecord:
 *   { domain, markets: { [code]: { history: MonthPoint[] } },
 *     competitors: [{domain, budget}], newKeywords: {count, baseline}|null,
 *     adCopyTurnover: number|null, source: string }
 *
 * MonthPoint:
 *   { month: 'YYYY-MM', budget, paidClicks, paidKeywords,
 *     organicClicks, organicKeywords, adRank, strength }
 */

import { generateRecord, enrichNewKeywords, enrichAdHistory } from './mock.js';
import { createSpyfuClient, pooled } from './spyfu.js';
import { scoreAll, summarise } from './score.js';
import { estimateRun } from './cost.js';
import { monthKey } from './util.js';

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

/* ------------------------------------------------------------------ mock -- */

export function mockProvider() {
  return {
    id: 'demo-data',
    label: 'Demo data',
    async cheapPass(domains, config, onProgress) {
      const out = [];
      const chunkSize = Math.max(1, Math.ceil(domains.length / 20));
      for (let i = 0; i < domains.length; i++) {
        out.push(generateRecord(domains[i], config));
        if (i % chunkSize === 0) {
          onProgress?.({ done: i + 1, total: domains.length, phase: 'snapshot' });
          await sleep(12); // keeps the progress bar honest and the UI responsive
        }
      }
      onProgress?.({ done: domains.length, total: domains.length, phase: 'snapshot' });
      return out;
    },
    async expensivePass(records, config, onProgress) {
      const out = [];
      for (let i = 0; i < records.length; i++) {
        out.push(enrichNewKeywords(records[i]));
        onProgress?.({ done: i + 1, total: records.length, phase: 'launch-signal' });
        await sleep(8);
      }
      return out;
    },
    async adHistory(record) {
      await sleep(400);
      return enrichAdHistory(record);
    },
  };
}

/* ------------------------------------------------------------------ live -- */

export function spyfuProvider({ proxyUrl }) {
  const client = createSpyfuClient({ proxyUrl });

  return {
    id: 'spyfu',
    label: 'SpyFu (live)',
    client,
    async cheapPass(domains, config, onProgress) {
      const byDomain = new Map(domains.map((d) => [d, {
        domain: d, markets: {}, competitors: [], newKeywords: null,
        adCopyTurnover: null, source: 'spyfu',
      }]));

      for (const code of config.markets) {
        const snap = await client.bulkSnapshot(domains, code);
        for (const row of snap) {
          const rec = byDomain.get(row.domain);
          if (rec) rec.markets[code] = { history: [row] };
        }
        onProgress?.({ done: 0, total: domains.length, phase: `snapshot ${code}` });

        // Trend points: 4 extra rows per domain per market -> ~$0.0025/domain.
        const list = [...byDomain.values()];
        let done = 0;
        await pooled(list, 24, async (rec) => {
          const pts = await client.trendPoints(rec.domain, code);
          const hist = [...pts, ...(rec.markets[code]?.history || [])]
            .filter(Boolean)
            .sort((a, b) => String(a.month).localeCompare(String(b.month)));
          rec.markets[code] = { history: dedupeMonths(hist) };
          done += 1;
          if (done % 10 === 0) onProgress?.({ done, total: list.length, phase: `trend ${code}` });
        });
      }

      // Competitors are $0.20 CPM — cheap enough to run across the list.
      const list = [...byDomain.values()];
      let done = 0;
      await pooled(list, 24, async (rec) => {
        rec.competitors = await client.topCompetitors(rec.domain, config.markets[0]);
        done += 1;
        if (done % 10 === 0) onProgress?.({ done, total: list.length, phase: 'competitors' });
      });

      return list;
    },
    async expensivePass(records, config, onProgress) {
      let done = 0;
      const res = await pooled(records, 4, async (rec) => {
        const nk = await client.newKeywords(rec.domain, config.markets[0]);
        done += 1;
        onProgress?.({ done, total: records.length, phase: 'launch-signal' });
        return { ...rec, newKeywords: { count: nk.count, baseline: baselineFor(rec) } };
      });
      return res.map((r, i) => (r.ok ? r.value : records[i]));
    },
    async adHistory(record, config) {
      const rows = await client.adHistory(record.domain, config.markets[0]);
      const uniqueRecent = new Set(rows.slice(0, 20).map((r) => r.headline ?? r.title));
      const uniqueOlder = new Set(rows.slice(20).map((r) => r.headline ?? r.title));
      let fresh = 0;
      uniqueRecent.forEach((h) => { if (!uniqueOlder.has(h)) fresh += 1; });
      const turnover = uniqueRecent.size ? fresh / uniqueRecent.size : 0;
      return { ...record, adCopyTurnover: turnover, adHistory: rows.slice(0, 12) };
    },
  };
}

function dedupeMonths(hist) {
  const seen = new Map();
  for (const p of hist) if (p.month) seen.set(p.month, p);
  return [...seen.values()].sort((a, b) => a.month.localeCompare(b.month));
}

function baselineFor(rec) {
  const m = Object.values(rec.markets)[0];
  if (!m || !m.history.length) return 5;
  const kw = m.history.map((p) => p.paidKeywords || 0).filter(Boolean);
  if (!kw.length) return 5;
  return Math.max(2, Math.round((kw.reduce((a, b) => a + b, 0) / kw.length) * 0.05));
}

/* -------------------------------------------------------------- pipeline -- */

export function getProvider(config) {
  return config.mode === 'live' && config.proxyUrl
    ? spyfuProvider({ proxyUrl: config.proxyUrl })
    : mockProvider();
}

/**
 * The run. Encodes the cost rule: the cheap pass scans the whole list, the
 * expensive pass only touches the top N by preliminary score.
 */
export async function runAnalysis({ prospects, config, onProgress }) {
  const started = Date.now();
  const provider = getProvider(config);
  const domains = prospects.map((p) => p.domain);
  const originalByDomain = new Map(prospects.map((p) => [p.domain, p.original]));

  onProgress?.({ phase: 'snapshot', done: 0, total: domains.length, label: 'Fetching domain snapshots' });
  let records = await provider.cheapPass(domains, config, onProgress);

  // Preliminary score decides who is worth the expensive endpoints.
  const prelim = scoreAll(records, config);
  const topN = config.thresholds.topN ?? 25;
  const shortlist = new Set(prelim.slice(0, topN).map((r) => r.domain));

  onProgress?.({ phase: 'launch-signal', done: 0, total: shortlist.size, label: `Launch signal for top ${shortlist.size}` });
  const enriched = await provider.expensivePass(
    records.filter((r) => shortlist.has(r.domain)), config, onProgress,
  );
  const enrichedMap = new Map(enriched.map((r) => [r.domain, r]));
  records = records.map((r) => enrichedMap.get(r.domain) || r);

  const results = scoreAll(records, config).map((r) => ({
    ...r,
    original: originalByDomain.get(r.domain) || {},
  }));

  onProgress?.({ phase: 'done', done: domains.length, total: domains.length, label: 'Done' });

  return {
    results,
    summary: summarise(results),
    cost: estimateRun({ domainCount: domains.length, markets: config.markets, topN }),
    provider: provider.id,
    runAt: new Date().toISOString(),
    month: monthKey(new Date()),
    elapsedMs: Date.now() - started,
  };
}
