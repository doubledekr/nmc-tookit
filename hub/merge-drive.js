#!/usr/bin/env node
/* =========================================================================
   merge-drive.js — the shared-drive bridge
   Each banker's toolkit autosaves "call-blocks-<name>.csv" into the shared
   folder. This script merges them into one master CSV, and can also feed
   the central server's data folder so the dashboard shows drive-only bankers.

   Usage:
     node merge-drive.js /path/to/shared-folder
     node merge-drive.js /path/to/shared-folder --into-server ./data
     node merge-drive.js /path/to/shared-folder --into-server ./data --watch

   Zero dependencies. Node 18+.
   ========================================================================= */
"use strict";
const fs = require("fs"), path = require("path");

const args = process.argv.slice(2);
const SHARED = args[0];
const serverIdx = args.indexOf("--into-server");
const SERVER_DATA = serverIdx > -1 ? args[serverIdx + 1] : null;
const WATCH = args.includes("--watch");
if (!SHARED || !fs.existsSync(SHARED)){
  console.error("Usage: node merge-drive.js /path/to/shared-folder [--into-server ./data] [--watch]");
  process.exit(1);
}

function parseCSVLine(line){
  const out = []; let cur = "", q = false;
  for (let i = 0; i < line.length; i++){ const ch = line[i];
    if (q){ if (ch === '"'){ if (line[i+1] === '"'){ cur += '"'; i++; } else q = false; } else cur += ch; }
    else { if (ch === '"') q = true; else if (ch === ","){ out.push(cur); cur = ""; } else cur += ch; } }
  out.push(cur); return out;
}
const slug = s => String(s || "unknown").toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g,"").slice(0,60) || "unknown";

function run(){
  const files = fs.readdirSync(SHARED).filter(f => /^call-blocks-.*\.csv$/i.test(f) && f !== "nmc-master-blocks.csv");
  const master = [["banker","nmls","start","label","minutes","dials","contacts","interested","folders"]];
  const byBanker = {};
  for (const f of files){
    const lines = fs.readFileSync(path.join(SHARED, f), "utf8").split(/\r?\n/).filter(Boolean);
    if (!lines.length) continue;
    const head = parseCSVLine(lines[0]).map(h => h.trim().toLowerCase());
    const col = name => head.indexOf(name); // -1 if the column is absent (older files have no "label")
    for (let i = 1; i < lines.length; i++){
      const c = parseCSVLine(lines[i]);
      const g = name => { const ix = col(name); return ix > -1 ? c[ix] : ""; };
      const row = { banker: g("banker"), nmls: g("nmls"), date: g("start"), label: g("label"),
        dur: +g("minutes")||0, dials: +g("dials")||0, contacts: +g("contacts")||0,
        interested: +g("interested")||0, folders: +g("folders")||0 };
      if (!row.banker || !row.date) continue;
      master.push([row.banker,row.nmls,row.date,row.label,row.dur,row.dials,row.contacts,row.interested,row.folders]);
      const key = slug(row.banker + "-" + row.nmls);
      (byBanker[key] = byBanker[key] || { banker: row.banker, nmls: row.nmls, blocks: [] }).blocks.push(row);
    }
  }
  const csv = master.map(r => r.map(x => '"' + String(x == null ? "" : x).replace(/"/g,'""') + '"').join(",")).join("\n");
  fs.writeFileSync(path.join(SHARED, "nmc-master-blocks.csv"), csv);

  // team.json — same shape the server's /api/team returns, so every toolkit
  // reading the shared folder sees the collective numbers (with monthly history)
  const zero = () => ({ blocks:0, dials:0, contacts:0, interested:0, folders:0, mins:0 });
  const months = {};
  for (const key in byBanker){ const p = byBanker[key];
    for (const b of p.blocks){ const mk = (b.date || "").slice(0, 7); if (!mk) continue;
      const M = months[mk] = months[mk] || { month: mk, team: zero(), bankers: {} };
      const bb = M.bankers[key] = M.bankers[key] || { banker: p.banker, nmls: p.nmls, month: zero() };
      bb.month.blocks++; bb.month.dials += b.dials; bb.month.contacts += b.contacts;
      bb.month.interested += b.interested; bb.month.folders += b.folders; bb.month.mins += b.dur;
      M.team.blocks++; M.team.dials += b.dials; M.team.contacts += b.contacts;
      M.team.interested += b.interested; M.team.folders += b.folders; M.team.mins += b.dur;
    }
  }
  const history = Object.values(months)
    .map(M => ({ month: M.month, team: M.team,
      bankers: Object.values(M.bankers).sort((a, b) => b.month.folders - a.month.folders) }))
    .sort((a, b) => b.month.localeCompare(a.month));
  const curKey = new Date().toISOString().slice(0, 7);
  let cur = history.find(h => h.month === curKey) ||
    { month: curKey, team: zero(), bankers: Object.values(byBanker).map(p => ({ banker: p.banker, nmls: p.nmls, month: zero() })) };
  if (!history.find(h => h.month === curKey)) history.unshift(cur);
  fs.writeFileSync(path.join(SHARED, "team.json"), JSON.stringify({
    updated: new Date().toLocaleString("en-US"), month: curKey,
    team: cur.team, bankers: cur.bankers, history }, null, 1));

  // relay server files onto the shared folder (rates + company templates), newer wins
  if (SERVER_DATA){
    for (const name of ["rates.json", "templates.json"]){
      const src = path.join(SERVER_DATA, name), dst = path.join(SHARED, name);
      try {
        const sM = fs.existsSync(src) ? fs.statSync(src).mtimeMs : 0;
        const dM = fs.existsSync(dst) ? fs.statSync(dst).mtimeMs : 0;
        if (sM > dM) fs.copyFileSync(src, dst);            // server → drive (normal)
        else if (dM > sM && dM) fs.copyFileSync(dst, src); // drive → server (management console wrote to the drive)
      } catch (e) {}
    }
  }

  // presence: fold every banker's presence-<slug>.json into one presence.json
  // (and into the server's data/presence/ so /api/presence sees drive-only bankers)
  const now = Date.now();
  const presence = [];
  for (const f of fs.readdirSync(SHARED).filter(x => /^presence-.*\.json$/i.test(x))){
    try { const j = JSON.parse(fs.readFileSync(path.join(SHARED, f), "utf8"));
      presence.push({ slug: j.slug || f.replace(/^presence-|\.json$/g, ""),
        name: String(j.name || "").slice(0, 80), last: j.t || 0, online: now - (j.t || 0) < 3 * 60 * 1000 });
      if (SERVER_DATA){ const pd = path.join(SERVER_DATA, "presence"); fs.mkdirSync(pd, { recursive: true });
        fs.writeFileSync(path.join(pd, (j.slug || "banker") + ".json"),
          JSON.stringify({ slug: j.slug, name: j.name, t: j.t || 0 })); }
    } catch (e) {}
  }
  fs.writeFileSync(path.join(SHARED, "presence.json"),
    JSON.stringify({ generated: new Date().toISOString(), bankers: presence.sort((a,b)=>b.last-a.last) }, null, 2));

  // shared templates: merge every shared-templates-<slug>.json into one pool
  // (and mirror each into the server's data/shared/ so /api/shared-templates matches)
  const pool = [];
  for (const f of fs.readdirSync(SHARED).filter(x => /^shared-templates-.*\.json$/i.test(x))){
    try { const j = JSON.parse(fs.readFileSync(path.join(SHARED, f), "utf8"));
      for (const t of (j.templates || []).slice(0, 60))
        pool.push({ banker: String(j.banker || "").slice(0, 80), id: String(t.id || "").slice(0, 40),
          kind: t.kind, title: String(t.title || "").slice(0, 140),
          subject: String(t.subject || "").slice(0, 200), body: String(t.body || "").slice(0, 6000) });
      if (SERVER_DATA){ const sd = path.join(SERVER_DATA, "shared"); fs.mkdirSync(sd, { recursive: true });
        fs.copyFileSync(path.join(SHARED, f), path.join(sd, (j.slug || "banker") + ".json")); }
    } catch (e) {}
  }
  fs.writeFileSync(path.join(SHARED, "shared-templates.json"),
    JSON.stringify({ updated: new Date().toISOString(), templates: pool }, null, 2));
  let fed = "";
  if (SERVER_DATA){
    const bdir = path.join(SERVER_DATA, "blocks"); fs.mkdirSync(bdir, { recursive: true });
    for (const key in byBanker){
      const p = byBanker[key];
      fs.writeFileSync(path.join(bdir, key + ".json"), JSON.stringify({ banker: p.banker, nmls: p.nmls,
        sent: new Date().toISOString(), source: "shared-drive",
        blocks: p.blocks.map(b => ({ date: b.date, label: b.label, dur: b.dur, dials: b.dials,
          contacts: b.contacts, interested: b.interested, folders: b.folders })) }, null, 2));
    }
    fed = " and fed " + Object.keys(byBanker).length + " banker file(s) into the dashboard";
  }
  console.log(new Date().toLocaleTimeString() + " — merged " + files.length + " banker CSV(s), " +
    (master.length - 1) + " blocks → nmc-master-blocks.csv + team.json · " +
    presence.filter(p => p.online).length + "/" + presence.length + " online · " +
    pool.length + " shared templates" + fed);
}
run();
if (WATCH){ console.log("Watching — re-merging every 5 minutes. Ctrl+C to stop."); setInterval(run, 5 * 60 * 1000); }
