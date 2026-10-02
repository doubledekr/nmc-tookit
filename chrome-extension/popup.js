const $=id=>document.getElementById(id);
chrome.storage.local.get(["port","lastSent"]).then(s=>{ if(s.port) $("port").value=s.port; if(s.lastSent) $("last").textContent="Last sent: "+new Date(s.lastSent.when).toLocaleString()+(s.lastSent.title?" — "+s.lastSent.title.replace(/\s*\|.*$/,""):""); });
chrome.runtime.sendMessage({type:"nmc:ping"}, j=>{ $("status").innerHTML = j&&j.ok ? `<span class="tag ok">Toolkit app connected</span> <span class="hint">v${j.version||""}</span>` : `<span class="tag bad">Toolkit app not reachable</span><div class="hint">Open NMC Toolkit on this computer. Sends fall back to the clipboard.</div>`; });
const SF=/^https:\/\/[^/]*(force\.com|salesforce\.com|salesforce-setup\.com)\//i;
function sendNow(tabId, retry){ $("result").textContent="Reading the page\u2026"; chrome.tabs.sendMessage(tabId,{type:"nmc:sendNow"},res=>{
  if(chrome.runtime.lastError){ if(retry){ /* tab was open before the extension loaded: inject on demand, then try once more */
      chrome.scripting.executeScript({target:{tabId, allFrames:true}, files:["content.js"]}).then(()=>setTimeout(()=>sendNow(tabId,false),300)).catch(e=>{ $("status").innerHTML='<span class="tag bad">Couldn\u2019t read this tab</span><div class="hint">'+(e.message||"")+'</div>'; }); return; }
    $("status").innerHTML='<span class="tag bad">Couldn\u2019t reach the page</span><div class="hint">Reload the Salesforce tab and try again.</div>'; return; }
  if(res) $("result").innerHTML = `Read <b>${res.pairs||0}</b> fields${res.via==="api"?" \u2014 "+res.apiPairs+" direct from the record":res.apiError?" \u2014 record lookup failed: "+res.apiError:""} \u2192 `+(res.ok?'<span class="tag ok">sent to the toolkit</span>':res.copied?'<span class="tag bad">app not running \u2014 copied to clipboard</span>':'<span class="tag bad">'+(res.error||"failed")+'</span>'); }); }
async function withTab(fn){ const [tab]=await chrome.tabs.query({active:true,currentWindow:true}); if(!tab) return; if(!SF.test(tab.url||"")){ $("status").innerHTML='<span class="tag bad">This isn\u2019t a Salesforce page</span>'; return; } fn(tab); }
$("copy").onclick=()=>withTab(tab=>{ $("result").textContent="Reading the page\u2026"; chrome.tabs.sendMessage(tab.id,{type:"nmc:harvest"},async h=>{
  if(chrome.runtime.lastError||!h){ await chrome.scripting.executeScript({target:{tabId:tab.id, allFrames:true}, files:["content.js"]}).catch(()=>{}); return setTimeout(()=>$("copy").click(),400); }
  try{ await navigator.clipboard.writeText(h.text); $("result").innerHTML=`Copied <b>${h.pairs}</b> fields (${h.text.length.toLocaleString()} chars) \u2014 paste into Notepad next to the bookmarklet\u2019s output.`; }catch(e){ $("result").textContent="Clipboard blocked: "+e.message; } }); });
$("send").onclick=async()=>{ const [tab]=await chrome.tabs.query({active:true,currentWindow:true}); if(!tab) return;
  if(!SF.test(tab.url||"")){ $("status").innerHTML='<span class="tag bad">This isn\u2019t a Salesforce page</span><div class="hint">Open the lead in Salesforce, then click Send.</div>'; return; }
  sendNow(tab.id, true); };
$("save").onclick=async()=>{ await chrome.storage.local.set({port:+$("port").value||47831}); $("status").textContent="Saved."; };
