/* Lead owner at Import (extension v0.6.1). The toolkit queues "take ownership" when a banker imports a Salesforce lead; this script, on a
   Lead record page (top frame), picks up the job for the lead it's showing and works the Change Owner box the way a person would —
   Salesforce refuses direct API writes from the page (401), but reads work, so:
     1. read the owner (UI API):  a queue ("Lead Queue", id 00G…) → go on · already the banker → done · another banker → leave it, report the name
     2. click Change Owner → click into the search box → the first suggestion must be the banker's own name (Settings → name), else STOP
     3. click that name → click "Change Owner" → re-read the owner until it's the banker (or report that it didn't change)
   It never picks anyone but the banker, never touches a lead owned by a person, and only acts on the record that's on screen. */
(function(){
  if (window !== window.top || window.__nmcOwner) return; window.__nmcOwner = true;
  const sleep = ms => new Promise(r => setTimeout(r, ms));
  const norm = s => String(s || "").toLowerCase().replace(/\s+/g, " ").trim();
  const alive = () => { try { return !!(chrome.runtime && chrome.runtime.id); } catch (e) { return false; } };
  const send = msg => new Promise(res => { try { chrome.runtime.sendMessage(msg, r => { void chrome.runtime.lastError; res(r || null); }); } catch (e) { res(null); } });
  const leadId = () => { const m = /\/lightning\/r\/Lead\/(00Q[A-Za-z0-9]{12,15})\//.exec(location.pathname); return m ? m[1] : null; };
  const visible = el => { try { return !!el && el.getClientRects().length > 0 && getComputedStyle(el).visibility !== "hidden"; } catch (e) { return false; } };
  async function waitFor(fn, ms){ const end = Date.now() + ms; for (;;){ let v = null; try { v = fn(); } catch (e) {} if (v) return v; if (Date.now() > end) return null; await sleep(150); } }
  function press(el){ if (!el) return; try { el.scrollIntoView({ block: "center" }); } catch (e) {}
    for (const t of ["pointerdown", "mousedown", "pointerup", "mouseup"]) el.dispatchEvent(new MouseEvent(t, { bubbles: true, cancelable: true, view: window }));
    el.click(); }
  async function readOwner(id){
    const r = await fetch(`/services/data/v61.0/ui-api/records/${id}?fields=Lead.OwnerId,Lead.Owner.Name`, { credentials: "same-origin", cache: "no-store" });
    if (!r.ok) throw new Error("couldn’t read the lead (" + r.status + ")");
    const j = await r.json(); const f = j.fields || {};
    return { id: f.OwnerId && f.OwnerId.value || "", name: (f.Owner && (f.Owner.displayValue || (f.Owner.value && f.Owner.value.fields && f.Owner.value.fields.Name && f.Owner.value.fields.Name.value))) || "" }; }
  const isQueue = o => /^00G/.test(o.id) || norm(o.name) === "lead queue";
  /* the Change Owner icon on the owner field (highlights panel first, then the details tab) */
  function ownerButton(){
    const cands = [...document.querySelectorAll('force-owner-lookup button, button[title="Change Owner"], button[title^="Change Owner"]')].filter(visible);
    return cands[0] || null; }
  function ownerDialog(){ return [...document.querySelectorAll(".forceChangeOwnerContent")].find(visible) || null; }
  function searchBox(dlg){ return dlg && ([...dlg.querySelectorAll('input[type="text"], input:not([type]), input[role="combobox"], input.uiInput')].find(visible) || null); }
  function firstSuggestion(dlg){ const scope = (dlg && dlg.closest(".uiModal, .forceModal, .modal-container, section[role=dialog]")) || document;
    const lis = [...scope.querySelectorAll(".listContent ul li, .lookup__menu li, ul[role=listbox] li, .forceSearchInputLookupDesktop li")].filter(visible).filter(li => (li.innerText || "").trim());
    return lis[0] || null; }
  /* the person's name in a suggestion: Salesforce's title/primary label, else the first piece of text (not the job title under it) */
  function suggestionName(li){ const el = li.querySelector(".primaryLabel, [title]"); if (el) return String(el.getAttribute("title") || el.textContent || "").trim();
    const w = document.createTreeWalker(li, NodeFilter.SHOW_TEXT); let n; while ((n = w.nextNode())) { const t = n.nodeValue.trim(); if (t) return t; } return ""; }
  function confirmButton(dlg){ const scope = (dlg && dlg.closest(".uiModal, .forceModal, .modal-container, section[role=dialog]")) || document;
    const btns = [...scope.querySelectorAll(".modal-footer button, .slds-modal__footer button, footer button")].filter(visible);
    return btns.find(b => /^\s*change owner\s*$/i.test(b.innerText || b.textContent || "")) || btns.find(b => /^\s*(submit|save)\s*$/i.test(b.innerText || "")) || null; }
  async function closeDialog(dlg){ const scope = (dlg && dlg.closest(".uiModal, .forceModal, .modal-container, section[role=dialog]")) || document;
    const c = [...scope.querySelectorAll(".modal-footer button, .slds-modal__footer button, button.slds-modal__close, button[title=Close]")].filter(visible).find(b => /cancel|close/i.test((b.innerText || "") + " " + (b.title || "")));
    if (c) press(c); }
  /* while it works: a notice on the Salesforce page that also blocks clicks, so nobody clicks to another lead mid-change.
     (Its own clicks are sent straight to Salesforce's buttons, so the cover doesn't get in their way.) */
  let cover = null, coverTimer = null;
  function showCover(){ if (cover) return; cover = document.createElement("div"); cover.className = "nmc-owner-cover";
    cover.style.cssText = "position:fixed;inset:0;z-index:2147483646;background:rgba(20,22,30,.18);cursor:progress;display:flex;align-items:flex-start;justify-content:center";
    cover.innerHTML = '<div style="margin-top:84px;background:#23242B;color:#fff;font:600 14px system-ui,sans-serif;padding:12px 18px;border-radius:10px;box-shadow:0 10px 30px rgba(0,0,0,.3);display:flex;gap:10px;align-items:center"><span style="width:14px;height:14px;border:2px solid rgba(255,255,255,.35);border-top-color:#fff;border-radius:50%;display:inline-block;animation:nmcspin .8s linear infinite"></span>Assigning this lead to you in Salesforce — one moment, please don’t switch leads</div><style>@keyframes nmcspin{to{transform:rotate(360deg)}}</style>';
    for (const t of ["click", "mousedown", "pointerdown", "keydown"]) cover.addEventListener(t, e => { e.stopPropagation(); e.preventDefault(); }, true);
    document.documentElement.appendChild(cover); coverTimer = setTimeout(hideCover, 20000); }
  function hideCover(){ clearTimeout(coverTimer); if (cover) { cover.remove(); cover = null; } }
  /* every step re-checks that this tab still shows the same lead and is on screen; if not, it stops and the job waits for next time */
  class Moved extends Error {}
  async function takeOwnership(job){
    const id = leadId(); if (!id || id.slice(0, 15) !== String(job.recordId).slice(0, 15)) return null;   /* not this tab's record */
    const same = () => { const now = leadId(); if (!now || now.slice(0, 15) !== id.slice(0, 15)) throw new Moved("the page moved to another lead"); if (document.visibilityState !== "visible") throw new Moved("the Salesforce tab went to the background"); };
    const me = norm(job.bankerName);
    let before; try { before = await readOwner(id); } catch (e) { return { state: "retry", error: e.message }; }
    if (me && norm(before.name) === me) return { state: "mine", owner: before.name };
    if (!isQueue(before)) return { state: "other", owner: before.name };
    if (!me) return { state: "failed", error: "set your name in the toolkit’s Settings first", owner: before.name };
    let dlg = null;
    try {
      showCover(); same();
      const btn = await waitFor(ownerButton, 8000); same(); if (!btn) return { state: "retry", error: "couldn’t find the Change Owner button on the lead", owner: before.name };
      press(btn);
      dlg = await waitFor(ownerDialog, 6000); same(); if (!dlg) return { state: "retry", error: "the Change Owner box didn’t open", owner: before.name };
      const box = await waitFor(() => searchBox(dlg), 4000); same(); if (!box) { await closeDialog(dlg); return { state: "retry", error: "couldn’t find the search box in Change Owner", owner: before.name }; }
      box.focus(); press(box);
      const li = await waitFor(() => firstSuggestion(dlg), 5000); same();
      const liLabel = li ? suggestionName(li) : ""; const liName = norm(liLabel);
      if (!li){ await closeDialog(dlg); return { state: "retry", error: "no suggestion appeared in the search box — nothing changed", owner: before.name }; }
      if (!(liName === me || liName.startsWith(me))){ await closeDialog(dlg);
        return { state: "failed", error: `the first suggestion was “${liLabel}”, not “${job.bankerName}” — stopped, nothing changed`, owner: before.name }; }
      press(li.querySelector("a, [role=option], .slds-media") || li);
      await sleep(500); same();
      const ok = await waitFor(() => confirmButton(dlg), 4000); same(); if (!ok) { await closeDialog(dlg); return { state: "retry", error: "couldn’t find the Change Owner button in the box", owner: before.name }; }
      press(ok); dlg = null;
      let after = before; for (let i = 0; i < 16; i++){ await sleep(500); try { after = await readOwner(id); } catch (e) {} if (after.id !== before.id) break; }
      if (norm(after.name) === me) return { state: "assigned", owner: after.name };
      return { state: "failed", error: after.id === before.id ? "Salesforce didn’t change the owner" : "owner changed to " + after.name + " — check the lead", owner: after.name };
    } catch (e) {
      if (dlg) { try { await closeDialog(dlg); } catch (err) {} }
      if (e instanceof Moved) return { state: "retry", error: e.message, owner: before.name };
      throw e;
    } finally { hideCover(); } }
  let busy = false;
  async function tick(){
    if (busy || !alive() || !leadId() || document.visibilityState !== "visible") return;   /* Salesforce only draws the Change Owner box in a tab that's on screen */
    const r = await send({ type: "nmc:jobs", recordId: leadId() }); const jobs = (r && r.jobs) || [];
    const job = jobs.find(j => j.kind === "owner" && String(j.recordId).slice(0, 15) === leadId().slice(0, 15)); if (!job) return;
    busy = true;
    try { const res = await takeOwnership(job); if (res) await send({ type: "nmc:jobDone", id: job.id, result: res }); }
    catch (e) { await send({ type: "nmc:jobDone", id: job.id, result: { state: "retry", error: String(e && e.message || e) } }); }
    finally { busy = false; } }
  const t = setInterval(() => { if (!alive()) { clearInterval(t); return; } tick(); }, 3000);
  document.addEventListener("visibilitychange", () => { if (document.visibilityState === "visible") setTimeout(tick, 300); });   /* start the moment the tab is looked at */
  let lastPath = location.pathname; setInterval(() => { if (location.pathname !== lastPath) { lastPath = location.pathname; setTimeout(tick, 800); } }, 500);   /* …or a lead is opened */
  setTimeout(tick, 1200);
})();
