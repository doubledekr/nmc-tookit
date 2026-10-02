/* NMC Toolkit — Salesforce content script.
   Reads the open lead the same way the bookmarklet does (every label/value pair, hidden sections included),
   then hands the text to the background worker, which posts it to the desktop app on this computer.
   Nothing is sent anywhere else. SSN, birthdate, age and marital status are dropped by the toolkit's parser. */
(function(){
  if(window.__nmcExt) return; window.__nmcExt=true;
  const TOP = window.top===window;

  /* ---- harvesting (same logic as the bookmarklet) ---- */
  function harvestPage(){
    var pairs=[],seen={},QSA,DQSA,TC,IT,SR,fr;
    try{fr=document.createElement('iframe');fr.style.display='none';document.documentElement.appendChild(fr);var W=fr.contentWindow;
    QSA=W.Element.prototype.querySelectorAll;DQSA=W.Document.prototype.querySelectorAll;
    TC=Object.getOwnPropertyDescriptor(W.Node.prototype,'textContent').get;IT=Object.getOwnPropertyDescriptor(W.HTMLElement.prototype,'innerText').get;SR=Object.getOwnPropertyDescriptor(W.Element.prototype,'shadowRoot').get;}catch(e){}
    function qs(root,sel){try{if(QSA&&root.nodeType===1)return QSA.call(root,sel);if(DQSA&&root.nodeType===9)return DQSA.call(root,sel);}catch(e){}try{return root.querySelectorAll(sel);}catch(e){return [];}}
    function tc(el){try{return TC.call(el)||'';}catch(e){return el.textContent||'';}}
    function it(el){try{return IT.call(el)||'';}catch(e){return el.innerText||'';}}
    var JUNK='button, .slds-assistive-text, [class*="inline-edit"], lightning-helptext, lightning-static-map, iframe, svg, script, style, .nmc-ext-btn, .nmc-ext-toast';
    function fallback(el){var c=el.cloneNode(true);qs(c,JUNK).forEach(function(b){b.remove();});qs(c,'div, li, p, br, tr').forEach(function(d){d.parentNode.insertBefore(document.createTextNode('\n'),d);});return tc(c);}
    function vis(el){try{if(el.checkVisibility)return el.checkVisibility();return el.getClientRects().length>0;}catch(e){return true;}}
    function lines(el){var t=it(el);if(!t||!t.trim())t=fallback(el);return t.split(/\n+/).map(function(s){return s.replace(/\s+/g,' ').trim();}).filter(function(s){return s&&!/^(Edit|Help)\s/.test(s);});}
    function harvest(root){
      qs(root,'[data-target-selection-name^="sfdc:RecordField"], .slds-form-element, records-record-layout-item').forEach(function(fe){
        if(fe.getAttribute&&fe.getAttribute('data-target-selection-name')&&qs(fe,'[data-target-selection-name^="sfdc:RecordField"]').length)return;
        var lab=qs(fe,'.test-id__field-label, .slds-form-element__label, label')[0];
        var val=qs(fe,'.test-id__field-value, .slds-form-element__static, .slds-form-element__control')[0];
        if(!lab||!val||!vis(fe))return;
        var l=(lines(lab)[0]||'').replace(/[:*]+$/,'').trim();if(!l)return;
        var v=lines(val).filter(function(s){return s!==l;}).join(', ');
        var k=l+'|'+v;if(!seen[k]){seen[k]=1;pairs.push(l+'\n'+v);}
      });
      qs(root,'*').forEach(function(el){var s=null;try{s=SR?SR.call(el):el.shadowRoot;}catch(e){}if(s)harvest(s);if(el.tagName==='IFRAME'&&el!==fr){try{if(el.contentDocument)harvest(el.contentDocument);}catch(e){}}});
    }
    harvest(document);
    var raw=it(document.body);
    if(fr)fr.remove();
    return {pairs:pairs.length, text: pairs.length?pairs.join('\n')+'\n\n----- page text -----\n'+raw:raw};
  }

  /* ---- UI: a floating button on lead/record pages (top frame only) ---- */
  function toast(msg, ok){ if(!TOP) return; let t=document.querySelector('.nmc-ext-toast'); if(!t){ t=document.createElement('div'); t.className='nmc-ext-toast'; document.body.appendChild(t); }
    t.textContent=msg; t.style.cssText='position:fixed;left:50%;bottom:72px;transform:translateX(-50%);background:'+(ok?'#23242B':'#8F3223')+';color:#fff;padding:10px 16px;border-radius:8px;font:13.5px system-ui,sans-serif;z-index:2147483647;box-shadow:0 6px 20px rgba(0,0,0,.25);max-width:70vw';
    clearTimeout(t._h); t._h=setTimeout(()=>t.remove(), 4000); }

  /* Lightning collapses sections (and the bookmarklet is usually clicked after the banker scrolled around): open them first */
  function expandSections(){ let n=0; try{ document.querySelectorAll('button.slds-section__title-action[aria-expanded="false"], .slds-section:not(.slds-is-open) .slds-section__title-action, button[aria-expanded="false"].test-id__section-header-button').forEach(b=>{ try{ b.click(); n++; }catch(e){} }); }catch(e){} return n; }
  function readLead(){ const opened=expandSections(); return new Promise(res=>setTimeout(()=>{ const h=harvestPage(); h.opened=opened; res(h); }, opened?500:0)); }
  function send(cb){ readLead().then(h=>{
    if(!h.text||h.text.length<40){ toast('Nothing to read here \u2014 open a lead or contact record first.', false); if(cb) cb({ok:false,pairs:0,error:'nothing to read'}); return; }
    toast('Read '+h.pairs+' fields'+(h.opened?' (opened '+h.opened+' section'+(h.opened===1?'':'s')+')':'')+' \u2014 sending to the NMC toolkit\u2026', true);
    chrome.runtime.sendMessage({type:'nmc:send', text:h.text, url:location.href, title:document.title, pairs:h.pairs}, res=>{
      if(chrome.runtime.lastError){ toast('Extension error: '+chrome.runtime.lastError.message, false); if(cb) cb({ok:false,pairs:h.pairs,error:chrome.runtime.lastError.message}); return; }
      if(res&&res.ok) toast('Sent '+h.pairs+' fields to the NMC toolkit \u2014 top of your Pipeline as New from Salesforce.', true);
      else if(res&&res.copied) toast('Toolkit app isn\u2019t running \u2014 copied '+h.pairs+' fields to the clipboard instead. Use Paste from clipboard & parse.', false);
      else toast('Couldn\u2019t reach the toolkit app'+(res&&res.error?': '+res.error:'')+'. Is NMC Toolkit open?', false);
      if(cb) cb(Object.assign({pairs:h.pairs,chars:h.text.length},res||{}));
    }); });
  }

  function isRecordPage(){ return /\/lightning\/r\/|\/lightning\/o\/|\/\w{15,18}(\/view)?(\?|$)/.test(location.href); }
  function ensureButton(){ if(!TOP) return; let b=document.querySelector('.nmc-ext-btn');
    if(!isRecordPage()){ if(b) b.remove(); return; }
    if(b) return;
    b=document.createElement('button'); b.className='nmc-ext-btn'; b.type='button'; b.textContent='Send to NMC toolkit';
    b.style.cssText='position:fixed;right:18px;bottom:18px;z-index:2147483646;background:#A53222;color:#fff;border:0;border-radius:999px;padding:10px 16px;font:600 13px system-ui,sans-serif;box-shadow:0 4px 14px rgba(0,0,0,.25);cursor:pointer';
    b.addEventListener('click', send); document.body.appendChild(b); }
  if(TOP){ ensureButton(); setInterval(ensureButton, 1500); }

  chrome.runtime.onMessage.addListener((msg, sender, reply)=>{
    if(msg&&msg.type==='nmc:harvest'&&TOP){ readLead().then(h=>reply(h)); return true; }
    if(msg&&msg.type==='nmc:sendNow'&&TOP){ send(r=>reply(r)); return true; }
  });
})();
