# NMC Toolkit — ideas backlog

Every idea raised during the build, in one place. Status: **Built** (in the
pack, tested) · **Designed** (spec written, needs company systems) ·
**Idea** (discussed, not specified). Priority is a suggestion for Monday's
discussion.

## A. Built — in the pack today
| # | Item | Notes |
|---|---|---|
| A1 | Standalone banker toolkit, local-first, offline-capable | Single file; migrations additive |
| A2 | Pipeline with hot/watching/follow-up filters and alert bar | Closed/Lost never alert |
| A3 | Explicit rate alerts per client with a target rate + quick chips | Surfaces on the next rate push |
| A4 | Salesforce paste parser tuned to NMC's record layout | SSN/DOB/age/marital dropped before preview |
| A5 | Salesforce one-click import via a URL button on the Lead page | Hub inbox → Pipeline strip → review-before-apply |
| A6 | Bookmarklet + paste-from-clipboard fallback (no hub) | |
| A7 | Total payment → automatic P&I / escrow split, everywhere | Salesforce "Mortgage Payment" treated as PITI |
| A8 | Lender pricing parser; saved options with cost of points and est. P&I; Analyze / Compare / Recommend | |
| A9 | Savings analysis: consolidation, skip, cash-out, second lien, extra paid to debts, optional debt APRs | |
| A10 | Debt paste-a-list parser; update-in-place when real numbers replace estimates | |
| A11 | Pay-what-you-pay-now + effective rate (same-interest equivalent) | Solver verified by re-amortization |
| A12 | Program rules: FHA Streamline (no skip, lender-paid, MIP financed, no appraisal bullets), VA IRRRL | |
| A13 | No-prepayment-penalty benefit (switchable) | Confirm applies to all NMC products |
| A14 | Compare options with PWYPN toggle, per-scenario extra, ☆ recommended column + why, include on proposal | |
| A15 | Benefits-only client proposal; program options table with ★ recommendation and note; comparison section | Negatives never shown |
| A16 | PDF export: client-facing title, forced colors, fallback borders, page-break control | |
| A17 | Scripts & templates: company library, team pool (opt-in share), personal; token fill on copy | |
| A18 | Tools deck: current-vs-new with rough inputs and quick chips, rate ladder, break-even, skip cash, cash from home, debt payoff | Auto-fills from selected client |
| A19 | Global client bar with local time, rate-alert chip, switch and clear | |
| A20 | Client time zones (auto from area code / state, overridable); NMC = Eastern | |
| A21 | Call blocks: standard day strip, three outcomes, month stats, team picture | Counts only leave the machine |
| A22 | Rate provenance (feed estimate / lender quote / manual); feed never overwrites a set rate | |
| A23 | Value provenance (AVM / manual); Estimate-value button via hub AVM plug-in; Pennymac link | |
| A24 | Settings: one block for local save file + hub link with online dot + backup state | One hub address derives everything |
| A25 | Save mirror to the hub (async, sequence-safe); admin-gated index/download | Laptop-died recovery |
| A26 | Presence heartbeat; console shows who has the toolkit open | Name + timestamp only |
| A27 | Management console: dashboard, rate desk, template library, presence & IT admin, connection | Server or shared-folder mode |
| A28 | Pricing-API hook: IT configures, leadership gets one-click Pull | |
| A29 | 10-yr Treasury from treasury.gov, hourly, merged into the feed | Direction only, never client-facing |
| A30 | Shared-drive bridge (merge-drive.js) unifying air-gapped bankers | One file per banker + merge |
| A31 | Branding locked to NMC in the banker toolkit; official logo/colors/fonts baked in | |
| A32 | Demo builds of both files, isolated storage, derived by a flag | |
| A33 | Responsive layouts (tablet top bar, phone tiers) and a unified control system | |
| A34 | Legacy sweep: older auto-seeded samples removed from real builds on first open | |
| A36 | Copy proposal to clipboard as an image; per-client proposal library (auto-records every copy/email/print, view/re-send/delete) | v1.1.0 |
| A37 | Hub access key + HTTPS guide for remote bankers; IT hub package with service installers | hub/ |
| A35 | Desktop app (Electron) for Windows and Mac: self-contained data file with backups, imports old browser exports on first launch, native dialogs, auto-update from the hub | `nmc-toolkit-desktop/`; needs code signing before rollout |

## B. Designed — spec written, needs company systems
| # | Item | Needs | Priority |
|---|---|---|---|
| B1 | Five9 ring-time pop (bankers use the Five9 Adapter for Salesforce) | Five9 admin: Workflow Automation event → hub | High |
| B2 | Salesforce two-way sync: per-banker OAuth, CDC on Task/Lead, delta-only write-back, Task per outcome | Salesforce admin + Ryan, sandbox | High |
| B3 | Call card: pre-computed answers to standard objections from the client's numbers, shown at pop | Ryan (toolkit only) | High — no external dependency |
| B4 | Management aggregate metrics (status counts, closed volume, avg savings proposed, conversion by source) | Mike's metric list; Ryan | Medium |
| B5 | AVM provider license (Clear Capital / ATTOM / CoreLogic / ICE / HouseCanary / RentCast) | Abe / vendor | Medium |
| B6 | Pricing engine endpoint to feed the rate desk | Abe / LOS or PPE vendor | Medium |
| B7 | Dialpad: pops on direct lines; SMS from banker numbers with template tokens | Dialpad API key | Medium |
| B8 | Dialpad real-time objection assist from the live transcript (or post-call notes if it only arrives at hangup) | 30-min timing test; consent policy; data agreement for any LLM | Later |
| B9 | Embed NMC .woff fonts for pixel-perfect offline rendering | The five .woff files | Low |
| B10 | Five9 disposition mapping so one outcome tag updates Five9, Salesforce, and the block | Five9 admin | With B1 |

## C. Ideas — discussed, not yet specified
| # | Item | Notes |
|---|---|---|
| C1 | Analytics / AI layer reading `/api/snapshot` (trends, coaching, lead scoring) | Snapshot is already self-describing for this |
| C2 | 20-second inbox poll while a call block is running (instant-feel pops) | One-line timer change |
| C3 | Inbound SMS replies landing in the toolkit | Dialpad webhook |
| C4 | Follow-up reminders / calendar hooks from the follow-up date | Toolkit-only |
| C5 | Rate-alert push notification when the banker isn't in the toolkit | Needs the hub to send (email/SMS) |
| C6 | Pipeline import/export to Salesforce in bulk (owned leads) | REST API, per-banker OAuth |
| C7 | Per-banker OAuth "Connect Salesforce" button in Settings | Part of B2 |
| C8 | Sandbox/test mode flag in the hub for the SF/Five9 work | Recommended before B1/B2 |
| C9 | Compliance review of proposal template, FHA/VA statements, prepay claim | Mike / compliance |
| C10 | Hub hardening: HTTPS, auth in front of dashboard, nightly backups, restricted OS access | Abe |
| C11 | Metrics on parser accuracy (how often bankers uncheck fields) to tune the Salesforce profile | Toolkit-only, counts only |
| C12 | Objection library in the template system (kind = objection) feeding the call card | Extends A17 |

## D. Open questions (also in the briefing)
- Abe: hub location and reachability; HTTPS/auth; shared-drive sites; distribution; pricing endpoint; AVM provider; backups.
- Ryan: Connected App + CDC in sandbox; field API names; Five9 Workflow Automation and event fields; Dialpad transcript timing test; event-stream client choice.
- Mike: pilot group and measures; first metrics to aggregate; product confirmations (prepay, FHA/VA); compliance review; recording consent; rate-desk owner and cadence.
