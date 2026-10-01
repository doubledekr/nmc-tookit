/* node --test bonzo-lab/test */
const test = require("node:test"), assert = require("node:assert");
const Core = require("../module/bonzo-core.js");

const facts = (o = {}) => Object.assign({ clientId: "c1", name: "Maria Lopez", phone: "(313) 555-0142", email: "Maria@Example.com",
  quoteDate: "2026-10-01", title: "Savings proposal — Maria Lopez", newPayment: 1840.4, monthlySavings: 412.3, interestSaved: 61234,
  cashOut: 0, debtsPaid: 18400, debtsCount: 3, rate: 6.125, loName: "Dave Maxwell", emailText: "Hi Maria,\n\nHere is the savings proposal — the image below has the full breakdown." }, o);
const cfg = { proposalStageId: "stage-proposal-sent", dryRun: false };

test("names split for Bonzo", () => {
  assert.deepStrictEqual(Core.splitName("Maria Lopez"), { first: "Maria", last: "Lopez" });
  assert.deepStrictEqual(Core.splitName("Maria & Jose Lopez"), { first: "Maria", last: "Lopez" });
  assert.deepStrictEqual(Core.splitName("Lopez, Maria"), { first: "Maria", last: "Lopez" });
  assert.deepStrictEqual(Core.splitName("New client"), { first: "", last: "" });
});

test("phone and email normalize", () => {
  assert.strictEqual(Core.normPhone("+1 (313) 555-0142"), "3135550142");
  assert.strictEqual(Core.normPhone("555-0142"), "");
  assert.strictEqual(Core.normEmail(" Maria@Example.com "), "maria@example.com");
});

test("custom fields are benefits only — non-benefits go over blank", () => {
  const cf = Core.customFields(facts({ monthlySavings: -50, cashOut: 0 }), Core.mergeConfig());
  assert.strictEqual(cf.nmc_monthly_savings, "");
  assert.strictEqual(cf.nmc_cash_out, "");
  assert.strictEqual(cf.nmc_debts_paid, "18400");
  assert.strictEqual(cf.nmc_new_payment, "1840");
});

test("full plan: upsert, note, email, stage", () => {
  const plan = Core.buildPlan(facts(), cfg);
  assert.ok(plan.ok);
  assert.deepStrictEqual(plan.steps.map(s => s.key), ["upsert", "note", "email", "stage"]);
  assert.strictEqual(plan.prospect.phone, "3135550142");
  assert.ok(plan.steps[2].body.html.includes("attached proposal"));
  assert.ok(plan.steps[2].body.html.includes("not locked"));
});

test("blocks a send with no name or contact info", () => {
  const p = Core.buildPlan(facts({ name: "New client", phone: "", email: "" }), cfg);
  assert.strictEqual(p.ok, false);
  assert.strictEqual(p.errors.length, 2);
});

test("no email → skips email step; no stage → warns", () => {
  const p = Core.buildPlan(facts({ email: "" }), {});
  assert.deepStrictEqual(p.steps.map(s => s.key), ["upsert", "note"]);
  assert.ok(p.warnings.some(w => /Proposal Sent stage/.test(w)));
});

test("runPlan creates, then updates the same prospect on the second send", async () => {
  const store = {}; let seq = 0; const calls = [];
  const send = async (method, path, body) => { calls.push(method + " " + path);
    if (method === "GET") { const ph = path.split("phone=")[1]; return { ok: true, status: 200, json: { data: Object.values(store).filter(p => p.phone === ph) } }; }
    if (method === "POST" && path === "/prospects") { const id = String(++seq); store[id] = Object.assign({ id }, body); return { ok: true, status: 201, json: { data: store[id] } }; }
    return { ok: true, status: 200, json: {} }; };
  const r1 = await Core.runPlan(Core.buildPlan(facts(), cfg), send);
  assert.ok(r1.ok); assert.strictEqual(r1.prospectId, "1");
  assert.ok(calls.includes("POST /prospects/1/notes") && calls.includes("PUT /prospects/1/pipeline"));
  calls.length = 0;
  const r2 = await Core.runPlan(Core.buildPlan(facts(), cfg), send);
  assert.strictEqual(r2.prospectId, "1"); assert.ok(calls.includes("PUT /prospects/1"));
  assert.strictEqual(Object.keys(store).length, 1, "no duplicate prospect");
});

test("a failed create stops the run", async () => {
  const send = async (m) => m === "GET" ? { ok: true, status: 200, json: { data: [] } } : { ok: false, status: 500, json: { message: "boom" } };
  const r = await Core.runPlan(Core.buildPlan(facts(), cfg), send);
  assert.strictEqual(r.ok, false); assert.strictEqual(r.results.length, 1); assert.strictEqual(r.results[0].error, "boom");
});
