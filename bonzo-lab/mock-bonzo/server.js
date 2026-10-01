/* Mock Bonzo API for testing the Send to Bonzo button with no real token and no real clients.
   node bonzo-lab/mock-bonzo/server.js        → http://localhost:8799
     /                       dashboard: every prospect, its custom fields, notes, emails, stage
     /api/v3/...             the fake API (same paths as bonzo-core.js DEFAULT_CONFIG.paths)
     /app/                   the lab toolkit in a browser (after `npm run sync` in bonzo-lab/desktop)
     POST /__reply/<id>      pretend the client texted back (so "Check Bonzo" shows Replied)
     POST /__optout/<id>     pretend the client texted STOP
     POST /__reset           wipe the mock
   MOCK_FAIL=email (or note, stage, create, update; comma-separated) makes that step return 500,
   to test how the toolkit handles a partial failure. */
const http = require("http"), fs = require("fs"), path = require("path"), { URL } = require("url");
const PORT = +process.env.PORT || 8799;
const FAIL = (process.env.MOCK_FAIL || "").split(",").filter(Boolean);
const STAGES = { "stage-proposal-sent": "Proposal Sent", "stage-replied": "Replied", "stage-requote": "Requote" };
let db = { seq: 100, prospects: {}, calls: [] };

const send = (res, code, obj, type = "application/json") => {
  res.writeHead(code, { "Content-Type": type, "Access-Control-Allow-Origin": "*", "Access-Control-Allow-Headers": "Content-Type, Authorization", "Access-Control-Allow-Methods": "GET,POST,PUT,PATCH,DELETE,OPTIONS" });
  res.end(type === "application/json" ? JSON.stringify(obj) : obj);
};
const esc = s => String(s == null ? "" : s).replace(/[&<>"]/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));

function api(method, parts, query, body) {
  /* parts: ["prospects", id?, sub?] */
  if (parts[0] !== "prospects") return [404, { message: "Unknown endpoint /" + parts.join("/") }];
  const id = parts[1], sub = parts[2], p = id && db.prospects[id];
  if (method === "GET" && !id) {
    const list = Object.values(db.prospects).filter(x => (query.email && x.email === query.email) || (query.phone && x.phone === query.phone));
    return [200, { data: list }];
  }
  if (method === "POST" && !id) {
    if (FAIL.includes("create")) return [500, { message: "Mock failure: create" }];
    if (!body.first_name) return [422, { message: "first_name is required" }];
    const nid = String(++db.seq); db.prospects[nid] = Object.assign({ id: nid, created_at: new Date().toISOString(), notes: [], emails: [], stage: null, replied: false, opted_out: false }, body);
    return [201, { data: db.prospects[nid] }];
  }
  if (!p) return [404, { message: "Prospect " + id + " not found" }];
  if (method === "GET" && !sub) return [200, { data: Object.assign({}, p, { pipeline_stage_name: STAGES[p.stage] || p.stage || "No stage" }) }];
  if (method === "PUT" && !sub) { if (FAIL.includes("update")) return [500, { message: "Mock failure: update" }];
    const cf = Object.assign({}, p.custom_fields, body.custom_fields); Object.assign(p, body, { custom_fields: cf, updated_at: new Date().toISOString() }); return [200, { data: p }]; }
  if (method === "POST" && sub === "notes") { if (FAIL.includes("note")) return [500, { message: "Mock failure: note" }]; p.notes.push({ at: new Date().toISOString(), note: body.note }); return [201, { data: { ok: true } }]; }
  if (method === "POST" && sub === "email") { if (FAIL.includes("email")) return [500, { message: "Mock failure: email" }];
    if (!p.email) return [422, { message: "Prospect has no email" }];
    p.emails.push({ at: new Date().toISOString(), subject: body.subject, html: body.html, attachments: (body.attachments || []).map(a => ({ filename: a.filename, kb: Math.round((a.content || "").length * 0.75 / 1024), content: a.content })) });
    return [201, { data: { queued: true } }]; }
  if (method === "PUT" && sub === "pipeline") { if (FAIL.includes("stage")) return [500, { message: "Mock failure: stage" }];
    p.stage = body.pipeline_stage_id; p.campaign_started = STAGES[p.stage] === "Proposal Sent"; return [200, { data: { stage: p.stage } }]; }
  return [404, { message: `No mock for ${method} /${parts.join("/")}` }];
}

function dashboard() {
  const rows = Object.values(db.prospects).reverse().map(p => `
    <div class="p"><h3>${esc(p.first_name)} ${esc(p.last_name)} <small>#${p.id} · ${esc(p.phone || "no phone")} · ${esc(p.email || "no email")} · assigned ${esc(p.assigned_to || "token owner")}</small></h3>
    <div><b>Stage:</b> ${esc(STAGES[p.stage] || p.stage || "none")} ${p.campaign_started ? "· <span class=ok>follow-up campaign started</span>" : ""} ${p.replied ? "· <span class=warn>REPLIED</span>" : ""} ${p.opted_out ? "· <span class=bad>OPTED OUT</span>" : ""}
      <form method=post action="/__reply/${p.id}" style="display:inline"><button>Simulate reply</button></form><form method=post action="/__optout/${p.id}" style="display:inline"><button>Simulate STOP</button></form></div>
    <div><b>Tags:</b> ${esc((p.tags || []).join(", "))}</div>
    <table>${Object.entries(p.custom_fields || {}).map(([k, v]) => `<tr><td>${esc(k)}</td><td>${esc(v) || "<i>blank</i>"}</td></tr>`).join("")}</table>
    ${p.notes.map(n => `<pre class=note>${esc(n.note)}</pre>`).join("")}
    ${p.emails.map(m => `<details><summary>Email: ${esc(m.subject)} (${m.attachments.length ? m.attachments.map(a => esc(a.filename) + " " + a.kb + " KB").join(", ") : "no attachment"})</summary><div class=mail>${m.html}</div>${m.attachments.map(a => `<img src="data:image/jpeg;base64,${a.content}" style="max-width:100%;border:1px solid #ddd">`).join("")}</details>`).join("")}
    </div>`).join("") || "<p>No prospects yet. Click <b>Send to Bonzo</b> in the lab toolkit.</p>";
  return `<!doctype html><meta charset=utf-8><meta http-equiv=refresh content=5><title>Mock Bonzo</title>
  <style>body{font:14px system-ui;margin:24px;max-width:900px;background:#faf8f3}.p{background:#fff;border:1px solid #e3ded3;border-radius:10px;padding:14px 16px;margin:12px 0}h3{margin:0 0 6px}small{color:#777;font-weight:normal}table{border-collapse:collapse;margin:8px 0}td{border:1px solid #eee;padding:3px 8px;font-size:13px}.note{background:#f4f1ea;padding:8px;white-space:pre-wrap}.ok{color:#2e6b4f}.warn{color:#9a6a12;font-weight:bold}.bad{color:#a53222;font-weight:bold}.mail{border:1px dashed #ccc;padding:10px;margin:6px 0;background:#fff}button{margin-left:6px}</style>
  <h1>Mock Bonzo <small>${Object.keys(db.prospects).length} prospects · ${db.calls.length} API calls · fail: ${FAIL.join(",") || "none"}</small></h1>
  <form method=post action="/__reset"><button>Reset mock</button></form>${rows}
  <h2>Last API calls</h2><pre>${db.calls.slice(-15).reverse().map(c => `${c.at.slice(11, 19)} ${c.method} ${c.path} → ${c.status}`).join("\n")}</pre>`;
}

http.createServer((req, res) => {
  if (req.method === "OPTIONS") return send(res, 204, {});
  const u = new URL(req.url, "http://localhost"); let raw = "";
  req.on("data", d => { raw += d; if (raw.length > 8e6) req.destroy(); });
  req.on("end", () => {
    const back = () => { res.writeHead(303, { Location: "/" }); res.end(); };
    if (u.pathname === "/") return send(res, 200, dashboard(), "text/html");
    if (u.pathname === "/__state") return send(res, 200, db);
    if (req.method === "POST" && u.pathname === "/__reset") { db = { seq: 100, prospects: {}, calls: [] }; return back(); }
    let m;
    if (req.method === "POST" && (m = u.pathname.match(/^\/__(reply|optout)\/(\w+)$/))) { const p = db.prospects[m[2]];
      if (p) { if (m[1] === "reply") { p.replied = true; p.last_inbound_at = new Date().toISOString(); p.stage = "stage-replied"; p.campaign_started = false; } else { p.opted_out = true; p.campaign_started = false; } } return back(); }
    if (u.pathname.startsWith("/app/")) {   /* serve the lab toolkit for browser testing */
      const f = path.join(__dirname, "..", "desktop", "app", path.normalize(u.pathname.slice(5)).replace(/^(\.\.[\/\\])+/, ""));
      return fs.readFile(f, (err, buf) => err ? send(res, 404, "Run `npm run sync` in bonzo-lab/desktop first", "text/plain") : send(res, 200, buf, f.endsWith(".js") ? "text/javascript" : "text/html"));
    }
    if (u.pathname.startsWith("/api/v3/")) {
      if (!/^Bearer \S+/.test(req.headers.authorization || "")) return send(res, 401, { message: "Missing bearer token" });
      let body = {}; try { body = raw ? JSON.parse(raw) : {}; } catch (e) { return send(res, 400, { message: "Bad JSON" }); }
      const [code, out] = api(req.method, u.pathname.slice(8).split("/").filter(Boolean), Object.fromEntries(u.searchParams), body);
      db.calls.push({ at: new Date().toISOString(), method: req.method, path: u.pathname + u.search, status: code });
      return send(res, code, out);
    }
    send(res, 404, { message: "Not found" });
  });
}).listen(PORT, () => console.log(`Mock Bonzo on http://localhost:${PORT}  (API: /api/v3 · toolkit: /app/neighborhood-toolkit.html)${FAIL.length ? "  failing: " + FAIL : ""}`));
