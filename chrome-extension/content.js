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

  /* ---- Salesforce UI API: the lead by field, straight from the record, whatever tab it sits on ----
     Explicit allowlist: only these fields are ever requested. SSN, birthdate, age and marital status are not on it. */
  const API_FIELDS = [
    ['FirstName','First Name'],['LastName','Last Name'],['Email','Email'],['Email_2__c','Email #2'],['Phone','Phone'],['MobilePhone','Mobile Phone'],['Phone_2__c','Phone +'],
    ['Street','Street'],['City','City'],['State','State'],['PostalCode','Zip'],
    ['Current_Balance_Of_1st_Mortgage__c','Current Mortgage Balance'],['Current_Balance_of_Most_Recent_Mortgage__c','Total Mortgage(s) Balance'],['imbus__Current_Loan_Balance__c','Current Loan Balance'],
    ['Current_Mortgage_Interest_Rate__c','Interest Rate'],['First_Mortgage_Interest_Rate__c','First Mortgage Interest Rate'],['imbus__CurrentNoteRate__c','Current Rate'],
    ['Monthly_Payment_of_Recent_Mortgage__c','Mortgage Payment'],['Monthly_payment_of_1st_Mortgage__c','Monthly Payment of 1st Mortgage'],['imbus__Current_Monthly_Payment__c','Current Monthly Payment'],
    ['Estimated_Monthly_P_and_I__c','Estimated Monthly P and I'],['imbus__Current_P_I__c','Current P & I'],
    ['Annual_Tax_Ammount__c','Annual Tax Amount'],['imbus__Current_Property_Tax__c','Current Property Tax - Monthly'],['imbus__CurrentHazardInsurance__c','Current Hazard Insurance - Monthly'],['Current_Mortgage_Insurance__c','Current Mortgage Insurance Payment'],
    ['Original_Balance_of_1st_Mortgage__c','Original Balance of 1st Mortgage'],['First_Mortgage_Loan_Amount__c','First Mortgage Loan Amount'],['Original_Loan_Amount__c','Original Loan Amount'],['Initial_Balance_of_Recent_Mortgage__c','Initial Balance of Recent Mortgage'],
    ['First_Mortgage_Loan_Term__c','Loan Term'],['imbus__Current_Loan_Term__c','Current Loan Term (Months)'],
    ['First_Mortgage_Close_Date__c','Close Date of 1st Mortgage'],['Open_Date_of_Most_Recent_Mortgage__c','Close Date'],['Months_Since_Most_Recent_Mortgage_Open_D__c','Months Since Close Date'],
    ['First_Mortagage_Loan_Type__c','First Mortgage Loan Type'],['Loan_Type_of_Most_Recent_Mortgage__c','Mortgage Loan Type'],['Current_Loan_Type__c','Current Loan Type'],['VA_Eligible__c','VA Eligible?'],['Military__c','Military?'],
    ['First_Mortgage_Servicer__c','First Mortgage Servicer'],['imbus__Current_Lender__c','Current Lender'],
    ['imbus__Property_Value__c','Property Value'],['imbus__AppraisalValue__c','Appraisal Value'],['LTV__c','LTV'],['Equity__c','Equity'],['FICO_Score__c','FICO Score'],
    ['Current_Balance_of_Second_Mortgage__c','Current Balance of 2nd Mortgage'],['Second_Mortgage_Interest__c','2nd Mortgage Interest Rate'],['Monthly_Payment_of_2nd_Mortgage__c','Monthly Payment of 2nd Mortgage'],['Second_Mortgage_Servicer__c','Second Mortgage Servicer'],['Second_Mortgage_Loan_Type__c','2nd Mortgage Loan Type'],
    ['HELOC_Balance__c','HELOC Balance'],['HELOC_Payment__c','HELOC Payment'],['HELOC_Credit_Limit__c','HELOC Credit Limit'],['Amount_of_HEL_Last_Year__c','HEL Balance'],['Monthly_Payment_of_HEL__c','HEL Monthly Payment'],
    ['Open_CC_Balance_Last_12_Months__c','Balance of Open CCs'],['Number_of_Open_CC_Trades__c','# of Open CCs'],['Revolving_Trades_Payment_Past_12_Month__c','Monthly Payment of Revolving Debt(s)'],['CC_Payment__c','CC Payment'],['Revolving_Debt_Payment__c','Revolving Debt Payment'],
    ['Balance_of_Auto_Loan_s__c','Balance of Auto Loan(s)'],['Payment_of_Auto_Loan_s__c','Payment of Auto Loan(s)'],
    ['Balance_of_Installment_Trades_Last_Year__c','Total Loan(s) Balance'],['Of_installment_trades_last_year__c','# of Loans'],['Total_Installment_Debt_Payments__c','Total Installment Debt Payments'],['Total_Installment_Debt__c','Total Installment Debt'],
    ['Total_Monthly_Debt__c','Total Monthly Debt'],['CreditVision_DTI__c','DTI'],
    ['Status','Lead Status'],['LeadSource','Lead Source'],['Loan_Type__c','Refi or Purchase'],['Transaction_Type__c','Transaction Type'],['Rate_to_Beat__c','Rate to Beat'],['imbus__Target_Rate__c','Target Rate'],['Cash_Out_Amount__c','Cash Out Amount'],['Occupancy__c','Occupancy'],['Br_Occupancy__c','Occupancy BR'],['Call_Back_Date__c','Call Back Date'],['Market_Watch__c','Market Watch'],
    ['Proposed_Rate__c','Proposed Rate'],['Proposed_PI__c','Proposed PI'],['Proposed_PITI__c','Proposed PITI'],['Proposed_Loan_Amount__c','Proposed Loan Amount'],['Chosen_Lender__c','Chosen Lender']
  ];
  function leadIdFromUrl(){ const m=location.href.match(/\b00Q[a-zA-Z0-9]{12,15}\b/); return m?m[0]:null; }
  async function apiLead(){
    const id=leadIdFromUrl(); if(!id) return null;
    const r=await fetch('/services/data/v61.0/ui-api/record-ui/'+id+'?layoutTypes=Full&modes=View',{credentials:'same-origin'}); if(!r.ok) throw new Error('UI API '+r.status);
    const j=await r.json(); const rec=j.records&&j.records[id]; if(!rec||!rec.fields) throw new Error('no record');
    const lines=[]; let n=0;
    for(const [api,label] of API_FIELDS){ const f=rec.fields[api]; if(!f) continue; let v=f.value; if(v==null||v==='') continue;
      if(typeof v==='object'){ v=f.displayValue||''; if(!v) continue; }
      if(typeof v==='boolean') v=v?'Yes':'No';
      lines.push(label+'\n'+String(v).replace(/\s+/g,' ').trim()); n++; }
    if(!n) return null;
    return {pairs:n, text:lines.join('\n'), id};
  }

  /* Lightning collapses sections (and the bookmarklet is usually clicked after the banker scrolled around): open them first */
  function expandSections(){ let n=0; try{ document.querySelectorAll('button.slds-section__title-action[aria-expanded="false"], .slds-section:not(.slds-is-open) .slds-section__title-action, button[aria-expanded="false"].test-id__section-header-button').forEach(b=>{ try{ b.click(); n++; }catch(e){} }); }catch(e){} return n; }
  function readLead(){ const opened=expandSections(); return new Promise(res=>setTimeout(async()=>{ const h=harvestPage(); h.opened=opened; h.via='page';
      try{ const a=await apiLead(); if(a){ h.text=a.text+'\n'+h.text; h.pairs=a.pairs+h.pairs; h.apiPairs=a.pairs; h.via='api'; } }catch(e){ h.apiError=e.message; }
      res(h); }, opened?500:0)); }
  function send(cb){ readLead().then(h=>{
    if(!h.text||h.text.length<40){ toast('Nothing to read here \u2014 open a lead or contact record first.', false); if(cb) cb({ok:false,pairs:0,error:'nothing to read'}); return; }
    toast('Read '+h.pairs+' fields'+(h.via==='api'?' ('+h.apiPairs+' direct from the record)':h.apiError?' (record lookup failed: '+h.apiError+')':'')+' \u2014 sending to the NMC toolkit\u2026', true);
    chrome.runtime.sendMessage({type:'nmc:send', text:h.text, url:location.href, title:document.title, pairs:h.pairs, via:h.via, apiPairs:h.apiPairs||0}, res=>{
      if(chrome.runtime.lastError){ toast('Extension error: '+chrome.runtime.lastError.message, false); if(cb) cb({ok:false,pairs:h.pairs,error:chrome.runtime.lastError.message}); return; }
      if(res&&res.ok) toast('Sent '+h.pairs+' fields to the NMC toolkit \u2014 top of your Pipeline as New from Salesforce.', true);
      else if(res&&res.copied) toast('Toolkit app isn\u2019t running \u2014 copied '+h.pairs+' fields to the clipboard instead. Use Paste from clipboard & parse.', false);
      else toast('Couldn\u2019t reach the toolkit app'+(res&&res.error?': '+res.error:'')+'. Is NMC Toolkit open?', false);
      if(cb) cb(Object.assign({pairs:h.pairs,chars:h.text.length,via:h.via,apiPairs:h.apiPairs||0,apiError:h.apiError},res||{}));
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
