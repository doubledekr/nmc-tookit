/* Background worker: delivers the harvested lead to the NMC Toolkit desktop app listening on this computer.
   Route 1: http://127.0.0.1:<port>/sf (the app's local listener — nothing leaves the machine).
   Fallback: copy the text to the clipboard so "Paste from clipboard & parse" still works. */
const DEFAULT_PORT = 47831;

async function getPort(){ const s = await chrome.storage.local.get("port"); return +(s.port) || DEFAULT_PORT; }

async function postToApp(payload){
  const port = await getPort();
  const ctl = new AbortController(); const t = setTimeout(() => ctl.abort(), 2500);
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

async function copyViaTab(tabId, text){
  try { await chrome.scripting.executeScript({ target:{ tabId }, func: (t) => navigator.clipboard.writeText(t), args:[text] }); return true; } catch(e){ return false; }
}

chrome.runtime.onMessage.addListener((msg, sender, reply) => {
  if(msg && msg.type === "nmc:send"){
    (async () => {
      const res = await postToApp({ text: msg.text, url: msg.url, title: msg.title, when: new Date().toISOString(), source: "chrome-extension" });
      if(res.ok){ await chrome.storage.local.set({ lastSent: { when: Date.now(), title: msg.title } }); reply(res); return; }
      const copied = sender.tab ? await copyViaTab(sender.tab.id, msg.text) : false;
      reply({ ok:false, copied, error: res.error });
    })();
    return true;
  }
  if(msg && msg.type === "nmc:ping"){ ping().then(j => reply(j)); return true; }
});
