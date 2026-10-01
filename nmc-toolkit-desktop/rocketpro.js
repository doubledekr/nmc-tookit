/* Rocket Pro autofill — opens app.rocketpro.com in its own window and fills a new pricing scenario
   from the client the banker has open in the toolkit.

   - The banker signs in to Rocket Pro themselves; the sign-in is kept in its own saved session
     ("persist:rocketpro"), so it survives restarts and is never shared with the toolkit window.
   - We never click Continue or save the scenario. The banker reviews what was filled and submits.
   - All Rocket Pro knowledge (field names, dropdown wording, Yes/No questions) lives in this file,
     so when Rocket changes their form this is the only place to update. */
const { BrowserWindow, shell } = require("electron");
const fs = require("fs"), path = require("path");

const RP_HOME = "https://app.rocketpro.com/pricing";
const ALLOWED = /^https:\/\/([a-z0-9-]+\.)*(rocketpro\.com|authrock\.com|rocketmortgage\.com|rocket\.com)(\/|$)/i;

let win = null, pending = null, pricingId = null, cacheFile = null;

function init(dataDir){
  cacheFile = path.join(dataDir, "rocketpro.json");
  try { pricingId = JSON.parse(fs.readFileSync(cacheFile, "utf8")).pricingId || null; } catch (e) {}
}
function rememberId(id){ if (!id || id === pricingId) return; pricingId = id;
  try { fs.writeFileSync(cacheFile, JSON.stringify({ pricingId: id })); } catch (e) {} }
const createUrl = () => pricingId ? `https://app.rocketpro.com/pricing/${pricingId}/create` : RP_HOME;

/* toolkit client → the list of steps the page script runs, in order (dropdowns that unlock other
   fields come before the fields they unlock) */
function stepsFor(p){
  const S = [], money = v => v == null || !isFinite(v) ? null : Math.round(v);
  const add = (s) => { if (s.v !== null && s.v !== undefined && s.v !== "") S.push(s); };
  add({ k: "in", name: "ficoScore", label: "FICO score", v: money(p.fico) });
  add({ k: "in", name: "monthlyIncome", label: "Monthly income", v: money(p.income) });
  add({ k: "in", name: "monthlyDebt", label: "Monthly debt", v: money(p.monthlyDebt) });
  add({ k: "in", name: "zipCode", label: "ZIP code", v: p.zip, wait: 1500 });            /* fills State + County by itself */
  add({ k: "radio", q: "Does the client rent at their present address", label: "Rents at present address", v: "No" });
  add({ k: "sel", name: "purpose", label: "Loan purpose", v: p.purpose === "cashout" ? "Refinance - Cash Out" : "Refinance - Rate/Term", wait: 800 });
  add({ k: "sel", name: "channel", label: "Loan channel", v: "Wholesale", wait: 800 });
  const TYPE = { Conventional: "Conventional", FHA: "FHA", VA: "VA", Jumbo: "Jumbo", second: "Home Equity Loan" };
  add({ k: "sel", name: "type", label: "Loan type", v: TYPE[p.lien === "second" ? "second" : p.loanType] || null, wait: 1000 });
  if (p.loanType === "FHA") add({ k: "radio", q: "Are you refinancing an FHA loan", label: "Refinancing an FHA loan", v: "Yes", optional: true });
  if (p.loanType === "VA") add({ k: "radio", q: "Client Previously Had A VA Loan", label: "Previously had a VA loan", v: "Yes", optional: true });
  add({ k: "in", name: "value", label: "Property value", v: money(p.value) });
  add({ k: "in", name: "amount", label: "Loan amount", v: money(p.amount), wait: 500 });   /* LTV/CLTV calculate themselves */
  if (p.lien === "second") add({ k: "in", name: "balance", labelText: "First Mortgage Balance", label: "First mortgage balance", v: money(p.firstBalance), optional: true });
  add({ k: "in", name: "monthlyTaxes", label: "Monthly taxes", v: money(p.taxes) });
  add({ k: "in", name: "monthlyHoi", label: "Monthly insurance", v: money(p.hoi) });
  add({ k: "sel", name: "compensationType", label: "Compensation", v: "Lender Paid", optional: true });
  add({ k: "radio", q: "Does the client have a second mortgage/HELOC", label: "Has a 2nd mortgage/HELOC", v: p.hasSecond ? "Yes" : "No", wait: 500 });
  if (p.hasSecond) {
    add({ k: "radio", q: "Will this refinance pay off the second mortgage/HELOC", label: "Pays off the 2nd", v: p.payoffSecond ? "Yes" : "No", optional: true });
    add({ k: "in", name: "balance", labelText: "2nd Mortgage Balance", label: "2nd mortgage balance", v: money(p.secondBalance), optional: true });
  }
  add({ k: "in", name: "name", label: "Scenario name", v: p.scenarioName ? String(p.scenarioName).slice(0, 25) : null });
  return S;
}

/* Runs inside the Rocket Pro page. Self-contained (it is injected as source text), so the
   "Fill again" button on the banner can re-run it without talking to the app. */
function pageFill(steps, name){
  const esc = t => String(t).replace(/[&<>"]/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));
  const who = esc(name);
  const sleep = ms => new Promise(r => setTimeout(r, ms));
  const vis = e => !!(e && !e.disabled && (e.offsetParent || e.getClientRects().length));
  const labelOf = e => { let p = e.parentElement; for (let i = 0; i < 6 && p && !p.querySelector("label"); i++) p = p.parentElement; return (p && p.querySelector("label") ? p.querySelector("label").innerText : "").trim(); };
  const findIn = s => [...document.querySelectorAll(`input[name="${s.name}"]`)].find(e => vis(e) && (!s.labelText || labelOf(e).toLowerCase().includes(s.labelText.toLowerCase())));
  const findSel = s => [...document.querySelectorAll(`select[name="${s.name}"]`)].find(vis);
  const findRadio = s => { const fs = [...document.querySelectorAll("fieldset")].find(f => f.innerText.trim().toLowerCase().startsWith(s.q.toLowerCase()) && f.querySelectorAll("input[type=radio]").length === 2);
    if (!fs) return null; return [...fs.querySelectorAll("input[type=radio]")].find(r => { const l = document.querySelector(`label[for="${r.id}"]`); return l && l.innerText.trim() === s.v && vis(r); }); };
  const setVal = (e, v) => { e.focus(); Object.getOwnPropertyDescriptor(e.tagName === "SELECT" ? HTMLSelectElement.prototype : HTMLInputElement.prototype, "value").set.call(e, v);
    ["input", "change", "blur"].forEach(t => e.dispatchEvent(new Event(t, { bubbles: true }))); e.blur(); };
  async function waitFor(fn, ms){ const end = Date.now() + ms; let el; while (!(el = fn()) && Date.now() < end) await sleep(150); return el; }

  function banner(html, ok){ let b = document.getElementById("nmc-fill-banner");
    if (!b) { b = document.createElement("div"); b.id = "nmc-fill-banner"; document.body.appendChild(b); }
    b.style.cssText = "position:fixed;right:18px;bottom:18px;z-index:2147483647;max-width:380px;background:#fff;border:2px solid " + (ok ? "#1f7a4d" : "#b45309") + ";border-radius:10px;box-shadow:0 8px 30px rgba(0,0,0,.25);padding:14px 16px;font:13px/1.45 system-ui,Segoe UI,Arial;color:#222";
    b.innerHTML = html; }

  return (async () => {
    banner(`<b>NMC Toolkit</b> — filling for ${who}…`, true);
    if (!(await waitFor(() => document.querySelector('input[name="ficoScore"]'), 15000))) {
      banner(`<b>NMC Toolkit</b> — couldn't find Rocket Pro's scenario form on this page. Open <b>Pricing → Start Scenario</b>, then press <b>Fill again</b>.<br><button id="nmc-again" style="margin-top:8px">Fill again</button>`, false);
      document.getElementById("nmc-again").onclick = () => window.__nmcFill(); return { ok: false, filled: [], skipped: ["form not found"] }; }
    const filled = [], skipped = [];
    for (const s of steps) {
      const finder = s.k === "in" ? () => findIn(s) : s.k === "sel" ? () => findSel(s) : () => findRadio(s);
      const el = await waitFor(finder, s.optional ? 1200 : 4000);
      if (!el) { if (!s.optional) skipped.push(s.label); continue; }
      if (s.k === "in") setVal(el, String(s.v));
      else if (s.k === "sel") { const o = [...el.options].find(o => o.text.trim().toLowerCase() === String(s.v).toLowerCase());
        if (!o) { skipped.push(`${s.label} (no “${s.v}” option)`); continue; } setVal(el, o.value); }
      else if (!el.checked) el.click();
      filled.push(s.label);
      await sleep(s.wait || 250);
    }
    banner(`<b>NMC Toolkit</b> — filled ${filled.length} fields for ${who}.` +
      (skipped.length ? `<br><span style="color:#b45309">Fill these yourself: ${skipped.map(esc).join(", ")}</span>` : "") +
      `<br><b>Check everything</b>, then click <b>Continue</b> on Rocket Pro. Nothing has been submitted.` +
      `<div style="margin-top:8px;display:flex;gap:8px"><button id="nmc-again">Fill again</button><button id="nmc-close">Hide</button></div>`, !skipped.length);
    document.getElementById("nmc-again").onclick = () => window.__nmcFill();
    document.getElementById("nmc-close").onclick = () => document.getElementById("nmc-fill-banner").remove();
    return { ok: true, filled, skipped };
  })();
}

function runFill(){
  if (!pending || !win) return; const p = pending; pending = null;
  const who = JSON.stringify(String(p.name || "this client"));
  const src = `window.__nmcFill = () => (${pageFill.toString()})(${JSON.stringify(stepsFor(p))}, ${who}); window.__nmcFill();`;
  win.webContents.executeJavaScript(src, true).catch(() => {});
}

/* every time Rocket Pro changes page: remember the account's pricing id, and once we're signed in,
   go straight to "Create a Scenario" and fill it */
function onNav(url){
  const m = /app\.rocketpro\.com\/pricing\/(\d+)/.exec(url || ""); if (m) rememberId(m[1]);
  if (!pending) return;
  if (/app\.rocketpro\.com\/pricing\/\d+\/create/.test(url)) { setTimeout(runFill, 600); return; }
  if (/^https:\/\/app\.rocketpro\.com\//.test(url) && pricingId) win.loadURL(createUrl());
  else if (/^https:\/\/app\.rocketpro\.com\//.test(url) && !/\/pricing/.test(url)) win.loadURL(RP_HOME);
}

function open(payload){
  pending = payload;
  if (!win || win.isDestroyed()) {
    win = new BrowserWindow({ width: 1280, height: 900, title: "Rocket Pro — NMC Toolkit autofill",
      webPreferences: { partition: "persist:rocketpro", contextIsolation: true, nodeIntegration: false, sandbox: true } });
    win.webContents.setWindowOpenHandler(({ url }) => { if (ALLOWED.test(url)) return { action: "allow" }; shell.openExternal(url); return { action: "deny" }; });
    win.webContents.on("will-navigate", (e, url) => { if (!ALLOWED.test(url)) { e.preventDefault(); shell.openExternal(url); } });
    win.webContents.on("did-navigate", (e, url) => onNav(url));
    win.webContents.on("did-navigate-in-page", (e, url) => onNav(url));
    win.on("closed", () => { win = null; pending = null; });
  }
  win.show(); win.focus();
  win.loadURL(createUrl());   /* a fresh form every time, so one client's numbers never carry into the next */
  return true;
}

module.exports = { init, open, stepsFor };
