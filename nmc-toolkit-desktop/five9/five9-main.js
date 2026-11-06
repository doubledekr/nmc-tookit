/* Five9 calls, main-process side (live since v1.21.0; tested first in the beta).
     · POST /five9  — one Open CTI event overheard by the beta extension's five9-watch.js. Same guard as /client: only a
                      chrome-extension:// Origin, only a loopback Host, only POST, no wildcard CORS.
     · keeps the last 200 events in five9-events.json next to the beta's data file
     · injects five9/five9-panel.js into the toolkit window (the "Five9 calls" panel in Settings) and pushes each new event to it.
   Nothing is ever sent to Five9 or Salesforce. */
const fs = require("fs"), path = require("path");
const KEEP = 200;
module.exports = function five9(app, getWin, isBeta){
  const file = path.join(app.getPath("userData"), "five9-events.json");
  let events = [];
  try { const j = JSON.parse(fs.readFileSync(file, "utf8")); if (Array.isArray(j)) events = j.slice(-KEEP); } catch (e) {}
  let tmr = null;
  function persist(){ clearTimeout(tmr); tmr = setTimeout(() => { try { fs.writeFileSync(file + ".tmp", JSON.stringify(events)); fs.renameSync(file + ".tmp", file); } catch (e) { console.error("five9 save failed: " + e.message); } }, 250); }
  function send(js){ const w = getWin(); if (w && !w.isDestroyed()) w.webContents.executeJavaScript(js, true).catch(() => {}); }
  const panelSrc = () => fs.readFileSync(path.join(__dirname, "five9-panel.js"), "utf8");
  function attach(win){
    win.webContents.on("did-finish-load", () => {
      try { send(panelSrc() + "\n;window.nmcFive9Init && window.nmcFive9Init(" + JSON.stringify({ events, file, beta: !!isBeta }) + ");"); } catch (e) { console.error("five9 panel failed: " + e.message); }
    }); }
  /* Lead owner jobs: the toolkit queues them at Import (window.nmcSfJobs), the extension's sf-owner.js takes and reports them. */
  function rendererCall(js){ const w = getWin(); if (!w || w.isDestroyed()) return Promise.resolve(null); return w.webContents.executeJavaScript(js, true).catch(() => null); }
  function handleJobs(req, res, hdr){
    let body = ""; req.on("data", c => { body += c; if (body.length > 20000) req.destroy(); });
    req.on("end", async () => { let j = {}; try { j = JSON.parse(body || "{}"); } catch (e) {}
      if (req.url.startsWith("/jobs/done")){
        if (typeof j.id !== "string" || !j.result || typeof j.result !== "object") { res.writeHead(400, hdr); res.end(JSON.stringify({ ok: false })); return; }
        const r = { state: String(j.result.state || "").slice(0, 20), owner: String(j.result.owner || "").slice(0, 120), error: String(j.result.error || "").slice(0, 300) };
        await rendererCall("window.nmcSfJobs && window.nmcSfJobs.done(" + JSON.stringify(j.id.slice(0, 40)) + "," + JSON.stringify(r) + ")");
        res.writeHead(200, hdr); res.end(JSON.stringify({ ok: true })); return; }
      const rid = /^00Q[A-Za-z0-9]{12,15}$/.test(String(j.recordId || "")) ? j.recordId : "";   /* each Lead tab only claims its own record's job */
      const t = await rendererCall("JSON.stringify(window.nmcSfJobs ? window.nmcSfJobs.take(" + JSON.stringify(rid) + ") : [])"); let jobs = []; try { jobs = JSON.parse(t || "[]"); } catch (e) {}
      res.writeHead(200, hdr); res.end(JSON.stringify({ jobs })); }); }
  function handle(req, res){
    const origin = String(req.headers.origin || ""), host = String(req.headers.host || "");
    const extOk = /^chrome-extension:\/\/[a-p]{32}$/.test(origin), hostOk = /^(127\.0\.0\.1|localhost):\d+$/.test(host);
    if (req.method !== "POST" || !extOk || !hostOk) { res.writeHead(403); res.end("forbidden"); return; }
    const hdr = { "Content-Type": "application/json", "Access-Control-Allow-Origin": origin, "Vary": "Origin", "Cache-Control": "no-store" };
    if (req.url.startsWith("/jobs")) return handleJobs(req, res, hdr);
    let body = ""; req.on("data", c => { body += c; if (body.length > 300000) { res.writeHead(413); res.end(); req.destroy(); } });
    req.on("end", () => { let ev = null; try { ev = JSON.parse(body); } catch (e) {}
      if (!ev || typeof ev !== "object" || typeof ev.methodName !== "string" || !ev.methodName) { res.writeHead(400, hdr); res.end(JSON.stringify({ ok: false, error: "bad payload" })); return; }
      ev.receivedAt = new Date().toISOString(); ev.n = (events.length ? (events[events.length - 1].n || 0) : 0) + 1; ev.ext = origin.slice(19);
      events.push(ev); if (events.length > KEEP) events = events.slice(-KEEP); persist();
      send("window.nmcFive9Push && window.nmcFive9Push(" + JSON.stringify(ev) + ");");
      res.writeHead(200, hdr); res.end(JSON.stringify({ ok: true, n: ev.n })); });
  }
  return { attach, handle, flush(){ if (tmr) { clearTimeout(tmr); try { fs.writeFileSync(file, JSON.stringify(events)); } catch (e) {} } } };
};
