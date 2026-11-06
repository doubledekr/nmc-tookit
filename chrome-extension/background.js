/* Background worker: delivers the harvested lead to the NMC Toolkit desktop app listening on this computer.
   Route 1: http://127.0.0.1:<port>/sf (the app's local listener — nothing leaves the machine).
   Fallback: copy the text to the clipboard so "Paste from clipboard & parse" still works. */
const DEFAULT_PORT = 47831;

async function getPort(){ const s = await chrome.storage.local.get("port"); return +(s.port) || DEFAULT_PORT; }

async function postToApp(payload){
  const port = await getPort();
  const ctl = new AbortController(); const t = setTimeout(() => ctl.abort(), 4000);
  try {
    const r = await fetch(`http://127.0.0.1:${port}/sf`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(payload), signal: ctl.signal });
    clearTimeout(t);
    if(!r.ok) return { ok:false, error:"app replied "+r.status };
    const j = await r.json().catch(() => ({}));
    return { ok:true, app:j };
  } catch(e){ clearTimeout(t); return { ok:false, error: e.name==="AbortError" ? "timed out" : (e.message||"not reachable") }; }
}

async function ping(){
  const port = await getPort();
  try { const r = await fetch(`http://127.0.0.1:${port}/ping`, { cache:"no-store" }); if(!r.ok) return null; return await r.json(); } catch(e){ return null; }
}

/* Lender autofill: POST so Chrome stamps our chrome-extension:// Origin, which is the only caller the app will answer. */
async function getClient(){
  const port = await getPort();
  const ctl = new AbortController(); const t = setTimeout(() => ctl.abort(), 5000);
  try {
    const r = await fetch(`http://127.0.0.1:${port}/client`, { method:"POST", headers:{ "Content-Type":"text/plain" }, body:"{}", cache:"no-store", signal: ctl.signal });
    clearTimeout(t);
    if(r.status === 404) return { ok:false, error:"Update the NMC Toolkit app — this version can’t share clients yet" };
    if(!r.ok) return { ok:false, error:"app replied "+r.status };
    return await r.json();
  } catch(e){ clearTimeout(t); return { ok:false, error: e.name==="AbortError" ? "the toolkit app didn’t answer" : "Open the NMC Toolkit app on this computer" }; }
}

async function copyViaTab(tabId, text){
  try { await chrome.scripting.executeScript({ target:{ tabId }, func: (t) => navigator.clipboard.writeText(t), args:[text] }); return true; } catch(e){ return false; }
}

chrome.runtime.onMessage.addListener((msg, sender, reply) => {
  if(msg && msg.type === "nmc:send"){
    (async () => {
      let res = await postToApp({ text: msg.text, url: msg.url, title: msg.title, pairs: msg.pairs||0, via: msg.via||"page", apiPairs: msg.apiPairs||0, obj: msg.obj||"", extVersion: msg.extVersion||chrome.runtime.getManifest().version, when: new Date().toISOString(), source: "chrome-extension" });
      if(!res.ok && res.error !== "timed out"){ await new Promise(r => setTimeout(r, 600)); res = await postToApp({ text: msg.text, url: msg.url, title: msg.title, pairs: msg.pairs||0, via: msg.via||"page", apiPairs: msg.apiPairs||0, obj: msg.obj||"", extVersion: msg.extVersion||chrome.runtime.getManifest().version, when: new Date().toISOString(), source: "chrome-extension" }); }   /* one quick retry: the app may be re-binding its port */
      if(res.ok){ await chrome.storage.local.set({ lastSent: { when: Date.now(), title: msg.title } }); reply(res); return; }
      const copied = sender.tab ? await copyViaTab(sender.tab.id, msg.text) : false;
      reply({ ok:false, copied, error: res.error });
    })();
    return true;
  }
  if(msg && msg.type === "nmc:ping"){ ping().then(j => reply(j)); return true; }
  if(msg && msg.type === "nmc:client"){ getClient().then(j => reply(j)); return true; }   /* lender autofill: the client selected in the toolkit */
});

/* ---- Five9 (v0.5) ---------------------------------------------------------------------------------------------------------
   five9-watch.js overhears the Five9 adapter's Open CTI messages on Salesforce pages and hands them here. Listen-only: nothing is
   ever sent to Five9, nothing is changed in Salesforce.
   1. Relay: call events go to the toolkit app at http://127.0.0.1:<port>/five9 (POST, so Chrome stamps our chrome-extension://
      Origin — the only caller the app accepts). Five9's housekeeping chatter (panel size, click-to-dial on/off, Apex lookups) is
      not relayed; a single "call-start" marks each new call instead.
   2. Auto-send: when a call starts, the lead Salesforce opens for it is sent to the toolkit — only if its record ID or one of its
      phone numbers matches the numbers Five9 gave for the call. No match, or no number from Five9 → not sent ("auto-skip").
      A record that opens within 45 s of the call starting (or was opened in the minute before — click-to-dial from the record)
      counts; an old tab never does. Setting the disposition ends the call.
   Chrome can put this worker to sleep between messages, so the call state is kept in chrome.storage.session. */
const NOISE = { setSoftphonePanelHeight: 1, setSoftphonePanelWidth: 1, isSoftphonePanelVisible: 1, setSoftphonePanelVisibility: 1, enableClickToDial: 1, disableClickToDial: 1,
  runApex: 1, onNavigationChange: 1, onClickToDial: 1, setSoftphoneItemIcon: 1, setSoftphoneItemLabel: 1, getSoftphoneLayout: 1, notifyInitializationComplete: 1, getAppViewInfo: 1 };
const CALL_START = { screenPop: 1, searchAndScreenPop: 1, disableClickToDial: 1 };
async function postFive9(ev){
  const port = await getPort();
  const ctl = new AbortController(); const t = setTimeout(() => ctl.abort(), 4000);
  try { const r = await fetch(`http://127.0.0.1:${port}/five9`, { method: "POST", headers: { "Content-Type": "text/plain" }, body: JSON.stringify(ev), cache: "no-store", signal: ctl.signal });
    clearTimeout(t); return r.ok; } catch (e) { clearTimeout(t); return false; } }
async function relay(ev){ let ok = await postFive9(ev); if (!ok){ await new Promise(r => setTimeout(r, 800)); ok = await postFive9(ev); } return ok; }

let AUTO = { armedUntil: 0, sent: {}, lastNav: {}, nums: [], ids: [], callN: 0, online: {} };
const autoReady = (async () => { try { const s = await chrome.storage.session.get("auto"); if (s && s.auto) AUTO = Object.assign(AUTO, s.auto); } catch (e) {} })();
function keep(){ const old = Date.now() - 10 * 60 * 1000; for (const k in AUTO.online) if (AUTO.online[k] < old) delete AUTO.online[k]; try { chrome.storage.session.set({ auto: AUTO }); } catch (e) {} }
const recId = u => { const m = /^https:\/\/[^/]+\.lightning\.force\.com\/lightning\/r\/(Lead|Opportunity|Contact)\/([A-Za-z0-9]{15,18})\//.exec(u || ""); return m ? m[2] : null; };
const bare = u => String(u || "").split("?")[0];
const ten = s => { const d = String(s || "").replace(/\D/g, ""); return d.length === 10 ? d : d.length === 11 && d[0] === "1" ? d.slice(1) : ""; };
function callDetails(v, depth){ if (v == null || depth > 7) return;
  const addN = t => { if (t && !AUTO.nums.includes(t)) AUTO.nums.push(t); }, addI = x => { x = x.slice(0, 15); if (!AUTO.ids.includes(x)) AUTO.ids.push(x); };
  if (typeof v === "string"){ const s = v.trim(); if (/^\+?[\d\s().-]{10,17}$/.test(s)) addN(ten(s));
    (s.match(/\+?1?[\s.(-]*\d{3}[\s.)-]*\d{3}[\s.-]*\d{4}\b/g) || []).forEach(x => addN(ten(x)));
    (s.match(/\b(00Q|003|006)[A-Za-z0-9]{12}(?:[A-Za-z0-9]{3})?\b/g) || []).forEach(addI); return; }
  if (typeof v === "number"){ addN(ten(String(v))); return; }
  if (Array.isArray(v)) { v.forEach(x => callDetails(x, depth + 1)); return; }
  if (typeof v === "object") for (const k of Object.keys(v)) callDetails(v[k], depth + 1); }
const pause = ms => new Promise(r => setTimeout(r, ms));
function harvestTab(tabId){ return new Promise(res => chrome.tabs.sendMessage(tabId, { type: "nmc:harvest" }, { frameId: 0 }, h => { void chrome.runtime.lastError; res(h || null); })); }
async function autoSend(tab, call){   /* call = which call this belongs to; a quick disposition doesn't cancel the record already on screen */
  await autoReady; const id = recId(tab && tab.url); if (!id || AUTO.sent[id] || AUTO.callN !== call) return;
  AUTO.sent[id] = Date.now(); keep();
  const skip = reason => relay({ methodName: "auto-skip", important: false, args: { reason, record: id }, seenAt: new Date().toISOString() });
  const h = await harvestTab(tab.id); if (!h || !h.text || h.text.length < 40) return skip("couldn’t read the record");
  const labeled = (h.text.split("----- page text -----")[0] || h.text);
  const phones = new Set((labeled.match(/\+?1?[\s.(-]*\d{3}[\s.)-]*\d{3}[\s.-]*\d{4}/g) || []).map(ten).filter(Boolean));
  let check = "";
  for (let i = 0; i < 9 && !check; i++){
    if (AUTO.callN !== call) return;
    if (AUTO.ids.includes(id.slice(0, 15))) check = "record";
    else if ([...phones].some(p => AUTO.nums.includes(p))) check = "phone";
    else if ((AUTO.nums.length || AUTO.ids.length) && i >= 2) break;   /* Five9 gave numbers and none match — 2 s for late ones, then stop */
    if (!check) await pause(1000); }
  if (!check) return skip(!AUTO.nums.length && !AUTO.ids.length ? "Five9 didn’t give a number to check against" : "the record that opened doesn’t match the call");
  await postToApp({ text: h.text, url: tab.url, title: tab.title || "", pairs: h.pairs || 0, via: "five9-auto;check=" + check, apiPairs: h.apiPairs || 0, obj: h.obj || "",
    extVersion: chrome.runtime.getManifest().version, when: new Date().toISOString(), source: "chrome-extension" }); }
async function armForCall(){ await autoReady;
  const now = Date.now(), fresh = now > AUTO.armedUntil;
  if (fresh){ AUTO.sent = {}; AUTO.nums = []; AUTO.ids = []; AUTO.callN++; relay({ methodName: "call-start", important: false, args: {}, seenAt: new Date().toISOString() }); }
  AUTO.armedUntil = now + 45000; keep(); const call = AUTO.callN;
  if (!fresh) return;
  setTimeout(async () => { try {
    const tabs = await chrome.tabs.query({ url: "https://*.lightning.force.com/lightning/r/*" });
    const recent = tabs.filter(t => { const n = AUTO.lastNav[t.id]; return recId(t.url) && n && n.url === bare(t.url) && Date.now() - n.at < 60000 + 2500; });
    recent.sort((a, b) => (b.lastAccessed || 0) - (a.lastAccessed || 0)); if (recent[0]) autoSend(recent[0], call);
  } catch (e) {} }, 2500); }
chrome.tabs.onUpdated.addListener(async (tabId, info) => {
  if (!info.url || !recId(info.url)) return; await autoReady;
  AUTO.lastNav[tabId] = { url: bare(info.url), at: Date.now() }; keep();
  if (Date.now() <= AUTO.armedUntil){ const call = AUTO.callN; setTimeout(() => chrome.tabs.get(tabId, t => { if (!chrome.runtime.lastError && t && bare(t.url) === bare(info.url)) autoSend(t, call); }), 2500); } });
chrome.tabs.onRemoved.addListener(async tabId => { await autoReady; if (AUTO.lastNav[tabId]){ delete AUTO.lastNav[tabId]; keep(); } });
chrome.runtime.onMessage.addListener((msg, sender, reply) => {
  if (!msg || msg.type !== "nmc:five9" || !msg.ev) return;
  if (!sender.tab || !/^https:\/\/[^/]*\.(force|salesforce)\.com\//i.test(sender.url || "")) return;   /* only from our own watcher on Salesforce */
  (async () => { await autoReady; const ev = msg.ev, m = ev.methodName;
    if (CALL_START[m]) await armForCall();
    if (m === "saveLog"){ AUTO.armedUntil = 0; keep(); }   /* dispositioned: the call is over */
    else if (Date.now() <= AUTO.armedUntil){ callDetails(ev.args, 0); keep(); }
    if (m === "watcher-online"){ const k = bare(sender.url); if (AUTO.online[k] && Date.now() - AUTO.online[k] < 10 * 60 * 1000) return reply({ ok: true, skipped: true }); AUTO.online[k] = Date.now(); keep(); }
    if (NOISE[m]) return reply({ ok: true, skipped: true });
    reply({ ok: await relay(ev) }); })();
  return true; });

/* ---- Lead owner jobs (v0.6) ------------------------------------------------------------------------------------------------
   sf-owner.js (on Lead pages) asks for queued jobs and reports results; the toolkit queues them at Import. POST so the app sees our
   chrome-extension:// Origin. */
async function appJobs(path, body){
  const port = await getPort(); const ctl = new AbortController(); const t = setTimeout(() => ctl.abort(), 4000);
  try { const r = await fetch(`http://127.0.0.1:${port}${path}`, { method: "POST", headers: { "Content-Type": "text/plain" }, body: JSON.stringify(body || {}), cache: "no-store", signal: ctl.signal });
    clearTimeout(t); if (!r.ok) return null; return await r.json(); } catch (e) { clearTimeout(t); return null; } }
chrome.runtime.onMessage.addListener((msg, sender, reply) => {
  if (!msg || (msg.type !== "nmc:jobs" && msg.type !== "nmc:jobDone")) return;
  if (!sender.tab || !/^https:\/\/[^/]*\.lightning\.force\.com\//i.test(sender.url || "")) return;
  (async () => { reply(msg.type === "nmc:jobs" ? (await appJobs("/jobs", { recordId: String(msg.recordId || "").slice(0, 18) }) || { jobs: [] }) : (await appJobs("/jobs/done", { id: msg.id, result: msg.result }) || { ok: false })); })();
  return true; });
