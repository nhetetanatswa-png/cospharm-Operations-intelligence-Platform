CREATE TABLE public.inventory_settings (
  id boolean PRIMARY KEY DEFAULT true CHECK (id),
  months_included int NOT NULL DEFAULT 8,
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE ON public.inventory_settings TO anon, authenticated;
GRANT ALL ON public.inventory_settings TO service_role;
ALTER TABLE public.inventory_settings ENABLE ROW LEVEL SECURITY;
CREATE POLICY "settings readable" ON public.inventory_settings FOR SELECT TO anon, authenticated USING (true);
CREATE POLICY "settings writable" ON public.inventory_settings FOR UPDATE TO anon, authenticated USING (true) WITH CHECK (true);
CREATE POLICY "settings insertable" ON public.inventory_settings FOR INSERT TO anon, authenticated WITH CHECK (true);
INSERT INTO public.inventory_settings (id, months_included) VALUES (true, 8);

CREATE TABLE public.inventory_products (
  item_code text PRIMARY KEY,
  item_description text NOT NULL,
  portfolio text NOT NULL DEFAULT 'Unassigned',
  qty_on_hand numeric NOT NULL DEFAULT 0,
  unit_cost numeric NOT NULL DEFAULT 0,
  monthly_target numeric NOT NULL DEFAULT 0,
  expiry_date date,
  batch text,
  notes text,
  last_updated timestamptz NOT NULL DEFAULT now(),
  data_flags text[] NOT NULL DEFAULT '{}',
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.inventory_products TO anon, authenticated;
GRANT ALL ON public.inventory_products TO service_role;
ALTER TABLE public.inventory_products ENABLE ROW LEVEL SECURITY;
CREATE POLICY "products readable" ON public.inventory_products FOR SELECT TO anon, authenticated USING (true);
CREATE POLICY "products writable" ON public.inventory_products FOR ALL TO anon, authenticated USING (true) WITH CHECK (true);

CREATE TABLE public.inventory_movements (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  item_code text NOT NULL REFERENCES public.inventory_products(item_code) ON DELETE CASCADE,
  month_name text NOT NULL,
  quantity numeric NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (item_code, month_name)
);
CREATE INDEX inventory_movements_item_idx ON public.inventory_movements (item_code);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.inventory_movements TO anon, authenticated;
GRANT ALL ON public.inventory_movements TO service_role;
ALTER TABLE public.inventory_movements ENABLE ROW LEVEL SECURITY;
CREATE POLICY "movements readable" ON public.inventory_movements FOR SELECT TO anon, authenticated USING (true);
CREATE POLICY "movements writable" ON public.inventory_movements FOR ALL TO anon, authenticated USING (true) WITH CHECK (true);

CREATE TABLE public.inventory_audit_log (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  action text NOT NULL,
  source text NOT NULL DEFAULT 'MANUAL',
  item_code text,
  record_label text,
  field_name text,
  old_value text,
  new_value text,
  actor_name text NOT NULL DEFAULT 'System',
  actor_role text NOT NULL DEFAULT 'system',
  detail text,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX inventory_audit_created_idx ON public.inventory_audit_log (created_at DESC);
GRANT SELECT, INSERT ON public.inventory_audit_log TO anon, authenticated;
GRANT ALL ON public.inventory_audit_log TO service_role;
ALTER TABLE public.inventory_audit_log ENABLE ROW LEVEL SECURITY;
CREATE POLICY "audit readable" ON public.inventory_audit_log FOR SELECT TO anon, authenticated USING (true);
CREATE POLICY "audit appendable" ON public.inventory_audit_log FOR INSERT TO anon, authenticated WITH CHECK (true);

CREATE TABLE public.inventory_imports (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  file_name text NOT NULL,
  sheet_name text,
  status text NOT NULL DEFAULT 'APPLIED',
  rows_read int NOT NULL DEFAULT 0,
  rows_new int NOT NULL DEFAULT 0,
  rows_changed int NOT NULL DEFAULT 0,
  rows_unchanged int NOT NULL DEFAULT 0,
  rows_conflicted int NOT NULL DEFAULT 0,
  rows_skipped int NOT NULL DEFAULT 0,
  failure_reason text,
  actor_name text NOT NULL DEFAULT 'System',
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT ON public.inventory_imports TO anon, authenticated;
GRANT ALL ON public.inventory_imports TO service_role;
ALTER TABLE public.inventory_imports ENABLE ROW LEVEL SECURITY;
CREATE POLICY "imports readable" ON public.inventory_imports FOR SELECT TO anon, authenticated USING (true);
CREATE POLICY "imports appendable" ON public.inventory_imports FOR INSERT TO anon, authenticated WITH CHECK (true);

CREATE OR REPLACE VIEW public.inventory_master
WITH (security_invoker = true) AS
WITH cfg AS (SELECT months_included FROM public.inventory_settings WHERE id),
ordered AS (
  SELECT m.item_code, m.quantity,
         row_number() OVER (PARTITION BY m.item_code ORDER BY array_position(
           ARRAY['January','February','March','April','May','June','July','August','September','October','November','December'], m.month_name)) AS month_pos
  FROM public.inventory_movements m
),
avg_mv AS (
  SELECT o.item_code, COALESCE(avg(o.quantity), 0) AS avg_monthly_movement
  FROM ordered o, cfg
  WHERE o.month_pos <= cfg.months_included
  GROUP BY o.item_code
)
SELECT
  p.item_code,
  p.item_description,
  p.portfolio,
  p.qty_on_hand,
  p.unit_cost,
  round((p.qty_on_hand * p.unit_cost)::numeric, 2) AS stock_value,
  round(COALESCE(a.avg_monthly_movement, 0)::numeric, 2) AS avg_monthly_movement,
  p.monthly_target,
  CASE WHEN COALESCE(a.avg_monthly_movement, 0) > 0
       THEN round((p.qty_on_hand / a.avg_monthly_movement)::numeric, 2)
       WHEN p.qty_on_hand > 0 THEN 999999 ELSE 0 END AS months_holding,
  p.expiry_date,
  CASE WHEN p.expiry_date IS NULL THEN NULL
       ELSE round(((p.expiry_date - CURRENT_DATE) / 30.4375)::numeric, 2) END AS months_to_expiry,
  CASE WHEN p.expiry_date IS NULL THEN 'No expiry date'
       WHEN p.expiry_date < (CURRENT_DATE + INTERVAL '6 months') THEN 'YES' ELSE 'No' END AS near_expiry,
  CASE
    WHEN p.qty_on_hand < 20 THEN 'Out of Stock'
    WHEN COALESCE(a.avg_monthly_movement, 0) <= 0 THEN 'Overstocked'
    WHEN (p.qty_on_hand / a.avg_monthly_movement) < 3 THEN 'Critical Low'
    WHEN (p.qty_on_hand / a.avg_monthly_movement) < 8 THEN 'Low Stock'
    WHEN (p.qty_on_hand / a.avg_monthly_movement) <= 15 THEN 'Normal Stock'
    ELSE 'Overstocked' END AS stock_status,
  CASE
    WHEN COALESCE(a.avg_monthly_movement, 0) <= 0 THEN 'No movement'
    WHEN p.monthly_target <= 0 THEN 'No target'
    WHEN a.avg_monthly_movement < 0.5 * p.monthly_target THEN 'Slow Mover'
    WHEN a.avg_monthly_movement <= p.monthly_target THEN 'Normal Mover'
    ELSE 'Fast Mover' END AS movement_status,
  p.notes,
  p.batch,
  p.data_flags,
  p.last_updated,
  (CASE WHEN p.qty_on_hand < 20 THEN 100 ELSE 0 END)
  + (CASE WHEN p.expiry_date IS NOT NULL AND p.expiry_date < (CURRENT_DATE + INTERVAL '6 months') THEN 50 ELSE 0 END)
  + (CASE WHEN p.qty_on_hand >= 20 AND COALESCE(a.avg_monthly_movement,0) > 0 AND (p.qty_on_hand / a.avg_monthly_movement) < 3 THEN 40 ELSE 0 END)
  + (CASE WHEN p.qty_on_hand >= 20 AND COALESCE(a.avg_monthly_movement,0) > 0 AND (p.qty_on_hand / a.avg_monthly_movement) >= 3 AND (p.qty_on_hand / a.avg_monthly_movement) < 8 THEN 20 ELSE 0 END)
  + (CASE WHEN COALESCE(a.avg_monthly_movement,0) > 0 AND p.monthly_target > 0 AND a.avg_monthly_movement < 0.5 * p.monthly_target THEN 10 ELSE 0 END)
  + (CASE WHEN p.qty_on_hand >= 20 AND (COALESCE(a.avg_monthly_movement,0) <= 0 OR (p.qty_on_hand / NULLIF(a.avg_monthly_movement,0)) > 15) THEN 5 ELSE 0 END)
  AS priority_score
FROM public.inventory_products p
LEFT JOIN avg_mv a ON a.item_code = p.item_code;
GRANT SELECT ON public.inventory_master TO anon, authenticated, service_role;