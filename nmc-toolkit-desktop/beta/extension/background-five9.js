
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
   Dave's call: when a Five9 call starts, send the lead Salesforce is showing to NMC Toolkit Beta — but only if it IS that call's lead.
   · a call starts = Five9 sends screenPop / searchAndScreenPop / disableClickToDial (seen at dial time in Dave's capture)
   · while the call is live, every Five9 message is read for the call's phone numbers and Salesforce record IDs
   · the first Lead / Opportunity / Contact that opens within 45 s (or one opened in the minute before — click-to-dial from the record)
     is read; it's sent only if its record ID or one of its phone numbers matches the call. A different record, or no number from Five9
     to check against within ~8 s → not sent (noted in the Five9 panel as "auto-skip").
   · a record just sitting in an old tab is never sent
   The toolkit is told it's an automatic send (via "five9-auto;check=…") so it opens the client and ties the call's disposition to it. */
const AUTO = { armedUntil: 0, sent: {}, lastNav: {}, nums: new Set(), ids: new Set(), callN: 0 };
const CALL_START = { screenPop: 1, searchAndScreenPop: 1, disableClickToDial: 1 };
const recId = u => { const m = /^https:\/\/[^/]+\.lightning\.force\.com\/lightning\/r\/(Lead|Opportunity|Contact)\/([A-Za-z0-9]{15,18})\//.exec(u || ""); return m ? m[2] : null; };
const bare = u => String(u || "").split("?")[0];
const ten = s => { const d = String(s || "").replace(/\D/g, ""); return d.length === 10 ? d : d.length === 11 && d[0] === "1" ? d.slice(1) : ""; };
function callDetails(v, depth){ if (v == null || depth > 7) return;
  if (typeof v === "string"){ const t = ten(v.trim()); if (t && /^\+?[\d\s().-]{10,17}$/.test(v.trim())) AUTO.nums.add(t);
    const m = v.match(/\b(00Q|003|006)[A-Za-z0-9]{12}(?:[A-Za-z0-9]{3})?\b/g); if (m) m.forEach(x => AUTO.ids.add(x.slice(0, 15))); return; }
  if (typeof v === "number"){ const t = ten(String(v)); if (t) AUTO.nums.add(t); return; }
  if (Array.isArray(v)) { v.forEach(x => callDetails(x, depth + 1)); return; }
  if (typeof v === "object") for (const k of Object.keys(v)) callDetails(v[k], depth + 1); }
const wait = ms => new Promise(r => setTimeout(r, ms));
function harvest(tabId){ return new Promise(res => chrome.tabs.sendMessage(tabId, { type: "nmc:harvest" }, { frameId: 0 }, h => { void chrome.runtime.lastError; res(h || null); })); }
async function autoSend(tab, call){   /* call = which call this send belongs to (a quick disposition mustn't cancel the record already on screen) */
  const id = recId(tab && tab.url); if (!id || AUTO.sent[id] || AUTO.callN !== call) return;
  AUTO.sent[id] = Date.now();
  const h = await harvest(tab.id); if (!h || !h.text || h.text.length < 40) { postFive9({ methodName: "auto-skip", important: false, args: { reason: "couldn’t read the record", record: id }, seenAt: new Date().toISOString() }); return; }
  const labeled = (h.text.split("----- page text -----")[0] || h.text);
  const phones = new Set((labeled.match(/\+?1?[\s.(-]*\d{3}[\s.)-]*\d{3}[\s.-]*\d{4}/g) || []).map(ten).filter(Boolean));
  let check = "";
  for (let i = 0; i < 9 && !check; i++){
    if (AUTO.callN !== call) return;   /* another call started meanwhile */
    if (AUTO.ids.has(id.slice(0, 15))) check = "record";
    else if ([...phones].some(p => AUTO.nums.has(p))) check = "phone";
    else if (AUTO.nums.size || AUTO.ids.size){ if (i >= 2) break; }   /* Five9 has given numbers and none match — give late ones 2 s, then stop */
    if (!check) await wait(1000); }
  if (!check){ const none = !AUTO.nums.size && !AUTO.ids.size;   /* strict: no match, no send — a wrong client is worse than a click */
    postFive9({ methodName: "auto-skip", important: false, args: { reason: none ? "Five9 didn’t give a number to check against" : "the record that opened doesn’t match the call", record: id, recordPhones: phones.size, callNumbers: AUTO.nums.size }, seenAt: new Date().toISOString() }); return; }
  await postToApp({ text: h.text, url: tab.url, title: tab.title || "", pairs: h.pairs || 0, via: "five9-auto;check=" + check, apiPairs: h.apiPairs || 0, obj: h.obj || "",
    extVersion: chrome.runtime.getManifest().version, when: new Date().toISOString(), source: "chrome-extension" }); }
function armForCall(){
  const now = Date.now(); if (now > AUTO.armedUntil){ AUTO.sent = {}; AUTO.nums = new Set(); AUTO.ids = new Set(); AUTO.callN++; }   /* a new call */
  AUTO.armedUntil = now + 45000; const call = AUTO.callN;
  setTimeout(async () => { try {
    const tabs = await chrome.tabs.query({ url: "https://*.lightning.force.com/lightning/r/*" });
    const fresh = tabs.filter(t => recId(t.url) && AUTO.lastNav[t.id] && AUTO.lastNav[t.id].url === bare(t.url) && Date.now() - AUTO.lastNav[t.id].at < 60000 + 2500);
    fresh.sort((a, b) => (b.lastAccessed || 0) - (a.lastAccessed || 0)); if (fresh[0]) autoSend(fresh[0], call);
  } catch (e) {} }, 2500); }
chrome.tabs.onUpdated.addListener((tabId, info, tab) => {
  if (!info.url || !recId(info.url)) return;
  AUTO.lastNav[tabId] = { url: bare(info.url), at: Date.now() };
  if (Date.now() <= AUTO.armedUntil){ const call = AUTO.callN; setTimeout(() => chrome.tabs.get(tabId, t => { if (!chrome.runtime.lastError && t && bare(t.url) === bare(info.url)) autoSend(t, call); }), 2500); } });
chrome.tabs.onRemoved.addListener(tabId => { delete AUTO.lastNav[tabId]; });
chrome.runtime.onMessage.addListener((msg) => { if (!msg || msg.type !== "nmc:five9" || !msg.ev) return;
  if (CALL_START[msg.ev.methodName]) armForCall();
  if (msg.ev.methodName === "saveLog"){ AUTO.armedUntil = 0; return; }   /* dispositioned: the call is over — nothing more is auto-sent for it */
  if (Date.now() <= AUTO.armedUntil) callDetails(msg.ev.args, 0); });
