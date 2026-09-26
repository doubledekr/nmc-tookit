# NMC Toolkit — developer handoff (for Ryan)

Everything a developer needs to pick this up: how it's built, where things
live, every contract between the pieces, how to test, and where to extend.
Companion files: `README.md` (endpoints/formats), `SALESFORCE-INTEGRATION.md`
(Salesforce / Five9 / Dialpad / AVM), `IDEAS-BACKLOG.md` (every idea, with
status), `SETUP-GUIDE.md` (IT / bankers / management).

---

## 1. Shape of the codebase

| Piece | Tech | Size | Notes |
|---|---|---|---|
| `neighborhood-toolkit.html` | single HTML file, vanilla JS, inline CSS, no build step | ~2,500 lines | All banker features. `const DEMO = false` build flag near the top; demo file is the same source with it flipped and the `<title>` prefixed. |
| `nmc-management.html` | same approach | ~600 lines | Leaders + IT console. `const DEMO=false` flag. |
| `server.js` | Node 18+, zero npm packages | ~500 lines | `http`/`https`/`fs`/`path` only. Data is plain JSON files under `./data/`. |
| `merge-drive.js` | Node, zero packages | ~200 lines | Shared-folder bridge. |

No frameworks, no bundler, no database. This is deliberate: bankers open a
file, IT runs `node server.js`. Keep it that way unless there's a strong
reason — every dependency is something IT has to approve and maintain.

### Regenerating the demo builds
```
python3 - <<'EOF'
for src,dst in [('neighborhood-toolkit.html','neighborhood-toolkit-demo.html'),('nmc-management.html','nmc-management-demo.html')]:
    s=open(src).read()
    d=s.replace('const DEMO = false;','const DEMO = true;',1).replace('const DEMO=false;','const DEMO=true;',1).replace('<title>','<title>DEMO — ',1)
    open(dst,'w').write(d)
EOF
```
Never edit a demo file directly.

---

## 2. Banker toolkit internals

### 2.1 State
One object, `state`, persisted to `localStorage["nmc_toolkit_v1"]`
(`nmc_toolkit_demo_v1` for the demo). Shape:

```
{ schema: 4,
  clients: [ Client ], currentId,
  settings: { loName, loNmls, loPhone, loEmail, hub, feedUrl, poll, reportUrl, teamUrl,
              folderGoal, sfMap, setupDone, ...branding (locked to NMC on every load) },
  rates: { updated, rates:{Product:rate}, treasury? } | null,
  rateHistory: [ {t, rates} ], teamCache, blocks: [ Block ],
  templates: { mine:[], company:{updated,templates:[]}|null, shared:[] },
  tools: { ...last inputs, _cid }, inbox: [ InboxItem ] }
```

`Client` (see `blankClient()`): name, email, phone, address, balance, rate,
payment (P&I), paymentTotal (PITI), escrow, monthsLeft, value, valueSrc,
fico, servicer, loanType, status, followUp, notes, targetRate, tz, quick,
closedAt, debts[], options[], scenarios[], selectedOption,
prop{included,rec,why}, cmp{pwypn,rec,why,include},
analysis{anRate, anTerm, anCosts, anCashOut, anSkip, anRoll, anLien, anExtra,
anProgram, anMip, anPrepay, rateSrc}.

`migrate()` runs on every load. It is additive only: new fields are
defaulted, nothing is removed, and `SCHEMA` bumps when a field is added.
It also enforces NMC branding and sweeps legacy auto-seeded samples
(`@example.com` emails) from real builds.

### 2.2 Save / sync engine
- `save()` → localStorage synchronously, bumps `mirrorSeq`, schedules the
  2.5 s debounce → folder autosave (if a folder is chosen; File System Access
  API, handle persisted in IndexedDB `nmc_fs`) and `pushSaveMirror()`.
- `pushSaveMirror()` POSTs the whole state to `/api/save`; a sequence counter
  means only the exact state sent is marked clean. Retries on the next save,
  sync, focus, and a 60 s timer while dirty.
- `syncAll()` runs on load, every 5 min, on window focus, and after each call
  block: drive read/write (rates, team, templates, shared, presence), HTTP
  pulls (templates, shared pool, team, inbox), pushes (shared templates,
  mirror). `heartbeat()` every 60 s marks `hubOnline` from the response.
- All hub URLs derive from `settings.hub` via `apiBase()`.

### 2.3 Math (all pure functions near the top of the script)
`pmt`, `amort(P, rate, n, extra, payOverride)` → {pay, months, interest,
points, rows}; `debtMonths`, `debtInterest`; `equivRate(P, n,
targetInterest, hi)` (bisection); `computeAnalysis(c)` is the single source
for the analysis screen and the proposal; `computeScenario(sc, curPay, opts)`
+ `compareMatrix(list, curPay, opts)` for comparisons; `toolsModel()` for the
Tools deck. If you change a formula, change it in one of these — nothing
renders its own math.

### 2.4 Parsers
- `parseSFText(text)` — NMC Salesforce profile (`SF_NMC` exact-label map,
  `SF_NEVER` refused labels, `SF_NOISE`), falls back to the editable
  `settings.sfMap` for other CRMs. Derives fields, notes, and debt rows; renders
  a current→new preview; `applySF(asNew)` applies checked fields and merges
  debts by name. Inbox records go through `recordToSFText()` → the same path.
- `parsePricing()` — lender rate stacks (rate 1–15, price 90–115 or points ≤10,
  lock "NN-day").
- `parseDebts()` — free-text debt lists (largest number = balance, next =
  payment, % or bare decimal <60 = APR).

### 2.5 Rendering
Screens are `<section class="screen" id="s-…">`; `go(s)` toggles and calls
that screen's render. `refreshAll()` re-renders everything client-bound.
`renderClientBar()` is the global bar. The proposal is one function,
`proposalHTML()`, rendered into both the on-screen preview and `#printSheet`;
`printAs(title, html)` swaps the window title for the PDF. Print CSS lives
under `@media print` with `print-color-adjust: exact` forced.

### 2.6 Testing
There is no test file in the pack; the tests were run headlessly with jsdom
during development. Pattern to reuse (Node, `npm i jsdom` in a scratch dir):
```js
const { JSDOM } = require('jsdom'); const fs=require('fs');
const dom=new JSDOM(fs.readFileSync('neighborhood-toolkit-demo.html','utf8'),
  {runScripts:"dangerously",pretendToBeVisual:true,url:"http://localhost/",
   beforeParse(w){ w.fetch=()=>Promise.reject(new Error("no net")); }});
setTimeout(()=>{ const w=dom.window, st=w.eval('state');
  // call w.pickClient(id), w.runAnalysis(), w.proposalHTML(), w.computeAnalysis(c) …
}, 600);
```
Stub `w.fetch` to simulate the hub; stub `navigator.clipboard` for the
paste-from-clipboard path; use a fake `dirHandle` object
(`getFileHandle → {getFile, createWritable}`) via `window._nmcTestSetDir(h)`
to test drive sync. Worth turning into a real `test/` folder.

---

## 3. Management console internals
`S` = config in `localStorage["nmc_mgmt_v1"]` (`mode: server|drive`, base,
token, extApi). `loadAll()` fetches team, rates, presence, shared pool,
company templates, and (with a token) the saves index; `renderAll()` paints
the four rooms. `publishRates()` / `publishTemplates()` POST with the token or
write `rates.json` / `templates.json` to the folder, preserving the treasury
block. `window._mgmt` exposes hooks for tests. DEMO mode short-circuits
`loadAll()` with `demoData()`.

---

## 4. Hub internals (`server.js`)
Single `http.createServer` handler; routes are `if (p === …)` blocks in
order. Helpers: `send`, `readBody(req, max)`, `slugify`, `teamData()`
(monthly rollups + history), `cleanTemplates`, `presenceList`, `sharedPool`,
`savesIndex`, `httpGet(url, redirects, headers)` (follows redirects; allows
`http:` for internal providers), `parseTreasuryXML`, `fetchTreasury`.
`module.exports = { parseTreasuryXML, teamData }` and `require.main` guards
the listen so the file is unit-testable.

Data layout under `./data/`:
```
rates.json  rate-history.json  treasury.json  templates.json  avm-cache.json
blocks/<slug>.json   shared/<slug>.json   presence/<slug>.json
saves/<slug>.json    inbox/<slug>/<id>.json
```
Slugs come from `slugify(name-or-email)`; the toolkit uses `slugTag()` on the
banker's name for blocks/presence/shared and the banker's **email** for the
inbox. If you unify these, do it on both sides at once.

Adding a route: copy an existing block, validate input, write JSON under
`data/`, return `send(res, 200, obj)`. Anything that stores client data must
require `TOKEN` to read (see `/api/saves`).

---

## 5. Contracts between the pieces (do not break without a migration)
- `rates.json` shape and the `treasury` block inside it.
- `/api/team` shape `{updated, month, team, bankers[], history[]}` — also
  written as `team.json` by merge-drive; the toolkit and console read both.
- Block report payload `{banker, nmls, start, label, minutes, dials, contacts,
  interested, folders}` and the CSV columns (append-only).
- Inbox item `{id, received, fields:{…}, sfid?}` — produced by `/import`,
  consumed by the toolkit's `importInbox()`. The Five9 pop must produce exactly
  this.
- Save mirror envelope `{banker, nmls, slug, sent, clients, state}`.
- Template objects `{id, kind:intro|text|email, title, subject, body}` and the
  token list.
- Client `schema` number + additive `migrate()`.

---

## 6. Where to extend (mapped to the backlog)
- **Five9 pop:** new `POST /api/five9/event` → match ANI to a save-mirror
  client or pull Salesforce by ID → write an inbox item. Toolkit change: poll
  inbox every 20 s while a block is running (`setupDriveSync` timer).
- **Salesforce write-back:** toolkit posts deltas from `bindClientFields`,
  outcome logging, and `setStatus` paths to `/api/sf/update`; hub queues to
  `data/sf-outbox/` and PATCHes with the banker's token.
- **Call card:** a `callCardHTML(c)` next to `proposalHTML()` reusing
  `computeAnalysis` and `toolsModel` for the objection answers; show it from
  the inbox pop and the client bar.
- **Management aggregates:** extend the block report (or a separate
  `/api/pipeline-stats`) with counts by status, closed volume, avg savings
  proposed — counts only, no client data — and add cards to the console.
- **Dialpad:** hub webhook receiver → inbox pop for direct lines; SMS send via
  Dialpad API using the template tokens; transcript listener if it streams.
- **Fonts offline:** base64-embed the five NMC `.woff` files as `@font-face`
  in both HTML files (~300 KB).

---

## 7. Conventions
- UTF-8 source; em dashes and arrows are literal characters in markup and
  `\u2014`-style escapes inside JS strings — either works, be consistent
  within a block.
- Money via `money()`, rates via `pct()`, durations via `yrsMo()`. Never
  format inline.
- Every new client field: add to `blankClient()`, to `migrate()`'s defaults,
  to `FIELD_LABELS` if it can come from Salesforce, and bump `SCHEMA`.
- Anything client-facing on the proposal must be gated on being a true
  benefit (see the `benefits` array and the wins-only stat strip).
- Never store or transmit SSN, DOB, age, marital status. `SF_NEVER` and the
  hub's `IMPORT_NEVER` are the two gates; keep both.


## Versioning and updates
`TOOLKIT_VERSION` in the toolkit HTML is the single version number; `npm run sync` writes it into the
desktop app's package.json. Release flow: bump it → push → Actions builds + releases → hub mirrors
(`NMC_UPDATE_REPO`, `NMC_GITHUB_TOKEN`) → apps update themselves (mandatory, 90-second countdown).
Heartbeats carry `version` and `platform`; `/api/presence` includes `latest`; the console flags stragglers.
