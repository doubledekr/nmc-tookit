# NMC Toolkit — Chrome extension (test build)

Adds a **Send to NMC toolkit** button to Salesforce record pages — a Lead, or a converted lead’s Loan (Opportunity). It reads the open record the same way the
bookmarklet does and posts it to the NMC Toolkit desktop app on this computer (127.0.0.1 only — nothing
leaves the machine). The lead appears at the top of the Pipeline as **New from Salesforce · via Chrome**.

## Install (developer mode)
1. Chrome → `chrome://extensions` → switch on **Developer mode**.
2. **Load unpacked** → pick this folder (the desktop app shows the exact path under Settings → Chrome extension).
3. Open a Salesforce lead or loan; click the red button bottom-right (or the toolbar icon → *Send this lead*).

If the desktop app isn't running the extension copies the lead to the clipboard instead, so
*Paste from clipboard & parse* still works.

## Updating
The desktop app ships this folder inside its install and replaces it on every app update.
Restart Chrome after a toolkit update and the extension picks up the new code.

## Lender autofill (Rocket Pro + Village Capital)
On **Rocket Pro → New Scenario** (app.rocketpro.com) and **Village Capital's quick price** in TPO Connect (the Optimal Blue frame,
epc.optimalblue.com) a **Fill from NMC Toolkit** button appears bottom-right. It asks the desktop app for the client **selected in the toolkit**,
shows what it will fill as (the product from the proposal, else the savings analysis — changeable), then types/selects the fields.
Filled fields are outlined green, ones it couldn't fill amber. It never clicks Price or Submit.

VA Streamline defaults — Rocket: FICO and VantageScore = the credit score, monthly income $15,000, Refinance – Rate/Term, Correspondent,
VA, prior VA loan Yes, value = balance + $100,000, no second mortgage. Village: base loan = balance + $5,000, purchase price = balance,
appraised value = balance + $100,000, DTI 0, lead source VA. Name, credit score, address and ZIP come from the client.

The app only hands client data to a Chrome extension (POST /client, checked by Origin) — a website open in Chrome can't read it.

## Port
Default `47831`. Change it in the extension popup if something else on the PC uses that port
(set `NMC_SF_PORT` for the app to match).

**Updating.** The extension is loaded from the NMC Toolkit app’s own folder, so app updates replace its files automatically. Chrome keeps the copy it loaded at startup, so after an app update restart Chrome (or click *Reload* on the extension at `chrome://extensions`). The app’s Settings → Desktop app panel says when Chrome is still running an older version.

**What never leaves the page.** SSN, date of birth, age, marital status, income and employer are stripped from the harvested text before it is sent, and the toolkit strips them again on arrival.
