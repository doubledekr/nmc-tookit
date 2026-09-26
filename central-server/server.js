#!/usr/bin/env node
/* =========================================================================
   NMC Central Server — the hub for the Banker Toolkit
   - Publishes rates to every banker's toolkit   GET  /rates.json
   - Owners update rates                          POST /api/rates  (token) or /admin page
   - Receives banker call-block reports           POST /api/blocks
   - Serves the team rollup                       GET  /api/team
   - Owners' dashboard                            GET  /  (or /dashboard)
   Zero dependencies. Node 18+.  Run:  node server.js
   ========================================================================= */
"use strict";
const http = require("http"), https = require("https"), fs = require("fs"), path = require("path");

const PORT  = process.env.PORT || 8787;
const TOKEN = process.env.NMC_ADMIN_TOKEN || "change-me";
const ORIGIN = process.env.NMC_ALLOW_ORIGIN || "*"; // tighten on a real deploy

const DATA   = path.join(__dirname, "data");
const SHARED_DIR   = path.join(DATA, "shared");
const PRESENCE_DIR = path.join(DATA, "presence");
const SAVES_DIR    = path.join(DATA, "saves");
const INBOX_DIR    = path.join(DATA, "inbox");
for (const d of [SHARED_DIR, PRESENCE_DIR, SAVES_DIR, INBOX_DIR]) try { fs.mkdirSync(d, { recursive: true }); } catch (e) {}
const slugify = s => String(s || "").toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 60) || "banker";
function cleanTemplates(list){
  return (Array.isArray(list) ? list : []).slice(0, 60).map(t => ({
    id: String(t.id || "").slice(0, 40) || ("t" + Math.random().toString(36).slice(2, 8)),
    kind: ["intro","text","email"].includes(t.kind) ? t.kind : "text",
    title: String(t.title || "").slice(0, 140),
    subject: String(t.subject || "").slice(0, 200),
    body: String(t.body || "").slice(0, 6000),
  })).filter(t => t.title || t.body);
}
function presenceList(){
  const out = []; const now = Date.now();
  try { for (const fn of fs.readdirSync(PRESENCE_DIR)) {
    try { const j = JSON.parse(fs.readFileSync(path.join(PRESENCE_DIR, fn), "utf8"));
      out.push({ slug: j.slug || fn.replace(/\.json$/, ""), name: String(j.name || "").slice(0, 80),
        last: j.t || 0, online: now - (j.t || 0) < 3 * 60 * 1000 }); } catch (e) {}
  } } catch (e) {}
  return out.sort((a, b) => b.last - a.last);
}
function savesIndex(){ /* metadata only — never the client data itself */
  const out = [];
  try { for (const fn of fs.readdirSync(SAVES_DIR)) {
    try { const st = fs.statSync(path.join(SAVES_DIR, fn));
      const j = JSON.parse(fs.readFileSync(path.join(SAVES_DIR, fn), "utf8"));
      out.push({ slug: j.slug || fn.replace(/\.json$/, ""), banker: String(j.banker || "").slice(0, 80),
        nmls: String(j.nmls || "").slice(0, 20), sent: j.sent || st.mtime.toISOString(),
        clients: j.clients || 0, bytes: st.size }); } catch (e) {}
  } } catch (e) {}
  return out.sort((a, b) => String(b.sent).localeCompare(String(a.sent)));
}
function sharedPool(){
  const out = [];
  try { for (const fn of fs.readdirSync(SHARED_DIR)) {
    try { const j = JSON.parse(fs.readFileSync(path.join(SHARED_DIR, fn), "utf8"));
      for (const t of cleanTemplates(j.templates))
        out.push(Object.assign({ banker: String(j.banker || "").slice(0, 80) }, t)); } catch (e) {}
  } } catch (e) {}
  return out;
}
const BLOCKS = path.join(DATA, "blocks");
const RATES  = path.join(DATA, "rates.json");
fs.mkdirSync(BLOCKS, { recursive: true });
if (!fs.existsSync(RATES))
  fs.writeFileSync(RATES, JSON.stringify({ updated: new Date().toISOString().slice(0,10),
    rates: { Conventional: 6.125, FHA: 5.875, VA: 5.75 } }, null, 2));

function cors(res){ res.setHeader("Access-Control-Allow-Origin", ORIGIN);
  res.setHeader("Access-Control-Allow-Methods","GET,POST,OPTIONS");
  res.setHeader("Access-Control-Allow-Headers","Content-Type"); }
function send(res, code, body, type){ cors(res);
  res.writeHead(code, { "Content-Type": type || "application/json; charset=utf-8" });
  res.end(typeof body === "string" ? body : JSON.stringify(body)); }
function readBody(req, max){ const cap = max || 2e6;
  return new Promise((ok, bad) => { let b = "";
  req.on("data", d => { b += d; if (b.length > cap) { bad(new Error("payload too large")); req.destroy(); } });
  req.on("end", () => ok(b)); req.on("error", bad); }); }
const slug = s => String(s || "unknown").toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g,"").slice(0, 60) || "unknown";

/* ---- team aggregation: latest snapshot per banker, monthly history ---- */
function readBankerFiles(){
  const src = {};
  for (const fx of fs.readdirSync(BLOCKS)){
    if (!fx.endsWith(".json")) continue;
    try { const p = JSON.parse(fs.readFileSync(path.join(BLOCKS, fx), "utf8"));
      src[fx.replace(/\.json$/,"")] = { banker: p.banker || fx, nmls: p.nmls || "",
        lastReport: p.sent || "", blocks: p.blocks || [] };
    } catch (e) {}
  }
  return src;
}
function zeroM(){ return { blocks:0, dials:0, contacts:0, interested:0, folders:0, mins:0 }; }
function teamData(){
  const src = readBankerFiles();
  const months = {};
  for (const key in src){ const p = src[key];
    for (const b of p.blocks){ const mk = (b.date || "").slice(0, 7); if (!mk) continue;
      const M = months[mk] = months[mk] || { month: mk, team: zeroM(), bankers: {} };
      const bb = M.bankers[key] = M.bankers[key] || { banker: p.banker, nmls: p.nmls, lastReport: p.lastReport, month: zeroM() };
      bb.month.blocks++; bb.month.dials += b.dials||0; bb.month.contacts += b.contacts||0;
      bb.month.interested += b.interested||0; bb.month.folders += b.folders||0; bb.month.mins += b.dur||0;
      M.team.blocks++; M.team.dials += b.dials||0; M.team.contacts += b.contacts||0;
      M.team.interested += b.interested||0; M.team.folders += b.folders||0; M.team.mins += b.dur||0;
    }
  }
  const history = Object.values(months)
    .map(M => ({ month: M.month, team: M.team,
      bankers: Object.values(M.bankers).sort((a, b) => b.month.folders - a.month.folders) }))
    .sort((a, b) => b.month.localeCompare(a.month));
  const curKey = new Date().toISOString().slice(0, 7);
  let cur = history.find(h => h.month === curKey);
  if (!cur){
    cur = { month: curKey, team: zeroM(),
      bankers: Object.values(src).map(p => ({ banker: p.banker, nmls: p.nmls, lastReport: p.lastReport, month: zeroM() })) };
    history.unshift(cur);
  }
  return { updated: new Date().toLocaleString("en-US"), month: curKey,
    team: cur.team, bankers: cur.bankers, history };
}

/* ---------------------------- routes ---------------------------- */
const server = http.createServer(async (req, res) => {
  const p = new URL(req.url, "http://x").pathname;
  if (req.method === "OPTIONS") return send(res, 204, "");
  try {
    if (p === "/rates.json" && req.method === "GET")
      return send(res, 200, fs.readFileSync(RATES, "utf8"));

    if (p === "/api/rates" && req.method === "POST"){
      const b = JSON.parse((await readBody(req)) || "{}");
      if (b.token !== TOKEN) return send(res, 403, { error: "bad token" });
      if (!b.rates || typeof b.rates !== "object") return send(res, 400, { error: "missing rates object" });
      const out = { updated: String(b.updated || new Date().toISOString().slice(0,10)).slice(0,40), rates: {} };
      for (const k in b.rates){ const v = +b.rates[k];
        if (isFinite(v) && v > 0 && v < 20) out.rates[String(k).slice(0,30)] = v; }
      if (!Object.keys(out.rates).length) return send(res, 400, { error: "no valid rates" });
      try { const old = JSON.parse(fs.readFileSync(RATES, "utf8")); if (old.treasury) out.treasury = old.treasury; } catch (e) {}
      fs.writeFileSync(RATES, JSON.stringify(out, null, 2));
      const HIST = path.join(DATA, "rate-history.json");
      let hist = []; try { hist = JSON.parse(fs.readFileSync(HIST, "utf8")); } catch (e) {}
      hist.push({ t: Date.now(), updated: out.updated, rates: out.rates });
      if (hist.length > 1000) hist = hist.slice(-1000);
      fs.writeFileSync(HIST, JSON.stringify(hist));
      return send(res, 200, { ok: true, saved: out });
    }

    if (p === "/api/blocks" && req.method === "POST"){
      const b = JSON.parse((await readBody(req)) || "{}");
      if (!b.banker || !Array.isArray(b.blocks)) return send(res, 400, { error: "expected {banker, nmls, blocks:[...]}" });
      const clean = { banker: String(b.banker).slice(0,80), nmls: String(b.nmls || "").slice(0,20),
        sent: new Date().toISOString(),
        blocks: b.blocks.slice(0, 2000).map(x => ({ date: String(x.date || "").slice(0,24), label: String(x.label || "").slice(0,60),
          dur: Math.max(0,+x.dur||0), dials: Math.max(0,+x.dials||0), contacts: Math.max(0,+x.contacts||0),
          interested: Math.max(0,+x.interested||0), folders: Math.max(0,+x.folders||0) })) };
      fs.writeFileSync(path.join(BLOCKS, slug(clean.banker + "-" + clean.nmls) + ".json"),
        JSON.stringify(clean, null, 2));
      return send(res, 200, { ok: true, stored: clean.blocks.length });
    }

    if (p === "/api/team" && req.method === "GET") return send(res, 200, teamData());

    if (p === "/api/rates.csv" && req.method === "GET"){
      let hist = []; try { hist = JSON.parse(fs.readFileSync(path.join(DATA, "rate-history.json"), "utf8")); } catch (e) {}
      const prods = []; hist.forEach(h => Object.keys(h.rates || {}).forEach(k => { if (!prods.includes(k)) prods.push(k); }));
      const rows = [["time", "updated"].concat(prods)];
      hist.forEach(h => rows.push([new Date(h.t).toISOString(), h.updated].concat(prods.map(pk => h.rates[pk] ?? ""))));
      const csv = rows.map(r => r.map(x => '"' + String(x == null ? "" : x).replace(/"/g, '""') + '"').join(",")).join("\n");
      cors(res); res.writeHead(200, { "Content-Type": "text/csv",
        "Content-Disposition": "attachment; filename=nmc-rate-history.csv" });
      return res.end(csv);
    }

    if (p === "/api/snapshot" && req.method === "GET"){
      /* One self-describing JSON of everything the org tracks — built to be handed
         to an AI/analytics layer later without changing the collectors. */
      let rates = null, hist = [];
      try { rates = JSON.parse(fs.readFileSync(RATES, "utf8")); } catch (e) {}
      try { hist = JSON.parse(fs.readFileSync(path.join(DATA, "rate-history.json"), "utf8")); } catch (e) {}
      return send(res, 200, { schema: 1, generated: new Date().toISOString(),
        description: "NMC org snapshot: current rates, rate history, and monthly call-block rollups per banker. Counts only — no client data.",
        rates, rateHistory: hist,
        presence: presenceList(),
        savesIndex: savesIndex(), /* metadata only — full saves stay behind the admin token */
        templates: (() => { try { return JSON.parse(fs.readFileSync(path.join(DATA, "templates.json"), "utf8")); } catch (e) { return null; } })(),
        sharedTemplates: sharedPool(),
        team: teamData() });
    }

    if (p === "/api/templates" && req.method === "GET"){
      let t = '{"updated":null,"templates":[]}';
      try { t = fs.readFileSync(path.join(DATA, "templates.json"), "utf8"); } catch (e) {}
      return send(res, 200, t);
    }

    if (p === "/api/templates" && req.method === "POST"){
      const b = JSON.parse((await readBody(req)) || "{}");
      if ((b.token || "") !== TOKEN) return send(res, 403, { error: "bad token" });
      const out = { updated: new Date().toISOString().slice(0, 10), templates: cleanTemplates(b.templates) };
      fs.writeFileSync(path.join(DATA, "templates.json"), JSON.stringify(out, null, 2));
      return send(res, 200, { ok: true, count: out.templates.length });
    }

    if (p === "/api/shared-templates" && req.method === "GET"){
      return send(res, 200, { updated: new Date().toISOString(), templates: sharedPool() });
    }

    if (p === "/api/shared-templates" && req.method === "POST"){
      /* per-banker file, wholesale replace — unsharing removes it on the next push */
      const b = JSON.parse((await readBody(req)) || "{}");
      const slug = slugify(b.slug || b.banker);
      const out = { banker: String(b.banker || "").slice(0, 80), slug,
        sent: new Date().toISOString(), templates: cleanTemplates(b.templates) };
      fs.writeFileSync(path.join(SHARED_DIR, slug + ".json"), JSON.stringify(out, null, 2));
      return send(res, 200, { ok: true, count: out.templates.length });
    }

    if (p === "/api/heartbeat" && req.method === "POST"){
      const b = JSON.parse((await readBody(req)) || "{}");
      const slug = slugify(b.slug || b.name);
      fs.writeFileSync(path.join(PRESENCE_DIR, slug + ".json"),
        JSON.stringify({ slug, name: String(b.name || "").slice(0, 80), t: Date.now() }));
      return send(res, 200, { ok: true });
    }

    if (p === "/api/presence" && req.method === "GET"){
      return send(res, 200, { generated: new Date().toISOString(), bankers: presenceList() });
    }

    if (p === "/api/save" && req.method === "POST"){
      /* full toolkit save mirrored up — decoupled from the banker's local save,
         which always succeeds on its own. This endpoint stores client data:
         keep the server on the LAN/VPN or behind HTTPS + auth. */
      const b = JSON.parse((await readBody(req, 8e6)) || "{}");
      if (!b.state || typeof b.state !== "object") return send(res, 400, { error: "expected {slug, banker, state:{...}}" });
      const slug = slugify(b.slug || b.banker);
      const out = { banker: String(b.banker || "").slice(0, 80), nmls: String(b.nmls || "").slice(0, 20),
        slug, sent: new Date().toISOString(),
        clients: Array.isArray(b.state.clients) ? b.state.clients.length : 0,
        state: b.state };
      fs.writeFileSync(path.join(SAVES_DIR, slug + ".json"), JSON.stringify(out));
      return send(res, 200, { ok: true, slug, clients: out.clients });
    }

    if (p === "/api/saves" && req.method === "GET"){
      const q = new URL(req.url, "http://x").searchParams;
      if ((q.get("token") || req.headers["x-admin-token"] || "") !== TOKEN)
        return send(res, 403, { error: "admin token required" });
      return send(res, 200, { generated: new Date().toISOString(), saves: savesIndex() });
    }

    if (p.startsWith("/api/saves/") && req.method === "GET"){
      const q = new URL(req.url, "http://x").searchParams;
      if ((q.get("token") || req.headers["x-admin-token"] || "") !== TOKEN)
        return send(res, 403, { error: "admin token required" });
      const slug = slugify(decodeURIComponent(p.slice("/api/saves/".length)));
      try { return send(res, 200, fs.readFileSync(path.join(SAVES_DIR, slug + ".json"), "utf8")); }
      catch (e) { return send(res, 404, { error: "no save for " + slug }); }
    }

    /* ---- on-demand Salesforce import: a banker clicks a URL button on an open lead ----
       The button opens /import?banker={!$User.Email}&name=...&rate=... ; we file the record in
       that banker's inbox and their toolkit picks it up on its next sync (focus, 5-min, or
       manual). Only whitelisted fields are kept; SSN/DOB/age/marital status are refused. */
    const IMPORT_KEYS = ["name","email","phone","balance","balanceAlt","rate","payment","value","fico","servicer",
      "leadSource","mortType","leadStatus","closeDate","monthsSince","purpose","rateToBeat","ccBal","ccCount","ccPay",
      "autoBal","autoPay","helBal","helPay","instBal","loanCount","address","sfid"];
    const IMPORT_NEVER = /ssn|social|birth|dob|age|marital/i;
    if (p === "/import" && req.method === "GET"){
      const q = new URL(req.url, "http://x").searchParams;
      if (process.env.NMC_IMPORT_KEY && q.get("key") !== process.env.NMC_IMPORT_KEY) return send(res, 403, "bad key");
      const banker = (q.get("banker") || "").trim();
      if (!banker) return send(res, 400, "missing banker");
      const rec = { id: Date.now().toString(36) + Math.random().toString(36).slice(2, 6), received: new Date().toISOString(), fields: {} };
      for (const [k, v] of q.entries()){ if (IMPORT_NEVER.test(k)) continue;
        if (IMPORT_KEYS.includes(k) && v && v.trim()) rec.fields[k] = v.trim().slice(0, 200); }
      if (!rec.fields.name) return send(res, 400, "missing name");
      const dir = path.join(INBOX_DIR, slugify(banker)); fs.mkdirSync(dir, { recursive: true });
      fs.writeFileSync(path.join(dir, rec.id + ".json"), JSON.stringify(rec));
      const page = `<!doctype html><meta charset="utf-8"><title>Sent to your NMC toolkit</title>
        <body style="font-family:Montserrat,Segoe UI,Arial,sans-serif;background:#FBF8F2;color:#343740;margin:0;display:grid;place-items:center;height:100vh">
        <div style="background:#fff;border:1px solid #E5DFD2;border-radius:14px;padding:28px 32px;max-width:460px">
        <div style="color:#A53222;font-weight:700;font-size:12px;letter-spacing:.06em">\u276F SENT</div>
        <h1 style="font-family:Lora,Georgia,serif;font-weight:400;font-size:24px;margin:6px 0 10px">${rec.fields.name.replace(/[<>&]/g,"")} is on the way</h1>
        <p style="line-height:1.6;margin:0 0 6px">Switch to your NMC toolkit \u2014 it appears at the top of your Pipeline as <b>New from Salesforce</b>. Hit <b>Import</b> there to review the fields before they land on the client.</p>
        <p style="font-size:12px;color:#5C616E;margin:0">This tab closes itself in a moment.</p></div>
        <script>setTimeout(function(){ window.close(); }, 2500);</script></body>`;
      res.writeHead(200, { "Content-Type": "text/html; charset=utf-8" }); return res.end(page);
    }
    if (p === "/api/inbox" && req.method === "GET"){
      const q = new URL(req.url, "http://x").searchParams; const out = [];
      for (const who of [q.get("email"), q.get("name")]){ if (!who) continue;
        const dir = path.join(INBOX_DIR, slugify(who)); if (!fs.existsSync(dir)) continue;
        for (const fn of fs.readdirSync(dir)) try { out.push(JSON.parse(fs.readFileSync(path.join(dir, fn), "utf8"))); } catch (e) {} }
      out.sort((a, b) => b.received.localeCompare(a.received));
      return send(res, 200, { items: out });
    }
    if (p === "/api/inbox/ack" && req.method === "POST"){
      const b = JSON.parse((await readBody(req)) || "{}");
      for (const who of [b.email, b.name]){ if (!who) continue;
        const fp = path.join(INBOX_DIR, slugify(who), String(b.id || "").replace(/[^a-z0-9]/gi, "") + ".json");
        try { fs.unlinkSync(fp); } catch (e) {} }
      return send(res, 200, { ok: true });
    }

    /* ---- AVM plug-in: any licensed provider, configured by IT with env vars ----
       NMC_AVM_URL     template, e.g. https://api.provider.com/avm?address={address}
       NMC_AVM_HEADERS optional JSON, e.g. {"apikey":"..."}
       NMC_AVM_PATH    dot-path to the value in the JSON reply, e.g. data.estimate   (default: value)
       NMC_AVM_LOW / NMC_AVM_HIGH / NMC_AVM_CONF   optional dot-paths for range and confidence
       NMC_AVM_SOURCE  label shown to bankers, e.g. "Clear Capital"                         */
    if (p === "/api/avm" && req.method === "GET"){
      const q = new URL(req.url, "http://x").searchParams; const address = (q.get("address") || "").trim();
      if (!address) return send(res, 400, { error: "address required" });
      if (!process.env.NMC_AVM_URL) return send(res, 501, { error: "no AVM provider configured", hint: "set NMC_AVM_URL on the hub (see README)" });
      const cacheFile = path.join(DATA, "avm-cache.json"); let cache = {};
      try { cache = JSON.parse(fs.readFileSync(cacheFile, "utf8")); } catch (e) {}
      const key = address.toLowerCase().replace(/\s+/g, " ");
      if (cache[key] && Date.now() - cache[key].t < 24 * 3600 * 1000) return send(res, 200, cache[key].v);
      const dig = (o, pth) => pth ? pth.split(".").reduce((a, k) => (a == null ? undefined : a[k]), o) : undefined;
      try {
        let headers = {}; try { headers = JSON.parse(process.env.NMC_AVM_HEADERS || "{}"); } catch (e) {}
        const url = process.env.NMC_AVM_URL.replace("{address}", encodeURIComponent(address));
        const r = await httpGet(url, 3, headers);
        if (r.status !== 200) return send(res, 502, { error: "provider returned HTTP " + r.status });
        const j = JSON.parse(r.body);
        const value = Number(dig(j, process.env.NMC_AVM_PATH || "value"));
        if (!isFinite(value) || value <= 0) return send(res, 404, { error: "no estimate for that address" });
        const out = { address, value: Math.round(value),
          low: Number(dig(j, process.env.NMC_AVM_LOW)) || null, high: Number(dig(j, process.env.NMC_AVM_HIGH)) || null,
          confidence: dig(j, process.env.NMC_AVM_CONF) ?? null,
          source: process.env.NMC_AVM_SOURCE || "AVM", asOf: new Date().toISOString().slice(0, 10) };
        cache[key] = { t: Date.now(), v: out }; fs.writeFileSync(cacheFile, JSON.stringify(cache));
        return send(res, 200, out);
      } catch (e) { return send(res, 502, { error: "provider error: " + e.message }); }
    }

    if (p.startsWith("/updates/") && req.method === "GET"){   /* desktop-app auto-update files (see nmc-toolkit-desktop/README-DESKTOP.md) */
      const fp = path.join(DATA, "updates", path.basename(decodeURIComponent(p.slice("/updates/".length))));
      try { const st = fs.statSync(fp); res.writeHead(200, { "Content-Type": /\.yml$/.test(fp) ? "text/yaml" : "application/octet-stream", "Content-Length": st.size });
        return fs.createReadStream(fp).pipe(res); } catch (e) { return send(res, 404, { error: "no such update file" }); }
    }

    if (p === "/api/treasury" && req.method === "GET"){
      let t = "null"; try { t = fs.readFileSync(path.join(DATA, "treasury.json"), "utf8"); } catch (e) {}
      return send(res, 200, t);
    }

    if (p === "/api/rate-history" && req.method === "GET"){
      let hist = "[]"; try { hist = fs.readFileSync(path.join(DATA, "rate-history.json"), "utf8"); } catch (e) {}
      return send(res, 200, hist);
    }

    if (p === "/api/master.csv" && req.method === "GET"){
      const rows = [["banker","nmls","start","label","minutes","dials","contacts","interested","folders"]];
      for (const fx of fs.readdirSync(BLOCKS)){ if (!fx.endsWith(".json")) continue;
        try { const pj = JSON.parse(fs.readFileSync(path.join(BLOCKS, fx), "utf8"));
          for (const b of pj.blocks || []) rows.push([pj.banker, pj.nmls, b.date, b.label || "", b.dur, b.dials, b.contacts, b.interested, b.folders]);
        } catch (e) {} }
      const csv = rows.map(r => r.map(x => '"' + String(x == null ? "" : x).replace(/"/g, '""') + '"').join(",")).join("\n");
      cors(res); res.writeHead(200, { "Content-Type": "text/csv",
        "Content-Disposition": "attachment; filename=nmc-master-blocks.csv" });
      return res.end(csv);
    }
    if (p === "/admin") return send(res, 200, ADMIN, "text/html; charset=utf-8");
    if (p === "/" || p === "/dashboard") return send(res, 200, DASH, "text/html; charset=utf-8");
    return send(res, 404, { error: "not found" });
  } catch (e) { return send(res, 500, { error: e.message }); }
});

/* ---------------------------- admin page (set rates) ---------------------------- */
const STYLE = "<style>" +
":root{--brand:#7E2318;--ink:#23242B;--cream:#EDE3D2;--cream-soft:#F7F1E6;--peri:#EDF1FA;--line:#E5E0D5}" +
"*{box-sizing:border-box;margin:0;padding:0}" +
"body{font-family:'DM Sans','Segoe UI',Arial,sans-serif;background:#FBF8F2;color:var(--ink);padding:30px;font-size:15px}" +
"h1,h2{font-family:Lora,Georgia,serif}h1{font-size:26px;margin:4px 0 16px}h2{font-size:17px;margin:0 0 12px}" +
".eyebrow{color:var(--brand);font-size:11px;font-weight:700;letter-spacing:.14em;text-transform:uppercase}" +
".eyebrow:before{content:'\\276F  '}" +
".panel{background:#fff;border:1px solid var(--line);border-radius:14px;padding:20px;margin-bottom:16px;max-width:980px}" +
"table{width:100%;border-collapse:collapse;font-size:13.5px}" +
"th{text-align:left;color:#5C616E;font-size:12px;border-bottom:2px solid var(--ink);padding:6px 8px}" +
"td{border-bottom:1px solid var(--line);padding:7px 8px}.num{text-align:right;font-variant-numeric:tabular-nums}" +
"input{font:inherit;padding:8px 10px;border:1px solid var(--line);border-radius:8px}" +
"button{font:inherit;font-weight:600;background:var(--brand);color:#fff;border:none;border-radius:8px;padding:9px 16px;cursor:pointer}" +
".stat{background:var(--peri);border-radius:14px;padding:14px 16px;display:inline-block;margin:0 10px 10px 0;min-width:170px}" +
".stat .v{font-family:Lora,Georgia,serif;font-size:23px;font-weight:600}.stat .l{font-size:12px;color:#5C616E}" +
".hl{background:var(--cream)}.hint{font-size:12.5px;color:#5C616E}</style>";

const ADMIN = "<!DOCTYPE html><html><head><meta charset='utf-8'><title>NMC Rates Admin</title>" + STYLE + "</head><body>" +
"<div class='eyebrow'>Neighborhood Mortgage Company</div><h1>Rate Desk — push today's rates</h1>" +
"<div class='panel'><h2>Current feed</h2><div id='cur' class='hint'>loading…</div></div>" +
"<div class='panel'><h2>Update</h2><div id='rows'></div>" +
"<p style='margin:10px 0'><button onclick='addRow(\"\",\"\")'>+ Add product</button></p>" +
"<p><input id='tok' type='password' placeholder='Admin token' style='width:220px'> " +
"<button onclick='push()'>Publish to all bankers</button> <span id='msg' class='hint'></span></p>" +
"<p class='hint'>Every banker's toolkit polls /rates.json — publishing here updates their streamline flags within their poll interval.</p></div>" +
"<script>" +
"function addRow(k,v){var d=document.createElement('div');d.style.margin='4px 0';" +
"d.innerHTML='<input class=pk placeholder=Product value=\"'+k+'\" style=\"width:200px\"> <input class=pv type=number step=0.001 placeholder=Rate value=\"'+v+'\" style=\"width:110px\"> %';" +
"document.getElementById('rows').appendChild(d);}" +
"fetch('/rates.json').then(function(r){return r.json()}).then(function(j){" +
"document.getElementById('cur').textContent='Updated '+j.updated+': '+Object.keys(j.rates).map(function(k){return k+' '+j.rates[k]+'%'}).join('  ·  ');" +
"Object.keys(j.rates).forEach(function(k){addRow(k,j.rates[k])});});" +
"function push(){var rates={};var ks=document.querySelectorAll('.pk'),vs=document.querySelectorAll('.pv');" +
"for(var i=0;i<ks.length;i++){if(ks[i].value&&vs[i].value)rates[ks[i].value]=parseFloat(vs[i].value);}" +
"fetch('/api/rates',{method:'POST',headers:{'Content-Type':'application/json'}," +
"body:JSON.stringify({token:document.getElementById('tok').value,rates:rates})})" +
".then(function(r){return r.json()}).then(function(j){document.getElementById('msg').textContent=j.ok?'Published ✓':'Error: '+j.error;});}" +
"</script></body></html>";

/* ---------------------------- owners' dashboard ---------------------------- */
const DASH = "<!DOCTYPE html><html><head><meta charset='utf-8'><title>NMC Team Dashboard</title>" + STYLE + "</head><body>" +
"<div class='eyebrow'>Neighborhood Mortgage Company</div><h1>Team Dashboard</h1>" +
"<div class='panel'><h2>Today's feed</h2><div id='rates' class='hint'>loading…</div></div>" +
"<div class='panel'><h2>This month, whole team</h2><div id='cards'></div></div>" +
"<div class='panel'><h2>Banker by banker</h2><div id='tbl'></div>" +
"<p class='hint' style='margin-top:8px'>Exports: <a href='/api/master.csv' style='color:var(--brand)'>Call blocks (CSV)</a> \u00b7 <a href='/api/rates.csv' style='color:var(--brand)'>Rate history (CSV)</a> \u00b7 <a href='/api/snapshot' style='color:var(--brand)'>Full snapshot (JSON, AI-ready)</a></p>" +
"<p class='hint' id='upd' style='margin-top:8px'></p></div>" +
"<script>" +
"function pctf(a,b){return b?Math.round(a/b*100)+'%':'—'}" +
"function refresh(){" +
"fetch('/rates.json').then(function(r){return r.json()}).then(function(j){" +
"var t=j.treasury; document.getElementById('rates').textContent='Updated '+j.updated+': '+Object.keys(j.rates).map(function(k){return k+' '+j.rates[k]+'%'}).join('  ·  ')+(t?('    |    10-yr Treasury '+t.y10+'% ('+t.date+')'):'');});" +
"fetch('/api/team').then(function(r){return r.json()}).then(function(j){var T=j.team;" +
"document.getElementById('cards').innerHTML=" +
"'<div class=\"stat hl\"><div class=v>'+T.folders+'</div><div class=l>Folders · '+j.bankers.length+' bankers reporting</div></div>'+" +
"'<div class=stat><div class=v>'+T.dials+'</div><div class=l>Dials · '+(T.mins/60).toFixed(0)+' hrs on the phones</div></div>'+" +
"'<div class=stat><div class=v>'+pctf(T.contacts,T.dials)+'</div><div class=l>Contact rate</div></div>'+" +
"'<div class=stat><div class=v>'+pctf(T.interested,T.contacts)+'</div><div class=l>Contact → interested</div></div>'+" +
"'<div class=stat><div class=v>'+pctf(T.folders,T.interested)+'</div><div class=l>Interested → folder</div></div>';" +
"var h='<table><tr><th>Banker</th><th class=num>Blocks</th><th class=num>Hrs</th><th class=num>Dials</th><th class=num>Contact %</th><th class=num>Interested</th><th class=num>Folders</th><th class=num>Dials/hr</th><th>Last report</th></tr>';" +
"j.bankers.forEach(function(b){var m=b.month;" +
"h+='<tr><td><b>'+b.banker+'</b>'+(b.nmls?' <span class=hint>#'+b.nmls+'</span>':'')+'</td>'+" +
"'<td class=num>'+m.blocks+'</td><td class=num>'+(m.mins/60).toFixed(1)+'</td><td class=num>'+m.dials+'</td>'+" +
"'<td class=num>'+pctf(m.contacts,m.dials)+'</td><td class=num>'+m.interested+'</td><td class=num><b>'+m.folders+'</b></td>'+" +
"'<td class=num>'+(m.mins?(m.dials/(m.mins/60)).toFixed(1):'—')+'</td>'+" +
"'<td class=hint>'+(b.lastReport?b.lastReport.slice(0,10):'—')+'</td></tr>';});" +
"document.getElementById('tbl').innerHTML=h+'</table>';" +
"document.getElementById('upd').textContent='Updated '+j.updated+' · month '+j.month+' · auto-refreshes every 5 minutes · counts only, no client data';});}" +
"refresh();setInterval(refresh,5*60*1000);" +
"</script></body></html>";

/* ------------------- 10-yr Treasury (public, keyless, official) -------------------
   Pulled hourly from treasury.gov's daily yield-curve XML. Market-direction context
   only — never a lockable rate. Merged into rates.json so every toolkit (and the
   shared-drive relay) carries it automatically. NMC_TREASURY=off disables. */
function httpGet(url, redirects, headers){
  redirects = redirects == null ? 3 : redirects;
  return new Promise((ok, bad) => {
    const req = (url.startsWith("http:") ? http : https).get(url, { headers: Object.assign({ "User-Agent": "NMC-Toolkit/1.0" }, headers || {}) }, res => {
      if ([301,302,307,308].includes(res.statusCode) && res.headers.location && redirects > 0){
        res.resume(); return ok(httpGet(res.headers.location, redirects - 1, headers)); }
      let b = ""; res.on("data", d => b += d); res.on("end", () => ok({ status: res.statusCode, body: b }));
    });
    req.on("error", bad);
    req.setTimeout(15000, () => req.destroy(new Error("timeout")));
  });
}
function parseTreasuryXML(xml){
  const out = [];
  const re = /<d:NEW_DATE[^>]*>([^<]+)<\/d:NEW_DATE>[\s\S]*?<d:BC_10YEAR[^>]*>([^<]+)<\/d:BC_10YEAR>/g;
  let m; while ((m = re.exec(xml))){ const y = parseFloat(m[2]);
    if (isFinite(y)) out.push({ d: m[1].slice(0, 10), y }); }
  out.sort((a, b) => a.d.localeCompare(b.d));
  return out;
}
async function fetchTreasury(){
  if (process.env.NMC_TREASURY === "off") return;
  try {
    const year = new Date().getFullYear();
    const base = "https://home.treasury.gov/resource-center/data-chart-center/interest-rates/pages/xml?data=daily_treasury_yield_curve&field_tdr_date_value=";
    let r = await httpGet(base + year);
    let entries = r.status === 200 ? parseTreasuryXML(r.body) : [];
    if (!entries.length){ r = await httpGet(base + (year - 1));
      entries = r.status === 200 ? parseTreasuryXML(r.body) : []; }
    if (!entries.length) throw new Error("no data in response");
    const hist = entries.slice(-30);
    const last = hist[hist.length - 1], prev = hist[hist.length - 2];
    const tz = { y10: last.y, date: last.d,
      change: prev ? +(last.y - prev.y).toFixed(2) : null, history: hist };
    fs.writeFileSync(path.join(DATA, "treasury.json"), JSON.stringify(tz));
    let cur = { updated: new Date().toISOString().slice(0, 10), rates: {} };
    try { cur = JSON.parse(fs.readFileSync(RATES, "utf8")); } catch (e) {}
    cur.treasury = tz;
    fs.writeFileSync(RATES, JSON.stringify(cur, null, 2));
    console.log("10-yr Treasury: " + last.y + "% (" + last.d + ")");
  } catch (e) {
    if (!fetchTreasury.warned){
      console.log("Treasury fetch unavailable (" + e.message + ") \u2014 fine on an air-gapped hub; set NMC_TREASURY=off to silence.");
      fetchTreasury.warned = true; }
  }
}

if (require.main === module){
  fetchTreasury();
  setInterval(fetchTreasury, 60 * 60 * 1000);
  server.listen(PORT, () => console.log(
    "NMC Central Server running on http://localhost:" + PORT +
    "\n  dashboard  /        rates admin  /admin        feed  /rates.json" +
    "\n  admin token: " + (process.env.NMC_ADMIN_TOKEN ? "(custom)" : "change-me  <-- set NMC_ADMIN_TOKEN before real use!")));
}
module.exports = { parseTreasuryXML, teamData };
