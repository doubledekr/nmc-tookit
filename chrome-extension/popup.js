const $=id=>document.getElementById(id);
chrome.storage.local.get(["port","lastSent"]).then(s=>{ if(s.port) $("port").value=s.port; if(s.lastSent) $("last").textContent="Last sent: "+new Date(s.lastSent.when).toLocaleString()+(s.lastSent.title?" — "+s.lastSent.title.replace(/\s*\|.*$/,""):""); });
chrome.runtime.sendMessage({type:"nmc:ping"}, j=>{ $("status").innerHTML = j&&j.ok ? `<span class="tag ok">Toolkit app connected</span> <span class="hint">v${j.version||""}</span>` : `<span class="tag bad">Toolkit app not reachable</span><div class="hint">Open NMC Toolkit on this computer. Sends fall back to the clipboard.</div>`; });
$("send").onclick=async()=>{ const [tab]=await chrome.tabs.query({active:true,currentWindow:true}); if(!tab) return;
  chrome.tabs.sendMessage(tab.id,{type:"nmc:sendNow"},res=>{ if(chrome.runtime.lastError){ $("status").innerHTML='<span class="tag bad">Open a Salesforce lead first</span>'; return; } window.close(); }); };
$("save").onclick=async()=>{ await chrome.storage.local.set({port:+$("port").value||47831}); $("status").textContent="Saved."; };
