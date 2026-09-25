-- COIP Inventory module
-- Translates "Inventorry managemenet dashbaord 2026-2027.xlsx" into an auditable model.
-- Excel is the initial source and an interchange format; PostgreSQL is the operational system of record.

create extension if not exists pgcrypto;
create extension if not exists btree_gist;

do $$ begin
  create type public.inventory_movement_type as enum (
    'opening_balance', 'receipt', 'issue', 'return', 'transfer_in',
    'transfer_out', 'damage', 'expiry', 'count_adjustment'
  );
exception when duplicate_object then null;
end $$;

do $$ begin
  create type public.inventory_import_status as enum ('validating', 'ready', 'committed', 'rejected');
exception when duplicate_object then null;
end $$;

create table if not exists public.inventory_imports (
  id uuid primary key default gen_random_uuid(),
  source_filename text not null,
  source_sha256 text not null unique,
  source_snapshot_at timestamptz,
  status public.inventory_import_status not null default 'validating',
  row_count integer not null default 0 check (row_count >= 0),
  accepted_count integer not null default 0 check (accepted_count >= 0),
  warning_count integer not null default 0 check (warning_count >= 0),
  rejected_count integer not null default 0 check (rejected_count >= 0),
  validation_report jsonb not null default '{}'::jsonb,
  created_by uuid default auth.uid(),
  created_at timestamptz not null default now(),
  committed_at timestamptz
);

create table if not exists public.inventory_products (
  id uuid primary key default gen_random_uuid(),
  item_code text not null unique,
  description text not null,
  portfolio text,
  default_unit_cost numeric(14,4) check (default_unit_cost is null or default_unit_cost >= 0),
  is_active boolean not null default true,
  source_import_id uuid references public.inventory_imports(id),
  source_row_number integer,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.inventory_targets (
  id uuid primary key default gen_random_uuid(),
  product_id uuid not null references public.inventory_products(id) on delete cascade,
  monthly_target numeric(14,2) check (monthly_target is null or monthly_target >= 0),
  valid_from date not null,
  valid_to date,
  source_import_id uuid references public.inventory_imports(id),
  created_by uuid default auth.uid(),
  created_at timestamptz not null default now(),
  check (valid_to is null or valid_to >= valid_from),
  exclude using gist (product_id with =, daterange(valid_from, coalesce(valid_to, 'infinity'::date), '[]') with &&)
);

create table if not exists public.inventory_batches (
  id uuid primary key default gen_random_uuid(),
  product_id uuid not null references public.inventory_products(id) on delete cascade,
  batch_number text not null,
  expiry_date date,
  unit_cost numeric(14,4) check (unit_cost is null or unit_cost >= 0),
  source_import_id uuid references public.inventory_imports(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (product_id, batch_number)
);

create table if not exists public.inventory_movements (
  id uuid primary key default gen_random_uuid(),
  product_id uuid not null references public.inventory_products(id),
  batch_id uuid references public.inventory_batches(id),
  movement_type public.inventory_movement_type not null,
  quantity_delta numeric(14,2) not null check (quantity_delta <> 0),
  unit_cost numeric(14,4) check (unit_cost is null or unit_cost >= 0),
  occurred_at timestamptz not null,
  reference_type text,
  reference_id text,
  reason text,
  source_import_id uuid references public.inventory_imports(id),
  source_row_number integer,
  created_by uuid default auth.uid(),
  created_at timestamptz not null default now(),
  unique nulls not distinct (source_import_id, source_row_number, product_id, movement_type)
);

create table if not exists public.inventory_monthly_history (
  id uuid primary key default gen_random_uuid(),
  product_id uuid not null references public.inventory_products(id) on delete cascade,
  month date not null check (month = date_trunc('month', month)::date),
  quantity_moved numeric(14,2) not null,
  source_import_id uuid references public.inventory_imports(id),
  source_row_number integer,
  created_at timestamptz not null default now(),
  unique (product_id, month)
);

create table if not exists public.inventory_legacy_movement_rows (
  id uuid primary key default gen_random_uuid(),
  product_id uuid not null references public.inventory_products(id) on delete cascade,
  item_description text,
  month date not null check (month = date_trunc('month', month)::date),
  quantity_moved numeric(14,2) not null,
  source_import_id uuid not null references public.inventory_imports(id) on delete cascade,
  source_row_number integer not null,
  created_at timestamptz not null default now(),
  unique (source_import_id, source_row_number)
);

create table if not exists public.inventory_notes (
  id uuid primary key default gen_random_uuid(),
  product_id uuid not null references public.inventory_products(id) on delete cascade,
  note text not null,
  source_import_id uuid references public.inventory_imports(id),
  created_by uuid default auth.uid(),
  created_at timestamptz not null default now()
);

create table if not exists public.inventory_audit_events (
  id uuid primary key default gen_random_uuid(),
  entity_type text not null,
  entity_id uuid not null,
  action text not null,
  before_state jsonb,
  after_state jsonb,
  actor_id uuid default auth.uid(),
  correlation_id uuid not null default gen_random_uuid(),
  occurred_at timestamptz not null default now()
);

create index if not exists inventory_products_portfolio_idx on public.inventory_products(portfolio);
create index if not exists inventory_movements_product_date_idx on public.inventory_movements(product_id, occurred_at desc);
create index if not exists inventory_monthly_history_month_idx on public.inventory_monthly_history(month);
create index if not exists inventory_legacy_rows_product_month_idx on public.inventory_legacy_movement_rows(product_id, month);
create index if not exists inventory_batches_expiry_idx on public.inventory_batches(expiry_date);
create index if not exists inventory_audit_entity_idx on public.inventory_audit_events(entity_type, entity_id, occurred_at desc);

create or replace function public.inventory_stock_status(
  quantity_on_hand numeric,
  average_monthly_movement numeric
) returns text
language sql immutable
as $$
  select case
    when quantity_on_hand < 20 then 'Out of Stock'
    when coalesce(average_monthly_movement, 0) <= 0 then 'Overstocked'
    when quantity_on_hand / average_monthly_movement < 3 then 'Critical Low'
    when quantity_on_hand / average_monthly_movement < 8 then 'Low Stock'
    when quantity_on_hand / average_monthly_movement <= 15 then 'Normal Stock'
    else 'Overstocked'
  end;
$$;

create or replace view public.inventory_master with (security_invoker = true) as
with balances as (
  select product_id, coalesce(sum(quantity_delta), 0) as quantity_on_hand
  from public.inventory_movements
  group by product_id
), ranked_history as (
  select
    product_id,
    quantity_moved,
    row_number() over (partition by product_id order by month desc) as month_rank
  from public.inventory_monthly_history
), history as (
  select product_id, avg(quantity_moved) as average_monthly_movement
  from ranked_history
  where month_rank <= 8
  group by product_id
), current_targets as (
  select distinct on (product_id) product_id, monthly_target
  from public.inventory_targets
  where valid_from <= current_date and (valid_to is null or valid_to >= current_date)
  order by product_id, valid_from desc
), expiries as (
  select product_id, min(expiry_date) as nearest_expiry_date
  from public.inventory_batches
  group by product_id
)
select
  p.id,
  p.item_code,
  p.description,
  p.portfolio,
  p.updated_at,
  coalesce(b.quantity_on_hand, 0) as quantity_on_hand,
  p.default_unit_cost,
  coalesce(b.quantity_on_hand, 0) * coalesce(p.default_unit_cost, 0) as stock_value,
  t.monthly_target,
  coalesce(h.average_monthly_movement, 0) as average_monthly_movement,
  case when coalesce(h.average_monthly_movement, 0) > 0
    then coalesce(b.quantity_on_hand, 0) / h.average_monthly_movement
  end as months_holding,
  e.nearest_expiry_date,
  (e.nearest_expiry_date is not null and e.nearest_expiry_date < current_date + interval '6 months') as near_expiry,
  public.inventory_stock_status(coalesce(b.quantity_on_hand, 0), coalesce(h.average_monthly_movement, 0)) as stock_status,
  case
    when coalesce(h.average_monthly_movement, 0) <= 0 then 'No movement'
    when t.monthly_target is null or t.monthly_target <= 0 then 'No target'
    when h.average_monthly_movement < t.monthly_target * 0.5 then 'Slow moving'
    when h.average_monthly_movement <= t.monthly_target then 'Normal movement'
    else 'Fast moving'
  end as movement_status
from public.inventory_products p
left join balances b on b.product_id = p.id
left join history h on h.product_id = p.id
left join current_targets t on t.product_id = p.id
left join expiries e on e.product_id = p.id
where p.is_active;

create or replace view public.inventory_priority_queue as
select
  m.*,
  (case when m.quantity_on_hand < 20 then 100 else 0 end) +
  (case when m.near_expiry then 50 else 0 end) +
  (case when m.stock_status = 'Critical Low' then 40 else 0 end) +
  (case when m.stock_status = 'Low Stock' then 20 else 0 end) +
  (case when m.movement_status = 'Slow moving' then 10 else 0 end) +
  (case when m.stock_status = 'Overstocked' then 5 else 0 end) as priority_score
from public.inventory_master m;

alter table public.inventory_imports enable row level security;
alter table public.inventory_products enable row level security;
alter table public.inventory_targets enable row level security;
alter table public.inventory_batches enable row level security;
alter table public.inventory_movements enable row level security;
alter table public.inventory_monthly_history enable row level security;
alter table public.inventory_legacy_movement_rows enable row level security;
alter table public.inventory_notes enable row level security;
alter table public.inventory_audit_events enable row level security;

do $$
declare table_name text;
begin
  foreach table_name in array array[
    'inventory_imports', 'inventory_products', 'inventory_targets', 'inventory_batches',
    'inventory_movements', 'inventory_monthly_history', 'inventory_legacy_movement_rows',
    'inventory_notes', 'inventory_audit_events'
  ] loop
    execute format('drop policy if exists "Authenticated users can read %1$s" on public.%1$I', table_name);
    execute format(
      'create policy "Authenticated users can read %1$s" on public.%1$I for select to authenticated using (true)',
      table_name
    );
  end loop;
end $$;

create or replace function public.import_inventory_workbook(
  p_source_filename text,
  p_source_sha256 text,
  p_source_snapshot_at timestamptz,
  p_products jsonb,
  p_history_rows jsonb,
  p_validation_report jsonb default '{}'::jsonb
) returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_import_id uuid := gen_random_uuid();
  v_existing public.inventory_imports%rowtype;
  v_product jsonb;
  v_history jsonb;
  v_product_id uuid;
  v_batch_id uuid;
  v_current_quantity numeric;
  v_quantity_delta numeric;
  v_snapshot_date date := coalesce(p_source_snapshot_at::date, current_date);
  v_product_count integer := coalesce(jsonb_array_length(p_products), 0);
  v_history_count integer := coalesce(jsonb_array_length(p_history_rows), 0);
  v_warning_count integer := coalesce(jsonb_array_length(p_validation_report -> 'warnings'), 0);
begin
  if nullif(trim(p_source_filename), '') is null then
    raise exception 'source filename is required';
  end if;
  if p_source_sha256 !~ '^[0-9a-f]{64}$' then
    raise exception 'source SHA-256 must be a 64-character lowercase hexadecimal value';
  end if;
  if jsonb_typeof(p_products) <> 'array' or jsonb_typeof(p_history_rows) <> 'array' then
    raise exception 'products and history rows must be JSON arrays';
  end if;

  select * into v_existing
  from public.inventory_imports
  where source_sha256 = p_source_sha256;

  if found and v_existing.status = 'committed' then
    return jsonb_build_object(
      'success', true,
      'idempotent', true,
      'importId', v_existing.id,
      'products', v_existing.accepted_count,
      'historyRows', v_history_count
    );
  end if;

  insert into public.inventory_imports (
    id, source_filename, source_sha256, source_snapshot_at, status,
    row_count, accepted_count, warning_count, rejected_count, validation_report
  ) values (
    v_import_id, p_source_filename, p_source_sha256, p_source_snapshot_at, 'validating',
    v_product_count + v_history_count, v_product_count, v_warning_count, 0,
    coalesce(p_validation_report, '{}'::jsonb)
  )
  on conflict (source_sha256) do update set
    source_filename = excluded.source_filename,
    source_snapshot_at = excluded.source_snapshot_at,
    status = 'validating',
    row_count = excluded.row_count,
    accepted_count = excluded.accepted_count,
    warning_count = excluded.warning_count,
    rejected_count = 0,
    validation_report = excluded.validation_report
  returning id into v_import_id;

  for v_product in select value from jsonb_array_elements(p_products)
  loop
    if nullif(trim(v_product ->> 'itemCode'), '') is null or
       nullif(trim(v_product ->> 'description'), '') is null then
      raise exception 'Every current product requires itemCode and description';
    end if;

    insert into public.inventory_products (
      item_code, description, portfolio, default_unit_cost, is_active,
      source_import_id, source_row_number, updated_at
    ) values (
      trim(v_product ->> 'itemCode'),
      trim(v_product ->> 'description'),
      nullif(trim(v_product ->> 'portfolio'), ''),
      nullif(v_product ->> 'unitCost', '')::numeric,
      true,
      v_import_id,
      nullif(v_product ->> 'sourceRowNumber', '')::integer,
      now()
    )
    on conflict (item_code) do update set
      description = excluded.description,
      portfolio = excluded.portfolio,
      default_unit_cost = excluded.default_unit_cost,
      is_active = true,
      source_import_id = excluded.source_import_id,
      source_row_number = excluded.source_row_number,
      updated_at = now()
    returning id into v_product_id;

    if nullif(v_product ->> 'monthlyTarget', '') is not null then
      update public.inventory_targets
      set valid_to = v_snapshot_date - 1
      where product_id = v_product_id
        and valid_from < v_snapshot_date
        and (valid_to is null or valid_to >= v_snapshot_date);

      delete from public.inventory_targets
      where product_id = v_product_id and valid_from = v_snapshot_date;

      insert into public.inventory_targets (
        product_id, monthly_target, valid_from, source_import_id
      ) values (
        v_product_id,
        (v_product ->> 'monthlyTarget')::numeric,
        v_snapshot_date,
        v_import_id
      );
    end if;

    v_batch_id := null;
    if nullif(trim(v_product ->> 'batch'), '') is not null then
      insert into public.inventory_batches (
        product_id, batch_number, expiry_date, unit_cost, source_import_id, updated_at
      ) values (
        v_product_id,
        trim(v_product ->> 'batch'),
        nullif(v_product ->> 'expiryDate', '')::date,
        nullif(v_product ->> 'unitCost', '')::numeric,
        v_import_id,
        now()
      )
      on conflict (product_id, batch_number) do update set
        expiry_date = excluded.expiry_date,
        unit_cost = excluded.unit_cost,
        source_import_id = excluded.source_import_id,
        updated_at = now()
      returning id into v_batch_id;
    end if;

    select coalesce(sum(quantity_delta), 0) into v_current_quantity
    from public.inventory_movements
    where product_id = v_product_id;

    v_quantity_delta := (v_product ->> 'qtyOnHand')::numeric - v_current_quantity;
    if v_quantity_delta <> 0 then
      insert into public.inventory_movements (
        product_id, batch_id, movement_type, quantity_delta, unit_cost, occurred_at,
        reference_type, reference_id, reason, source_import_id, source_row_number
      ) values (
        v_product_id,
        v_batch_id,
        case when v_current_quantity = 0 then 'opening_balance' else 'count_adjustment' end,
        v_quantity_delta,
        nullif(v_product ->> 'unitCost', '')::numeric,
        coalesce(p_source_snapshot_at, now()),
        'workbook_import',
        v_import_id::text,
        case when v_current_quantity = 0
          then 'Opening balance from workbook snapshot'
          else 'Balance adjustment from workbook snapshot'
        end,
        v_import_id,
        nullif(v_product ->> 'sourceRowNumber', '')::integer
      );
    end if;

    if nullif(trim(v_product ->> 'notes'), '') is not null then
      insert into public.inventory_notes (product_id, note, source_import_id)
      values (v_product_id, trim(v_product ->> 'notes'), v_import_id);
    end if;
  end loop;

  for v_history in select value from jsonb_array_elements(p_history_rows)
  loop
    if nullif(trim(v_history ->> 'itemCode'), '') is null or
       nullif(v_history ->> 'month', '') is null or
       nullif(v_history ->> 'quantity', '') is null then
      raise exception 'Every history row requires itemCode, month and quantity';
    end if;

    insert into public.inventory_products (
      item_code, description, is_active, source_import_id, updated_at
    ) values (
      trim(v_history ->> 'itemCode'),
      coalesce(nullif(trim(v_history ->> 'description'), ''), trim(v_history ->> 'itemCode')),
      false,
      v_import_id,
      now()
    )
    on conflict (item_code) do update set
      description = case
        when nullif(public.inventory_products.description, '') is null then excluded.description
        else public.inventory_products.description
      end,
      updated_at = now()
    returning id into v_product_id;

    insert into public.inventory_legacy_movement_rows (
      product_id, item_description, month, quantity_moved,
      source_import_id, source_row_number
    ) values (
      v_product_id,
      nullif(trim(v_history ->> 'description'), ''),
      (v_history ->> 'month')::date,
      (v_history ->> 'quantity')::numeric,
      v_import_id,
      (v_history ->> 'sourceRowNumber')::integer
    );
  end loop;

  insert into public.inventory_monthly_history (
    product_id, month, quantity_moved, source_import_id, source_row_number
  )
  select
    product_id,
    month,
    sum(quantity_moved),
    v_import_id,
    min(source_row_number)
  from public.inventory_legacy_movement_rows
  where source_import_id = v_import_id
  group by product_id, month
  on conflict (product_id, month) do update set
    quantity_moved = excluded.quantity_moved,
    source_import_id = excluded.source_import_id,
    source_row_number = excluded.source_row_number;

  update public.inventory_imports
  set status = 'committed', committed_at = now()
  where id = v_import_id;

  insert into public.inventory_audit_events (
    entity_type, entity_id, action, after_state, correlation_id
  ) values (
    'inventory_import',
    v_import_id,
    'workbook_import_committed',
    jsonb_build_object(
      'sourceFilename', p_source_filename,
      'sourceSha256', p_source_sha256,
      'products', v_product_count,
      'historyRows', v_history_count,
      'warnings', v_warning_count
    ),
    v_import_id
  );

  return jsonb_build_object(
    'success', true,
    'idempotent', false,
    'importId', v_import_id,
    'products', v_product_count,
    'historyRows', v_history_count,
    'warnings', v_warning_count
  );
exception when others then
  insert into public.inventory_imports (
    id, source_filename, source_sha256, source_snapshot_at, status,
    row_count, accepted_count, warning_count, rejected_count, validation_report
  ) values (
    v_import_id, p_source_filename, p_source_sha256, p_source_snapshot_at, 'rejected',
    v_product_count + v_history_count, 0, v_warning_count,
    v_product_count + v_history_count,
    coalesce(p_validation_report, '{}'::jsonb) || jsonb_build_object('databaseError', sqlerrm)
  )
  on conflict (source_sha256) do update set
    status = 'rejected',
    accepted_count = 0,
    rejected_count = excluded.rejected_count,
    validation_report = excluded.validation_report;

  return jsonb_build_object(
    'success', false,
    'importId', v_import_id,
    'error', sqlerrm
  );
end;
$$;

revoke all on function public.import_inventory_workbook(text, text, timestamptz, jsonb, jsonb, jsonb) from public;
grant execute on function public.import_inventory_workbook(text, text, timestamptz, jsonb, jsonb, jsonb) to service_role;

comment on view public.inventory_master is 'Live replacement for the workbook Inventory Master formula sheet.';
comment on view public.inventory_priority_queue is 'Workbook priority formula, corrected so null expiry dates are not treated as near expiry.';
comment on table public.inventory_audit_events is 'Append-only record of inventory changes; application mutations should write here in the same transaction.';
comment on table public.inventory_legacy_movement_rows is 'Unaggregated source rows retained from the workbook MovementLog table.';
comment on function public.import_inventory_workbook is 'Idempotent, transactional workbook cutover called only with the server-side service role.';
