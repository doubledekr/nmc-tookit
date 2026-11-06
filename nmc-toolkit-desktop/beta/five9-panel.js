/* NMC Toolkit Beta only — "Five9 calls (beta)" panel. Injected into the toolkit window by beta/five9-main.js; the live app never loads it.
   RECORD-ONLY: it lists what Five9 told Salesforce, matches each event to a toolkit client, and says what phase 2 WOULD do.
   It never changes a status, follow-up, log, the Inbox or the pipeline. The one thing it writes is the Salesforce record ID
   (c.sfId / inbox item .sfId) when the extension sends a record, so later Five9 events can be matched to the right client. */
(function(){
  const W = window;
  const F9 = W.__nmcF9 = W.__nmcF9 || { events: [], filter: "all", shown: 60, open: {} };
  const esc = s => String(s == null ? "" : s).replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  const $ = id => document.getElementById(id);
  const st = () => { try { return state; } catch (e) { return null; } };          /* the toolkit's state (global let binding) */
  const ID_RE = /^(00Q|003|001|006|00T)[A-Za-z0-9]{12}(?:[A-Za-z0-9]{3})?$/;      /* Lead, Contact, Account, Opportunity, Task */
  const id15 = s => String(s || "").slice(0, 15);
  const last10 = s => { const d = String(s || "").replace(/\D/g, ""); return d.length >= 10 ? d.slice(-10) : ""; };
  function recordFromUrl(u){ const m = /\/lightning\/r\/(\w+)\/([A-Za-z0-9]{15,18})(?:\/|$|\?)/.exec(String(u || "")); return m ? { obj: m[1], id: m[2] } : null; }

  /* ---------- reading an Open CTI event ---------- */
  function walk(v, fn, depth, key){ if (depth > 6 || v == null) return; fn(v, key);
    if (Array.isArray(v)) v.forEach(x => walk(x, fn, depth + 1, key)); else if (typeof v === "object") for (const k of Object.keys(v)) walk(v[k], fn, depth + 1, k); }
  function task(ev){ let t = null; walk(ev.args, (v) => { if (!t && v && typeof v === "object" && !Array.isArray(v) && ("CallDisposition" in v || "WhoId" in v || "CallType" in v)) t = v; }, 0); return t || {}; }
  function read(ev){
    const t = task(ev); const r = { disp: t.CallDisposition || "", type: t.CallType || "", dur: t.CallDurationInSeconds, comments: t.Description || t.Comments || t.Five9__Comments__c || "",
      who: t.WhoId || "", what: t.WhatId || "", subject: t.Subject || "", session: t.Five9__Five9SessionId__c || "", ani: "", ids: [], callback: "", phones: [],
      campaign: t.Five9Campaign__c || "" };
    walk(ev.args, (v, k) => {
      if (typeof v === "string"){
        if (ID_RE.test(v) && !r.ids.includes(v)) r.ids.push(v);
        if (/^(ani|dnis|phone|phonenumber|number|number\d|from|callerid|caller|five9ani__c|five9dnis__c|callbacknumber)$/i.test(k || "") && last10(v) && !r.phones.includes(last10(v))) r.phones.push(last10(v));
        if (!r.campaign && /^(campaignname|five9campaign__c)$/i.test(k || "")) r.campaign = v;
        const rec = /lightning\/r\//.test(v) && recordFromUrl(v); if (rec && !r.ids.includes(rec.id)) r.ids.push(rec.id);
        if (!r.callback && /callback|redial|reminder/i.test(k || "") && /\d{4}-\d{2}-\d{2}|\d{1,2}\/\d{1,2}/.test(v)) r.callback = v; } }, 0);
    /* Five9 puts the client's number in DNIS on an outbound call and in ANI on an inbound one */
    const dn = last10(t.Five9DNIS__c), an = last10(t.Five9ANI__c), out = /out/i.test(r.type);
    r.ani = (out ? dn || an : an || dn) || r.phones[0] || "";
    if (r.ani && !r.phones.includes(r.ani)) r.phones.unshift(r.ani); else if (r.ani) { r.phones = [r.ani].concat(r.phones.filter(x => x !== r.ani)); }
    if (!r.ani){ walk(ev.args, (v) => { if (!r.ani && typeof v === "string" && /^\+?1?[\s.(-]*\d{3}[\s.)-]*\d{3}[\s.-]*\d{4}$/.test(v.trim())) r.ani = v; }, 0); }
    r.record = r.who || r.ids.find(x => /^(00Q|003)/.test(x)) || r.what || r.ids.find(x => !/^00T/.test(x)) || "";
    return r; }

  /* ---------- matching: Salesforce record ID first, then phone (last 10 digits) ---------- */
  function backfill(){ const s = st(); if (!s || !s.sfRec) return false; let ch = false;
    for (const c of s.clients || []){ if (c.sfId || c.quick) continue; const em = (c.email || "").toLowerCase(), nm = (c.name || "").toLowerCase();
      for (const id in s.sfRec){ const x = s.sfRec[id]; if ((em && x.email === em) || (nm && x.name === nm)){ c.sfId = id; ch = true; break; } } }
    return ch; }
  function match(r){ const s = st(); if (!s) return null;
    const ids = [r.record].concat(r.ids).filter(Boolean).map(id15);
    if (ids.length){
      const c = (s.clients || []).find(c => !c.quick && c.sfId && ids.includes(id15(c.sfId))); if (c) return { kind: "client", c, by: "record ID" };
      const it = (s.inbox || []).find(x => x.sfId && ids.includes(id15(x.sfId))); if (it) return { kind: "inbox", it, by: "record ID" }; }
    for (const p of (r.phones && r.phones.length ? r.phones : [last10(r.ani)]).filter(Boolean)){
      const c = (s.clients || []).find(c => !c.quick && last10(c.phone) === p); if (c) return { kind: "client", c, by: "phone" };
      const it = (s.inbox || []).find(x => x.fields && last10(x.fields.phone) === p); if (it) return { kind: "inbox", it, by: "phone" }; }
    return null; }

  /* ---------- phase-2 preview: which toolkit "box" a disposition lands in ---------- */
  const MAP = { "no answer": "noanswer", "busy": "noanswer", "answering machine": "noanswer", "dead air": "noanswer", "left message": "noanswer", "left vm - no answer": "noanswer", "left vm": "noanswer", "no answer - left vm": "noanswer", "left voicemail": "noanswer", "voicemail": "noanswer",
    "not interested": "stop", "add to dnc list": "remove", "dnc": "remove", "do not call": "remove",
    "scheduled callback": "appt", "appointment": "appt", "appointment set": "appt", "appointment scheduled": "appt",
    "application": "status", "app taken": "status",
    "fax": "ignore", "system": "ignore", "dial error": "ignore",
    "contacted": "spoke", "spoke with client": "spoke", "conversation": "spoke", "interested": "spoke", "follow up": "spoke", "quoted": "spoke", "transferred": "spoke" };
  const GUESS = [[/not interested|no interest|declin|went (with|elsewhere)|already (refi|closed)/i, "stop"], [/dnc|do not call|remove/i, "remove"],
    [/fax|system|dial error|error|invalid|wrong number|bad number|disconnected number/i, "ignore"], [/no answer|busy|machine|dead air|left (a )?(msg|message|vm|voicemail)|voicemail|\bvm\b|no contact|redial|hung up|abandon/i, "noanswer"],
    [/appoint|appt|callback|call back|schedul/i, "appt"], [/applic|\bapp\b/i, "status"], [/spoke|contact|conversation|talk|interest|follow|quote|transfer|warm|hot|lead/i, "spoke"]];
  function box(disp){ const k = String(disp || "").trim().toLowerCase(); if (!k) return { box: "", guessed: false };
    if (MAP[k]) return { box: MAP[k], guessed: false };
    for (const [re, b] of GUESS) if (re.test(k)) return { box: b, guessed: true };
    return { box: "unknown", guessed: true }; }
  const BOX_NAME = { noanswer: "No answer", spoke: "Spoke", appt: "Appointment", stop: "Stop following up", status: "Set status", remove: "Remove", ignore: "Ignore", unknown: "Unknown" };
  function fdate(d){ try { return typeof fuNice === "function" ? fuNice(d) || d : d; } catch (e) { return d; } }
  function today(){ try { return todayStr(); } catch (e) { return new Date().toLocaleDateString("en-CA"); } }
  function nextBiz(){ try { return nextBizDay(); } catch (e) { return "next business day"; } }
  function wouldDo(ev, r, m){
    if (ev.methodName === "screenPop" || ev.methodName === "searchAndScreenPop")
      return m ? `Call arriving — would bring up ${esc(m.kind === "client" ? m.c.name : (m.it.fields && m.it.fields.name) || "the Inbox entry")} in the toolkit` : `Call arriving${r.ani ? " from " + esc(r.ani) : ""} — not in the toolkit; would keep the screen-popped record details for the disposition`;
    if (ev.methodName === "watcher-online") return `Nothing — the beta extension is running on this Salesforce ${ev.popout ? "popout" : "page"} (${esc(ev.host || "")}${esc(ev.page || "")})`;
    if (ev.methodName === "other-origin") return `Nothing — heard an Open CTI message <b>${esc(ev.args && ev.args.method)}</b> from <b>${esc(ev.args && ev.args.origin)}</b> (not five9.com, so its contents weren’t kept). Send this to Claude.`;
    if (ev.methodName !== "saveLog") return "Nothing — recorded so we can see what Five9 sends";
    const b = box(r.disp); const flag = b.guessed ? ` <span class="f9-flag">${b.box === "unknown" ? "unknown disposition — Dave to map" : "guessed from the name — confirm"}</span>` : "";
    const lbl = `“${esc(r.disp || "no disposition")}” → ${BOX_NAME[b.box] || "—"} box${flag}: `;
    if (!b.box) return "No disposition on this log — nothing";
    if (b.box === "ignore") return lbl + "would ignore it";
    if (b.box === "unknown") return lbl + "would do nothing until it’s mapped";
    if (!m){ const convo = b.box === "spoke" || b.box === "appt" || b.box === "status";
      if (b.box === "remove") return lbl + "not in the toolkit — nothing to remove";
      return lbl + (convo ? `not in the toolkit — would add as a <b>New lead</b>${r.record ? " (record " + esc(r.record) + ")" : ""}` : "not in the toolkit — would put it in the <b>Inbox</b> with the screen-popped record details, never the pipeline"); }
    if (m.kind === "inbox"){
      if (b.box === "remove") return lbl + "would drop this not-yet-imported Inbox entry";
      return lbl + (b.box === "spoke" || b.box === "appt" || b.box === "status" ? "Inbox entry — would import it as a <b>New lead</b>" : "Inbox entry — would leave it in the Inbox and note the call"); }
    const c = m.c, s = c.status || "";
    if (b.box === "noanswer"){ const msg = `would log “No answer — ${esc(r.disp)} (Five9)”`;
      if (s === "Watching" || s === "Ineligible" || s === "Future purchase") return lbl + msg + `; status stays ${esc(s)}`;
      if (c.followUp && c.followUp <= today()) return lbl + msg + ` and roll the follow-up from ${esc(fdate(c.followUp))} to ${esc(fdate(nextBiz()))}`;
      return lbl + msg + (c.followUp ? ` (follow-up ${esc(fdate(c.followUp))} not due yet — left alone)` : " — no follow-up created"); }
    if (b.box === "spoke") return lbl + "would log “Done — spoke with them” and show the next-follow-up chips";
    if (b.box === "appt") return lbl + "would log “Appointment booked”" + (r.callback ? ` (Five9 callback ${esc(r.callback)} — whether to use it is undecided)` : "");
    if (b.box === "stop") return lbl + `would Abandon: log it and move ${esc(c.name)} to <b>Watching</b> (Watching vs Lost still to confirm); Five9’s follow-up date ignored`;
    if (b.box === "status") return lbl + `would set status ${esc(s || "—")} → <b>In app</b>`;
    if (b.box === "remove") return lbl + `would remove ${esc(c.name)} from the pipeline (Undo toast, kept 30 days in a hidden “Removed” list)`;
    return lbl; }

  /* ---------- panel ---------- */
  const CSS = `#f9Box{margin-top:12px;padding-top:10px;border-top:1px solid var(--line)}
    #f9Box .f9-status{margin:4px 0 8px} #f9Box .f9-list{max-height:520px;overflow:auto;border:1px solid var(--line);border-radius:10px;background:var(--paper,#fff)}
    #f9Box .f9-ev{padding:9px 12px;border-bottom:1px solid var(--line);font-size:12.5px;line-height:1.5} #f9Box .f9-ev:last-child{border-bottom:0}
    #f9Box .f9-ev.imp{background:color-mix(in srgb,#5B3FA8 6%,transparent)} #f9Box .f9-top{display:flex;gap:8px;align-items:baseline;flex-wrap:wrap}
    #f9Box .f9-m{font-weight:700;font-family:ui-monospace,Menlo,Consolas,monospace;font-size:12px} #f9Box .f9-t{color:var(--muted,#6b6b6b);font-variant-numeric:tabular-nums}
    #f9Box .f9-k{color:var(--muted,#6b6b6b)} #f9Box .f9-would{margin-top:3px;padding:4px 8px;border-left:3px solid #5B3FA8;background:color-mix(in srgb,#5B3FA8 5%,transparent);border-radius:0 6px 6px 0}
    #f9Box .f9-flag{display:inline-block;font-size:11px;font-weight:700;color:#8a5a00;background:#fff3d6;border-radius:999px;padding:0 7px;margin-left:2px}
    #f9Box pre{white-space:pre-wrap;word-break:break-all;font-size:11px;max-height:260px;overflow:auto;background:rgba(0,0,0,.04);padding:8px;border-radius:6px;margin:6px 0 0}
    #f9Box .f9-tag{font-size:11px;font-weight:700;border-radius:999px;padding:0 8px;background:#5B3FA8;color:#fff}`;
  function fmtT(iso){ const d = new Date(iso || Date.now()); const t = d.toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit", second: "2-digit" });
    return d.toDateString() === new Date().toDateString() ? t : d.toLocaleDateString("en-US", { month: "short", day: "numeric" }) + " " + t; }
  function dur(n){ if (n === "" || n == null) return ""; n = +n; if (!isFinite(n) || n < 0) return ""; return Math.floor(n / 60) + ":" + String(Math.round(n % 60)).padStart(2, "0"); }
  function install(){
    if (!$("f9Style")){ const s = document.createElement("style"); s.id = "f9Style"; s.textContent = CSS; document.head.appendChild(s); }
    const ext = $("extBox");
    if (ext && !ext.dataset.f9){ ext.dataset.f9 = "1";
      const eb = ext.querySelector(".eyebrow"); if (eb) eb.innerHTML = `NMC Beta extension — Salesforce send, lender autofill &amp; Five9 <span class="f9-tag" style="font-size:10px">BETA</span>`;
      const ol = ext.querySelector("ol"); if (ol) ol.innerHTML = `
        <li>In Chrome open <b>chrome://extensions</b> and switch on <b>Developer mode</b> (top right).</li>
        <li>Click <b>Load unpacked</b> and pick the folder below — it’s the <b>beta</b> extension, inside the NMC Toolkit <b>Beta</b> app. It shows up as <b>“NMC Beta — Salesforce, lender autofill &amp; Five9 (test)”</b> with a purple <b>BETA</b> badge on its toolbar icon.</li>
        <li>Leave the live NMC extension on as well — the live one pairs with the live app (port 47831), this one with the beta (port 47832), so they never cross.</li>
        <li>On a Salesforce lead the beta’s purple <b>BETA · Send to NMC Beta</b> button sits bottom-<b>left</b> (the live red button stays bottom-right). Rocket Pro / Village show <b>BETA · Fill from NMC Beta</b> bottom-left too.</li>
        <li>Reload any open Salesforce tabs, then make Five9 calls as usual — each one is recorded in <b>Five9 calls (beta)</b> below. Nothing in your pipeline changes.</li>`; }
    if (!$("f9Box")){ const host = ext ? ext.parentNode : null; if (!host) return false;
      const box = document.createElement("div"); box.id = "f9Box";
      box.innerHTML = `<div class="eyebrow" style="font-size:11px">Five9 calls (beta) — record only</div>
        <div class="hint f9-status" id="f9Status"></div>
        <p class="hint" style="margin:0 0 8px">What Five9 told Salesforce on each call, the toolkit client it matched, and what the next beta <i>would</i> do. Display only — no status, follow-up, log, Inbox or pipeline changes.</p>
        <div class="btnrow" style="margin-bottom:8px;flex-wrap:wrap;gap:6px">
          <select id="f9Filter" class="btn ghost small" style="padding-right:22px"><option value="all">All events</option><option value="imp">Call events only (screenPop · saveLog)</option><option value="log">Dispositions only (saveLog)</option></select>
          <span style="flex:1"></span><button class="btn small" id="f9CopyAll">Copy raw JSON — all</button></div>
        <div class="f9-list" id="f9List"></div>`;
      if (ext.nextSibling) host.insertBefore(box, ext.nextSibling); else host.appendChild(box);
      $("f9Filter").value = F9.filter; $("f9Filter").onchange = e => { F9.filter = e.target.value; F9.shown = 60; render(); };
      $("f9CopyAll").onclick = () => copy(JSON.stringify(F9.events, null, 2), F9.events.length + " Five9 events copied — paste them back to Claude");
      $("f9List").addEventListener("click", e => { const b = e.target.closest("[data-f9]"); if (!b) return; const n = +b.dataset.n; const ev = F9.events.find(x => x.n === n);
        if (b.dataset.f9 === "copy" && ev) copy(JSON.stringify(ev, null, 2), "Event #" + n + " copied");
        if (b.dataset.f9 === "raw"){ F9.open[n] = !F9.open[n]; render(); }
        if (b.dataset.f9 === "more"){ F9.shown += 100; render(); } }); }
    const ub = $("updBanner"); if (ub && !$("f9Banner")){ const s = document.createElement("span"); s.id = "f9Banner"; s.innerHTML = ` <b>Five9 record-only mode is on</b> — calls show in <a href="#" onclick="go('settings');setTimeout(()=>{const b=document.getElementById('f9Box');b&&b.scrollIntoView({behavior:'smooth',block:'start'})},60);return false">Settings → Five9 calls (beta)</a>.`; ub.appendChild(s); }
    return true; }
  function copy(text, msg){ const done = () => { try { toast(msg); } catch (e) {} };
    const fallback = () => { const t = document.createElement("textarea"); t.value = text; t.style.cssText = "position:fixed;left:-9999px"; document.body.appendChild(t); t.select(); try { document.execCommand("copy"); } catch (e) {} t.remove(); done(); };
    try { navigator.clipboard.writeText(text).then(done, fallback); } catch (e) { fallback(); } }
  const DIAG = { "watcher-online": 1, "other-origin": 1 };
  function statusLine(){ const el = $("f9Status"); if (!el) return; const calls = F9.events.filter(e => !DIAG[e.methodName]); const last = calls[calls.length - 1];
    const w = F9.events.filter(e => e.methodName === "watcher-online"); const lw = w[w.length - 1];
    const hm = iso => new Date(iso).toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" });
    const wline = lw ? `<div style="margin-top:3px">Beta extension last checked in from Salesforce at ${esc(hm(lw.receivedAt || lw.seenAt))}${lw.popout ? " (popout window)" : ""}.</div>`
      : `<div style="margin-top:3px;color:var(--warn)">The beta extension hasn’t checked in from Salesforce yet — in Chrome, reload <b>NMC Beta</b> on chrome://extensions, then reload your Salesforce tab and the Five9 popout.</div>`;
    let port = 47832, listening = true; try { const s = DESK.sfStatus(); port = s.port; listening = s.listening; } catch (e) {}
    el.innerHTML = !listening ? `<span class="tag-warn">Listener isn’t running on port ${port}</span> — Five9 events can’t arrive` :
      last ? `<span class="tag-good">Listening for Five9 — last event ${esc(new Date(last.receivedAt || last.seenAt).toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" }))}</span> · ${F9.events.length} kept (last 200)` :
      `<span class="tag-good">Listening for Five9</span> — nothing received yet`;
    if (listening) el.innerHTML += wline; }
  function row(ev){ const r = read(ev); const m = match(r);
    const name = m ? (m.kind === "client" ? `<b>${esc(m.c.name || "client")}</b> <span class="f9-k">(${esc(m.c.status || "")} · matched by ${m.by})</span>` : `<b>${esc((m.it.fields && m.it.fields.name) || "Inbox entry")}</b> <span class="f9-k">(Inbox · matched by ${m.by})</span>`) : `<span class="f9-k">not in toolkit</span>`;
    const bits = [r.disp && `<span class="f9-k">Disposition</span> <b>${esc(r.disp)}</b>`, r.type && `<span class="f9-k">Type</span> ${esc(r.type)}`, r.dur != null && r.dur !== "" && `<span class="f9-k">Duration</span> ${esc(dur(r.dur))}`,
      r.ani && `<span class="f9-k">Number</span> ${esc(r.ani)}`, r.campaign && `<span class="f9-k">Campaign</span> ${esc(r.campaign)}`, `<span class="f9-k">Record</span> ${r.record ? esc(r.record) : "—"}`].filter(Boolean).join(" · ");
    return `<div class="f9-ev${ev.important ? " imp" : ""}"><div class="f9-top"><span class="f9-t">${esc(fmtT(ev.receivedAt || ev.seenAt))}</span><span class="f9-m">${esc(ev.methodName)}</span>${ev.popout ? '<span class="f9-k">· popped out</span>' : ""}<span style="flex:1"></span>
      <button class="btn ghost small" data-f9="raw" data-n="${ev.n}">${F9.open[ev.n] ? "Hide JSON" : "Show JSON"}</button><button class="btn ghost small" data-f9="copy" data-n="${ev.n}">Copy raw JSON</button></div>
      <div>${bits}</div><div><span class="f9-k">Client</span> ${name}</div>${r.comments ? `<div><span class="f9-k">Comments</span> ${esc(String(r.comments).slice(0, 400))}</div>` : ""}
      <div class="f9-would"><span class="f9-k">Would do:</span> ${wouldDo(ev, r, m)}</div>${F9.open[ev.n] ? `<pre>${esc(JSON.stringify(ev, null, 2))}</pre>` : ""}</div>`; }
  function render(){ if (!install()) return; statusLine(); const list = $("f9List"); if (!list) return;
    if (backfill()) { try { save(); } catch (e) {} }
    const evs = F9.events.filter(e => F9.filter === "all" || (F9.filter === "imp" ? e.important : e.methodName === "saveLog")).slice().reverse();
    list.innerHTML = evs.length ? evs.slice(0, F9.shown).map(row).join("") + (evs.length > F9.shown ? `<div class="f9-ev" style="text-align:center"><button class="btn ghost small" data-f9="more">Show older (${evs.length - F9.shown} more)</button></div>` : "")
      : `<div class="f9-ev hint">Nothing yet. Open Salesforce with the Five9 panel (docked or popped out) and make a call — events land here within a second.</div>`; }

  /* ---------- remember the Salesforce record ID whenever the extension sends a record ---------- */
  function onSf(p){ try { const s = st(); if (!s || !p) return; const rec = recordFromUrl(p.url); if (!rec) return;
    const it = (s.inbox || []).find(x => x.source === "chrome-extension" && x.url === p.url && !x.sfId); if (it){ it.sfId = rec.id; it.sfObj = rec.obj; }
    const F = (it && it.fields) || {}; const em = (F.email || "").toLowerCase(), nm = (F.name || "").toLowerCase();
    s.sfRec = s.sfRec || {}; s.sfRec[rec.id] = { obj: rec.obj, name: nm, email: em, at: Date.now() };
    const ids = Object.keys(s.sfRec); if (ids.length > 3000) ids.sort((a, b) => s.sfRec[a].at - s.sfRec[b].at).slice(0, ids.length - 3000).forEach(k => delete s.sfRec[k]);
    const c = (s.clients || []).find(c => !c.quick && em && (c.email || "").toLowerCase() === em) || (s.clients || []).find(c => !c.quick && nm && (c.name || "").toLowerCase() === nm);
    if (c && !c.sfId) c.sfId = rec.id;
    save(); setTimeout(render, 0); } catch (e) { console.warn("five9 beta: record id", e); } }

  W.nmcFive9Init = function(o){ F9.events = (o && o.events) || []; if (!F9.hooked){ F9.hooked = true; try { DESK.onSfIncoming(onSf); } catch (e) {}
      setInterval(statusLine, 30000); }
    render(); };
  W.nmcFive9Push = function(ev){ F9.events.push(ev); if (F9.events.length > 200) F9.events = F9.events.slice(-200); render();
    if (ev.methodName === "saveLog"){ const r = read(ev); try { toast("Five9 recorded: " + (r.disp || "call log") + " — nothing changed (beta)"); } catch (e) {} } };
  W.nmcFive9Debug = { read, match, box, wouldDo };   /* for tests */
})();
