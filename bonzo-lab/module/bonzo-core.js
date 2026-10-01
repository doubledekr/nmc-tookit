/* NMC Toolkit — Bonzo integration, pure logic (no DOM, no network).
   Turns one client's proposal facts into the exact list of Bonzo API calls.
   Runs in the toolkit page (window.NMCBonzoCore) and in Node for tests (module.exports).

   ⚠ ENDPOINTS AND FIELD NAMES ARE PLACEHOLDERS until checked against Bonzo's official API docs
   (ask the Bonzo rep / Abe). Everything Bonzo-specific lives in DEFAULT_CONFIG so fixing a path or
   a field name is a settings change, not a code change. */
(function (root, factory) {
  const api = factory();
  if (typeof module === "object" && module.exports) module.exports = api;
  else root.NMCBonzoCore = api;
})(typeof self !== "undefined" ? self : this, function () {
  "use strict";

  const DEFAULT_CONFIG = {
    baseUrl: "http://localhost:8799/api/v3",      /* mock by default; real: Bonzo's API base (UNVERIFIED: https://app.getbonzo.com/api/v3) */
    dryRun: true,                                  /* preview only — nothing is sent until this is turned off */
    proposalStageId: "",                           /* Bonzo pipeline stage that starts the "Proposal Sent" campaign */
    assignTo: "",                                  /* banker's Bonzo user email/id; blank = token owner */
    sendEmail: true,                               /* email the proposal from the banker's Bonzo thread */
    attachImage: true,                             /* attach the proposal JPG (turn off if the API rejects attachments) */
    tags: ["nmc-toolkit", "proposal-sent"],
    paths: {                                       /* {id} = Bonzo prospect id */
      findByEmail: "GET /prospects?email={email}",
      findByPhone: "GET /prospects?phone={phone}",
      create:      "POST /prospects",
      update:      "PUT /prospects/{id}",
      get:         "GET /prospects/{id}",
      note:        "POST /prospects/{id}/notes",
      email:       "POST /prospects/{id}/email",
      stage:       "PUT /prospects/{id}/pipeline"
    },
    fields: {                                      /* toolkit fact → Bonzo custom-field key (create these team-wide in Bonzo) */
      newPayment:     "nmc_new_payment",
      monthlySavings: "nmc_monthly_savings",
      interestSaved:  "nmc_interest_saved",
      cashOut:        "nmc_cash_out",
      debtsPaid:      "nmc_debts_paid",
      quoteDate:      "nmc_quote_date",
      proposalTitle:  "nmc_proposal"
    }
  };

  function mergeConfig(saved) {
    const s = saved || {};
    return Object.assign({}, DEFAULT_CONFIG, s, {
      paths: Object.assign({}, DEFAULT_CONFIG.paths, s.paths || {}),
      fields: Object.assign({}, DEFAULT_CONFIG.fields, s.fields || {}),
      tags: Array.isArray(s.tags) ? s.tags : DEFAULT_CONFIG.tags.slice()
    });
  }

  /* ---- small helpers ---- */
  const round = v => (v == null || !isFinite(v)) ? null : Math.round(v);
  const usd = v => v == null ? "" : "$" + Math.round(v).toLocaleString("en-US");
  function splitName(full) {
    const clean = String(full || "").replace(/\s+/g, " ").trim();
    if (!clean || /^(new client|quick quote)/i.test(clean)) return { first: "", last: "" };
    if (clean.includes(",")) { const [last, rest] = clean.split(",").map(x => x.trim()); return { first: (rest || "").split(/[ &]/)[0], last }; }
    const parts = clean.split(" ").filter(p => p !== "&" && !/^and$/i.test(p));
    return { first: parts[0], last: parts.length > 1 ? parts[parts.length - 1] : "" };
  }
  function normPhone(p) {
    let d = String(p || "").replace(/\D/g, "");
    if (d.length === 11 && d[0] === "1") d = d.slice(1);
    return d.length === 10 ? d : "";
  }
  function normEmail(e) { const v = String(e || "").trim().toLowerCase(); return /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(v) ? v : ""; }
  function parseRoute(route, vars) {
    const [method, path] = route.split(" ");
    return { method, path: path.replace(/\{(\w+)\}/g, (_, k) => encodeURIComponent(vars[k] == null ? "" : vars[k])) };
  }

  /* ---- what the toolkit hands us (built by the adapter in bonzo.js) ----
     facts = { clientId, name, phone, email, quoteDate, title,
               newPayment, monthlySavings, interestSaved, cashOut, debtsPaid, debtsCount, rate,
               loName, loPhone, loEmail, loNmls, emailText, imageBase64?, imageName? }          */

  function validate(facts) {
    const errors = [], warnings = [];
    const n = splitName(facts.name);
    if (!n.first) errors.push("Give the client a real name before sending.");
    if (!normPhone(facts.phone) && !normEmail(facts.email)) errors.push("Client needs a phone number or email so Bonzo can match them.");
    if (!normPhone(facts.phone)) warnings.push("No valid 10-digit phone — the follow-up texts won't reach this client.");
    if (!normEmail(facts.email)) warnings.push("No valid email — the proposal email step will be skipped.");
    if (!(facts.monthlySavings > 0) && !(facts.cashOut > 0) && !(facts.debtsPaid > 0) && !(facts.interestSaved > 0))
      warnings.push("This proposal has no positive savings, cash out, or debt payoff to show — double-check before sending.");
    if (!facts.loName) warnings.push("Your name isn't set in toolkit Settings — the email signature will be blank.");
    return { errors, warnings };
  }

  /* custom fields: benefits only. A number that isn't a true benefit goes over as "" so an older,
     better-looking value from a previous push can never linger and get texted to the client. */
  function customFields(facts, cfg) {
    const F = cfg.fields, pos = v => (v != null && v > 0) ? String(round(v)) : "";
    const out = {};
    out[F.newPayment] = facts.newPayment > 0 ? String(round(facts.newPayment)) : "";
    out[F.monthlySavings] = pos(facts.monthlySavings);
    out[F.interestSaved] = pos(facts.interestSaved);
    out[F.cashOut] = pos(facts.cashOut);
    out[F.debtsPaid] = pos(facts.debtsPaid);
    out[F.quoteDate] = facts.quoteDate || "";
    out[F.proposalTitle] = facts.title || "";
    return out;
  }

  function noteText(facts) {
    const lines = [`NMC Toolkit proposal sent ${facts.quoteDate}: ${facts.title || "Savings proposal"}`];
    if (facts.newPayment > 0) lines.push(`New payment: ${usd(facts.newPayment)}/mo`);
    if (facts.monthlySavings > 0) lines.push(`Monthly savings: ${usd(facts.monthlySavings)}`);
    if (facts.debtsPaid > 0) lines.push(`Debts paid off: ${usd(facts.debtsPaid)}${facts.debtsCount ? ` (${facts.debtsCount})` : ""}`);
    if (facts.cashOut > 0) lines.push(`Cash out: ${usd(facts.cashOut)}`);
    if (facts.interestSaved > 0) lines.push(`Interest saved: ${usd(facts.interestSaved)}`);
    if (facts.rate) lines.push(`Quoted rate: ${facts.rate}% (pricing as of ${facts.quoteDate}; not locked)`);
    lines.push(`Sent by ${facts.loName || "banker"} from the NMC Toolkit.`);
    return lines.join("\n");
  }

  function emailHTML(facts) {
    const esc = s => String(s == null ? "" : s).replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
    const body = esc(facts.emailText || "").replace(/the image below has/i, "the attached proposal has").split("\n\n")
      .map(p => `<p style="margin:0 0 14px">${p.replace(/\n/g, "<br>")}</p>`).join("");
    return `<div style="font-family:Arial,Helvetica,sans-serif;font-size:15px;line-height:1.5;color:#222;max-width:560px">${body}` +
      `<p style="margin:18px 0 0;font-size:12px;color:#777">Estimates based on pricing as of ${esc(facts.quoteDate)}. This is not a Loan Estimate or a commitment to lend; rates are not locked. Neighborhood Mortgage Company LLC · NMLS #2484730 · 844-210-3644</p></div>`;
  }

  /* the plan: an ordered list of steps; {id} is filled from the first step's result at run time */
  function buildPlan(facts, savedCfg, existingProspectId) {
    const cfg = mergeConfig(savedCfg);
    const { errors, warnings } = validate(facts);
    const n = splitName(facts.name), phone = normPhone(facts.phone), email = normEmail(facts.email);
    const prospect = {
      first_name: n.first, last_name: n.last,
      ...(phone ? { phone } : {}), ...(email ? { email } : {}),
      ...(cfg.assignTo ? { assigned_to: cfg.assignTo } : {}),
      tags: cfg.tags, external_id: facts.clientId, source: "NMC Toolkit",
      custom_fields: customFields(facts, cfg)
    };
    const steps = [];
    if (existingProspectId) steps.push({ key: "update", label: "Update the client in Bonzo", ...parseRoute(cfg.paths.update, { id: existingProspectId }), body: prospect });
    else steps.push({ key: "upsert", label: "Find or create the client in Bonzo", findBy: phone ? { route: cfg.paths.findByPhone, vars: { phone } } : { route: cfg.paths.findByEmail, vars: { email } },
      ...parseRoute(cfg.paths.create, {}), updateRoute: cfg.paths.update, body: prospect });
    steps.push({ key: "note", label: "Attach the proposal note", route: cfg.paths.note, body: { note: noteText(facts) } });
    if (cfg.sendEmail && email) {
      const mail = { subject: facts.title || "Your savings proposal from Neighborhood Mortgage", html: emailHTML(facts), text: facts.emailText || "" };
      if (cfg.attachImage && facts.imageBase64) mail.attachments = [{ filename: facts.imageName || "proposal.jpg", content_type: "image/jpeg", content: facts.imageBase64 }];
      steps.push({ key: "email", label: `Email the proposal to ${email}`, route: cfg.paths.email, body: mail });
    }
    if (cfg.proposalStageId) steps.push({ key: "stage", label: "Move to Proposal Sent (starts the follow-up texts)", route: cfg.paths.stage, body: { pipeline_stage_id: cfg.proposalStageId } });
    else warnings.push("No Proposal Sent stage set in Bonzo settings — the client won't enter the follow-up campaign.");
    return { ok: errors.length === 0, errors, warnings, steps, prospect, dryRun: !!cfg.dryRun, baseUrl: cfg.baseUrl };
  }

  /* pull a prospect id out of whatever shape the API returns ({id}, {data:{id}}, {prospect:{id}}, [{id}], {data:[{id}]}) */
  function pickId(json) {
    if (!json) return null;
    const one = Array.isArray(json) ? json[0] : Array.isArray(json.data) ? json.data[0] : (json.data || json.prospect || json);
    return one && (one.id != null ? String(one.id) : null);
  }

  /* run a plan through any transport: send(method, path, body) → {ok,status,json} */
  async function runPlan(plan, send, onStep) {
    let id = null; const results = [];
    for (const step of plan.steps) {
      let method = step.method, path = step.path, res;
      if (step.key === "upsert") {
        const f = parseRoute(step.findBy.route, step.findBy.vars);
        const found = await send(f.method, f.path);
        id = found.ok ? pickId(found.json) : null;
        if (id) { ({ method, path } = parseRoute(step.updateRoute, { id })); }
      } else if (step.route) {
        if (!id) { results.push({ key: step.key, ok: false, status: 0, error: "No Bonzo prospect id — skipped" }); onStep && onStep(results[results.length - 1]); continue; }
        ({ method, path } = parseRoute(step.route, { id }));
      }
      res = await send(method, path, step.body);
      if (step.key === "upsert" || step.key === "update") id = id || pickId(res.json) || (step.key === "update" ? path.split("/").pop() : null);
      const r = { key: step.key, label: step.label, method, path, ok: !!res.ok, status: res.status, error: res.ok ? "" : (res.json && (res.json.message || res.json.error)) || res.error || ("HTTP " + res.status) };
      results.push(r); onStep && onStep(r);
      if (!res.ok && (step.key === "upsert" || step.key === "update")) break;   /* no client, nothing else can attach */
    }
    return { prospectId: id, results, ok: results.length > 0 && results.every(r => r.ok) };
  }

  return { DEFAULT_CONFIG, mergeConfig, splitName, normPhone, normEmail, validate, customFields, noteText, emailHTML, buildPlan, runPlan, pickId, parseRoute };
});
