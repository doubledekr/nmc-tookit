/* NMC Toolkit — "Send to Bonzo" (lab module).
   Loaded after the toolkit's own script. It only READS toolkit globals through the adapter below
   (cur, propSelected, computeSnap, snapHousehold, computeAnalysis, sheetTitle, emailBodyFor, renderSheet,
   libSent, save, toast, todayStr, state) and adds its UI next to the proposal buttons — the toolkit file
   itself is unchanged. To merge later: add these two <script> tags (or paste the files) and the
   nmcBonzo bridge from desktop/bonzo-main.js into the real desktop shell. */
(function () {
  "use strict";
  const Core = window.NMCBonzoCore;
  const BRIDGE = window.nmcBonzo || null;               /* desktop lab app: token + network live in the main process */
  const CFG_KEY = "nmc_bonzo_cfg_v1";
  const $id = id => document.getElementById(id);
  const esc = s => String(s == null ? "" : s).replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  const say = m => { try { toast(m); } catch (e) { console.log(m); } };

  /* ---------- config ---------- */
  function loadCfg() {
    let saved = null;
    try { saved = BRIDGE ? BRIDGE.getConfig() : JSON.parse(localStorage.getItem(CFG_KEY) || "null"); } catch (e) {}
    return Core.mergeConfig(saved);
  }
  function saveCfg(cfg) { try { BRIDGE ? BRIDGE.setConfig(cfg) : localStorage.setItem(CFG_KEY, JSON.stringify(cfg)); } catch (e) {} }
  const isLocal = url => { try { return ["localhost", "127.0.0.1", "[::1]"].includes(new URL(url).hostname); } catch (e) { return false; } };

  /* ---------- transport ---------- */
  async function realSend(cfg, method, path, body) {
    if (BRIDGE) return BRIDGE.request({ baseUrl: cfg.baseUrl, method, path, body });
    /* browser fallback is for the local mock only — a real Bonzo token never sits in a web page */
    if (!isLocal(cfg.baseUrl)) return { ok: false, status: 0, error: "Real Bonzo calls only run in the desktop lab app" };
    try {
      const r = await fetch(cfg.baseUrl.replace(/\/+$/, "") + path, { method, headers: { "Content-Type": "application/json", Authorization: "Bearer " + (sessionStorage.getItem("nmc_bonzo_mock_token") || "mock-token") }, body: body ? JSON.stringify(body) : undefined });
      let json = null; try { json = await r.json(); } catch (e) {}
      return { ok: r.ok, status: r.status, json };
    } catch (e) { return { ok: false, status: 0, error: "Can't reach " + cfg.baseUrl + " — is the mock running?" }; }
  }
  function drySend(log) {
    return async (method, path, body) => { log.push({ method, path, body }); return method === "GET" ? { ok: true, status: 200, json: [] } : { ok: true, status: 200, json: { id: "dry-run" } }; };
  }

  /* ---------- adapter: toolkit → facts ---------- */
  function blobToBase64(blob) { return new Promise((ok, bad) => { const fr = new FileReader(); fr.onload = () => ok(String(fr.result).split(",")[1]); fr.onerror = bad; fr.readAsDataURL(blob); }); }
  function pickNumbers(c) {
    /* side-by-side → the starred recommendation (or the first option); otherwise the live analysis */
    const sel = propSelected(c);
    if (sel.length) {
      const sc = sel.find(x => c.cmp && x.id === c.cmp.rec) || sel[0];
      const r = computeSnap(c, sc); const h = snapHousehold(c, r);
      return { r, newPayment: r.newPay, monthlySavings: h.save, interestSaved: h.todayInt - h.newInt, rate: r.a.anRate };
    }
    const r = computeAnalysis(c);
    if (!r || r.tooSmall) return null;
    const pwSaved = r.curPathInterest - (r.pw ? r.pw.interest : r.curPathInterest);
    return { r, newPayment: r.newPay, monthlySavings: r.saveMo, interestSaved: pwSaved, rate: r.a.anRate };
  }
  function gatherFacts(withImage) {
    const c = cur(); if (!c) throw new Error("Pick a client first");
    const nums = pickNumbers(c); if (!nums) throw new Error("Finish the Savings analysis first");
    const { r } = nums, s = state.settings;
    const f = {
      clientId: c.id, name: c.name, phone: c.phone, email: c.email,
      quoteDate: (typeof todayStr === "function" ? todayStr() : new Date().toISOString().slice(0, 10)),
      title: sheetTitle("proposal", c, r),
      newPayment: nums.newPayment, monthlySavings: nums.monthlySavings, interestSaved: nums.interestSaved,
      cashOut: r.cashOut || 0, debtsPaid: r.roll ? r.dBal : 0, debtsCount: r.roll && r.debts ? r.debts.length : 0, rate: nums.rate,
      loName: s.loName, loPhone: s.loPhone, loEmail: s.loEmail, loNmls: s.loNmls,
      emailText: emailBodyFor(c, r, "proposal")
    };
    return { c, f };
  }
  async function attachImage(f) {
    const sheet = await renderSheet("proposal");       /* also files the proposal in the client's library */
    f.imageBase64 = await blobToBase64(sheet.jpg); f.imageName = sheet.name + ".jpg";
  }

  /* ---------- UI ---------- */
  const CSS = `
  .bz-pill{display:inline-flex;align-items:center;gap:6px;font-size:12px;padding:3px 9px;border-radius:999px;background:#EEF1F8;color:#33415C;white-space:nowrap}
  .bz-pill.ok{background:#E6F2EC;color:#2E6B4F}.bz-pill.warn{background:#FBEFD9;color:#7A5212}.bz-pill.bad{background:#F8E3E0;color:#8A2A1D}
  .bz-modal{position:fixed;inset:0;background:rgba(20,20,30,.45);display:flex;align-items:flex-start;justify-content:center;z-index:9999;overflow:auto;padding:40px 16px}
  .bz-card{background:#fff;border-radius:12px;max-width:720px;width:100%;padding:22px 24px;box-shadow:0 20px 60px rgba(0,0,0,.25);font-size:14px}
  .bz-card h2{margin:0 0 4px}.bz-card .bz-sub{color:#666;margin-bottom:14px}
  .bz-step{border:1px solid #E5E1D8;border-radius:8px;padding:10px 12px;margin:8px 0}
  .bz-step b{display:block}.bz-step code{font-size:12px;color:#555}
  .bz-step details pre{white-space:pre-wrap;word-break:break-word;font-size:11.5px;background:#F7F5F0;padding:8px;border-radius:6px;max-height:260px;overflow:auto}
  .bz-step.ok{border-color:#9BC7B0;background:#F3FAF6}.bz-step.bad{border-color:#E0A79D;background:#FDF4F2}
  .bz-msg{padding:8px 12px;border-radius:8px;margin:6px 0}.bz-msg.err{background:#F8E3E0;color:#8A2A1D}.bz-msg.warn{background:#FBEFD9;color:#7A5212}
  .bz-dry{display:inline-block;font-size:11px;font-weight:700;letter-spacing:.04em;background:#33415C;color:#fff;border-radius:4px;padding:2px 6px;margin-left:8px;vertical-align:middle}
  .bz-row{display:flex;gap:10px;justify-content:flex-end;margin-top:16px;flex-wrap:wrap}
  .bz-grid{display:grid;grid-template-columns:1fr 1fr;gap:10px 14px}.bz-grid .full{grid-column:1/-1}
  .bz-grid label{font-size:12px;color:#555;display:block;margin-bottom:3px}.bz-grid input,.bz-grid textarea{width:100%;box-sizing:border-box}
  .bz-bar{display:flex;align-items:center;gap:10px;flex-wrap:wrap;margin:4px 0 14px;padding:10px 12px;border:1px solid #E5E1D8;border-radius:10px;background:#FBF8F2}
  .bz-label{font-size:11px;font-weight:700;letter-spacing:.08em;text-transform:uppercase;color:#7A6F5E;margin-right:2px}
  .bz-check{display:flex;align-items:center;gap:8px}.bz-check input{width:auto}`;
  function modal(html) {
    closeModal(); const m = document.createElement("div"); m.className = "bz-modal"; m.id = "bzModal";
    m.innerHTML = `<div class="bz-card">${html}</div>`; m.addEventListener("click", e => { if (e.target === m) closeModal(); });
    document.body.appendChild(m); return m;
  }
  function closeModal() { const m = $id("bzModal"); if (m) m.remove(); }
  function clipBody(b) { if (!b) return ""; const copy = JSON.parse(JSON.stringify(b));
    (copy.attachments || []).forEach(a => { if (a.content) a.content = `[JPG, ${Math.round(a.content.length * 0.75 / 1024)} KB]`; });
    if (copy.html) copy.html = copy.html.length > 400 ? copy.html.slice(0, 400) + "…" : copy.html; return JSON.stringify(copy, null, 2); }

  function statusPill() {
    const c = cur(), el = $id("bzPill"); if (!el) return;
    const b = c && c.bonzo;
    if (!b) { el.className = "bz-pill"; el.textContent = "Not in Bonzo"; return; }
    el.className = "bz-pill " + (!b.lastOk || b.optedOut ? "bad" : b.replied ? "warn" : "ok");
    el.textContent = b.lastOk ? `Bonzo · ${b.stageName || "Proposal sent"}${b.replied && !/repl/i.test(b.stageName || "") ? " · Replied" : ""}${b.optedOut ? " · OPTED OUT" : ""} · ${b.sentAt ? b.sentAt.slice(0, 10) : ""}` : "Bonzo send failed — see log";
    el.title = b.prospectId ? "Bonzo prospect " + b.prospectId : "";
  }

  /* preview → send */
  async function openSend() {
    let facts, c; const cfg = loadCfg();
    try { ({ c, f: facts } = gatherFacts()); } catch (e) { say(e.message); return; }
    const existing = c.bonzo && c.bonzo.prospectId && c.bonzo.prospectId !== "dry-run" ? c.bonzo.prospectId : null;
    const plan = Core.buildPlan(facts, cfg, existing);
    const hasToken = BRIDGE ? BRIDGE.hasToken() : isLocal(cfg.baseUrl);
    modal(`
      <h2>Send to Bonzo${cfg.dryRun ? '<span class="bz-dry">DRY RUN</span>' : ""}</h2>
      <div class="bz-sub">${esc(c.name)} · ${esc(facts.title)}<br>Target: <code>${esc(cfg.baseUrl)}</code>${isLocal(cfg.baseUrl) ? " (local mock)" : ""}</div>
      ${plan.errors.map(e => `<div class="bz-msg err">${esc(e)}</div>`).join("")}
      ${plan.warnings.map(w => `<div class="bz-msg warn">${esc(w)}</div>`).join("")}
      ${!hasToken && !cfg.dryRun ? `<div class="bz-msg err">No Bonzo API token saved — add it in Bonzo settings, or turn on dry run.</div>` : ""}
      <div id="bzSteps">${plan.steps.map((s, i) => `<div class="bz-step" id="bzStep${i}"><b>${i + 1}. ${esc(s.label)}</b><code>${esc(s.method || (s.route || "").split(" ")[0])} ${esc(s.path || (s.route || "").split(" ")[1])}</code><details><summary>What gets sent</summary><pre>${esc(clipBody(s.body))}</pre></details></div>`).join("")}</div>
      <div class="hint" style="margin-top:8px">${cfg.dryRun ? "Dry run: nothing leaves the app. Turn dry run off in Bonzo settings to send for real." : "This sends to Bonzo now. The follow-up texts start when the client lands in the Proposal Sent stage."}</div>
      <div class="bz-row"><button class="btn ghost" id="bzCancel">Cancel</button><button class="btn ghost" id="bzCfgBtn">Bonzo settings</button>
        <button class="btn" id="bzGo" ${plan.ok && (hasToken || cfg.dryRun) ? "" : "disabled"}>${cfg.dryRun ? "Run dry run" : "Send to Bonzo"}</button></div>`);
    $id("bzCancel").onclick = closeModal; $id("bzCfgBtn").onclick = openSettings;
    $id("bzGo").onclick = () => runSend(c, facts, cfg, existing);
  }

  async function runSend(c, facts, cfg, existing) {
    const go = $id("bzGo"); go.disabled = true; go.textContent = "Working…";
    try { if (cfg.sendEmail && cfg.attachImage) await attachImage(facts); } catch (e) { say("Couldn't render the proposal image — sending without it"); }
    const plan = Core.buildPlan(facts, cfg, existing);
    const dryLog = [];
    const send = cfg.dryRun ? drySend(dryLog) : (m, p, b) => realSend(cfg, m, p, b);
    let i = 0;
    const out = await Core.runPlan(plan, send, r => {
      const el = $id("bzStep" + i++); if (!el) return;
      el.classList.add(r.ok ? "ok" : "bad");
      el.insertAdjacentHTML("beforeend", `<div style="margin-top:4px">${r.ok ? "✓ Done" : "✕ " + esc(r.error)} <code>${esc(r.method)} ${esc(r.path)}</code> ${r.status ? "· " + r.status : ""}</div>`);
    });
    if (!cfg.dryRun) {
      c.bonzo = Object.assign({}, c.bonzo || {}, { prospectId: out.prospectId || (c.bonzo && c.bonzo.prospectId) || null, sentAt: new Date().toISOString(), lastOk: out.ok,
        stageName: out.results.some(r => r.key === "stage" && r.ok) ? "Proposal sent" : (c.bonzo && c.bonzo.stageName) || "In Bonzo", replied: false });
      c.log = c.log || []; c.log.unshift({ when: fuStamp(), outcome: "sent", note: `Bonzo: ${facts.title} — ${out.ok ? "sent" : "partly failed"}` });
      if (out.ok && c.library && c.library[0]) libSent(c.library[0].id, "Bonzo"); else save();
      statusPill();
    }
    go.textContent = cfg.dryRun ? "Dry run complete" : (out.ok ? "Sent ✓" : "Finished with errors");
    $id("bzCancel").textContent = "Close";
    say(cfg.dryRun ? "Dry run done — nothing was sent" : out.ok ? "Sent to Bonzo" : "Bonzo send had errors — see the steps");
  }

  /* pull the client's current state back from Bonzo */
  async function refreshStatus() {
    const c = cur(), cfg = loadCfg();
    if (!c || !c.bonzo || !c.bonzo.prospectId) { say("This client hasn't been sent to Bonzo yet"); return; }
    if (cfg.dryRun) { say("Dry run is on — turn it off in Bonzo settings to check live status"); return; }
    const { method, path } = Core.parseRoute(cfg.paths.get, { id: c.bonzo.prospectId });
    const res = await realSend(cfg, method, path);
    if (!res.ok) { say("Couldn't read the client from Bonzo (" + (res.error || res.status) + ")"); return; }
    const p = (res.json && (res.json.data || res.json.prospect)) || res.json || {};
    c.bonzo.stageName = p.pipeline_stage_name || p.stage || p.status || c.bonzo.stageName;
    c.bonzo.replied = !!(p.replied || p.last_inbound_at || p.has_replied);
    c.bonzo.optedOut = !!(p.opted_out || p.do_not_text || p.unsubscribed);
    c.bonzo.checkedAt = new Date().toISOString(); c.bonzo.lastOk = true;
    save(); statusPill(); say(c.bonzo.optedOut ? "Client opted out of texts in Bonzo" : c.bonzo.replied ? "Client replied in Bonzo — give them a call" : "Bonzo: " + c.bonzo.stageName);
  }

  function openSettings() {
    const cfg = loadCfg(), hasToken = BRIDGE ? BRIDGE.hasToken() : false;
    const f = cfg.fields;
    modal(`
      <h2>Bonzo settings</h2><div class="bz-sub">Lab build. ${BRIDGE ? "Your token is stored encrypted by the app and never shown again." : "Browser mode: only the local mock can be reached."}</div>
      <div class="bz-grid">
        <div class="full bz-check"><input type="checkbox" id="bzDry" ${cfg.dryRun ? "checked" : ""}><label for="bzDry" style="margin:0">Dry run — preview everything, send nothing</label></div>
        <div class="full"><label>API base URL</label><input id="bzBase" value="${esc(cfg.baseUrl)}"><div class="hint">Mock: http://localhost:8799/api/v3 · Real: from Bonzo's API docs</div></div>
        ${BRIDGE ? `<div class="full"><label>API token ${hasToken ? "(saved — leave blank to keep)" : "(Bonzo → Settings → Integrations → API)"}</label><input id="bzToken" type="password" placeholder="${hasToken ? "••••••••" : "paste token"}"></div>` : ""}
        <div><label>"Proposal Sent" pipeline stage id</label><input id="bzStage" value="${esc(cfg.proposalStageId)}"></div>
        <div><label>Assign to (your Bonzo user)</label><input id="bzAssign" value="${esc(cfg.assignTo)}" placeholder="blank = token owner"></div>
        <div class="bz-check"><input type="checkbox" id="bzEmail" ${cfg.sendEmail ? "checked" : ""}><label for="bzEmail" style="margin:0">Email the proposal from Bonzo</label></div>
        <div class="bz-check"><input type="checkbox" id="bzAttach" ${cfg.attachImage ? "checked" : ""}><label for="bzAttach" style="margin:0">Attach the proposal JPG</label></div>
        <div class="full"><label>Custom field keys (must match the fields created in Bonzo)</label></div>
        ${Object.keys(f).map(k => `<div><label>${esc(k)}</label><input data-field="${esc(k)}" value="${esc(f[k])}"></div>`).join("")}
        <div class="full"><label>Endpoints (advanced — fix these once we have Bonzo's API docs)</label><textarea id="bzPaths" style="min-height:150px;font-family:monospace;font-size:12px">${esc(JSON.stringify(cfg.paths, null, 2))}</textarea></div>
      </div>
      <div class="bz-row"><button class="btn ghost" id="bzTest">Test connection</button><button class="btn ghost" id="bzClose">Cancel</button><button class="btn" id="bzSave">Save</button></div>`);
    $id("bzClose").onclick = closeModal;
    const collect = () => {
      const next = loadCfg();
      next.dryRun = $id("bzDry").checked; next.baseUrl = $id("bzBase").value.trim().replace(/\/+$/, "");
      next.proposalStageId = $id("bzStage").value.trim(); next.assignTo = $id("bzAssign").value.trim();
      next.sendEmail = $id("bzEmail").checked; next.attachImage = $id("bzAttach").checked;
      document.querySelectorAll("[data-field]").forEach(i => { next.fields[i.dataset.field] = i.value.trim(); });
      try { next.paths = Object.assign({}, next.paths, JSON.parse($id("bzPaths").value)); } catch (e) { throw new Error("Endpoints box isn't valid JSON"); }
      return next;
    };
    $id("bzSave").onclick = async () => {
      let next; try { next = collect(); } catch (e) { say(e.message); return; }
      const tok = $id("bzToken") && $id("bzToken").value.trim(); if (tok && BRIDGE) await BRIDGE.setToken(tok);
      saveCfg(next); closeModal(); say("Bonzo settings saved" + (next.dryRun ? " (dry run on)" : ""));
    };
    $id("bzTest").onclick = async () => {
      let next; try { next = collect(); } catch (e) { say(e.message); return; }
      const tok = $id("bzToken") && $id("bzToken").value.trim(); if (tok && BRIDGE) await BRIDGE.setToken(tok);
      const { method, path } = Core.parseRoute(next.paths.findByEmail, { email: "connection-test@example.com" });
      const res = await realSend(next, method, path);
      say(res.ok ? "Connected to Bonzo ✓ (" + res.status + ")" : "Couldn't connect: " + (res.error || "HTTP " + res.status));
    };
  }

  /* ---------- mount ---------- */
  function mount() {
    if ($id("bzSendBtn")) return;
    const style = document.createElement("style"); style.textContent = CSS; document.head.appendChild(style);
    const grid = document.querySelector("#s-proposal .panel .grid3");
    if (!grid) { console.warn("[bonzo] proposal panel not found"); return; }
    grid.insertAdjacentHTML("afterend", `<div class="bz-bar"><span class="bz-label">Bonzo</span>
      <button class="btn" id="bzSendBtn" title="Create or update this client in Bonzo, email the proposal, and start the follow-up texts">Send to Bonzo</button>
      <button class="btn ghost" id="bzCheckBtn" title="Read this client's stage and replies back from Bonzo">Check status</button>
      <button class="btn ghost" id="bzSetBtn" title="Bonzo settings">Settings</button><span class="bz-pill" id="bzPill">Not in Bonzo</span></div>`);
    $id("bzSendBtn").onclick = openSend; $id("bzCheckBtn").onclick = refreshStatus; $id("bzSetBtn").onclick = openSettings;
    /* keep the pill in step when the banker switches clients */
    const orig = window.renderProposalPreview;
    if (typeof orig === "function") window.renderProposalPreview = function () { const out = orig.apply(this, arguments); statusPill(); return out; };
    statusPill();
  }
  window.NMCBonzo = { openSend, openSettings, refreshStatus, gatherFacts, loadCfg, mount };
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", mount); else mount();
})();
