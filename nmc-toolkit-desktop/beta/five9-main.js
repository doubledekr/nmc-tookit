/* NMC Toolkit Beta only — Five9 record-only mode, main-process side. main.js loads this file only when IS_BETA, and
   scripts/beta.js adds beta/ to the packaged files, so the live app neither ships nor runs any of it.
     · POST /five9  — one Open CTI event overheard by the beta extension's five9-watch.js. Same guard as /client: only a
                      chrome-extension:// Origin, only a loopback Host, only POST, no wildcard CORS.
     · keeps the last 200 events in five9-events.json next to the beta's data file
     · injects beta/five9-panel.js into the toolkit window (the "Five9 calls (beta)" panel) and pushes each new event to it.
   Record-only: nothing here changes a client, the Inbox or the pipeline, and nothing is ever sent to Five9 or Salesforce. */
const fs = require("fs"), path = require("path");
const KEEP = 200;
module.exports = function five9(app, getWin){
  const file = path.join(app.getPath("userData"), "five9-events.json");
  let events = [];
  try { const j = JSON.parse(fs.readFileSync(file, "utf8")); if (Array.isArray(j)) events = j.slice(-KEEP); } catch (e) {}
  let tmr = null;
  function persist(){ clearTimeout(tmr); tmr = setTimeout(() => { try { fs.writeFileSync(file + ".tmp", JSON.stringify(events)); fs.renameSync(file + ".tmp", file); } catch (e) { console.error("five9 save failed: " + e.message); } }, 250); }
  function send(js){ const w = getWin(); if (w && !w.isDestroyed()) w.webContents.executeJavaScript(js, true).catch(() => {}); }
  const panelSrc = () => fs.readFileSync(path.join(__dirname, "five9-panel.js"), "utf8");
  function attach(win){
    win.webContents.on("did-finish-load", () => {
      try { send(panelSrc() + "\n;window.nmcFive9Init && window.nmcFive9Init(" + JSON.stringify({ events, file }) + ");"); } catch (e) { console.error("five9 panel failed: " + e.message); }
    }); }
  function handle(req, res){
    const origin = String(req.headers.origin || ""), host = String(req.headers.host || "");
    const extOk = /^chrome-extension:\/\/[a-p]{32}$/.test(origin), hostOk = /^(127\.0\.0\.1|localhost):\d+$/.test(host);
    if (req.method !== "POST" || !extOk || !hostOk) { res.writeHead(403); res.end("forbidden"); return; }
    const hdr = { "Content-Type": "application/json", "Access-Control-Allow-Origin": origin, "Vary": "Origin", "Cache-Control": "no-store" };
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
