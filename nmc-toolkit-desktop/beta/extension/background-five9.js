
/* ---- NMC Beta only (appended by scripts/beta-extension.js) ---------------------------------------------------------------
   Five9 record-only relay: five9-watch.js hands us each Open CTI message it overheard; we pass it to the beta app at
   http://127.0.0.1:<port>/five9. POST so Chrome stamps our chrome-extension:// Origin — the only caller the app accepts.
   Nothing is stored here and nothing is ever sent to Five9 or Salesforce. */
const onlineSeen = {};
async function postFive9(ev){
  const port = await getPort();
  const ctl = new AbortController(); const t = setTimeout(() => ctl.abort(), 4000);
  try { const r = await fetch(`http://127.0.0.1:${port}/five9`, { method: "POST", headers: { "Content-Type": "text/plain" }, body: JSON.stringify(ev), cache: "no-store", signal: ctl.signal });
    clearTimeout(t); return r.ok; } catch (e) { clearTimeout(t); return false; } }
chrome.runtime.onMessage.addListener((msg, sender, reply) => {
  if (!msg || msg.type !== "nmc:five9" || !msg.ev) return;
  if (!sender.tab || !/^https:\/\/[^/]*\.(force|salesforce)\.com\//i.test(sender.url || "")) return;   /* only from our own watcher on Salesforce */
  if (msg.ev.methodName === "watcher-online"){ const k = (sender.url || "").split("?")[0]; const now = Date.now(); if (onlineSeen[k] && now - onlineSeen[k] < 10 * 60 * 1000) { reply({ ok: true, skipped: true }); return; } onlineSeen[k] = now; }
  (async () => { let ok = await postFive9(msg.ev); if (!ok){ await new Promise(r => setTimeout(r, 800)); ok = await postFive9(msg.ev); } reply({ ok }); })();
  return true; });
/* tell the two extensions apart in Chrome's toolbar */
try { chrome.action.setBadgeText({ text: "BETA" }); chrome.action.setBadgeBackgroundColor({ color: "#5B3FA8" }); } catch (e) {}
chrome.runtime.onInstalled.addListener(() => { try { chrome.action.setBadgeText({ text: "BETA" }); chrome.action.setBadgeBackgroundColor({ color: "#5B3FA8" }); } catch (e) {} });
