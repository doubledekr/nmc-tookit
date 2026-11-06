/* NMC Beta only — Five9 record-only watcher (copied into the beta extension by scripts/beta-extension.js; the live extension never has it).
   The Five9 Plus Adapter panel is an iframe from app.five9.com inside Salesforce Lightning. It tells Salesforce what is happening on a call
   through Open CTI: parent.postMessage({methodName, callId, apiVersion, apiType, args, ...}) — or opener.parent.postMessage when the panel is
   popped out. This script only LISTENS to those messages on the Salesforce page and hands a copy to the NMC Toolkit Beta app on this computer.
   It never posts anything to Five9, never answers Five9, and never changes anything in Salesforce. Top frame only (see manifest). */
(function(){
  if (window.__nmcFive9Watch) return; window.__nmcFive9Watch = true;
  const FIVE9 = /^https:\/\/([a-z0-9-]+\.)*five9\.com$/i;
  const IMPORTANT = { screenPop: 1, searchAndScreenPop: 1, saveLog: 1 };
  /* never leaves the page: anything that looks like an SSN, and any line that names a birthdate / SSN / age / marital status */
  const NEVER_LINE = /(social\s*security|\bssn\b|\bdob\b|date\s*of\s*birth|birth\s*date|birthdate|\bage\b|marital)/i;
  function scrubText(s){ s = String(s);
    s = s.replace(/\b\d{3}[- ]?\d{2}[- ]?\d{4}\b/g, m => /^\d{10}$/.test(m.replace(/\D/g, "")) ? m : "[removed]");   /* 9 digits shaped like an SSN; 10-digit phones stay */
    return s.split(/\r?\n/).map(l => { const m = NEVER_LINE.exec(l); return m ? l.slice(0, m.index) + "[removed]" : l; }).join("\n"); }   /* from the word on, the rest of that line goes */
  function clean(v, depth){
    if (depth > 6) return "[deep]";
    if (v == null || typeof v === "number" || typeof v === "boolean") return v;
    if (typeof v === "string") return scrubText(v.length > 4000 ? v.slice(0, 4000) + "…" : v);
    if (Array.isArray(v)) return v.slice(0, 50).map(x => clean(x, depth + 1));
    if (typeof v === "object"){ const o = {}; let n = 0;
      for (const k of Object.keys(v)){ if (++n > 120) break; if (NEVER_LINE.test(k) && !/^Five9__/.test(k)) { o[k] = "[removed]"; continue; } o[k] = clean(v[k], depth + 1); }
      return o; }
    return undefined; }   /* functions etc. */
  function alive(){ try { return !!(chrome.runtime && chrome.runtime.id); } catch (e) { return false; } }
  window.addEventListener("message", (e) => {
    if (!FIVE9.test(e.origin || "")) return;
    let d = e.data;
    if (typeof d === "string"){ if (d.length > 200000) return; try { d = JSON.parse(d); } catch (err) { return; } }
    if (!d || typeof d !== "object" || typeof d.methodName !== "string" || !d.methodName) return;
    if (!alive()) return;
    const ev = { methodName: d.methodName.slice(0, 80), important: !!IMPORTANT[d.methodName], callId: d.callId == null ? null : String(d.callId).slice(0, 80),
      apiVersion: d.apiVersion == null ? null : String(d.apiVersion).slice(0, 20), apiType: d.apiType == null ? null : String(d.apiType).slice(0, 40),
      args: clean(d.args, 0), origin: e.origin, page: location.pathname.slice(0, 200), popout: /\/lightning\/popout\//.test(location.pathname), seenAt: new Date().toISOString() };
    try { chrome.runtime.sendMessage({ type: "nmc:five9", ev }, () => { void chrome.runtime.lastError; }); } catch (err) {}
  }, false);
})();
