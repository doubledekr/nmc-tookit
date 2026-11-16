/* NMC page sensor (extension v0.8) — for lender sites the extension doesn't know by heart. It only runs on a site the banker allowed
   from the toolbar button (Chrome asks once per site), and it never acts by itself: the banker clicks the NMC button.
     · Send rate: finds a rate table (a table with a rate column and a payment column) and the selected row, plus labelled numbers on the
       page (loan amount, total fees). First time on a site — or whenever something isn't found — a panel shows what it read and lets
       the banker pick the right column / label; then it sends to the client open in the toolkit and saves that as the site's RECIPE.
     · Fill: finds the form's boxes by their labels and fills them from the client open in the toolkit, after the banker confirms which
       toolkit value goes in which box (also saved in the recipe).
   Recipes live in the toolkit (Settings → Lender page recipes), where a banker can copy one as a code and paste a teammate's.
   A recipe is just header / label TEXT to look for — never page code, selectors or client data. Read-only except when the banker fills. */
(function(){
  if (window !== window.top || window.__nmcSensor) return; window.__nmcSensor = true;
  const KNOWN = /(^|\.)(rocketpro\.com|optimalblue\.com|force\.com|salesforce\.com|salesforce-setup\.com)$/i;   /* built-in handling there */
  if (KNOWN.test(location.hostname)) return;
  const HOST = location.hostname.replace(/^www\./, "");
  const alive = () => { try { return !!(chrome.runtime && chrome.runtime.id); } catch (e) { return false; } };
  const send = msg => new Promise(res => { try { chrome.runtime.sendMessage(msg, r => { void chrome.runtime.lastError; res(r || null); }); } catch (e) { res(null); } });
  const T = el => el ? String(el.innerText || el.textContent || "").replace(/\s+/g, " ").trim() : "";
  const norm = s => String(s || "").toLowerCase().replace(/[\s*:]+/g, " ").trim();
  const num = s => { const str = String(s || ""); const m = str.replace(/,/g, "").match(/\d+(\.\d+)?/); if (!m) return null; const v = parseFloat(m[0]); if (!isFinite(v)) return null;
    return /-\s*\$?\s*\d|\$\s*-|\(\s*\$?\s*[\d,.]+\s*\)/.test(str) ? -v : v; };   /* "-$1,875.00", "$-1,875", "($1,875)" → negative */
  const visible = el => { try { return !!el && el.getClientRects().length > 0 && getComputedStyle(el).visibility !== "hidden"; } catch (e) { return false; } };
  const esc = s => String(s == null ? "" : s).replace(/[&<>"]/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));

  /* ---------- rate tables ---------- */
  function tables(){
    const out = [];
    for (const t of document.querySelectorAll("table, [role=table], [role=grid]")){
      if (!visible(t)) continue;
      let heads = [...t.querySelectorAll("thead th, [role=columnheader]")].map(T);
      const rows = [...t.querySelectorAll("tbody tr, [role=row]")].filter(r => r.querySelector("td, [role=cell], [role=gridcell]"));
      if (!heads.length){ const first = t.querySelector("tr"); if (first) heads = [...first.children].map(T); }
      if (heads.length < 2 || !rows.length) continue;
      const hn = heads.map(norm);
      if (!hn.some(h => /rate/.test(h)) || !hn.some(h => /payment|p ?& ?i|pmt|monthly/.test(h))) continue;
      out.push({ el: t, heads, rows, sig: hn.join("|") }); }
    return out; }
  const cellsOf = tr => [...tr.querySelectorAll(":scope > td, :scope > th, :scope > [role=cell], :scope > [role=gridcell]")];
  function selectedRow(tb){
    return tb.rows.find(r => r.querySelector("input[type=radio]:checked, input[type=checkbox]:checked"))
      || tb.rows.find(r => r.getAttribute("aria-selected") === "true" || r.querySelector('[aria-checked="true"], [aria-selected="true"]'))
      || tb.rows.find(r => /(^|[\s_-])(selected|is-selected|active|checked|highlight)/i.test(r.className || "")) || null; }
  const colIndex = (tb, head) => { if (!head) return -1; const n = norm(head); let i = tb.heads.findIndex(h => norm(h) === n); if (i < 0) i = tb.heads.findIndex(h => norm(h).startsWith(n)); return i; };
  const cellVal = (tb, tr, head) => { const i = colIndex(tb, head); if (i < 0 || !tr) return null; const c = cellsOf(tr)[i]; return c ? num(T(c)) : null; };
  function guessCols(tb){ const H = tb.heads, find = re => H.find(h => re.test(norm(h)));
    return { rate: find(/adjusted rate|note rate|interest rate/) || H.find(h => /rate/.test(norm(h)) && !/apr|base|lock/.test(norm(h))) || "",
      payment: find(/payment|p ?& ?i|pmt/) || "", apr: find(/^apr\b|\bapr$/) || "", cost: find(/\$ ?cost|price \$|credit|points \$|^\$/) || "" }; }

  /* ---------- labelled numbers on the page (loan amount, fees …) ---------- */
  function labelledNumbers(){
    const out = [], seen = new Set();
    for (const el of document.querySelectorAll("label, dt, th, span, div, p, td, strong, b, h4, h5, h6")){
      if (el.children.length > 2) continue; const t = T(el); if (t.length < 3 || t.length > 40 || /\d{3}/.test(t) || !/[a-z]/i.test(t)) continue;
      if (el.closest(".nmc-sn-panel, .nmc-sn-btn")) continue;
      const v = valueNear(el); if (v == null) continue; const k = norm(t); if (seen.has(k)) continue; seen.add(k);
      out.push({ label: t.replace(/[:*]\s*$/, ""), value: v }); if (out.length > 60) break; }
    return out; }
  function valueNear(el){
    const pick = s => { const m = String(s || "").match(/-?\$\s?-?[\d,]+(\.\d+)?|-?\b\d{1,3}(,\d{3})+(\.\d+)?\b|\b\d{4,7}(\.\d+)?\b/); return m ? num(m[0]) : null; };
    if (el.tagName === "LABEL" && el.htmlFor){ const i = document.getElementById(el.htmlFor); if (i && "value" in i) return pick(i.value); }
    const own = el.querySelector && el.querySelector("input, select"); if (own && "value" in own) return pick(own.value);
    let n = el.nextElementSibling; for (let k = 0; k < 2 && n; k++, n = n.nextElementSibling){ const i = n.matches("input, select") ? n : n.querySelector && n.querySelector("input"); const v = i && "value" in i ? pick(i.value) : pick(T(n)); if (v != null) return v; }
    const p = el.parentElement; if (p && T(p).length < 80){ const rest = T(p).slice(T(el).length); const v = pick(rest); if (v != null) return v; }
    return null; }
  const findNumber = (pairs, label, re) => { if (label){ const n = norm(label); const x = pairs.find(p => norm(p.label) === n) || pairs.find(p => norm(p.label).startsWith(n)); return x ? x.value : null; }
    const x = pairs.find(p => re.test(norm(p.label))); return x ? x.value : null; };

  /* ---------- form fields (Fill) ---------- */
  const FILL_KEYS = [["first", "First name", /first name|borrower first|^first$/], ["last", "Last name", /last name|borrower last|^last$|surname/], ["fico", "Credit score / FICO", /fico|credit score|qualifying score|representative score|^score$/],
    ["value", "Property value", /property value|appraised value|home value|estimated value|^value$/], ["balance", "Current loan balance / payoff", /current (loan |mortgage )?balance|payoff|unpaid principal|first mortgage balance|existing (loan|lien)/],
    ["loanAmount", "New loan amount", /loan amount|base loan|new loan|total loan/], ["cashOut", "Cash out", /cash ?out|cash to borrower/], ["street", "Street", /street|address line ?1|property address|^address$/],
    ["city", "City", /^city|property city/], ["state", "State", /^state|property state/], ["zip", "ZIP code", /zip|postal/], ["term", "Term (years)", /term|amortization/],
    ["phone", "Phone", /phone|mobile|cell/], ["email", "Email", /e-?mail/]];
  /* boxes the sensor never fills or offers — the banker types these by hand: SSN / tax ID, employer / employment, income */
  const HAND_ONLY = /\bssn\b|social security|tax ?id|\bitin\b|\bein\b|employer|employment|occupation|job title|income|salary|wages/;
  const phoneDigits = v => { let d = String(v || "").replace(/\D/g, ""); if (d.length === 11 && d[0] === "1") d = d.slice(1); return d.length === 10 ? d : null; };
  function fieldLabel(el){
    if (el.id){ const l = document.querySelector(`label[for="${(window.CSS && CSS.escape) ? CSS.escape(el.id) : el.id}"]`); if (l && T(l)) return T(l); }
    if (el.getAttribute("aria-label")) return el.getAttribute("aria-label").trim();
    const lb = el.getAttribute("aria-labelledby"); if (lb){ const l = document.getElementById(lb.split(/\s+/)[0]); if (l && T(l)) return T(l); }
    const wrap = el.closest("label"); if (wrap){ const t = T(wrap).replace(T(el), "").trim(); if (t) return t; }
    if (el.placeholder) return el.placeholder.trim();
    let p = el.previousElementSibling; if (p && T(p) && T(p).length < 50) return T(p);
    const par = el.parentElement; if (par && par.previousElementSibling && T(par.previousElementSibling).length < 50 && T(par.previousElementSibling)) return T(par.previousElementSibling);
    return el.name || ""; }
  function formFields(){
    return [...document.querySelectorAll("input:not([type=hidden]):not([type=checkbox]):not([type=radio]):not([type=submit]):not([type=button]), select, textarea")]
      .filter(el => visible(el) && !el.disabled && !el.readOnly && !el.closest(".nmc-sn-panel"))
      .map(el => ({ el, label: fieldLabel(el).replace(/[:*]\s*$/, "").slice(0, 60) })).filter(f => f.label && !HAND_ONLY.test(norm(f.label)) && !HAND_ONLY.test(norm(f.el.name || f.el.id || ""))); }
  function setValue(el, v){
    if (el.tagName === "SELECT"){ const want = norm(v); const o = [...el.options].find(o => norm(o.textContent) === want || norm(o.value) === want) || [...el.options].find(o => norm(o.textContent).startsWith(want));
      if (!o) return false; el.value = o.value; el.dispatchEvent(new Event("input", { bubbles: true })); el.dispatchEvent(new Event("change", { bubbles: true })); return true; }
    const proto = el.tagName === "TEXTAREA" ? HTMLTextAreaElement.prototype : HTMLInputElement.prototype;
    el.focus(); Object.getOwnPropertyDescriptor(proto, "value").set.call(el, String(v)); el.dispatchEvent(new Event("input", { bubbles: true })); el.dispatchEvent(new Event("change", { bubbles: true })); el.blur();
    return true; }

  /* ---------- UI ---------- */
  const SIDE = "right:18px";
  let btn = null, menu = null, panel = null, recipe = null, gotRecipe = false;
  function toast(msg, ok){ const t = document.createElement("div"); t.className = "nmc-sn-toast"; t.textContent = msg;
    t.style.cssText = `position:fixed;${SIDE};bottom:72px;z-index:2147483647;max-width:400px;background:${ok ? "#23242B" : "#8F3223"};color:#fff;padding:10px 14px;border-radius:10px;font:13px/1.4 system-ui,sans-serif;box-shadow:0 6px 20px rgba(0,0,0,.25)`;
    document.body.appendChild(t); setTimeout(() => t.remove(), 7000); }
  function closeAll(){ if (menu){ menu.remove(); menu = null; } if (panel){ panel.remove(); panel = null; } }
  function box(html){ closeAll(); panel = document.createElement("div"); panel.className = "nmc-sn-panel";
    panel.style.cssText = `position:fixed;${SIDE};bottom:66px;z-index:2147483647;width:360px;max-height:70vh;overflow:auto;background:#FBF8F2;border:1px solid #D9D3C6;border-radius:12px;padding:14px;box-shadow:0 10px 30px rgba(0,0,0,.25);font:13px/1.45 system-ui,sans-serif;color:#23242B`;
    panel.innerHTML = html; document.body.appendChild(panel); return panel; }
  const opt = (list, cur, none) => (none ? `<option value="">${esc(none)}</option>` : "") + list.map(x => `<option${norm(x) === norm(cur) ? " selected" : ""}>${esc(x)}</option>`).join("");
  const row = (label, inner) => `<div style="display:grid;grid-template-columns:118px 1fr;gap:6px;align-items:center;margin:5px 0"><span style="color:#5C616E">${label}</span>${inner}</div>`;
  const SEL = 'style="width:100%;padding:4px 6px;border:1px solid #D9D3C6;border-radius:6px;font:12.5px system-ui;background:#fff"';
  const BTN = (a, t, ghost) => `<button data-a="${a}" style="border:${ghost ? "1px solid #D9D3C6" : "0"};background:${ghost ? "#fff" : "#2E6B4F"};color:${ghost ? "#23242B" : "#fff"};border-radius:8px;padding:8px 12px;font:600 12.5px system-ui;cursor:pointer;margin-right:6px">${t}</button>`;
  async function loadRecipe(){ const r = await send({ type: "nmc:recipe", op: "get", host: HOST }); gotRecipe = !!(r && r.ok); recipe = (r && r.recipe) || {}; return recipe; }
  const money = v => v == null ? "—" : (v < 0 ? "−$" : "$") + Math.abs(v).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 });

  /* Send rate */
  function readRate(R){
    const tbs = tables(); if (!tbs.length) return { err: "No rate table found on this page" };
    const tb = (R && R.table && tbs.find(t => t.sig === R.table)) || tbs.find(t => selectedRow(t)) || tbs[0];
    const tr = selectedRow(tb); const g = guessCols(tb); const cols = Object.assign({}, g, R && R.cols ? R.cols : {});
    const pairs = labelledNumbers();
    const q = { lender: (R && R.name) || HOST, product: (R && R.product) || document.title.slice(0, 80), term: (R && R.term) || null,
      rate: cellVal(tb, tr, cols.rate), payment: cellVal(tb, tr, cols.payment), aprTyped: cols.apr ? cellVal(tb, tr, cols.apr) : null, costDollars: cols.cost ? cellVal(tb, tr, cols.cost) : null,
      loanAmount: findNumber(pairs, R && R.loanLabel, /loan amount|base loan|total loan/), totalFees: (R && R.feesLabel === "") ? null : findNumber(pairs, R && R.feesLabel, /total (closing )?(fees|costs)|estimated closing costs/) };
    return { tb, tr, cols, pairs, q }; }
  function ratePanel(){ const R = recipe && recipe.rate; const x = readRate(R);
    if (x.err) return box(`<b style="color:#8F3223">${esc(x.err)}</b><div style="color:#5C616E;margin-top:4px">Price a scenario so the rates show, select one, then click NMC again.</div><div style="margin-top:8px">${BTN("x", "Close", true)}</div>`).onclick = e => { if (e.target.dataset.a) closeAll(); };
    const pl = x.pairs.map(p => p.label);
    const p = box(`<div style="font-weight:700;color:#2E6B4F;font-size:14px">Send this rate to the NMC Toolkit</div>
      <div style="color:#5C616E;margin:2px 0 8px">${R ? "Using this site’s recipe — change anything that’s off." : "First time on " + esc(HOST) + " — check what I read, fix anything that’s off. It’s remembered for next time."}</div>
      ${x.tr ? "" : `<div style="color:#8F3223;margin-bottom:6px"><b>Select a rate in the table first</b>, then click NMC again.</div>`}
      ${row("Note rate column", `<select data-k="rate" ${SEL}>${opt(x.tb.heads, x.cols.rate, "—")}</select>`)}
      ${row("Payment column", `<select data-k="payment" ${SEL}>${opt(x.tb.heads, x.cols.payment, "—")}</select>`)}
      ${row("APR column", `<select data-k="apr" ${SEL}>${opt(x.tb.heads, x.cols.apr, "none on this page")}</select>`)}
      ${row("Cost / credit $", `<select data-k="cost" ${SEL}>${opt(x.tb.heads, x.cols.cost, "none")}</select>`)}
      ${row("Loan amount", `<select data-k="loanLabel" ${SEL}>${opt(pl, (R && R.loanLabel) || (x.pairs.find(p => /loan amount|base loan|total loan/.test(norm(p.label))) || {}).label, "— pick the label —")}</select>`)}
      ${row("Total fees", `<select data-k="feesLabel" ${SEL}>${opt(pl, (R && R.feesLabel) || (x.pairs.find(p => /total (closing )?(fees|costs)|estimated closing costs/.test(norm(p.label))) || {}).label, "none / not shown")}</select>`)}
      ${row("Term", `<select data-k="term" ${SEL}>${opt(["30", "25", "20", "15", "10"], String((R && R.term) || (/(\d{2})\s*(yr|year)/i.exec(document.body.innerText || "") || [])[1] || "30"))}</select>`)}
      <div data-k="preview" style="background:#fff;border:1px solid #E5E0D5;border-radius:8px;padding:8px;margin:8px 0;font-size:12.5px"></div>
      <div>${BTN("send", "Send to toolkit")}${BTN("x", "Cancel", true)}</div>`);
    const cur = () => { const s = k => p.querySelector(`[data-k="${k}"]`).value;
      return { table: x.tb.sig, cols: { rate: s("rate"), payment: s("payment"), apr: s("apr"), cost: s("cost") }, loanLabel: s("loanLabel"), feesLabel: s("feesLabel"), term: +s("term"), name: (R && R.name) || HOST }; };
    const preview = () => { const y = readRate(cur()); const q = y.q; p.querySelector('[data-k="preview"]').innerHTML = y.tr ? `Rate <b>${q.rate != null ? q.rate.toFixed(3) + "%" : "—"}</b> · Payment <b>${money(q.payment)}</b>${q.aprTyped != null ? " · APR " + q.aprTyped.toFixed(3) + "%" : ""}<br>Loan <b>${money(q.loanAmount)}</b> · Fees ${money(q.totalFees)}${q.costDollars != null ? " · Cost/credit " + money(q.costDollars) : ""} · ${q.term || ""} yrs` : "No row selected."; return y; };
    p.addEventListener("change", preview); preview();
    p.onclick = async e => { const a = e.target.dataset.a; if (!a) return; if (a === "x") return closeAll();
      const rc = cur(); const y = preview(); if (!y.tr) return toast("Select a rate in the table first.", false);
      if (!(y.q.rate > 0) || !(y.q.payment > 0) || !(y.q.loanAmount > 0)) return toast("Need a rate, a payment and a loan amount — pick the right column / label.", false);
      await sendQuote(y.q, rc); }; }
  async function sendQuote(q, rc){
    q.term = rc.term || q.term || 30; q.lender = rc.name || HOST; q.fees = []; q.pulledAt = new Date().toISOString(); q.source = "recipe";
    const r = await send({ type: "nmc:quote", quote: q });
    if (!r) return toast("Couldn’t reach the NMC Toolkit app — is it open?", false);
    if (!r.ok) return toast("Not sent: " + (r.error || "the toolkit said no"), false);
    await send({ type: "nmc:recipe", op: "save", host: HOST, kind: "rate", recipe: rc }); recipe = Object.assign({}, recipe, { rate: rc });
    closeAll(); toast(`Sent ${q.rate.toFixed(3)}% · ${money(q.payment)}/mo to ${r.client}` + (r.warnings && r.warnings.length ? " — check the analysis: " + r.warnings[0] : ""), true); }
  async function quickRate(){ await loadRecipe(); const R = recipe && recipe.rate;
    if (!R) return ratePanel();
    const y = readRate(R); if (y.err || !y.tr || !(y.q.rate > 0) || !(y.q.payment > 0) || !(y.q.loanAmount > 0)) return ratePanel();   /* something moved: show the panel */
    await sendQuote(y.q, R); }

  /* Fill */
  async function fillPanel(){
    await loadRecipe(); const F = (recipe && recipe.fill) || {};
    const c = await send({ type: "nmc:client" }); if (!c || !c.ok || !c.client) return toast("Open a client in the NMC Toolkit first" + (c && c.error ? " (" + c.error + ")" : ""), false);
    const p0 = c.client, addr = p0.address || {};
    const vals = { first: p0.first, last: p0.last, fico: p0.fico, value: p0.value, balance: p0.balance, loanAmount: null, cashOut: p0.cashOut || null, street: addr.street, city: addr.city, state: addr.state, zip: addr.zip, term: p0.term, phone: phoneDigits(p0.phone), email: p0.email || null };
    const fields = formFields(); if (fields.length < 2) return toast("No form boxes found on this page.", false);
    const labels = [...new Set(fields.map(f => f.label))];
    const guess = k => { if (F[k] !== undefined) return F[k]; const re = (FILL_KEYS.find(x => x[0] === k) || [])[2]; const f = re && fields.find(f => re.test(norm(f.label))); return f ? f.label : ""; };
    const p = box(`<div style="font-weight:700;color:#2E6B4F;font-size:14px">Fill from ${esc(p0.name || "the open client")}</div>
      <div style="color:#5C616E;margin:2px 0 8px">${Object.keys(F).length ? "Using this site’s recipe — change anything that’s off." : "First time on " + esc(HOST) + " — match each value to a box (leave blank to skip). It’s remembered for next time."}</div>
      ${FILL_KEYS.filter(([k]) => vals[k] != null && vals[k] !== "").map(([k, name]) => row(`${esc(name)}<br><span style="font-size:11px">${esc(String(vals[k]))}</span>`, `<select data-k="${k}" ${SEL}>${opt(labels, guess(k), "— skip —")}</select>`)).join("")}
      <div style="margin-top:8px">${BTN("fill", "Fill these boxes")}${BTN("x", "Cancel", true)}</div>`);
    p.onclick = e => { const a = e.target.dataset.a; if (!a) return; if (a === "x") return closeAll();
      const rc = {}; let n = 0; const missed = [];
      for (const sel of p.querySelectorAll("select[data-k]")){ const k = sel.dataset.k; rc[k] = sel.value; if (!sel.value) continue;
        const f = formFields().find(f => norm(f.label) === norm(sel.value)); if (f && setValue(f.el, vals[k])){ n++; f.el.style.outline = "2px solid #2E6B4F"; } else missed.push(sel.value); }
      send({ type: "nmc:recipe", op: "save", host: HOST, kind: "fill", recipe: rc }); recipe = Object.assign({}, recipe, { fill: rc });
      closeAll(); toast(`Filled ${n} box${n === 1 ? "" : "es"} from ${p0.name}${missed.length ? " — couldn’t fill: " + missed.join(", ") : ""}. Check it over before you continue.`, !missed.length); }; }

  /* the NMC button: shows only when this page has a rate table or a form */
  function ensure(){
    if (!alive()){ if (btn) btn.remove(); return false; }
    const hasRates = tables().length > 0, hasForm = formFields().length >= 3;
    if (!hasRates && !hasForm){ if (btn){ btn.remove(); btn = null; closeAll(); } return true; }
    if (!btn || !btn.isConnected){ btn = document.createElement("button"); btn.type = "button"; btn.className = "nmc-sn-btn"; btn.textContent = "NMC";
      btn.title = "NMC Toolkit — send the selected rate or fill this form";
      btn.style.cssText = `position:fixed;${SIDE};bottom:18px;z-index:2147483646;background:#A53222;color:#fff;border:0;border-radius:999px;padding:10px 16px;font:700 13px system-ui,sans-serif;box-shadow:0 4px 14px rgba(0,0,0,.25);cursor:pointer`;
      btn.onclick = () => { if (menu || panel) return closeAll();
        const r = tables().length > 0, f = formFields().length >= 3;
        if (r && !f) return quickRate(); if (f && !r) return fillPanel();
        menu = document.createElement("div"); menu.className = "nmc-sn-panel";
        menu.style.cssText = `position:fixed;${SIDE};bottom:66px;z-index:2147483647;background:#fff;border:1px solid #D9D3C6;border-radius:10px;padding:6px;box-shadow:0 10px 30px rgba(0,0,0,.2);font:13px system-ui`;
        menu.innerHTML = `<div data-a="rate" style="padding:8px 12px;cursor:pointer">Send the selected rate</div><div data-a="fill" style="padding:8px 12px;cursor:pointer">Fill this form from the toolkit</div>`;
        menu.onclick = e => { const a = e.target.dataset.a; if (a === "rate") { closeAll(); quickRate(); } if (a === "fill") { closeAll(); fillPanel(); } };
        document.body.appendChild(menu); };
      document.body.appendChild(btn); }
    return true; }
  const timer = setInterval(() => { if (document.body && ensure() === false) clearInterval(timer); }, 1500); setTimeout(ensure, 500);
  try { chrome.runtime.onMessage.addListener((m, s, reply) => { if (m && m.type === "nmc:sensor"){ ensure(); if (m.do === "rate") quickRate(); if (m.do === "fill") fillPanel(); reply({ ok: true }); } }); } catch (e) {}
})();
