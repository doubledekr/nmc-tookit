/* Five9 watcher (extension v0.5) — listen-only.
   The Five9 Plus Adapter panel is an iframe from app.five9.com inside Salesforce Lightning. It tells Salesforce what is happening on a call
   through Open CTI: parent.postMessage({methodName, callId, apiVersion, apiType, args, ...}) — or opener.parent.postMessage when the panel is
   popped out. This script only LISTENS to those messages on the Salesforce page and hands a copy to the NMC Toolkit app on this computer.
   It never posts anything to Five9, never answers Five9, and never changes anything in Salesforce. Beta 2: runs in every Salesforce frame (the adapter may post to a frame inside the page, not the top window). */
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
    /* Five9 call variables ({name, dataType, value}) can be any field the campaign carries, under unreadable names; keep Five9's own
       f9_* ones and phone numbers, and drop the value of anything else (it could be a birthdate or other detail we never keep) */
    if (typeof v === "object" && !Array.isArray(v) && "dataType" in v && "name" in v && "value" in v && !/^f9_|^number\d*$/i.test(String(v.name)) && !/PHONE/i.test(String(v.dataType)))
      { const rest = Object.assign({}, v); delete rest.value; return Object.assign(clean(rest, depth), { value: "[not kept]" }); }
    if (typeof v === "object"){ const o = {}; let n = 0;
      for (const k of Object.keys(v)){ if (++n > 120) break; if (NEVER_LINE.test(k) && !/^Five9__/.test(k)) { o[k] = "[removed]"; continue; } o[k] = clean(v[k], depth + 1); }
      return o; }
    return undefined; }   /* functions etc. */
  function alive(){ try { return !!(chrome.runtime && chrome.runtime.id); } catch (e) { return false; } }
  const TOP = window === window.top;
  function relay(ev){ try { chrome.runtime.sendMessage({ type: "nmc:five9", ev }, () => { void chrome.runtime.lastError; }); } catch (err) {} }
  const base = () => ({ page: location.pathname.slice(0, 200), host: location.hostname, frame: TOP ? "top" : "sub", popout: /\/lightning\/popout\//.test(location.pathname), seenAt: new Date().toISOString() });
  /* diagnostics (beta 2): Dave's first real call recorded nothing, so the beta now says where it is running and what it hears,
     without the message contents: a "watcher online" note from each Salesforce top window, and the origin + method name of any
     Open CTI-shaped message that does NOT come from five9.com (in case the adapter is served from another domain). */
  if (TOP && alive()) setTimeout(() => relay(Object.assign({ methodName: "watcher-online", important: false, args: { five9Frames: document.querySelectorAll('iframe[src*="five9"]').length, frames: window.frames.length } }, base())), 1500);
  const otherSeen = {};
  window.addEventListener("message", (e) => {
    let d = e.data;
    if (typeof d === "string"){ if (d.length > 200000 || d.indexOf("methodName") < 0) return; try { d = JSON.parse(d); } catch (err) { return; } }
    if (!d || typeof d !== "object" || typeof d.methodName !== "string" || !d.methodName) return;
    if (!alive()) return;
    if (!FIVE9.test(e.origin || "")){ const k = (e.origin || "?") + "|" + d.methodName; if (otherSeen[k] || Object.keys(otherSeen).length > 40) return; otherSeen[k] = 1;
      relay(Object.assign({ methodName: "other-origin", important: false, args: { origin: String(e.origin || "").slice(0, 120), method: d.methodName.slice(0, 80) } }, base())); return; }
    relay(Object.assign({ methodName: d.methodName.slice(0, 80), important: !!IMPORTANT[d.methodName], callId: d.callId == null ? null : String(d.callId).slice(0, 80),
      apiVersion: d.apiVersion == null ? null : String(d.apiVersion).slice(0, 20), apiType: d.apiType == null ? null : String(d.apiType).slice(0, 40),
      args: clean(d.args, 0), origin: e.origin }, base()));
  }, false);
})();
