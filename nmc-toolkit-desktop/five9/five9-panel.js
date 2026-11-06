/* "Five9 calls" panel (Settings) + Five9 call handling in the toolkit. Injected into the toolkit window by five9/five9-main.js.
   Live since v1.21.0; the beta build shows the same panel with beta wording (F9.beta).
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

  /* ---------- what Import does with the lead's latest Five9 disposition (Dave's list, v1.22) ----------
     Only for a lead imported from the Inbox as a NEW client; an existing client just keeps the disposition as a note. */
  const normD = d => String(d || "").toLowerCase().replace(/[\u2010-\u2015]/g, "-").replace(/\s*-\s*/g, " - ").replace(/\s+/g, " ").replace(/[.\u2026\s]+$/, "").trim();
  const RULES = { "assign to broker - interested": "followCal", "call back": "followCal", "contacted": "follow", "dead air": "none", "do not call": "dnc",
    "hang up - try again": "none", "hot lead - purchase": "follow", "hot lead - refi": "follow", "left vm - no answer": "follow", "new build construction": "none",
    "not interested - take me off your list": "dnc", "overacw": "follow", "recycle": "none", "spanish speaker": "spanish", "vm full": "follow",
    "wrong number - bogus": "wrongNumber", "wrong info": "wrongInfo" };
  function ruleFor(d){ const k = normD(d); if (!k) return ""; if (RULES[k]) return RULES[k]; if (/^not interested at this time/.test(k)) return "notint"; return "unknown"; }
  const RULE_TXT = { follow: "follow-up next business day", followCal: "follow-up next business day + book the call", dnc: "marked DNC — no follow-ups",
    notint: "Watching — not interested as of the call", spanish: "marked Spanish speaker", wrongNumber: "marked wrong number", wrongInfo: "marked wrong info",
    none: "no automatic action", unknown: "no rule for this disposition yet — no automatic action" };
  function dayOf(v){ const m = /(\d{4})-(\d{2})-(\d{2})/.exec(String(v || "")); if (m) return m[1] + "-" + m[2] + "-" + m[3];
    const u = /(\d{1,2})\/(\d{1,2})\/(\d{2,4})/.exec(String(v || "")); if (u){ const y = u[3].length === 2 ? "20" + u[3] : u[3]; return y + "-" + u[1].padStart(2, "0") + "-" + u[2].padStart(2, "0"); }
    const d = new Date(v); return isNaN(d) ? "" : d.toLocaleDateString("en-CA"); }
  function applyRule(c, notes){ const last = notes[notes.length - 1]; const rule = ruleFor(last && last.disp); if (!c || !last) return "";
    c.f9flags = c.f9flags || {};
    if (rule === "follow" || rule === "followCal"){ if (c.status !== "Needs follow-up" && !isDone(c)) c.status = "Needs follow-up"; c.followUp = nextBizDay(); c.followUpTime = ""; c.apptLen = 0; }
    if (rule === "dnc"){ c.f9flags.dnc = true; c.followUp = ""; c.followUpTime = ""; c.apptLen = 0; }
    if (rule === "notint"){ c.status = "Watching"; c.followUp = ""; c.followUpTime = ""; c.apptLen = 0; c.notInt = { at: dayOf(last.at), suggested: dayOf(last.callback) || "" }; }
    if (rule === "spanish") c.f9flags.spanish = true;
    if (rule === "wrongNumber") c.f9flags.wrongNumber = true;
    if (rule === "wrongInfo") c.f9flags.wrongInfo = true;
    if (rule === "followCal") setTimeout(() => { try { cbOpen = "appt"; cbAnimPop = true; renderClientBar(); } catch (e) {} }, 60);   /* the client bar's 15-min Outlook booking */
    return rule; }

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
    if (ev.methodName === "call-start") return "A Five9 call started";
    if (ev.methodName === "watcher-online") return `Nothing — the ${F9.beta ? "beta" : "NMC"} extension is running on this Salesforce ${ev.popout ? "popout" : "page"} (${esc(ev.host || "")}${esc(ev.page || "")})`;
    if (ev.methodName === "auto-skip") return `Didn’t auto-send record ${esc(ev.args && ev.args.record)} — ${esc(ev.args && ev.args.reason)}`;
    if (ev.methodName === "other-origin") return `Nothing — heard an Open CTI message <b>${esc(ev.args && ev.args.method)}</b> from <b>${esc(ev.args && ev.args.origin)}</b> (not five9.com, so its contents weren’t kept). Send this to Claude.`;
    if (ev.methodName !== "saveLog") return "Nothing — recorded so we can see what Five9 sends";
    { const rule = ruleFor(r.disp); if (!rule) return "No disposition on this log";
      const txt = RULE_TXT[rule] || ""; const flag = rule === "unknown" ? ' <span class="f9-flag">new disposition name — tell Dave</span>' : "";
      if (m && m.kind === "client") return `Saved as a note on ${esc(m.c.name || "the client")} (already a client — no automatic action)`;
      return `“${esc(r.disp)}” — when imported: ${esc(txt)}${flag}`; }
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
    if (ext && !ext.dataset.f9 && F9.beta){ ext.dataset.f9 = "1";
      const eb = ext.querySelector(".eyebrow"); if (eb) eb.innerHTML = `NMC Beta extension — Salesforce send, lender autofill &amp; Five9 <span class="f9-tag" style="font-size:10px">BETA</span>`;
      const ol = ext.querySelector("ol"); if (ol) ol.innerHTML = `
        <li>In Chrome open <b>chrome://extensions</b> and switch on <b>Developer mode</b> (top right).</li>
        <li>Click <b>Load unpacked</b> and pick the folder below — it’s the <b>beta</b> extension, inside the NMC Toolkit <b>Beta</b> app. It shows up as <b>“NMC Beta — Salesforce, lender autofill &amp; Five9 (test)”</b> with a purple <b>BETA</b> badge on its toolbar icon.</li>
        <li>Leave the live NMC extension on as well — the live one pairs with the live app (port 47831), this one with the beta (port 47832), so they never cross.</li>
        <li>On a Salesforce lead the beta’s purple <b>BETA · Send to NMC Beta</b> button sits bottom-<b>left</b> (the live red button stays bottom-right). Rocket Pro / Village show <b>BETA · Fill from NMC Beta</b> bottom-left too.</li>
        <li>Reload any open Salesforce tabs, then make Five9 calls as usual — the call’s lead comes over by itself and each call is listed in <b>Five9 calls (beta)</b> below.</li>`; }
    if (ext && !ext.dataset.f9 && !F9.beta){ ext.dataset.f9 = "1";
      const eb = ext.querySelector(".eyebrow"); if (eb) eb.textContent = "Chrome extension — Salesforce send, lender autofill & Five9";
      const ol = ext.querySelector("ol"); if (ol){ const li = document.createElement("li"); li.innerHTML = `<b>Five9:</b> when a Five9 call starts, the lead Salesforce opens for it comes over by itself — only if its record or phone matches the call. A client you already have opens; a new lead waits at the top of your Inbox. The disposition you set is saved on the lead (see <b>Five9 calls</b> below).`; ol.appendChild(li);
        const li2 = document.createElement("li"); li2.innerHTML = `<b>Lead owner:</b> when you Import a lead that sits in <b>Lead Queue</b>, the extension assigns it to you in Salesforce (Change Owner, using your name above — it must match your Salesforce name). A lead owned by another banker is left alone and shows “Already assigned to …”. Keep the lead open in Salesforce for a few seconds after Import.`; ol.appendChild(li2); } }
    if (!$("f9Box")){ const host = ext ? ext.parentNode : null; if (!host) return false;
      const box = document.createElement("div"); box.id = "f9Box";
      box.innerHTML = `<div class="eyebrow" style="font-size:11px">Five9 calls${F9.beta ? " (beta)" : ""}</div>
        <div class="hint f9-status" id="f9Status"></div>
        <p class="hint" style="margin:0 0 8px">What Five9 told Salesforce on each call and the client it matched. The call’s lead comes over by itself and its disposition is saved on the lead as a note; when you Import a new lead, its latest disposition sets the follow-up, DNC / Not interested / Spanish / wrong-number marks (the “Toolkit” line says what). Existing clients just get the note.</p>
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
    const ub = $("updBanner"); if (F9.beta && ub && !$("f9Banner")){ const s = document.createElement("span"); s.id = "f9Banner"; s.innerHTML = ` <b>Five9 record-only mode is on</b> — calls show in <a href="#" onclick="go('settings');setTimeout(()=>{const b=document.getElementById('f9Box');b&&b.scrollIntoView({behavior:'smooth',block:'start'})},60);return false">Settings → Five9 calls (beta)</a>.`; ub.appendChild(s); }
    return true; }
  function copy(text, msg){ const done = () => { try { toast(msg); } catch (e) {} };
    const fallback = () => { const t = document.createElement("textarea"); t.value = text; t.style.cssText = "position:fixed;left:-9999px"; document.body.appendChild(t); t.select(); try { document.execCommand("copy"); } catch (e) {} t.remove(); done(); };
    try { navigator.clipboard.writeText(text).then(done, fallback); } catch (e) { fallback(); } }
  const DIAG = { "watcher-online": 1, "other-origin": 1, "auto-skip": 1, "call-start": 1 };
  function statusLine(){ const el = $("f9Status"); if (!el) return; const calls = F9.events.filter(e => !DIAG[e.methodName]); const last = calls[calls.length - 1];
    const w = F9.events.filter(e => e.methodName === "watcher-online"); const lw = w[w.length - 1];
    const hm = iso => new Date(iso).toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" });
    const xn = F9.beta ? "NMC Beta" : "NMC Toolkit";
    const wline = lw ? `<div style="margin-top:3px">The ${F9.beta ? "beta" : "NMC"} extension last checked in from Salesforce at ${esc(hm(lw.receivedAt || lw.seenAt))}${lw.popout ? " (popout window)" : ""}.</div>`
      : `<div style="margin-top:3px;color:var(--warn)">The ${F9.beta ? "beta" : "NMC"} extension hasn’t checked in from Salesforce yet — in Chrome, reload <b>${xn}</b> on chrome://extensions, then reload your Salesforce tab and the Five9 popout.</div>`;
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
      <div class="f9-would"><span class="f9-k">Toolkit:</span> ${wouldDo(ev, r, m)}</div>${F9.open[ev.n] ? `<pre>${esc(JSON.stringify(ev, null, 2))}</pre>` : ""}</div>`; }
  function render(){ if (!install()) return;
    const scr = $("s-settings"); if (scr && !scr.classList.contains("active")){ F9.dirty = true; return; }   /* drawn when Settings opens */
    F9.dirty = false; statusLine(); const list = $("f9List"); if (!list) return;
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
    backfill(); save(); setTimeout(render, 0);
    if (/^five9-auto/.test(p.via || "") && it){ it.f9check = (/check=(\w+)/.exec(p.via) || [])[1] || ""; const call = curCall();
      if (call) call.items.push(it.id);
      else if (F9.call && F9.call.note && Date.now() - F9.call.closedAt < 60000 && !F9.call.items.length){ F9.call.items.push(it.id); it.f9 = (it.f9 || []).concat([F9.call.note]); }   /* dispositioned before the record finished sending */
      save(); autoOpen(it, rec); } } catch (e) { console.warn("five9: record id", e); } }

  /* ---------- a Five9 call sent this lead automatically: open it (Dave's rules) ----------
     · already a client → open their workspace. When the read shares their phone or email, the toolkit's own "already in your pipeline —
       Update their numbers" bar shows (nothing changes until he clicks it), same as Import; otherwise the read waits in the Inbox.
     · not in the toolkit → stays at the top of the Pipeline Inbox (where the toolkit already put it), one click to Import. Nothing is created.
     · during follow-up mode the queue isn't hijacked: just a toast */
  function autoOpen(it, rec){ const s = st(); const F = it.fields || {}; const em = (F.email || "").toLowerCase(), nm = (F.name || "").toLowerCase(), ph = last10(F.phone);
    const c = (s.clients || []).find(c => !c.quick && c.sfId && id15(c.sfId) === id15(rec.id)) || (s.clients || []).find(c => !c.quick && em && (c.email || "").toLowerCase() === em) || (s.clients || []).find(c => !c.quick && nm && (c.name || "").toLowerCase() === nm);
    let inFuq = false; try { inFuq = !!fuqLive; } catch (e) {}
    if (inFuq){ toast("Five9 call: " + (F.name || "lead") + (c ? " — already a client" : " — new, in your Inbox") + ". Follow-up mode left as is."); return; }
    { const call = curCall() || (F9.call && F9.call.note && Date.now() - F9.call.closedAt < 60000 ? F9.call : null);
      if (call && c && !call.clients.includes(c.id)){ call.clients.push(c.id); if (!curCall() && call.note){ c.f9 = (c.f9 || []).concat([call.note]).slice(-10); save(); } } }
    if (!c){ toast("Five9 call: new lead " + (F.name || "") + " — top of your Pipeline Inbox. Import when you\u2019re ready."); return; }
    s.currentId = c.id; save(); refreshAll(); go("client");
    const same = (ph && last10(c.phone) === ph) || (em && (c.email || "").toLowerCase() === em);
    if (same){ const text = it.text || (typeof recordToSFText === "function" ? recordToSFText(F) : ""); const ta = $("sfPaste"); if (ta) ta.value = text; parseSFText(text); ackInbox(it.id);
      toast("Five9 call: " + (c.name || "client") + " opened — \u201cUpdate their numbers\u201d applies the Salesforce read; nothing changed yet"); return; }
    toast("Five9 call: " + (c.name || "client") + " opened — the Salesforce read is in your Inbox if you want to apply it"); }

  /* ---------- the Five9 disposition, written onto the leads that call staged ----------
     A call opens at screenPop / searchAndScreenPop / disableClickToDial and closes at its saveLog (Set Disposition) or after 10 min.
     On saveLog the disposition goes onto: every Inbox entry the call auto-sent, the client it opened, and any Inbox entry whose phone or
     record ID matches the log. Stored as it.f9 / c.f9 = [{disp, at, type, dur, campaign}] — the Inbox row shows it, and Import carries
     it onto the client. Display only: no status, follow-up or log changes. */
  const START = { screenPop: 1, searchAndScreenPop: 1, disableClickToDial: 1, "call-start": 1 };
  function curCall(){ const c = F9.call; return c && !c.closed && Date.now() - c.at < 10 * 60 * 1000 ? c : null; }
  function onCallEvent(ev){ const s = st(); if (!s) return;
    if (START[ev.methodName] && !curCall()) F9.call = { at: Date.now(), items: [], clients: [] };
    if (ev.methodName !== "saveLog") return;
    const r = read(ev); if (!r.disp) return;
    const note = { disp: String(r.disp).slice(0, 80), at: ev.receivedAt || ev.seenAt || new Date().toISOString(), type: r.type || "", dur: r.dur == null ? "" : r.dur, campaign: r.campaign || "", callback: r.callback || "" };
    const call = curCall() || { items: [], clients: [] }; const ids = [r.record].concat(r.ids).filter(Boolean).map(id15);
    const add = (o) => { o.f9 = (o.f9 || []).filter(x => !(x.at === note.at && x.disp === note.disp)); o.f9.push(note); if (o.f9.length > 10) o.f9 = o.f9.slice(-10); };
    let n = 0;
    for (const it of s.inbox || []){ const ph = last10(it.fields && it.fields.phone);
      if (call.items.includes(it.id) || (it.sfId && ids.includes(id15(it.sfId))) || (ph && r.phones.includes(ph))){ add(it); n++; } }
    for (const c of s.clients || []){ if (c.quick) continue;
      if (call.clients.includes(c.id) || (c.sfId && ids.includes(id15(c.sfId))) || (last10(c.phone) && r.phones.includes(last10(c.phone)))){ add(c); n++; } }
    if (F9.call && !F9.call.closed){ F9.call.closed = true; F9.call.closedAt = Date.now(); F9.call.note = note; }
    if (n){ save(); try { if (document.getElementById("s-pipeline").classList.contains("active")) renderPipeline(); } catch (e) {} decorate(); } }
  function f9Label(list){ if (!list || !list.length) return ""; const x = list[list.length - 1];
    const t = new Date(x.at); const when = t.toDateString() === new Date().toDateString() ? t.toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" }) : t.toLocaleDateString("en-US", { month: "short", day: "numeric" }) + " " + t.toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" });
    const rule = ruleFor(x.disp); const act = { follow: "follow-up " + fdate(nextBiz()), followCal: "follow-up " + fdate(nextBiz()) + " + book", dnc: "DNC", notint: "Watching", spanish: "Spanish", wrongNumber: "wrong number", wrongInfo: "wrong info" }[rule];
    return `Five9: <b>${esc(x.disp)}</b> · ${esc(when)}${list.length > 1 ? ` <span style="opacity:.75">(+${list.length - 1} earlier)</span>` : ""}${act ? ` <span style="opacity:.8">→ ${esc(act)}</span>` : ""}`; }
  /* Inbox rows: a small badge next to Import / Ignore. The pipeline redraws its HTML, so this re-applies after every redraw. */
  let decoQueued = false;
  function decorate(){ const s = st(); if (!s) return;
    document.querySelectorAll('button[onclick^="importInbox(\'"]').forEach(b => { const id = (/importInbox\('([^']+)'\)/.exec(b.getAttribute("onclick")) || [])[1];
      const it = (s.inbox || []).find(x => x.id === id); const row = b.parentElement; if (!row) return; let tag = row.querySelector(".f9-inb");
      if (!it || !it.f9 || !it.f9.length){ if (tag) tag.remove(); return; }
      const html = f9Label(it.f9); if (tag && tag.innerHTML === html) return;
      if (!tag){ tag = document.createElement("span"); tag.className = "f9-inb"; row.insertBefore(tag, row.firstChild); }
      tag.style.cssText = "font-size:11.5px;background:#EEE9F8;color:#3E2A7A;border-radius:999px;padding:2px 9px;margin-right:6px;white-space:nowrap"; tag.title = it.f9.map(x => x.disp + " — " + new Date(x.at).toLocaleString()).join("\n"); tag.innerHTML = html; }); }
  new MutationObserver(() => { if (decoQueued) return; decoQueued = true; requestAnimationFrame(() => { decoQueued = false; decorate(); }); }).observe(document.body, { childList: true, subtree: true });
  /* Import carries the call notes onto the client it creates or opens */
  if (typeof W.importInbox === "function" && !W.importInbox.__f9){ const orig = W.importInbox;
    W.importInbox = function(id){ const s = st(); const it = s && (s.inbox || []).find(x => x.id === id); const notes = it && it.f9 ? it.f9.slice() : null;
      const had = new Set((s && s.clients || []).map(c => c.id));
      const out = orig.apply(this, arguments);
      if (!notes) setTimeout(() => { const c = (st().clients || []).find(c => c.id === st().currentId); if (c && !had.has(c.id)) { queueOwner(c, it); save(); try { refreshAll(); } catch (e) {} } }, 0);
      if (notes) setTimeout(() => { const c = (st().clients || []).find(c => c.id === st().currentId); if (!c) return;
        c.f9 = (c.f9 || []).concat(notes.filter(n => !(c.f9 || []).some(x => x.at === n.at && x.disp === n.disp))).slice(-10);
        const isNew = !had.has(c.id); const rule = isNew ? applyRule(c, notes) : "";
        if (isNew) queueOwner(c, it);
        save(); try { refreshAll(); } catch (e) {}
        const last = notes[notes.length - 1].disp;
        try { toast(isNew ? "Five9: " + last + " — " + (RULE_TXT[rule] || "no automatic action") : "Five9 on this client: " + notes.map(n => n.disp).join(", ") + " (saved as a note)"); } catch (e) {} }, 0);
      return out; };
    W.importInbox.__f9 = true; }

  /* ---------- Lead owner at Import ----------
     A new client imported from a Salesforce Lead gets a job: the extension (sf-owner.js) takes ownership if the lead sits in Lead Queue,
     leaves it if it's already the banker's, and reports "Already assigned to <name>" if another banker owns it. Jobs live in state.sfJobs
     until done (or 3 days); c.sfOwner = {state, name, error, at} drives the chip on the client bar / pipeline row. */
  function queueOwner(c, it){ const rid = (it && it.sfId) || c.sfId || ""; if (it && it.sfId && !c.sfId) c.sfId = it.sfId;
    if (!/^00Q/.test(rid) || (it && it.converted)) return;
    const s = st(); s.sfJobs = (s.sfJobs || []).filter(j => !(j.kind === "owner" && j.clientId === c.id));
    s.sfJobs.push({ id: "own" + Date.now().toString(36) + Math.random().toString(36).slice(2, 6), kind: "owner", recordId: rid, clientId: c.id, created: Date.now(), taken: 0 });
    c.sfOwner = { state: "pending", at: new Date().toISOString() }; }
  W.nmcSfJobs = {
    take(rid){ const s = st(); if (!rid) return []; if (!s || !s.sfJobs || !s.sfJobs.length) return []; const now = Date.now(), name = (s.settings && s.settings.loName || "").trim();
      s.sfJobs = s.sfJobs.filter(j => now - j.created < 3 * 864e5 && (s.clients || []).some(c => c.id === j.clientId));
      const mine = s.sfJobs.filter(j => String(j.recordId).slice(0, 15) === String(rid).slice(0, 15) && now - (j.taken || 0) > 30000);
      mine.forEach(j => { j.taken = now; const c = (s.clients || []).find(x => x.id === j.clientId); if (c && (!c.sfOwner || c.sfOwner.state !== "assigning")) { c.sfOwner = Object.assign({}, c.sfOwner, { state: "assigning" }); try { renderClientBar(); } catch (e) {} } });
      return mine.map(j => ({ id: j.id, kind: j.kind, recordId: j.recordId, bankerName: name })); },
    done(id, r){ const s = st(); if (!s) return; const j = (s.sfJobs || []).find(x => x.id === id); if (!j) return;
      const c = (s.clients || []).find(x => x.id === j.clientId);
      if (r.state === "retry"){ j.tries = (j.tries || 0) + 1; j.taken = 0;   /* stopped partway (tab hidden, lead switched, box slow) — try again next time the lead is on screen */
        if (j.tries < 4){ if (c) c.sfOwner = { state: "pending", note: r.error || "", at: new Date().toISOString() }; save(); try { refreshAll(); } catch (e) {} return; }
        r = { state: "failed", owner: r.owner, error: (r.error || "it kept stopping partway") + " (tried 4 times)" }; }
      s.sfJobs = s.sfJobs.filter(x => x.id !== id);
      if (c){ c.sfOwner = { state: r.state, name: r.owner || "", error: r.error || "", at: new Date().toISOString() }; }
      save(); try { refreshAll(); if ($("s-pipeline") && $("s-pipeline").classList.contains("active")) renderPipeline(); } catch (e) {}
      const who = c ? c.name : "the lead";
      try { toast(r.state === "assigned" ? "Salesforce: " + who + " is now assigned to you" : r.state === "mine" ? "Salesforce: " + who + " was already yours" : r.state === "other" ? "Salesforce: " + who + " is already assigned to " + (r.owner || "another banker") + " — left as is" : "Salesforce owner not changed for " + who + ": " + (r.error || "unknown problem")); } catch (e) {} } };

  W.nmcFive9Init = function(o){ F9.events = (o && o.events) || []; F9.beta = !!(o && o.beta);
    if (!F9.hooked){ F9.hooked = true; try { DESK.onSfIncoming(onSf); } catch (e) {}
      setInterval(() => { if ($("s-settings") && $("s-settings").classList.contains("active")) statusLine(); }, 30000);
      document.addEventListener("click", e => { if (e.target.closest && e.target.closest('[data-s="settings"]')) setTimeout(() => { if (F9.dirty) render(); }, 0); }, true);
      new MutationObserver(() => { if (F9.dirty && $("s-settings") && $("s-settings").classList.contains("active")) render(); }).observe($("s-settings") || document.body, { attributes: true, attributeFilter: ["class"] }); }
    try { if (backfill()) save(); } catch (e) {}
    render(); };
  W.nmcFive9Push = function(ev){ F9.events.push(ev); if (F9.events.length > 200) F9.events = F9.events.slice(-200); try { onCallEvent(ev); } catch (e) { console.warn("five9: call note", e); } render();
    if (ev.methodName === "saveLog"){ const r = read(ev); try { toast("Five9: " + (r.disp || "call logged") + " — saved as a note on the lead"); } catch (e) {} } };
  W.nmcFive9Debug = { read, match, box, wouldDo };   /* for tests */
})();
