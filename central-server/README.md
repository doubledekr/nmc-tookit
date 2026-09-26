# NMC Central Server

The hub that connects every banker's copy of the Neighborhood Mortgage Banker Toolkit.
One file, zero dependencies, Node 18+.

## The pipeline, end to end

```
                    OWNERS                                BANKERS
              ┌───────────────┐                    ┌──────────────────┐
   set rates  │  /admin page  │──► data/rates.json │  Banker Toolkit  │
              └───────────────┘         │          │  (each machine)  │
                                        ▼          └──────────────────┘
                              GET /rates.json  ◄──── polls every 30 min
                                        │                    │
                     streamline flags + │                    │ "Send report"
                     notifications fire │                    ▼
                     in every toolkit ◄─┘          POST /api/blocks
                                                   (counts only, no client data)
              ┌───────────────┐                              │
   full team  │  / dashboard  │◄──── GET /api/team ◄─────────┘
   picture    └───────────────┘      (also shown inside each
                                      banker's "Team" panel)
```

**Rates out:** an owner opens `/admin`, types today's rates and the admin token, hits
Publish. Every toolkit that polls `/rates.json` picks it up on its next check; any
pipeline client whose rate is now ≥ 0.5% above market flips to "Streamline window"
and the banker gets a notification naming them.

**Blocks in:** each banker's toolkit posts its full call-block history (with the
banker's name + NMLS from their setup) to `/api/blocks`. The server keeps the
latest snapshot per banker — re-sending is always safe and idempotent.

**Team view:** `/api/team` aggregates the current month per banker and for the whole
team. Owners watch it on `/` (the dashboard, auto-refreshing); bankers see the same
numbers inside the toolkit's Call blocks → "The team's picture" panel, with their
own row highlighted, so everyone can judge their conversion and timing against the team.

**Privacy by design:** block reports contain *only counts and timestamps* — dials,
contacts, interested, folders, minutes. Client names, balances, and proposals never
leave each banker's machine.

## Run it

```bash
NMC_ADMIN_TOKEN="pick-something-strong" node server.js
# → http://localhost:8787
```

Put it on any always-on box the bankers can reach (intranet server, cheap VPS,
office Mac mini). For internet-facing use, sit it behind a reverse proxy with
HTTPS and set `NMC_ALLOW_ORIGIN` to lock CORS down (default is `*`).

Data lives in `./data/` as plain JSON — back it up by copying the folder.

## Point the toolkits at it

In each banker's toolkit → Settings:

| Setting              | Value                                   |
|----------------------|-----------------------------------------|
| Rates JSON URL       | `http://YOUR-SERVER:8787/rates.json`    |
| Auto-check           | on                                      |
| Report endpoint URL  | `http://YOUR-SERVER:8787/api/blocks`    |
| Team stats URL       | leave blank — auto-derived from above   |

## JSON contracts

`GET /rates.json`
```json
{ "updated": "2026-09-16", "rates": { "Conventional": 6.125, "FHA": 5.875, "VA": 5.75 } }
```

`POST /api/rates` — body: `{ "token": "...", "rates": { "Conventional": 5.99 }, "updated": "2026-09-16" }`

`POST /api/blocks` — body (what the toolkit sends):
```json
{ "banker": "Dave Maxwell", "nmls": "2821756",
  "blocks": [ { "date": "2026-09-16T14:05:00.000Z", "dur": 52,
                "dials": 21, "contacts": 7, "interested": 3, "folders": 1 } ] }
```

`GET /api/team`
```json
{ "updated": "...", "month": "2026-09",
  "team": { "blocks": 41, "dials": 812, "contacts": 239, "interested": 96, "folders": 38, "mins": 2140 },
  "bankers": [ { "banker": "...", "nmls": "...", "lastReport": "...", "month": { "...": 0 } } ] }
```

## Environment variables

| Var                | Default     | Purpose                                  |
|--------------------|-------------|------------------------------------------|
| `PORT`             | `8787`      | Listen port                              |
| `NMC_ADMIN_TOKEN`  | `change-me` | Required to publish rates — change it    |
| `NMC_ALLOW_ORIGIN` | `*`         | CORS origin; tighten for production      |

## Shared drive instead of (or before) the server

**Can a central file on a local/shared drive work?** Yes — with one rule: **never have
every banker write to the same file.** Simultaneous writes to one shared file over SMB
is how you get silent corruption and lost blocks. The pattern that works:

1. Each banker points their toolkit's autosave (My desk → "Choose autosave folder") at
   the mapped shared drive. Each toolkit writes its *own* files:
   `call-blocks-dave-maxwell.csv`, `call-blocks-j-allen.csv`, …
2. `merge-drive.js` combines them into the master:

```bash
node merge-drive.js "Z:/NMC Call Data" --into-server ./data --watch
```

That produces `nmc-master-blocks.csv` in the shared folder (open it in Excel) every
5 minutes, and `--into-server` feeds the same data into the dashboard — so the drive
setup and the server dashboard aren't either/or.

The drive route needs no server for collection, but bankers must be on the office
network/VPN to autosave, and rates still need `/rates.json` hosted somewhere. Treat
the drive as the bridge; the POST endpoint is the destination.

## Live rates: the recommended methodology

Publish-and-poll, with a human rate desk as the source of truth:

1. **Publish** — whoever watches lender pricing each morning opens `/admin`, types the
   par rates, hits Publish. 30 seconds, once or twice a day (plus on volatile days).
2. **Poll** — every toolkit already checks `/rates.json` on a 30-minute timer.
   Streamline flags and "window just opened for …" notifications fire automatically.

Why not scrape rates automatically? The rates that matter to NMC are *executable
broker pricing* from your lenders' portals — behind logins, per-scenario, and
scraping them violates most portal terms. Public feeds (Freddie Mac PMMS, FRED's
MORTGAGE30US) are surveys that lag days behind and don't match what you can lock.
A human publishing real pricing beats a robot publishing the wrong number.

Optional upgrade later: a server cron that pulls the 10-year Treasury (free, public)
as a *market direction* indicator on the dashboard — useful context, never the
client-facing rate. Polling is the right transport here; rates change a few times a
day, not per second, so websockets/push add complexity for nothing.

## Management interface

You already have one — the dashboard at `/`:
- whole-team month: folders, dials, contact rate, interested rate, close-through
- banker-by-banker table sorted by folders, with last-report dates
- `Download master CSV` (every block from every banker, Excel-ready)
- `/api/rate-history` — every rate publish, timestamped (the toolkits also keep
  their own local history chart on My desk)

It auto-refreshes every 5 minutes and needs no login to view — put it behind the
office network or add basic auth at the reverse proxy if it's internet-facing.
When the owners outgrow it (date-range filters, per-banker drilldowns, trend
charts), those bolt onto the same `/api/team` data without touching the toolkits.

## Fully air-gapped mode (no internet, no HTTP)

When banker machines must not touch the public internet, the **shared folder is the
entire transport** — no server required on the banker side:

```
 Rate desk edits  Z:\NMC\rates.json ──┐
                                      ├──► every toolkit reads rates.json + team.json
 merge-drive.js writes team.json ─────┘    automatically every 5 min (and right
        ▲                                   after every ended call block)
        └── each toolkit autosaves call-blocks-<banker>.csv into the same folder
```

Banker setup is one action: My desk → **Choose autosave folder** → pick the mapped
drive. From then on, automatically: their stats write out after every block, rates
and streamline alerts come in, and the whole team's numbers (with month-by-month
history) appear in their Call blocks tab. One machine on the network runs
`node merge-drive.js Z:\NMC --watch` (the server box, or any always-on PC —
`--into-server ./data` optional if the dashboard also runs). Ending a block also
triggers an immediate push + sync, so the team view stays fresh block to block.

The HTTP server and the drive can coexist: connected bankers use the endpoints,
air-gapped bankers use the folder, `merge-drive.js --into-server` unifies both
into one dashboard and relays the server's rates.json onto the drive.

## Spreadsheet exports & AI-readiness

From the dashboard (or directly):
- `/api/master.csv` — every call block from every banker (Excel-ready)
- `/api/rates.csv` — the full rate history, one column per product
- `/api/snapshot` — one self-describing JSON with current rates, rate history, and
  monthly per-banker rollups. This is the AI hook: when you're ready for live
  metrics ("who's converting best on Block 3?", "did the rate drop move folder
  pace?"), an AI layer reads this single endpoint — the collectors never change.

## Compatibility promise (updates never eat data)

- The toolkit carries a schema version and runs **additive migrations** on load:
  old saves gain new fields with safe defaults; nothing is ever dropped or renamed.
- Imported JSON backups from any earlier version migrate the same way.
- CSV columns are **append-only** (new columns go on the right); merge-drive.js
  reads old and new schemas side by side — tested with mixed files.
- Server endpoints accept old payloads (missing fields default to empty/zero).
When you deploy a new toolkit HTML, bankers just replace the file — their browser
data, autosave files, and the master files all keep working.


## Templates, presence, and the management console

- `GET/POST /api/templates` — company template library (POST needs the admin
  token). Relayed onto the shared drive as `templates.json` by merge-drive.
- `GET/POST /api/shared-templates` — banker-shared pool. Each POST wholesale
  replaces that banker's contribution, so unsharing in the toolkit removes it
  on the next sync. Drive mode: `shared-templates-<slug>.json` per banker,
  merged to `shared-templates.json`.
- `POST /api/heartbeat` / `GET /api/presence` — presence. Toolkits beat once a
  minute while open (slug, name, timestamp — nothing else). Online = seen
  within 3 minutes. Drive mode: `presence-<slug>.json` files, folded into
  `presence.json` by merge-drive and mirrored into the server so one presence
  list covers HTTP and air-gapped bankers alike.
- `nmc-management.html` — standalone console for leaders (dashboard, rate desk,
  template publishing) and IT (presence, health, endpoints). Works against the
  server or directly against the shared folder; publishing to the folder
  preserves the treasury block exactly like the server does.
- `/api/snapshot` now also carries `templates`, `sharedTemplates`, and
  `presence` — still one self-describing JSON for a future analytics layer.


## Local-first saves with an asynchronous server mirror

The banker's own machine is the source of truth. `save()` writes to
localStorage (and the autosave folder, if chosen) synchronously and
unconditionally — it never waits on, or fails because of, the network.

Separately and asynchronously, the toolkit mirrors its whole save to
`POST /api/save`, which stores it as `data/saves/<slug>.json` on the hub, one
file per banker. The mirror is debounced with the local save, retried on every
sync, on window focus, and on a 60-second timer while it has a pending change.
A `save()` that lands mid-request keeps the mirror dirty (sequence-counter
check) so the newer state still goes up rather than being silently marked sent.

Consequence, by design: a banker working remotely with no VPN keeps the full
pipeline, client records, analyses, proposals, and call logging. Only shared
data (rate pushes, team rollups, template library) goes stale until they
reconnect, at which point everything — including offline call blocks — flows up
automatically.

Reading the mirrors is admin-gated because they contain client data:
`GET /api/saves` (index: banker, client count, size, timestamp) and
`GET /api/saves/<slug>` (full save) both require the admin token via
`?token=` or the `X-Admin-Token` header. `/api/snapshot` includes the index
only, never the saves themselves. Keep the hub on the LAN/VPN, or behind HTTPS
with real auth, before enabling this in a place where that matters.


## On-demand Salesforce import

- `GET /import?banker=<email>&name=...&<field>=...` — the target of a
  Salesforce custom URL button. Whitelisted fields only (the same keys the
  toolkit's Salesforce parser understands); `ssn`, `birth*`, `dob`, `age`,
  `marital*` parameters are dropped unconditionally. Optional
  `NMC_IMPORT_KEY` env → `&key=` required. Files the record under
  `data/inbox/<slugified banker>/<id>.json` and returns a self-closing page.
- `GET /api/inbox?email=&name=` — a toolkit's pending records (both slugs
  checked so email or name routing works).
- `POST /api/inbox/ack {id,email,name}` — removes a record after Import or
  Ignore. Toolkits call this automatically.


## AVM plug-in

`GET /api/avm?address=…` — provider-agnostic. Configure `NMC_AVM_URL` (with
`{address}`), optional `NMC_AVM_HEADERS` (JSON), and dot-paths
`NMC_AVM_PATH` / `_LOW` / `_HIGH` / `_CONF` into the provider's JSON, plus
`NMC_AVM_SOURCE` for the label bankers see. Replies are cached 24 h per
address. Returns 501 until configured. Internal `http://` providers are
allowed; external ones must be `https://`.
