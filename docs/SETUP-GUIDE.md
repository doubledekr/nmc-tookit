# NMC Banker Toolkit — Setup & Usage Guide

Three audiences, three sections. Hand each section to the right person.

**The files, and who gets which:**

| File | Who | What it is |
|---|---|---|
| `neighborhood-toolkit.html` | every banker | the real toolkit — starts empty, first-run setup card, no demo clutter |
| `neighborhood-toolkit-demo.html` | training / sales demos | same toolkit pre-loaded with sample clients, rates, blocks, templates. Saves to its own separate slot, so it can sit next to a real toolkit on one machine |
| `nmc-management.html` | leaders + IT | the real console — Rate desk and Template library for leadership; Presence & IT admin and Connection for IT |
| `nmc-management-demo.html` | leadership preview | same console with a fictional five-banker floor, three months of history, presence, templates, and mirrored saves |

Demo files are the real files with one build flag flipped (`DEMO = true`), so
they never drift from the real thing.

**All four are standalone.** Every calculation, chart, parser, and the PDF
export (browser Print → Save as PDF) runs inside the file — no server, no
internet, no install. The one outside reference is Google Fonts for Lora and
Montserrat; without internet the file falls back to Georgia/Segoe UI and
everything still works. The server and shared folder only add sharing.

---

## 1 · For IT: standing it up

**What you're deploying:** one HTML file per banker (no install, no admin rights),
plus a hub — either a tiny Node server, a shared network folder, or both.

### A. The banker file
- Copy `neighborhood-toolkit.html` to each banker's machine (Desktop is fine).
- They open it in **Chrome or Edge**. That's the whole install.
- All client data lives in that browser + the banker's autosave folder. Nothing
  is sent anywhere except call-block *counts* and nothing requires the internet.

### B. The hub — pick one (or run both)

**Option 1 — Node server** (connected office / VPN):
```bash
# any always-on box the bankers can reach; Node 18+
NMC_ADMIN_TOKEN="pick-something-strong" node server.js       # port 8787
```
Run it as a service: `pm2 start server.js` or a systemd unit / Windows Task
Scheduler "At startup" task running `node C:\nmc\server.js`.
- Bankers paste the hub address in the toolkit's Settings (`http://SERVER:8787`, or the
  `https://` name if it's exposed for remote bankers) plus the access key if IT set one. Rates, reports, team stats, templates, presence, and
  the save mirror all derive from it.
- Internet-facing? Put it behind a reverse proxy with HTTPS, set
  `NMC_ALLOW_ORIGIN` to the exact origin, and add basic auth on `/` and `/admin`.

**Option 2 — Shared drive only** (fully air-gapped):
- Create a shared folder every banker can read/write, e.g. `Z:\NMC`.
- Each banker: My desk → **Choose autosave folder** → pick `Z:\NMC`. Done — their
  stats write out and rates/team data read in automatically from then on.
- On one always-on machine on that network:
  ```bash
  node merge-drive.js "Z:\NMC" --watch
  ```
  (Task Scheduler: run at logon, restart on failure.) This builds
  `nmc-master-blocks.csv` and `team.json` every 5 minutes.
- Rates in this mode: whoever runs the rate desk edits `Z:\NMC\rates.json`
  directly (format below), or run the server anywhere and add
  `--into-server ./data` to the merge command to relay its rates.json onto the drive.

**Both:** `node merge-drive.js "Z:\NMC" --into-server ./data --watch` next to the
server unifies drive-only and connected bankers into one dashboard.

### C. rates.json format (what the rate desk publishes)
```json
{ "updated": "2026-09-16", "rates": { "Conventional": 6.125, "FHA": 5.875, "VA": 5.75 } }
```
The server adds a `treasury` block to this file automatically (see Management).

### D. Salesforce "Send to NMC toolkit" button (on-demand import, no automation)

Bankers pull a client in by clicking a button on the open Salesforce lead — no
Flows, no webhooks, and Salesforce never needs to reach the hub (only the
banker's browser does, same as for rates). Your Salesforce admin adds a
**custom button** (Setup → Object Manager → Lead → Buttons, Links, and Actions
→ New Button or Link; Display Type: Detail Page Button; Behavior: Display in
new window; Content Source: URL) with a URL like this — swap in your real field
API names:

```
http://HUB:8787/import?banker={!$User.Email}&name={!Lead.Name}&email={!Lead.Email}&phone={!Lead.Phone}
&balance={!Lead.Total_Mortgage_s_Balance__c}&rate={!Lead.Interest_Rate__c}&payment={!Lead.Mortgage_Payment__c}
&value={!Lead.Property_Value__c}&fico={!Lead.FICO_Score__c}&servicer={!Lead.First_Mortgage_Servicer__c}
&leadSource={!Lead.LeadSource}&leadStatus={!Lead.Status}&closeDate={!Lead.Close_Date__c}
&monthsSince={!Lead.Months_Since_Close_Date__c}&ccBal={!Lead.Balance_of_Open_CCs__c}
&ccPay={!Lead.Monthly_Payment_of_Revolving_Debt_s__c}&ccCount={!Lead.of_Open_CCs__c}
&autoBal={!Lead.Balance_of_Auto_Loan_s__c}&autoPay={!Lead.Payment_of_Auto_Loan_s__c}&sfid={!Lead.Id}
```

Then add the button to the Lead page layout. Notes:
- `banker={!$User.Email}` is what routes the record to the right toolkit — the
  banker's email in their toolkit Settings must match their Salesforce login.
- Do **not** put SSN, birthdate, age, or marital status in the URL. The hub
  refuses those parameters anyway, but better they never leave Salesforce.
- Set `NMC_IMPORT_KEY=somesecret` on the server and add `&key=somesecret` to
  the URL to keep strangers on the network from posting into inboxes.
- Optional: use HTTPS for the hub if the URL crosses anything but the LAN.

What the banker sees: click → a small "Jakob B Strand is on the way" page that
closes itself → switch to the toolkit → **New from Salesforce** at the top of
Pipeline → Import → the usual review-before-apply preview (existing clients get
current → new; new ones get "Create new client"). Nothing lands without review.

**No hub?** Settings has a "Copy lead for NMC" bookmarklet: click it on the
lead, switch to the toolkit, hit "Paste from clipboard & parse."

### D2. Home-value estimates (AVM)
Bankers get an **Estimate value** button on the client workspace. It asks the
hub, and the hub asks whichever AVM provider you license (Clear Capital, ATTOM,
CoreLogic, HouseCanary, RentCast…). Six env vars on the server wire it up —
see `SALESFORCE-INTEGRATION.md` §6. Until a provider is configured, the button
explains that and the Pennymac estimator link beside it opens for a manual
lookup (that page is licensed for personal use only, so it can't be automated).

### D3. Salesforce Engage screen-pop and two-way sync
Covered in full in `SALESFORCE-INTEGRATION.md` — Salesforce admin steps,
what the developer builds on the hub, and the rollout. The banker toolkit
stays a standalone file throughout.

### D4. Desktop app (optional)
`nmc-toolkit-desktop/` builds the toolkit as a Windows installer and a Mac
app: bankers get an icon, data saved with the app (not a browser), a first-run
import of their old browser export, and auto-updates from the hub. See
`README-DESKTOP.md` there — build steps, where data lives, and the code-signing
you need before rolling it out.

### D5. Housekeeping
- **Backups:** copy the server's `./data/` folder and the shared folder nightly.
- **Updates:** replacing a banker's HTML file is safe — the toolkit migrates old
  saves additively and never drops data. Same for server.js (data files are stable).
- **Privacy line to hold:** block reports and CSVs contain counts and timestamps
  only. Client names/balances never leave a banker's machine. Don't add fields
  that change that without a compliance conversation.

---

## 2 · For bankers: daily use

**First open:** the welcome card asks your name, NMLS, phone, email — fill it in.
It goes on every proposal and tags your stats. Then **Settings → Your save file
& the home office**: choose your save folder (a local folder or the Z: drive)
and paste the hub address IT gave you. That one block shows where your file
lives, whether the hub is online right now (green dot), and when your server
backup last went up. One time. After that, saving, rate updates, team numbers,
and templates are automatic.

**Working remotely without the VPN:** everything core keeps working. Your
pipeline, client records, savings analysis, proposals, compare screens, and
call-block logging all run off the copy saved on your own computer — no
connection needed, nothing to remember. What pauses is only the shared stuff:
new rate pushes, team stats, and the template library stay at whatever they
were the last time you connected. Reconnect (VPN, office, home network with the
hub reachable) and it all catches up on its own within a couple of minutes —
including sending everything you did offline up to the home office. The line
under your save file on My desk tells you where the backup stands.

**Your day:**
1. **Pipeline** — the bell bar at the top tells you who's hot right now and which
   follow-ups are due. Filter with 🔥 Hot now / Follow-ups due / Watching. When a
   rate push opens a streamline window, you get a notification with names.
2. **Call blocks** — the strip shows the standard day (9:00–10:30, 11:00–12:30,
   lunch, 1:30–3:00, 3:00–4:30 follow-ups). Start the block, tap the big counters —
   or expand the call-by-call log: **1** No answer / wrong info · **2** Not
   interested · **3** Interested / following up. Ending a block pushes your stats
   and refreshes the team table automatically.
3. **Working a client:** paste their Salesforce record → Parse → Apply. Paste
   lender pricing → save options. Run the Savings analysis (skip payments, debt
   roll-in, HELOAN mode). Need side-by-sides? Compare options.
4. **Proposal:** check which programs to include, hit **Recommend** on your pick,
   write one line on why — it prints in a highlighted box. Export = Print → Save
   as PDF.
5. **Tools** — the mid-call calculator deck, no client needed. The big one is
   *Current vs new*: today's mortgage and debts on the left, the new loan on
   the right, hit **Pay what you pay now**, and read them the effective rate
   ("6.75% on paper, 3.91% in practice"). Plus a rate ladder, break-even,
   skipped-payment cash, cash-available-from-the-home, and how long a card
   really takes at its minimum. "Turn into a quick quote" hands it straight
   to the full analysis and proposal.
6. **Quick quote** (Pipeline or Analysis) when you don't want a lead in the
   pipeline — full analysis and PDF, promote it later if it turns real.

**My desk** is your corner: your info, your save file, today's rates + the 10-yr
Treasury direction + rate history, and your month (loans closed, volume, folder
pace, pipeline counts).

---

## 3 · For management: the console, rates, templates, exports

**The management console** (`nmc-management.html`) is the leaders' and IT's own
standalone file — open it in Chrome/Edge, no install. On the Connection screen
point it at the server URL (+ admin token for publishing) or, air-gapped, at the
same shared folder the bankers use. It holds four rooms:

- **Team dashboard** — whole-team month, banker-by-banker table with a live
  green dot for anyone who has their toolkit open, month history, current
  rates + the 10-yr Treasury. Auto-refreshes every minute.
- **Rate desk** — the manual publish (below), plus an optional "pull from an
  external rates API" hook: if IT wires a pricing endpoint that returns
  `{"rates":{...}}`, one click prefills the desk; you still review and Publish.
- **Template library** — write the company's strongest intros, texts, and
  emails once, hit Publish, and they appear in every banker's Scripts &
  templates screen automatically. Below it sits everything bankers have chosen
  to share; one click promotes the good ones into the company library.
- **Presence & IT admin** — who's online right now (toolkits heartbeat once a
  minute: name + timestamp only), hub health ping, and the full endpoint map
  including `/api/snapshot`, the future-AI hook.

Everything streams automatically in both directions — bankers never press a
sync button (theirs exists only as a manual "Sync now" kick), and nothing you
publish waits on anyone.

**Pushing rates (manual, ~30 seconds):**
- Server mode: open `http://SERVER:8787/admin`, adjust the numbers, enter the
  admin token, **Publish**. Every banker's toolkit picks it up within 30 minutes
  (or their next shared-folder sync) and hot-lead alerts fire automatically.
- Drive-only mode: edit `Z:\NMC\rates.json` (format above). Same effect.
- Publish when lender pricing moves — typically each morning and on volatile days.

**The 10-yr Treasury** appears automatically next to your rates (server fetches
it hourly from treasury.gov — no account needed). Read it as *direction*: when
the 10-yr falls meaningfully, mortgage pricing usually follows within the day —
that's your cue to check lender pricing and publish, which is what actually
opens the streamline windows in every banker's pipeline. It is never shown to
clients as a quotable rate.

**Banker save files:** each toolkit mirrors its full save file to the hub
whenever it can reach it — completely separate from the banker's own local copy,
which is the real source of truth and never waits on the network. This is your
safety net: if a laptop dies, Presence & IT admin → Mirrored banker save files
lets you download that banker's last mirrored save and they import it in
Settings. These files contain client data, so the endpoint requires the admin
token and the list shows metadata only (banker, client count, size, timestamp)
until you deliberately open one.

**Watching the team:** `http://SERVER:8787/` — whole-team month, banker-by-banker
table (blocks, hours, dials, contact %, interested, folders, dials/hr, last
report), auto-refreshing. Bankers see the same table inside their toolkit, with
their own row highlighted and month-by-month history.

**Exports (all on the dashboard):**
- **Call blocks (CSV)** — every block, every banker, opens straight in Excel
- **Rate history (CSV)** — every publish, one column per product
- **Full snapshot (JSON)** — everything in one self-describing document. This is
  the future AI hook: when you're ready for live management metrics, an analysis
  layer reads this single endpoint and nothing else has to change.
