/* NMC Toolkit — lender autofill.
   On a lender pricing page (Rocket Pro "New Scenario", Village Capital's Optimal Blue quick price inside TPO Connect) this shows a
   "Fill from NMC Toolkit" button. It asks the toolkit app on this computer for the client selected there, then types/selects like a
   person would. It fills and stops — it never clicks Price / Submit. Filled fields get a green outline, ones it couldn't fill amber.
   Each site is recognised by its form, not just its address, so it also works inside TPO Connect's pricing frame. */
(() => {
  if (window.__nmcLenderFill) return; window.__nmcLenderFill = true;

  const sleep = ms => new Promise(r => setTimeout(r, ms));
  const norm = s => String(s == null ? "" : s).replace(/\s+/g, " ").trim().toLowerCase();
  const digits = s => String(s == null ? "" : s).replace(/[^\d]/g, "");
  const has = v => v !== null && v !== undefined && v !== "" && !(typeof v === "number" && !isFinite(v));
  const plus = (a, b) => has(a) ? Math.round(+a + b) : null;
  function visible(el){ if (!el || !el.isConnected) return false; if (el.closest(".sprk-u-Display--none")) return false;
    const r = el.getBoundingClientRect(); return (r.width > 0 || r.height > 0) && getComputedStyle(el).visibility !== "hidden"; }
  async function waitFor(fn, ms = 4000){ const end = Date.now() + ms; let v; while (Date.now() < end){ try { v = fn(); } catch (e) { v = null; } if (v) return v; await sleep(120); } return null; }
  function mark(el, ok){ if (!el) return; el.style.setProperty("outline", "2px solid " + (ok ? "#2E8B57" : "#E0A100"), "important"); el.style.setProperty("outline-offset", "1px", "important"); el.dataset.nmcFilled = ok ? "1" : "0"; }
  function clearMarks(){ document.querySelectorAll("[data-nmc-filled]").forEach(el => { el.style.removeProperty("outline"); el.style.removeProperty("outline-offset"); delete el.dataset.nmcFilled; }); }

  /* ---------- low-level fillers ---------- */
  function setNative(el, v){ const proto = el instanceof HTMLSelectElement ? HTMLSelectElement.prototype : el instanceof HTMLTextAreaElement ? HTMLTextAreaElement.prototype : HTMLInputElement.prototype;
    Object.getOwnPropertyDescriptor(proto, "value").set.call(el, v); }
  function blurIt(el){ const was = document.activeElement === el; el.blur(); if (!was){ el.dispatchEvent(new FocusEvent("blur")); el.dispatchEvent(new FocusEvent("focusout", { bubbles: true })); } }
  /* plain inputs (Angular forms listen for "input") */
  async function typeText(el, v){ el.focus(); setNative(el, String(v)); el.dispatchEvent(new Event("input", { bubbles: true })); el.dispatchEvent(new Event("change", { bubbles: true })); blurIt(el); await sleep(60); return norm(el.value) !== "" || String(v) === ""; }
  /* PrimeNG InputNumber (Optimal Blue): it ignores a value that's just set, so key the digits in through its keypress handler, then blur so it
     parses and saves. If that version of PrimeNG doesn't take keypresses, fall back to setting the value and blurring. */
  async function typeNumber(el, v){ const want = digits(Math.round(+v)); el.focus();
    setNative(el, ""); el.dispatchEvent(new Event("input", { bubbles: true }));
    for (const ch of want){ const code = ch.charCodeAt(0);
      el.dispatchEvent(new KeyboardEvent("keydown", { key: ch, code: "Digit" + ch, keyCode: code, which: code, bubbles: true, cancelable: true }));
      el.dispatchEvent(new KeyboardEvent("keypress", { key: ch, code: "Digit" + ch, keyCode: code, which: code, charCode: code, bubbles: true, cancelable: true }));
      el.dispatchEvent(new KeyboardEvent("keyup", { key: ch, code: "Digit" + ch, keyCode: code, which: code, bubbles: true, cancelable: true })); }
    if (digits(el.value).replace(/^0+(?=\d)/, "") !== want.replace(/^0+(?=\d)/, "")){ setNative(el, want); el.dispatchEvent(new Event("input", { bubbles: true })); }
    blurIt(el); await sleep(80);
    return digits(el.value).replace(/^0+(?=\d)/, "") === want.replace(/^0+(?=\d)/, ""); }
  function pickOption(opts, wants, textOf){ const W = wants.map(norm);
    for (const w of W){ const o = opts.find(o => norm(textOf(o)) === w); if (o) return o; }
    for (const w of W){ const o = opts.find(o => norm(textOf(o)).startsWith(w)); if (o) return o; }
    for (const w of W){ if (w.length < 3) continue; const o = opts.find(o => norm(textOf(o)).includes(w)); if (o) return o; }
    return null; }
  /* native <select> (Rocket Pro) — waits for the options to load (Loan Type fills in after Loan Purpose) */
  async function chooseNative(el, wants){ const ok = await waitFor(() => !el.disabled && el.options.length > 1 && pickOption([...el.options], wants, o => o.textContent), 3500);
    if (!ok) return false; const o = pickOption([...el.options], wants, o => o.textContent);
    el.focus(); setNative(el, o.value); el.dispatchEvent(new Event("input", { bubbles: true })); el.dispatchEvent(new Event("change", { bubbles: true })); blurIt(el); await sleep(150); return el.value === o.value; }
  /* PrimeNG <p-select> (Optimal Blue): open it, click the option in the overlay */
  async function choosePrime(root, wants){ const label = root.querySelector(".p-select-label") || root;
    const now = norm(label.textContent); if (wants.some(w => norm(w) === now)) return true;
    const open = () => { root.dispatchEvent(new MouseEvent("mousedown", { bubbles: true })); root.click(); };
    open(); let list = await waitFor(() => { const ul = document.querySelector(".p-select-overlay [role=listbox], .p-select-list, [role=listbox]"); return ul && ul.querySelector("[role=option]") ? ul : null; }, 2000);
    if (!list){ open(); list = await waitFor(() => document.querySelector(".p-select-overlay [role=listbox], [role=listbox]"), 1500); }
    if (!list) return false;
    const opts = [...list.querySelectorAll("[role=option]")]; const o = pickOption(opts, wants, o => o.getAttribute("aria-label") || o.textContent);
    if (!o){ document.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", bubbles: true })); label.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", code: "Escape", bubbles: true })); await sleep(100); return false; }
    o.scrollIntoView({ block: "nearest" }); o.dispatchEvent(new MouseEvent("mousedown", { bubbles: true })); o.click(); await sleep(200);
    return pickOption([{ t: label.textContent }], wants, x => x.t) != null; }
  async function clickRadio(el){ if (!el.checked){ el.click(); await sleep(150); } if (!el.checked){ el.checked = true; el.dispatchEvent(new Event("change", { bubbles: true })); } return el.checked; }

  /* ---------- site definitions ----------
     A step: { label, find: () => element, kind: "text"|"number"|"native"|"prime"|"radio", value, wait } — a step whose value is missing is
     listed as "needs you"; a step with skip:true is left alone silently (it doesn't apply to this product). */
  const VA = p => p.product === "va_irrrl", FHA = p => p.product === "fha_streamline", CASH = p => p.product === "cashout" || p.product === "fc";
  const rq = sel => () => document.querySelector(sel);
  const SITES = {
    rocket: {
      name: "Rocket Pro",
      detect: () => document.querySelector('[data-id="input-loan.purpose"]'),
      steps: p => { const rid = k => rq(`[data-id="input-${k}"]`), rad = (k, yes) => rq(`[data-id="radio-input-${k}-${yes ? "true" : "false"}"]`);
        const type = VA(p) ? ["VA"] : FHA(p) ? ["FHA"] : p.currentLoanType === "VA" ? ["VA"] : p.currentLoanType === "FHA" ? ["FHA"] : ["Conventional", "Conforming"];
        return [
          { label: "FICO score", find: rid("ficoScore"), kind: "text", value: p.fico },
          { label: "VantageScore", find: rid("vantageScore"), kind: "text", value: p.fico },
          { label: "Monthly income", find: rid("client.monthlyIncome"), kind: "text", value: 15000 },
          { label: "Loan purpose", find: rid("loan.purpose"), kind: "native", value: CASH(p) ? ["Refinance - Cash Out"] : ["Refinance - Rate/Term"] },
          { label: "Loan channel", find: rid("loan.channel"), kind: "native", value: ["Correspondent"] },
          { label: "Loan type", find: rid("loan.type"), kind: "native", value: type, wait: 3500 },
          { label: "First mortgage balance", find: rid("loan.currentFirstMortgage.balance"), kind: "text", value: p.balance, wait: 2500 },
          { label: "Previously had a VA loan", find: rad("client.va.hadPriorVALoan", true), kind: "radio", value: true, skip: type[0] !== "VA", wait: 2500 },
          { label: "Refinancing an FHA loan", find: rad("client.hasPriorFHALoan", true), kind: "radio", value: true, skip: !FHA(p), wait: 2500 },
          { label: "Property value", find: rid("property.value"), kind: "text", value: VA(p) ? plus(p.balance, 100000) : p.value, wait: 2500 },
          { label: "Second mortgage / HELOC", find: rad("loan.hasSecondMortgage", false), kind: "radio", value: false, wait: 2500 },
          { label: "ZIP code", find: rid("property.address.zipCode"), kind: "text", value: p.address && p.address.zip },
        ]; },
    },
    village: {
      name: "Village Capital (Optimal Blue)",
      detect: () => document.querySelector('input[name="representativeFico"]') && document.querySelector('p-select[name="leadSource"]'),
      steps: p => { const inp = n => rq(`input[name="${n}"]`), sel = n => rq(`p-select[name="${n}"]`), a = p.address || {};
        return [
          { label: "Borrower first name", find: inp("firstName"), kind: "text", value: p.first },
          { label: "Borrower last name", find: inp("lastName"), kind: "text", value: p.last },
          { label: "Representative credit score", find: inp("representativeFico"), kind: "number", value: p.fico },
          { label: "Base loan amount", find: inp("baseLoanAmount"), kind: "number", value: VA(p) ? plus(p.balance, 5000) : null, skip: !VA(p) },
          { label: "Purchase price", find: inp("salesAmount"), kind: "number", value: VA(p) ? p.balance : null, skip: !VA(p) },
          { label: "Appraised value", find: inp("appraisedValue"), kind: "number", value: VA(p) ? plus(p.balance, 100000) : p.value },
          { label: "Cash-out amount", find: inp("cashOutAmount"), kind: "number", value: p.cashOut, skip: !CASH(p) || !(p.cashOut > 0) },
          { label: "DTI ratio", find: inp("loanLevelDebtToIncomeRatio"), kind: "number", value: 0, skip: !VA(p) },
          { label: "Lead source", find: sel("leadSource"), kind: "prime", value: ["VA"], skip: !VA(p) },
          { label: "Property address", find: inp("propertyStreetAddress"), kind: "text", value: a.street },
          { label: "Property city", find: inp("city"), kind: "text", value: a.city },
          { label: "Property state", find: sel("state"), kind: "prime", value: a.state ? [STATE_NAMES[a.state] || a.state, a.state] : null },
          { label: "Property ZIP", find: inp("zipCode"), kind: "text", value: a.zip },
        ]; },
    },
  };
  const STATE_NAMES = { AL:"Alabama",AK:"Alaska",AZ:"Arizona",AR:"Arkansas",CA:"California",CO:"Colorado",CT:"Connecticut",DE:"Delaware",DC:"District of Columbia",FL:"Florida",GA:"Georgia",HI:"Hawaii",ID:"Idaho",IL:"Illinois",IN:"Indiana",IA:"Iowa",KS:"Kansas",KY:"Kentucky",LA:"Louisiana",ME:"Maine",MD:"Maryland",MA:"Massachusetts",MI:"Michigan",MN:"Minnesota",MS:"Mississippi",MO:"Missouri",MT:"Montana",NE:"Nebraska",NV:"Nevada",NH:"New Hampshire",NJ:"New Jersey",NM:"New Mexico",NY:"New York",NC:"North Carolina",ND:"North Dakota",OH:"Ohio",OK:"Oklahoma",OR:"Oregon",PA:"Pennsylvania",RI:"Rhode Island",SC:"South Carolina",SD:"South Dakota",TN:"Tennessee",TX:"Texas",UT:"Utah",VT:"Vermont",VA:"Virginia",WA:"Washington",WV:"West Virginia",WI:"Wisconsin",WY:"Wyoming" };
  const PRODUCTS = [["va_irrrl", "VA Streamline (IRRRL)"], ["refi", "Refinance — rate & term"], ["cashout", "Cash-out refinance"], ["fha_streamline", "FHA Streamline"]];

  async function runFill(site, p){ clearMarks(); const done = [], need = [];
    for (const st of site.steps(p)){ if (st.skip) continue;
      if (!has(st.value) || (Array.isArray(st.value) && !st.value.length)){ const el = st.find(); if (el && visible(el)) mark(el.closest("p-select") || el, false); need.push(st.label); continue; }
      const shown = e => visible(st.kind === "radio" ? (e.closest(".sprk-b-SelectionContainer") || e.parentElement) : e);   /* styled radios hide the real input */
      const el = await waitFor(() => { const e = st.find(); return e && shown(e) ? e : null; }, st.wait || 1200);
      if (!el){ need.push(st.label); continue; }
      let ok = false;
      try { ok = st.kind === "text" ? await typeText(el, st.value) : st.kind === "number" ? await typeNumber(el, st.value) : st.kind === "native" ? await chooseNative(el, st.value)
        : st.kind === "prime" ? await choosePrime(el, st.value) : st.kind === "radio" ? await clickRadio(el) : false; } catch (e) { ok = false; }
      const box = st.kind === "radio" ? (el.closest("fieldset") || el.parentElement) : el;
      mark(box, ok); (ok ? done : need).push(st.label); }
    return { done, need }; }

  /* ---------- UI: floating button + small panel (only in the frame that holds the form) ---------- */
  const CSS = "position:fixed;right:18px;bottom:18px;z-index:2147483646;font:13px system-ui,sans-serif;color:#23242B";
  let btn = null, panel = null, busy = false;
  const alive = () => { try { return !!(chrome.runtime && chrome.runtime.id); } catch (e) { return false; } };
  function ask(){ return new Promise(res => { try { chrome.runtime.sendMessage({ type: "nmc:client" }, r => { if (chrome.runtime.lastError) res({ ok: false, error: "Reload this page — the NMC extension was updated" }); else res(r || { ok: false, error: "no answer" }); }); } catch (e) { res({ ok: false, error: "Reload this page — the NMC extension was updated" }); } }); }
  const esc = s => String(s == null ? "" : s).replace(/[&<>"]/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));
  const money = v => has(v) ? "$" + Math.round(+v).toLocaleString() : "—";
  function closePanel(){ if (panel){ panel.remove(); panel = null; } }
  function showPanel(html){ closePanel(); panel = document.createElement("div"); panel.className = "nmc-lf-panel";
    panel.style.cssText = CSS + ";bottom:66px;width:300px;background:#FBF8F2;border:1px solid #D9D3C6;border-radius:12px;padding:14px;box-shadow:0 10px 30px rgba(0,0,0,.25)";
    panel.innerHTML = html; document.body.appendChild(panel); return panel; }
  const B = (id, txt, ghost) => `<button data-a="${id}" style="border:${ghost ? "1px solid #D9D3C6" : "0"};background:${ghost ? "#fff" : "#A53222"};color:${ghost ? "#23242B" : "#fff"};border-radius:8px;padding:8px 12px;font:600 12.5px system-ui;cursor:pointer;margin:8px 6px 0 0">${txt}</button>`;
  async function onClick(site){ if (busy) return; if (panel){ closePanel(); return; }
    showPanel(`<div style="color:#5C616E">Asking the NMC Toolkit for the selected client…</div>`);
    const r = await ask();
    if (!r || !r.ok){ showPanel(`<b style="color:#A53222">Can’t fill yet</b><div style="margin-top:6px">${esc(r && r.error || "The toolkit app isn’t reachable")}</div>${B("x", "Close", true)}`).onclick = e => { if (e.target.dataset.a) closePanel(); }; return; }
    const p = r.client; let prod = PRODUCTS.some(x => x[0] === p.product) ? p.product : (p.product === "fc" ? "cashout" : "refi");
    const pn = showPanel(`<div style="font-weight:700;color:#A53222;font-size:14px">${esc(p.name || "Client")}</div>
      <div style="color:#5C616E;margin:2px 0 8px">Balance ${money(p.balance)} · FICO ${esc(p.fico || "—")} · ${esc(site.name)}</div>
      <label style="font-size:12px;color:#5C616E">Fill as <span style="opacity:.8">(from the ${p.productFrom === "proposal" ? "proposal" : "savings analysis"})</span></label>
      <select data-k="prod" style="width:100%;margin-top:3px;padding:6px;border:1px solid #D9D3C6;border-radius:6px;font:13px system-ui">${PRODUCTS.map(([k, l]) => `<option value="${k}" ${k === prod ? "selected" : ""}>${l}</option>`).join("")}</select>
      <div>${B("fill", "Fill this page")}${B("x", "Cancel", true)}</div>
      <div data-k="res" style="margin-top:8px;font-size:12.5px"></div>`);
    pn.onclick = async e => { const a = e.target.dataset.a; if (a === "x"){ closePanel(); return; }
      if (a === "fill" && !busy){ busy = true; e.target.textContent = "Filling…"; prod = pn.querySelector("[data-k=prod]").value;
        const res = await runFill(site, Object.assign({}, p, { product: prod })); busy = false; e.target.textContent = "Fill again";
        pn.querySelector("[data-k=res]").innerHTML = `<div style="color:#2E6B4F"><b>${res.done.length}</b> filled — outlined green.</div>` +
          (res.need.length ? `<div style="color:#8a6400;margin-top:4px"><b>Needs you</b> (amber): ${res.need.map(esc).join(", ")}</div>` : "") +
          `<div style="color:#5C616E;margin-top:4px">Check it over, then price it yourself.</div>`; } }; }
  function ensure(){ if (!alive()){ if (btn){ btn.textContent = "NMC extension updated — reload page"; btn.style.background = "#8F3223"; btn.onclick = () => location.reload(); } return false; }
    const key = Object.keys(SITES).find(k => SITES[k].detect()); const site = key && SITES[key];
    if (!site){ if (btn){ btn.remove(); btn = null; closePanel(); } return true; }
    if (!btn || !btn.isConnected){ btn = document.createElement("button"); btn.type = "button"; btn.className = "nmc-lf-btn"; btn.textContent = "Fill from NMC Toolkit";
      btn.style.cssText = CSS + ";background:#A53222;color:#fff;border:0;border-radius:999px;padding:10px 16px;font:600 13px system-ui,sans-serif;box-shadow:0 4px 14px rgba(0,0,0,.25);cursor:pointer";
      document.body.appendChild(btn); }
    btn.onclick = () => onClick(site); return true; }
  /* single-page apps: the form appears and disappears without a page load, so keep checking */
  const tick = () => { if (document.body && ensure() === false) clearInterval(timer); };
  const timer = setInterval(tick, 1500); tick();
  try { chrome.runtime.onMessage.addListener((m, s, reply) => { if (m && m.type === "nmc:fillNow"){ const key = Object.keys(SITES).find(k => SITES[k].detect()); if (key){ onClick(SITES[key]); reply({ ok: true, site: SITES[key].name }); } } }); } catch (e) {}
})();
