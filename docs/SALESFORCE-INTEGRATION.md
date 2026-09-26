# Salesforce integration — implementation guide for IT and developers

This document covers three things:

1. **Screen-pop** — a call arrives in Salesforce Engage and the lead appears in
   the banker's toolkit automatically.
2. **Two-way sync** — status, outcomes, follow-ups, notes, and corrections
   flow from the toolkit back to Salesforce, attributed to the banker.
3. **AVM plug-in** — automatic home-value estimates from a licensed provider.

Everything here runs on the **hub** (server.js). The banker toolkit stays a
standalone HTML file with no new dependencies — see the next section.

---

## 0 · Does the toolkit stay standalone? Yes.

The toolkit already talks to the hub for rates, team stats, templates, and the
save mirror. Every feature below rides that same one-address link:

| Capability | Where it lives | Toolkit change |
|---|---|---|
| Salesforce button (today) | hub `/import` → inbox | none — already built |
| Engage screen-pop | hub event listener → inbox | none — inbox already polls on focus + every 5 min; add a 20-second poll while a call block is running |
| Write-back to Salesforce | hub `/api/sf/update` queue | one small function: post the changed fields |
| AVM | hub `/api/avm` | already built |

Offline, no VPN, no Salesforce reachable: the toolkit keeps working from its
local copy, exactly as now. Pops queue at the hub and land on reconnect;
write-backs queue in the toolkit and send on reconnect. Nothing about the
standalone-file model changes, and IT never installs anything on banker
machines.

---

## 1 · Salesforce setup (Salesforce admin, ~1 hour, do it in a sandbox first)

### 1.1 Connected App (one time)
Setup → App Manager → New Connected App.
- Enable OAuth. Scopes: `api`, `refresh_token`, `offline_access`.
- Callback URL: `https://HUB/oauth/callback` (the hub must be reachable by the
  bankers' browsers over HTTPS for the login step; Salesforce itself never
  needs to reach the hub).
- Note the Consumer Key and Secret → hub env `SF_CLIENT_ID`, `SF_CLIENT_SECRET`,
  and `SF_LOGIN_URL` (`https://login.salesforce.com` or your My Domain).

### 1.2 Per-banker authorization (each banker, once, 30 seconds)
Bankers click **Connect Salesforce** in the toolkit's Settings, log in on
Salesforce's page, and are sent back. The hub stores that banker's refresh
token (encrypted at rest, keyed by their email). All writes then happen as
*that banker*, so Salesforce history and compliance attribution are correct.

Alternative for a faster pilot: a single integration user
(`SF_INTEGRATION_USERNAME` + password/token). Simpler, but every Task and edit
shows as the integration user — acceptable for a test, not for production.

### 1.3 Change Data Capture on Task and Lead
Setup → Integrations → Change Data Capture → select **Task** and **Lead**.
This is what makes the screen-pop instant: when Engage logs the call, a Task
change event fires within ~1 second.

### 1.4 Field API names
Export the Lead object's field list (Setup → Object Manager → Lead → Fields).
Fill in `sf-fields.json` on the hub — a map from the toolkit's keys to your API
names. The keys are the same ones the paste parser and the URL button use:

```json
{
  "name": "Name", "email": "Email", "phone": "Phone",
  "balance": "Total_Mortgage_s_Balance__c", "rate": "Interest_Rate__c",
  "paymentTotal": "Mortgage_Payment__c", "value": "Property_Value__c",
  "fico": "FICO_Score__c", "servicer": "First_Mortgage_Servicer__c",
  "leadSource": "LeadSource", "leadStatus": "Status",
  "closeDate": "Close_Date__c", "monthsSince": "Months_Since_Close_Date__c",
  "ccBal": "Balance_of_Open_CCs__c", "ccPay": "Monthly_Payment_of_Revolving_Debt_s__c",
  "ccCount": "of_Open_CCs__c", "autoBal": "Balance_of_Auto_Loan_s__c",
  "autoPay": "Payment_of_Auto_Loan_s__c", "address": "Street"
}
```
**Never map** SSN, birthdate, age, or marital status. The hub refuses those
keys regardless.

### 1.5 Status vocabulary
Decide the mapping between toolkit statuses (New, Working, Quoted, Follow-up,
Closed, Lost) and Lead Status picklist values. Put it in `sf-status.json`.

---

## 2 · Hub components to build (developer, ~2 days)

The hub is dependency-free Node today. Keep it that way where possible; the
one justified addition is an event-stream client (Salesforce's Pub/Sub API is
gRPC; the older CometD/Bayeux stream works over plain HTTPS long-polling and is
implementable in ~150 lines with no packages — use that).

### 2.1 OAuth (`/oauth/start`, `/oauth/callback`)
Standard web-server flow. Store `{email, instanceUrl, refreshToken}` in
`data/sf-auth/<slug>.json`, encrypted with `SF_TOKEN_KEY`. Refresh access
tokens on demand; they expire in ~2 hours.

### 2.2 Event listener (screen-pop)
Subscribe to `/data/TaskChangeEvent` (and `/data/LeadChangeEvent` for
reassignment). On a **create** with `Subject` containing "Call" (Engage's
convention — confirm in your org) and a `WhoId` starting with `00Q` (Lead):
1. Look up `OwnerId` → banker email (cache User records).
2. `GET /services/data/vXX.0/sobjects/Lead/<WhoId>` with the mapped fields.
3. Write the record to `data/inbox/<slug>/<id>.json` **in exactly the shape
   `/import` writes today** (`{id, received, fields:{...}, sfid}`), plus
   `pop:true`.
That is the whole pop path — the toolkit's existing inbox handling shows it in
the Pipeline strip. To make it feel instant, the toolkit polls the inbox every
20 seconds while a call block is running (one-line change to the sync timer).

Resilience: keep the replay id; on reconnect, resubscribe from the last id so
missed events during a hub restart are delivered. Log, never crash, on
malformed events.

### 2.3 Write-back (`POST /api/sf/update`)
Body from the toolkit: `{banker, sfid, changes:{rate:6.25, leadStatus:"Working"},
task:{outcome:"Interested", notes:"...", followUp:"2026-09-24"}}`.
- Apply **only the keys in `changes`** with a `PATCH` on the Lead. Never send
  the whole record — a stale toolkit must not overwrite fresher Salesforce
  data.
- Create a **Task** for the call outcome (Subject "NMC toolkit — Interested",
  Description = notes, ActivityDate = followUp, Status Completed).
- Queue to `data/sf-outbox/`; retry with backoff; return 202 immediately so
  the toolkit never waits on Salesforce.
- Rate-limit per banker (Salesforce API limits are per org).

### 2.4 Call-block feed
Outcomes posted in 2.3 already carry dial/contact/interested semantics. Count
them into the banker's current block on the hub side too, so blocks logged via
Engage and blocks logged by hand agree.

### 2.5 Config
```
SF_LOGIN_URL, SF_CLIENT_ID, SF_CLIENT_SECRET, SF_TOKEN_KEY
SF_FIELDS=./sf-fields.json     SF_STATUS=./sf-status.json
SF_POP_SUBJECT_MATCH=Call      (regex, matches Engage's Task subject)
```

---

## 2b · Five9 (the "Engage" dialer) — where the ring-time pop really comes from

Bankers log into the **Five9 Adapter for Salesforce** (Open CTI). Five9 runs
campaigns and routing; the Salesforce Task it writes is created at wrap-up,
which is fine for post-call notes but too late for a pop at ring time. So:

- **Ring-time pop:** Five9 Workflow Automation (or the Five9 Agent/Supervisor
  APIs) posts a call-connected event to the hub — `POST /api/five9/event` with
  the agent, ANI/DNIS, campaign, and the Salesforce record ID Five9 attached.
  The hub matches the number (or pulls the lead by ID) and files it in the
  banker's inbox exactly as §2.2 describes. Salesforce Task CDC remains the
  post-call path (outcome, recap, notes).
- **Dispositions:** if the floor reports on Five9 dispositions, map toolkit
  outcomes (No answer / Not interested / Interested) to Five9 disposition names
  in `five9-dispositions.json` so one tag updates Five9, Salesforce, and the
  toolkit's call block.
- **What to ask the Five9 admin:** is Workflow Automation enabled; which event
  carries the Salesforce record ID; whether campaign calls and direct-line calls
  (Dialpad) both need pops.

## 3 · Toolkit contract (already in place, plus one addition)

Existing, unchanged:
- `GET /api/inbox?email=&name=` and `POST /api/inbox/ack` — the pop shows up
  here; Import routes through the same review-before-apply preview as a paste
  (existing clients: current → new; new: "Create new client").

One addition (small):
- When a banker changes status, logs an outcome, sets a follow-up, or edits a
  field on a client that has an `sfid`, the toolkit posts the delta to
  `/api/sf/update`. If offline, it queues the delta with the save mirror and
  sends on reconnect. A "synced to Salesforce ✓ 2 min ago" line under the
  client bar shows the state.

Conflict rule, in plain words: **the last human to touch a specific field
wins, per field.** The toolkit only ever sends fields the banker changed; the
pop only ever offers fields for review. Nothing overwrites silently on either
side.

---

## 4 · Security & compliance checklist
- Hub behind HTTPS (required for the OAuth callback anyway).
- Refresh tokens encrypted at rest; `SF_TOKEN_KEY` in a secret store, not the
  repo.
- Sensitive fields (SSN, DOB, age, marital status) never mapped, never
  requested from Salesforce, refused at the inbox.
- Per-banker OAuth for production so every Task and edit is attributed
  correctly.
- Sandbox first: point `SF_LOGIN_URL` at `https://test.salesforce.com`, run a
  week of pops and write-backs, review the Tasks it created, then switch.
- The hub already holds client data (save mirrors). This adds Salesforce
  tokens. Treat the box as a system of record: LAN/VPN only or HTTPS + auth,
  nightly backups of `data/`, restricted OS access.

---

## 5 · Rollout
1. Sandbox: Connected App, CDC on Task/Lead, `sf-fields.json`. One banker
   authorizes. Verify a test call pops within 2 seconds.
2. Write-back on for that banker; verify Lead edits and Tasks in Salesforce.
3. Add five bankers for a week. Watch API usage in Setup → System Overview.
4. Production Connected App, all bankers authorize from Settings.

---

## 6 · AVM plug-in (already built on the hub)
`GET /api/avm?address=…` calls whatever provider IT configures and returns
`{value, low, high, confidence, source, asOf}`; the toolkit's **Estimate
value** button fills the client's home value with provenance. Configure with:
```
NMC_AVM_URL="https://api.provider.com/avm?address={address}"
NMC_AVM_HEADERS='{"apikey":"…"}'
NMC_AVM_PATH="data.estimate"   NMC_AVM_LOW="data.range.low"   NMC_AVM_HIGH="data.range.high"
NMC_AVM_CONF="data.fsd"        NMC_AVM_SOURCE="Clear Capital"
```
Provider notes: Pennymac's TPO estimator is Clear Capital's Consumer AVM
licensed to Pennymac for personal, non-commercial lookups — it has no API and
its terms don't allow automated commercial use, so the toolkit links to it for
manual lookups only. For automation, license an AVM directly: Clear Capital
(same engine), ATTOM, CoreLogic, ICE Mortgage Technology, HouseCanary, or a
lighter one (RentCast, Estated) for ballparks. Any provider that returns JSON
over HTTPS works with the env config above; anything that needs a POST body or
signed requests is a 20-line adapter in server.js.
