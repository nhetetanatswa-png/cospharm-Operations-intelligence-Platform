# Redesign: four modules + weekly intelligence report

Brainstorm only — no code changes in this step.

## Where things stand today

Ten top-level tabs (Overview, Deliveries, Tasks, Stock, Marketer, Regulatory, Presence, Calendar, Audit, Admin) all read from in-memory React state in `Dashboard.tsx`, with a few slices persisted to `localStorage` (`presence.ts`, delivery timing, `WeeklyDigest.tsx` history). There is no database. Consequences that shape every recommendation below:

- Data is per-browser and per-device. A weekly report today can only see what that one browser stored.
- Nothing runs when the tab is closed, so "automatic end-of-week" needs either Lovable Cloud (database + scheduled job) or an on-open catch-up generator.
- Tasks, Stock and Deliveries overlap: a delivery already carries `requiredStockIds`, `requiredTaskIds` and 7 timed steps, while Tasks and Stock keep parallel status lights for the same work.

## Proposed replacement architecture

### 1. Stock -> Inventory Integrity
Stops being a second task list; becomes the discrepancy and loss desk.
- Screens: Discrepancy Board (system vs warehouse count vs customer-facing availability, Green/Yellow/Red), Damages & Losses register (product, SKU, batch, qty, value, detection stage, action taken), Expiry & Batch Watch, Reorder Pressure.
- Inputs: `StockItem`, `damagedUnits`, `batch`, `expiry`, outcomes of delivery steps 3-5.
- Roles: warehouse_supervisor and procurement write; ops_manager and GM read; staff read-only.
- Links: a red discrepancy flags or blocks deliveries requiring that SKU; damages feed the weekly report's profitability section.

### 2. Regulatory -> Compliance & Customer Trust (KYC)
Merges licence and cold-chain tracking with per-customer KYC keyed to the imported Excel directory (`mockClients.ts`).
- Screens: Customer Compliance Register (KYC status Verified/Pending/Expired/Missing/Flagged plus risk rating), Document Vault with expiry countdown, Company Licences & Cold Chain, Compliance Alerts.
- Links: delivery creation checks KYC state — flagged customers show a warning badge on the delivery card; expired is a hard block requiring an authorisation request.

### 3. Tasks -> Work Assignments (non-delivery work)
Delivery work lives only in the 7 steps. This module keeps what does not belong to an order: stocktakes, cleaning, cold-chain checks, corrective actions, audit follow-ups.
- Screens: My Work, Team Board by shift, Recurring Duties, Verification Queue (the existing evidence-note rule stays).
- Links: any step delay, discrepancy or compliance gap can raise an assignment with an owner and due date; open assignments become the weekly report's accountable-actions section.

### 4. Presence -> Capacity & Coverage
Keeps the FIGJAM board but reframes it around shift capacity rather than attendance.
- Screens: Coverage Board (Present/Absent/Out, reassignment-on-absence rule kept), Shift Capacity Forecast (heads vs deliveries due per dispatch window), Delegation Ledger (who covered what, for how long).
- Links: coverage gaps explain delivery delays in root-cause analysis; delegation history feeds deliveries-per-staff.

Suggested top nav after the change: Overview · Deliveries · Inventory Integrity · Compliance & KYC · Work Assignments · Capacity & Coverage · Field Activity · Calendar · Intelligence · Admin.

## Audit -> Intelligence (automatic weekly report)

Replaces the Audit tab, absorbing `PerformanceReport.tsx`, `AuditTrailCard.tsx` and `WeeklyDigest.tsx`.

Screens:
1. This Week (live) — running numbers for the in-progress week.
2. Weekly Report — the generated report for a completed week: executive summary, KPI block, trend graphs, forecasts, SWOT, PESTLE, root causes, accountable actions.
3. Archive — past weekly snapshots, each openable and downloadable (Markdown/CSV first, PDF later).
4. Raw audit trail — the existing entry log, kept as evidence.

Deterministic vs AI, labelled explicitly in the UI:
- Calculated (deterministic): total/completed/late deliveries and percentages, cycle time per step, on-time rate, damage units and value, discrepancy counts, KYC expiries, deliveries per staff, alert open/close counts, moving averages and naive linear forecasts — each shown with the sample size behind it.
- Generated (AI narrative): executive summary, SWOT, PESTLE, root-cause hypotheses, suggested actions — produced from the calculated block via the Lovable AI gateway, marked "AI-generated interpretation", never inventing numbers.
- Confidence / data quality: every forecast carries weeks-of-history, missing-data count, and a Low/Medium/High tag. Under about four completed weeks, forecasts render as "insufficient history".

Automation: on app open, compare the last archived ISO week to the current one and generate any missing completed weeks (catch-up). With Lovable Cloud enabled this becomes a scheduled job, so the report exists whether or not anyone opens the app.

## Phased order

1. Phase 1 — de-duplicate. Rename and rescope Stock, Tasks, Presence as above; move delivery-linked work out of Tasks. No backend needed.
2. Phase 2 — Compliance & KYC. Customer register keyed to the Excel names, document expiry alerts, delivery-side flag/block.
3. Phase 3 — Intelligence, deterministic half. Weekly snapshot builder, KPI block, trend graphs, forecasts with confidence notes, archive and download, catch-up generation.
4. Phase 4 — Intelligence, narrative half. AI executive summary, SWOT, PESTLE, root causes, accountable actions written back as Work Assignments.
5. Phase 5 — Lovable Cloud. Move state off `localStorage` so data is shared across devices, history survives, and the weekly job runs server-side.

## Open question

Phases 3-5 are only trustworthy once data is shared and durable. Worth deciding whether to enable Lovable Cloud before Phase 3 rather than after.