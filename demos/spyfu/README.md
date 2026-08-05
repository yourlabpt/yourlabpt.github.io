# Intent Signals — demo

A purchase-intent signal engine. Feed it a list of companies, get back the ones showing
buying behaviour right now, ranked, each with a sentence an SDR can open an email with.
SpyFu is signal source #1.

Live at **`/demos/spyfu/`**.

## Deploying

Nothing to do. This is a plain static folder — `express.static` in `server/server.js`
already serves it, the same way `your-blocks` and `your-run` are served. Commit and it's
live.

- No build step
- No npm dependencies
- No changes to `server.js`, `package.json`, the Dockerfile or anything else in the repo

The nested `package.json` here exists only to set `"type": "module"` for this folder, so
Node can run the tests without reinterpreting the rest of the site as ES modules.

## Running it locally

```bash
cd website/server && node server.js
# http://localhost:3000/demos/spyfu/
```

Opening `index.html` straight off the filesystem will not work — ES modules and `fetch`
need a real http origin.

## Demo data by default

Figures are generated deterministically from each domain name, so:

- the same list always produces the same answer — no surprises between rehearsal and the meeting
- it works on **any** list, including one a client uploads live
- nothing is sent anywhere, no API credit is used, and it works offline

The scoring, the cost model, the cleanup counters and the exports are all the real
implementation. Only the source data is synthetic, and the UI says so on screen.

## Going live on a real SpyFu key

The browser never holds the key. Run the proxy on your own machine or server:

```bash
SPYFU_API_ID=xxx SPYFU_SECRET_KEY=yyy ALLOW_ORIGIN=https://yourlabpt.com \
  node demos/spyfu/server/proxy.mjs
```

Then on the config page: switch to **Live SpyFu API**, set the proxy URL, click **Test
connection**. Requires a SpyFu **Pro + AI** ($40/mo API credit) or **Team/Agency**
($100/mo) plan.

Before the first paid run, confirm SpyFu's exact query-parameter spellings against
[developer.spyfu.com](https://developer.spyfu.com). `server/proxy.mjs` (endpoint paths) and
`lib/spyfu.js` (`mapBulkRow`, response fields) are the only two places to adjust.

## Layout

```
index.html / signals.html   the two pages
assets/app.css              styling, matched to the site palette
lib/                        business logic — no DOM, directly testable under node
  normalize.js                URL -> root domain, dedupe, exclusions
  rules.js                    the nine intent rules and their outreach copy
  score.js                    weighted composite, segments, run-over-run diff
  cost.js                     pre-run estimator and budget cap
  provider.js                 SignalProvider seam — demo and live behind one interface
  mock.js                     deterministic demo data
  spyfu.js                    live client (talks to the proxy, never to SpyFu directly)
  exporters.js                XLSX / CSV / Skylead export
  store.js                    localStorage + sessionStorage persistence
ui/                         vanilla DOM rendering
server/proxy.mjs            optional; holds the API key. Not wired into server.js.
test/                       see below
```

## Tests

```bash
cd demos/spyfu
node test/run-tests.mjs        # 39 assertions — normalisation, rules, scoring, cost, pipeline
node test/smoke-ui.mjs         # 32 assertions — mounts both pages and drives them
node test/make-sample-list.mjs # regenerate data/sample-prospects.csv
```

These are intentionally **not** in `projects/tests/`, so `npm run test:unit` at the repo
root is unaffected.

`test/smoke-ui.mjs` runs the real UI against a hand-written minimal DOM
(`test/dom-shim.mjs`) — it loads the sample list, runs the analysis, filters, sorts, opens
a drill-down and checks the chart rendered. Both suites are mutation-checked.

## Known limits (deliberate, for V1)

- **`monthlyBudget` is Google text ads only.** No Shopping, PMax, Display, YouTube or paid
  social. Treat it as a floor, not an estimate. The "No paid search found" tab exists
  because of this and is not junk.
- No caching yet — a repeat live run re-fetches.
- Discovery mode (net-new leads with no list) is scoped but not built.
- The run-over-run diff works from one snapshot in browser storage. Scheduled runs and
  alerts are the next phase.
