# SpyFu Spend Check — demo

Upload a list of companies. Get back combined monthly Google paid-search spend
per domain from SpyFu, and which ones clear a spend threshold — qualified,
below threshold, or no paid search found.

Live at **`/demos/spyfu/`**.

## Deploying

Nothing to do. This is a plain static folder — `express.static` in
`server/server.js` already serves it, the same way `your-blocks` and
`your-run` are served. Commit and it's live.

- No build step
- No npm dependencies
- No changes to `server.js`, `package.json`, the Dockerfile or anything else in the repo

The nested `package.json` here exists only to set `"type": "module"` for this
folder, so Node can run the tests without reinterpreting the rest of the site
as ES modules.

## Running it locally

```bash
cd website/server && node server.js
# http://localhost:3000/demos/spyfu/
```

Opening `index.html` straight off the filesystem will not work — ES modules
and `fetch` need a real http origin.

## Demo data by default

Figures are generated deterministically from each domain name, so:

- the same list always produces the same answer
- it works on **any** list, including one a client uploads live
- nothing is sent anywhere, no API credit is used, and it works offline

The threshold logic, dedupe/normalisation, and exports are all the real
implementation. Only the source data is synthetic, and the page says so.

## Going live on a real SpyFu key

Nothing to set up. Your browser can't call `api.spyfu.com` directly (no CORS,
and Basic auth would expose the key), so `server/server.js` mounts a small
same-origin route — `GET /demos/spyfu/api/spyfu/*` — that attaches Basic auth
and forwards to SpyFu. It's already live wherever the site is deployed.

On the page, fill in both fields under **SpyFu access**: API ID and secret
key (Account Settings → API Usage in SpyFu). The badge switches to **Live
API**. The credentials are sent to that route per request as headers — never
a URL parameter, never logged, never stored anywhere — which forwards to
SpyFu and never lets the key reach the browser directly.

If you'd rather not retype a key every demo, set it once in the server's own
environment instead (`SPYFU_API_ID` / `SPYFU_SECRET_KEY`) and leave the page
fields blank — the route falls back to those.

Requires a SpyFu **Pro + AI** ($40/mo API credit) or **Team/Agency**
($100/mo) plan. Billing is per row returned, one row per domain per country.

`server/proxy.mjs` still exists as a standalone zero-dependency version of
the same route, useful for testing `lib/spend-check.js` against real SpyFu
without booting the full site server. It is not wired into anything and the
page doesn't call it.

## Layout

```
index.html                  the page
assets/app.css               styling, matched to the site palette
lib/
  normalize.js                URL -> root domain, dedupe
  csv.js                       CSV parse/write
  config.js                    countries, default threshold
  mock.js                      deterministic demo data
  spyfu.js                     live client (talks to the proxy, never to SpyFu directly)
  spend-check.js                the pipeline: fetch, combine across countries, classify
  exporters.js                  XLSX / CSV export
ui/
  dom.js, components.js         tiny DOM helpers, no framework
  app.js                        the whole page
server/proxy.mjs             optional; holds/forwards the API key. Not wired into server.js.
test/                        see below
```

## Tests

```bash
cd demos/spyfu
node test/run-tests.mjs        # engine: normalisation, mock data, classification, pipeline
node test/smoke-ui.mjs         # mounts the real page and drives it end to end
node test/make-sample-list.mjs # regenerate data/sample-prospects.csv
```

These are intentionally **not** in `projects/tests/`, so `npm run test:unit`
at the repo root is unaffected.

`test/smoke-ui.mjs` runs the real UI against a hand-written minimal DOM
(`test/dom-shim.mjs`) — it loads the sample list, runs the check, switches
tabs, searches, and exports. Note: the shim only matches compound CSS
selectors (`table.results`, `.tab[data-on="true"]`) — it has no descendant
combinator support, so a selector like `table tbody tr` silently matches only
the outer element. Walk the tree explicitly instead when a test needs it.

## Known limits (deliberate, for a demo)

- **Monthly spend is Google text ads only.** No Shopping, PMax, Display,
  YouTube or paid social. Treat it as a floor, not an estimate. The "No paid
  search found" tab exists because of this and is not junk.
- Countries are summed, not broken out by trend over time — this is a
  point-in-time spend check, not a monitoring feed.
- No exclusion list, no saved profiles, no run-over-run diff — upload a list,
  check it, export it.
