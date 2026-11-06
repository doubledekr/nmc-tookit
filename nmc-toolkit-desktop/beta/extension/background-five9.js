
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

/* ---- Auto-send on Five9 calls (beta) --------------------------------------------------------------------------------
   Dave's call: when a Five9 call starts, send the lead Salesforce is showing to NMC Toolkit Beta, exactly as if he'd clicked
   "BETA · Send to NMC Beta". Only on Five9 calls — browsing records never sends anything.
   · a call starts = Five9 sends screenPop / searchAndScreenPop / disableClickToDial (seen at dial time in Dave's capture)
   · then, for 45 s, the first Lead / Opportunity / Contact record that opens in a Salesforce tab is sent once; a record opened in the
     last 60 s before the call (click-to-dial from the lead you're on) is sent right away
   · a record that was just sitting in an old tab is NOT sent — so a stale tab can't push the wrong client
   The toolkit is told it's an automatic send (via:"five9-auto") so it opens the client instead of just filing it. */
const AUTO = { armedUntil: 0, sent: {}, pending: {}, lastNav: {} };
const CALL_START = { screenPop: 1, searchAndScreenPop: 1, disableClickToDial: 1 };
const recId = u => { const m = /^https:\/\/[^/]+\.lightning\.force\.com\/lightning\/r\/(Lead|Opportunity|Contact)\/([A-Za-z0-9]{15,18})\//.exec(u || ""); return m ? m[2] : null; };
const bare = u => String(u || "").split("?")[0];
function autoSend(tab, why){
  const id = recId(tab && tab.url); if (!id || AUTO.sent[id] || Date.now() > AUTO.armedUntil) return;
  AUTO.sent[id] = Date.now(); AUTO.pending[bare(tab.url)] = Date.now();
  chrome.tabs.sendMessage(tab.id, { type: "nmc:sendNow" }, { frameId: 0 }, () => { void chrome.runtime.lastError; }); }
async function armForCall(){
  const now = Date.now(); if (now > AUTO.armedUntil) AUTO.sent = {};   /* a new call; screenPop + disableClickToDial of the same call share one window */
  AUTO.armedUntil = now + 45000;
  setTimeout(async () => { try {
    const tabs = await chrome.tabs.query({ url: "https://*.lightning.force.com/lightning/r/*" });
    const fresh = tabs.filter(t => recId(t.url) && AUTO.lastNav[t.id] && AUTO.lastNav[t.id].url === bare(t.url) && Date.now() - AUTO.lastNav[t.id].at < 60000 + 2500);
    fresh.sort((a, b) => (b.lastAccessed || 0) - (a.lastAccessed || 0)); if (fresh[0]) autoSend(fresh[0], "open");
  } catch (e) {} }, 2500); }
chrome.tabs.onUpdated.addListener((tabId, info, tab) => {
  if (!info.url || !recId(info.url)) return;
  AUTO.lastNav[tabId] = { url: bare(info.url), at: Date.now() };
  if (Date.now() <= AUTO.armedUntil) setTimeout(() => chrome.tabs.get(tabId, t => { if (!chrome.runtime.lastError && t && bare(t.url) === bare(info.url)) autoSend(t, "nav"); }), 2500); });
chrome.tabs.onRemoved.addListener(tabId => { delete AUTO.lastNav[tabId]; });
chrome.runtime.onMessage.addListener((msg) => { if (msg && msg.type === "nmc:five9" && msg.ev && CALL_START[msg.ev.methodName]) armForCall(); });
/* mark the automatic sends; a manual click on the button stays a normal send */
const postToAppManual = postToApp;
postToApp = async function(p){ const k = bare(p && p.url); const t = AUTO.pending[k];
  if (t && Date.now() - t < 60000) p = Object.assign({}, p, { via: "five9-auto" });
  return postToAppManual(p); };
