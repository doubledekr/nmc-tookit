/* Real quote from Rocket Pro (extension v0.7). On the pricing page, once a rate is selected, a "Send rate to NMC Toolkit" button
   sends that ONE selected rate to the client open in the toolkit: product, lock, rate, monthly payment (P&I + MI), MI, cost/credit,
   the scenario's loan amount / property value / LTV / purpose / type, and the itemized fees (A–E) for that rate.
   Not sent: compensation (lender-paid / broker), income, FICO, ZIP, names. Read-only: nothing on the page is changed. */
(function(){
  if (window !== window.top || window.__nmcRateGrab) return; window.__nmcRateGrab = true;
  const CSS = "position:fixed;right:18px;bottom:66px;z-index:2147483646";
  const alive = () => { try { return !!(chrome.runtime && chrome.runtime.id); } catch (e) { return false; } };
  const money = s => { const t = String(s || "").replace(/[^\d.\-]/g, ""); const v = parseFloat(t); return isFinite(v) ? v : null; };
  const txt = el => el ? String(el.textContent || "").replace(/\s+/g, " ").trim() : "";
  const val = id => { const el = document.getElementById(id); return el ? String(el.value || el.textContent || "").trim() : ""; };
  const visible = el => { try { return !!el && el.getClientRects().length > 0; } catch (e) { return false; } };
  function selectedRow(){
    const sel = [...document.querySelectorAll("tr.pro-nova-pricing-table__row--selected")].find(visible);
    if (sel) return sel;
    const r = [...document.querySelectorAll('input[type=radio][name^="pro-nova-pricing-table-rate"]')].find(x => x.checked);
    return r ? r.closest("tr") : null; }
  const cell = (tr, label) => { const td = tr.querySelector(`td[data-label^="${label}"]`);   /* "Monthly payment*" carries an asterisk */ return td ? txt(td) : ""; };
  function fees(){
    const out = []; let total = null;
    const tot = document.querySelector('[aria-label="Total Fees"]'); if (tot) total = money(txt(tot));
    if (!tot) return { total, items: out };
    /* the fee lists that follow "Total Fees": a bold header li per section (with its "Section Total"), then one li per fee */
    const scope = tot.closest("div") && tot.closest("div").parentElement || document;
    let section = "";
    for (const li of scope.querySelectorAll("ul li")){
      /* only the fee lists AFTER "Total Fees" — never the compensation block above it (lender-paid / broker compensation stays internal) */
      if (!(tot.compareDocumentPosition(li) & Node.DOCUMENT_POSITION_FOLLOWING)) continue;
      if (li.closest("pricing-calc-lender-compensation")) continue;   /* (a broker fee listed INSIDE section A is a borrower-paid charge — kept) */
      const st = li.querySelector('[aria-label="Section Total"]');
      if (st){ section = txt(li).replace(txt(st), "").trim(); continue; }
      const spans = li.querySelectorAll(":scope > span"); if (spans.length < 2) continue;
      const nameEl = spans[0]; const name = String(nameEl.childNodes[0] && nameEl.childNodes[0].textContent || txt(nameEl)).trim();
      const amount = money(txt(spans[spans.length - 1])); if (amount == null || !name) continue;
      out.push({ section: section.slice(0, 60), name: name.slice(0, 80), amount }); }
    return { total, items: out }; }
  /* Rocket's "Rate adjustments" box (home equity): Base rate, Adjusted rate, Undiscounted all-in rate, then each adjustment
     (e.g. CLTV/FICO +1.750, loan amount −0.100). Read as label/number pairs. Only this box — the "Pricing adjustments" box on other
     products lists compensation, and anything labelled compensation is skipped regardless. */
  function rateAdjustments(){
    const head = [...document.querySelectorAll("h1,h2,h3,h4,h5,h6,div,span,p")].find(el => el.children.length === 0 && /^\s*rate adjustments\s*$/i.test(el.textContent || "") && visible(el));
    if (!head) return null;
    let box = head.parentElement; for (let i = 0; i < 4 && box && !/base rate/i.test(box.innerText || ""); i++) box = box.parentElement;
    if (!box) return null;
    const lines = String(box.innerText || "").split(/\n+/).map(l => l.trim()).filter(Boolean);
    const out = []; let label = null;
    for (const l of lines){
      if (/^rate adjustments$/i.test(l)) continue;
      const m = /^(.*?)[\s\t]+(-?\d{1,2}\.\d{2,4})$/.exec(l);
      if (m && m[1]) { out.push([m[1].trim(), +m[2]]); label = null; continue; }
      if (/^-?\d{1,2}\.\d{2,4}$/.test(l) && label) { out.push([label, +l]); label = null; continue; }
      label = l; }
    const rows = out.filter(([k]) => !/compensation/i.test(k)).slice(0, 20).map(([label, value]) => ({ label: label.slice(0, 60), value }));
    const get = re => { const r = rows.find(x => re.test(x.label)); return r ? r.value : null; };
    return rows.length ? { base: get(/^base rate/i), adjusted: get(/^adjusted rate/i), allIn: get(/undiscounted/i), total: get(/^adjustments$/i), items: rows.filter(x => !/^(base rate|adjusted rate|undiscounted|adjustments$|base price)/i.test(x.label)) } : null; }
  function readQuote(){
    const tr = selectedRow(); if (!tr) return null;
    const adj = rateAdjustments();
    const rate = money(cell(tr, "Rate")), adjustedRate = money(cell(tr, "Adjusted rate")) || (adj && adj.adjusted) || null, payment = money(cell(tr, "Monthly payment")), mi = money(cell(tr, "MI amount")) || 0;
    const costPct = money(cell(tr, "% cost to borrower")), costDollars = money(cell(tr, "$ cost to borrower"));
    const prodLi = document.querySelector(".pc-c-List--summaryview li"); const spans = prodLi ? prodLi.querySelectorAll("span") : [];
    const product = spans[0] ? txt(spans[0]) : ""; const lock = spans[1] ? txt(spans[1]) : "";
    const term = (/(\d{2})\s*Year/i.exec(product) || [])[1];
    const f = fees();
    return { lender: "Rocket Pro", product, lock, term: term ? +term : null, rate, adjustedRate, rateAdjustments: adj, payment, mi, costPct, costDollars,
      eligibility: cell(tr, "Eligibility"), loanAmount: money(val("txt-loan-amount")), propertyValue: money(val("txt-property-value")),
      ltv: val("txt-loan-ltv"), purpose: val("txt-loan-purpose"), loanType: val("txt-loan-type"),
      totalFees: f.total, fees: f.items, comp: comp(), pulledAt: new Date().toISOString() }; }
  /* what NMC earns on this rate — "Lender Paid Compensation" in Rocket's compensation box. Sent ONLY for the banker's lender
     comparison in the toolkit; it never goes into fees, the proposal or anything the client sees. */
  function comp(){ const box = document.querySelector("pricing-calc-lender-compensation"); if (!box) return null;
    const t = String(box.innerText || box.textContent || ""); const m = /Lender Paid Compensation\s*\$?\s*([\d,]+(?:\.\d+)?)/i.exec(t.replace(/\s+/g, " "));
    return m ? { lenderPaid: money(m[1]) } : null; }
  let btn = null, toastEl = null;
  function toast(msg, ok){ if (toastEl) toastEl.remove(); toastEl = document.createElement("div"); toastEl.className = "nmc-rg-toast";
    toastEl.textContent = msg; toastEl.style.cssText = "position:fixed;right:18px;bottom:116px;z-index:2147483647;max-width:380px;background:" + (ok ? "#23242B" : "#8F3223") + ";color:#fff;padding:10px 14px;border-radius:10px;font:13px/1.4 system-ui,sans-serif;box-shadow:0 6px 20px rgba(0,0,0,.25)";
    document.body.appendChild(toastEl); setTimeout(() => { if (toastEl) { toastEl.remove(); toastEl = null; } }, 7000); }
  async function send(){
    const q = readQuote();
    if (!q || !(q.rate > 0)) return toast("Select a rate in the table first.", false);
    if (!(q.loanAmount > 0) || !(q.payment > 0)) return toast("Couldn’t read the loan amount or payment on this page.", false);
    if (/^ineligible/i.test(q.eligibility || "")) return toast("That rate is marked Ineligible — pick an eligible one.", false);
    btn.textContent = "Sending…";
    let r = null; try { r = await new Promise(res => chrome.runtime.sendMessage({ type: "nmc:quote", quote: q }, x => { void chrome.runtime.lastError; res(x || null); })); } catch (e) {}
    btn.textContent = "Send rate to NMC Toolkit";
    if (!r) return toast("Couldn’t reach the NMC Toolkit app — is it open?", false);
    if (!r.ok) return toast("Not sent: " + (r.error || "the toolkit said no"), false);
    toast(`Sent ${(q.adjustedRate || q.rate).toFixed(3)}% · $${q.payment.toFixed(2)}/mo to ${r.client}` + (r.warnings && r.warnings.length ? " — check the analysis: " + r.warnings[0] : ""), true); }
  function ensure(){
    if (!alive()){ if (btn){ btn.textContent = "NMC extension updated — reload page"; btn.onclick = () => location.reload(); } return false; }
    const on = /rocketpro\.com$/.test(location.hostname) && !!document.querySelector('[data-testid="pricing-table-ready"], tr.pro-nova-pricing-table__rate-row');
    if (!on){ if (btn){ btn.remove(); btn = null; } return true; }
    const has = !!selectedRow();
    if (!btn || !btn.isConnected){ btn = document.createElement("button"); btn.type = "button"; btn.className = "nmc-rg-btn"; btn.textContent = "Send rate to NMC Toolkit";
      btn.style.cssText = CSS + ";background:#2E6B4F;color:#fff;border:0;border-radius:999px;padding:10px 16px;font:600 13px system-ui,sans-serif;box-shadow:0 4px 14px rgba(0,0,0,.25);cursor:pointer";
      btn.onclick = send; document.body.appendChild(btn); }
    btn.style.opacity = has ? "1" : ".55"; btn.title = has ? "Send the selected rate to the client open in the NMC Toolkit" : "Select a rate in the table first";
    return true; }
  const timer = setInterval(() => { if (document.body && ensure() === false) clearInterval(timer); }, 1200); setTimeout(ensure, 600);
})();
