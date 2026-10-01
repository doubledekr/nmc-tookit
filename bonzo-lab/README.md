# Bonzo Lab — "Send to Bonzo" for the NMC Toolkit

A separate test build of the toolkit with a **Send to Bonzo** bar on the Client proposal screen.
It lives only on the `bonzo-lab` branch. Nothing here touches the real app, its releases, or any banker's data:

- The real `banker-toolkit/neighborhood-toolkit.html` is **not modified**. The lab copies it and injects two scripts.
- The lab desktop app has its own name, app ID, and data folder (`NMC Toolkit Bonzo Lab`), and **no auto-updater**.
- The release workflow only runs on `main`, so pushing this branch builds nothing.

## What one click does

1. **Finds or creates the client** in Bonzo, matching on phone first, then email, so there are no duplicates.
   Writes the proposal numbers into custom fields and assigns the banker.
2. **Attaches a note** with the proposal summary and the date of the pricing.
3. **Emails the proposal** from the banker's Bonzo thread, with the proposal JPG attached.
4. **Moves the client to "Proposal Sent"**, the stage that starts the follow-up text campaign.

Then **Check status** reads the client back from Bonzo (stage, replied, opted out) and shows it on the bar.
Every send is logged in the client's history and marks the proposal "Sent by Bonzo" in their library.

Safeguards: **dry run is on by default** (preview every call, send nothing). Sends are blocked without a name and
a phone or email. Custom fields are benefits only: a number that isn't a real benefit goes over blank, so an
older value can't linger and get texted. The token is stored encrypted by the OS keychain in the main process
and never reaches the page.

## Try it (no Bonzo account needed)

```bash
cd bonzo-lab/desktop
npm install
npm run mock          # terminal 1: fake Bonzo on http://localhost:8799 (dashboard shows everything received)
npm start             # terminal 2: the lab app
```

In the lab app: Settings & data → enter your name. Add a client with a phone/email and run a Savings analysis.
Then go to Client proposal → Bonzo **Settings** → set the stage id to `stage-proposal-sent` → **Send to Bonzo**.
Untick dry run in Settings to actually hit the mock. Use the dashboard's **Simulate reply** / **Simulate STOP**
buttons, then **Check status**.

You can also use it in a browser with no Electron: after `npm run sync`, open
http://localhost:8799/app/neighborhood-toolkit.html (browser mode only talks to the local mock).

`MOCK_FAIL=email npm run mock` makes a step fail, to see how a partial failure looks.

## Tests

```bash
node --test bonzo-lab/test/*.test.js          # payload logic (8 tests)
node bonzo-lab/test/e2e.js                    # real toolkit in headless Chromium vs the mock (needs Playwright)
```

## Before pointing it at real Bonzo

The endpoint paths and field names are **placeholders** until we have Bonzo's API docs. All of them are editable in
the lab's Bonzo Settings (Endpoints box and custom field keys), so fixing them needs no code change. Needed from Abe / the Bonzo rep:

- [ ] API docs: base URL, prospect create/update/search, notes, email (HTML? attachments?), pipeline stage change, read prospect
- [ ] An API token (per banker, or a team-lead token) and a test prospect we can hit freely
- [ ] Custom fields created team-wide: `nmc_new_payment`, `nmc_monthly_savings`, `nmc_interest_saved`, `nmc_cash_out`, `nmc_debts_paid`, `nmc_quote_date`, `nmc_proposal`
- [ ] "Proposal Sent" stage id, with the follow-up campaign attached to it
- [ ] Whether API email goes out through the banker's integrated email or the Bonzo bulk server
- [ ] Compliance OK on which lead sources may receive automated texts

## Merging into the main toolkit later

| Lab file | Goes to |
|---|---|
| `module/bonzo-core.js`, `module/bonzo.js` | paste into the toolkit HTML (or load beside it); the module only reads toolkit globals, no toolkit code changes |
| `desktop/bonzo-main.js` | `require("./bonzo-main")(dataDir)` in `nmc-toolkit-desktop/main.js` |
| `nmcBonzo` block in `desktop/preload.js` | add to `nmc-toolkit-desktop/preload.js` |

## Layout

```
module/       bonzo-core.js (pure logic: payloads, validation, run order)  ·  bonzo.js (button, preview, settings)
desktop/      lab Electron shell, Bonzo bridge (token + network), sync script
mock-bonzo/   fake Bonzo API + dashboard
test/         unit tests and the end-to-end browser test
```
