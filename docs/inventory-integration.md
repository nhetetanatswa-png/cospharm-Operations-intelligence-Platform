# Workbook-to-COIP inventory integration

## Decision

The workbook is the source blueprint and initial migration package, not the live database. COIP preserves its operational rules in PostgreSQL/Supabase and exposes familiar Dashboard, Inventory Master, Top 50 and export views.

Using the workbook directly at runtime would be acceptable only for a single-user, read-only prototype. It cannot safely provide concurrent writes, row-level permissions, transactional stock movements, referential integrity, reliable audit history or application-scale querying.

## Source workbook inventory

| Sheet            | Workbook purpose                            | COIP destination                                        |
| ---------------- | ------------------------------------------- | ------------------------------------------------------- |
| Dashboard        | Summary cards and charts                    | Inventory command-centre UI                             |
| Raw              | Current product snapshot                    | Products, targets, batches and opening-balance movement |
| Monthly Average  | January–August movement log (`MovementLog`) | Monthly history records                                 |
| Inventory Master | Joined/formula-driven master                | `inventory_master` database view and searchable UI      |
| Top 50           | Value ranking and suggested actions         | Live ranked UI over `inventory_master`                  |

The migrated snapshot contains 198 current products and 1,160 historical movement rows. It also retains 17 item codes found only in history, while flagging 12 current products with no movement history.

## Preserved calculations

- Stock value: quantity on hand × unit cost.
- Average monthly movement: mean of the eight workbook months.
- Months holding: quantity on hand ÷ average monthly movement.
- Stock condition: quantity below 20 is Out of Stock; then less than 3 months is Critical Low, less than 8 is Low Stock, 8–15 is Normal Stock, and above 15 or no movement is Overstocked.
- Movement condition: below 50% of target is Slow moving, up to target is Normal movement, above target is Fast moving.
- Priority: quantity below 20 +100, near expiry +50, critical low +40, low stock +20, slow moving +10, overstocked +5.

COIP deliberately corrects one workbook defect: a missing expiry is `unknown`, not `near expiry`. It also calculates Top 50 directly instead of relying on the workbook's broken `#REF!` suggested-action references.

## Operational data model

- `inventory_products`: durable item identity, description and portfolio.
- `inventory_targets`: effective-dated monthly targets.
- `inventory_batches`: batch number, expiry and unit cost.
- `inventory_movements`: append-only receipts, issues, returns, transfers, losses and count adjustments. The workbook quantity is imported as an opening-balance movement.
- `inventory_monthly_history`: legacy monthly movement used for trend calculations.
- `inventory_imports`: source file identity, checksum, validation counts and commit state.
- `inventory_notes`: migrated and operational product notes.
- `inventory_audit_events`: before/after state for every controlled mutation.
- `inventory_master` and `inventory_priority_queue`: calculated database views replacing formula sheets.

## Import process

1. Hash the workbook and create an `inventory_imports` record. The unique checksum prevents accidental duplicate imports.
2. Read `Raw` and validate item code, quantity, unit cost, target, expiry and batch values.
3. Upsert products, effective-dated targets and batches.
4. Add one opening-balance movement per product at the workbook snapshot date (26 August 2026).
5. Aggregate `MovementLog` to one product/month record and import January–August history.
6. Create inactive product records for the 17 history-only codes so history is never orphaned.
7. Store data-quality warnings for missing portfolio, target, expiry or batch values.
8. Commit the import in one transaction and write its audit event.

## Application architecture

```text
Excel workbook (migration + export format)
                  |
          validated import job
                  v
Supabase/PostgreSQL + row-level security
  products -> batches -> movements -> calculated views
                  |
          COIP Inventory module
  command centre | master | Top 50 | audit/import health
```

The frontend uses the exact workbook seed while Supabase is not configured. When server-side Supabase credentials are present and the database contains inventory records, it automatically switches to the live calculated views. All future stock changes should be posted as movements; the application should never overwrite a calculated balance directly.

## Configuration and cutover

1. Create a Supabase project and apply `supabase/migrations/202609250001_inventory_module.sql`.
2. Copy `.env.example` to `.env` and set `SUPABASE_URL` and `SUPABASE_SERVICE_ROLE_KEY`. The service-role key stays on the server and must never use a `VITE_` prefix.
3. Validate the workbook without changing the database:

   ```powershell
   npm run inventory:import -- --file "C:\path\to\inventory.xlsx"
   ```

4. Review all warnings, then run the transactional import:

   ```powershell
   npm run inventory:import -- --file "C:\path\to\inventory.xlsx" --commit
   ```

The importer hashes the source file, rejects structural or data errors before database access, preserves every legacy movement row, and calls one PostgreSQL function for the complete commit. Re-running the same file is idempotent. A later full workbook snapshot posts only the balance difference as a count adjustment.

The dashboard reads Supabase through a TanStack Start server function. Until application authentication is implemented, the service function should be treated as an internal deployment endpoint; the service-role key is never shipped to the browser.
