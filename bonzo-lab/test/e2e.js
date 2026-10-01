/* End-to-end: the real toolkit + Bonzo module in headless Chromium, against the mock.
   Needs: mock running (npm run mock), lab synced (npm run sync), and Playwright (npm i -D playwright).
   node bonzo-lab/test/e2e.js [screenshotDir] */
const { chromium } = require("playwright");
const assert = require("assert");
const BASE = "http://localhost:8799";
const shots = process.argv[2] || null;

(async () => {
  await fetch(BASE + "/__reset", { method: "POST", redirect: "manual" });
  const browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: 1360, height: 1000 } });
  const errors = []; page.on("pageerror", e => errors.push(e.message));
  await page.goto(BASE + "/app/neighborhood-toolkit.html");
  const snap = async n => shots && page.screenshot({ path: `${shots}/${n}.png` });

  /* a banker and a client with a finished analysis */
  await page.evaluate(() => {
    Object.assign(state.settings, { loName: "Dave Maxwell", loNmls: "2821756", loPhone: "(313) 425-5593", loEmail: "dave.m@neighborhoodmc.com", setupDone: true });
    const m = document.getElementById("setupModal"); if (m) m.style.display = "none";
    newClient(); const c = cur();
    Object.assign(c, { name: "Maria Lopez", phone: "(313) 555-0142", email: "maria.test@example.com", balance: 285000, rate: 7.375, payment: 2150, monthsLeft: 336, value: 420000 });
    Object.assign(c.analysis, { anRate: 6.125, anTerm: 30, anCosts: 4500 });
    save(); refreshAll(); go("proposal");
    localStorage.setItem("nmc_bonzo_cfg_v1", JSON.stringify({ baseUrl: "http://localhost:8799/api/v3", dryRun: true, proposalStageId: "stage-proposal-sent", assignTo: "dave.m@neighborhoodmc.com" }));
  });
  assert.ok(await page.isVisible("#bzSendBtn"), "Send to Bonzo button is on the proposal screen");

  /* 1. dry run sends nothing */
  await page.click("#bzSendBtn"); await page.waitForSelector("#bzModal"); await snap("1-preview-dry-run");
  await page.click("#bzGo"); await page.waitForFunction(() => /Dry run complete/.test(document.getElementById("bzGo").textContent));
  let st = await (await fetch(BASE + "/__state")).json();
  assert.strictEqual(Object.keys(st.prospects).length, 0, "dry run created nothing"); await page.click("#bzCancel");

  /* 2. live send to the mock */
  await page.evaluate(() => { const c = JSON.parse(localStorage.getItem("nmc_bonzo_cfg_v1")); c.dryRun = false; localStorage.setItem("nmc_bonzo_cfg_v1", JSON.stringify(c)); });
  await page.click("#bzSendBtn"); await page.waitForSelector("#bzModal"); await page.click("#bzGo");
  await page.waitForFunction(() => /Sent ✓|errors/.test(document.getElementById("bzGo").textContent), null, { timeout: 20000 });
  await snap("2-sent"); assert.ok(/Sent ✓/.test(await page.textContent("#bzGo")), "all steps succeeded");
  st = await (await fetch(BASE + "/__state")).json();
  const p = Object.values(st.prospects)[0];
  assert.strictEqual(p.first_name, "Maria"); assert.strictEqual(p.phone, "3135550142");
  assert.strictEqual(p.stage, "stage-proposal-sent"); assert.ok(p.notes.length === 1 && p.emails.length === 1);
  assert.ok(p.emails[0].attachments[0].kb > 5, "proposal JPG attached");
  assert.ok(Number(p.custom_fields.nmc_monthly_savings) > 0, "savings field filled");
  console.log("custom fields →", p.custom_fields);
  await page.click("#bzCancel");
  const pill1 = await page.textContent("#bzPill"); assert.ok(/Proposal sent/.test(pill1), pill1);
  const logged = await page.evaluate(() => cur().library[0].sent && cur().library[0].sent.how);
  assert.strictEqual(logged, "Bonzo", "library entry marked sent by Bonzo");

  /* 3. client replies → Check Bonzo picks it up */
  await fetch(BASE + "/__reply/" + p.id, { method: "POST", redirect: "manual" });
  await page.click("#bzCheckBtn"); await page.waitForFunction(() => /Replied/.test(document.getElementById("bzPill").textContent));
  await snap("3-replied");

  /* 4. second send updates the same prospect, no duplicate */
  await page.click("#bzSendBtn"); await page.click("#bzGo"); await page.waitForFunction(() => /Sent ✓|errors/.test(document.getElementById("bzGo").textContent));
  st = await (await fetch(BASE + "/__state")).json();
  assert.strictEqual(Object.keys(st.prospects).length, 1, "no duplicate prospect");
  assert.ok(st.calls.some(c => c.method === "PUT" && c.path === "/api/v3/prospects/" + p.id), "updated in place");

  assert.deepStrictEqual(errors, [], "no page errors");
  await browser.close();
  console.log("E2E PASS");
})().catch(e => { console.error("E2E FAIL:", e.message); process.exit(1); });
