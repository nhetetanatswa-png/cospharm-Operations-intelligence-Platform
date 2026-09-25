import process from "node:process";
import { createClient } from "@supabase/supabase-js";
import type { InventoryDataset, InventoryProductRecord } from "./types";

type InventoryMasterRow = {
  id: string;
  item_code: string;
  description: string;
  portfolio: string | null;
  quantity_on_hand: number | string;
  default_unit_cost: number | string | null;
  monthly_target: number | string | null;
  nearest_expiry_date: string | null;
  updated_at: string | null;
};

type HistoryRow = {
  product_id: string;
  month: string;
  quantity_moved: number | string;
};

type BatchRow = {
  product_id: string;
  batch_number: string;
  expiry_date: string | null;
};

type NoteRow = {
  product_id: string;
  note: string;
  created_at: string;
};

const asNumber = (value: number | string | null) =>
  value === null || value === "" ? null : Number(value);

export function hasInventoryDatabaseConfig() {
  return Boolean(process.env.SUPABASE_URL && process.env.SUPABASE_SERVICE_ROLE_KEY);
}

function getSupabaseAdmin() {
  const url = process.env.SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !serviceRoleKey) return null;
  return createClient(url, serviceRoleKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
}

export async function loadInventoryDataset(): Promise<InventoryDataset | null> {
  const supabase = getSupabaseAdmin();
  if (!supabase) return null;

  const [masterResult, historyResult, importResult] = await Promise.all([
    supabase
      .from("inventory_master")
      .select(
        "id,item_code,description,portfolio,quantity_on_hand,default_unit_cost,monthly_target,nearest_expiry_date,updated_at",
      )
      .order("item_code"),
    supabase
      .from("inventory_monthly_history")
      .select("product_id,month,quantity_moved")
      .order("month")
      .range(0, 9999),
    supabase
      .from("inventory_imports")
      .select(
        "id,source_filename,source_snapshot_at,row_count,accepted_count,warning_count,rejected_count,committed_at",
      )
      .eq("status", "committed")
      .order("committed_at", { ascending: false })
      .limit(1)
      .maybeSingle(),
  ]);

  if (masterResult.error) throw masterResult.error;
  if (historyResult.error) throw historyResult.error;
  if (importResult.error) throw importResult.error;

  const masterRows = (masterResult.data ?? []) as InventoryMasterRow[];
  const historyRows = (historyResult.data ?? []) as HistoryRow[];
  const productIds = masterRows.map((row) => row.id);
  const [batchResult, noteResult] = productIds.length
    ? await Promise.all([
        supabase
          .from("inventory_batches")
          .select("product_id,batch_number,expiry_date")
          .in("product_id", productIds)
          .order("expiry_date"),
        supabase
          .from("inventory_notes")
          .select("product_id,note,created_at")
          .in("product_id", productIds)
          .order("created_at", { ascending: false }),
      ])
    : [
        { data: [], error: null },
        { data: [], error: null },
      ];

  if (batchResult.error) throw batchResult.error;
  if (noteResult.error) throw noteResult.error;

  const monthKeys = Array.from(new Set(historyRows.map((row) => row.month.slice(0, 7))))
    .sort()
    .slice(-8);
  const historyByProduct = new Map<string, Map<string, number>>();
  for (const row of historyRows) {
    const series = historyByProduct.get(row.product_id) ?? new Map<string, number>();
    series.set(row.month.slice(0, 7), Number(row.quantity_moved));
    historyByProduct.set(row.product_id, series);
  }

  const batchesByProduct = new Map<string, BatchRow>();
  for (const row of (batchResult.data ?? []) as BatchRow[]) {
    if (!batchesByProduct.has(row.product_id)) batchesByProduct.set(row.product_id, row);
  }
  const notesByProduct = new Map<string, string>();
  for (const row of (noteResult.data ?? []) as NoteRow[]) {
    if (!notesByProduct.has(row.product_id)) notesByProduct.set(row.product_id, row.note);
  }

  const products: InventoryProductRecord[] = masterRows.map((row) => ({
    itemCode: row.item_code,
    description: row.description,
    portfolio: row.portfolio,
    qtyOnHand: Number(row.quantity_on_hand),
    unitCost: asNumber(row.default_unit_cost),
    monthlyTarget: asNumber(row.monthly_target),
    expiryDate: row.nearest_expiry_date,
    batch: batchesByProduct.get(row.id)?.batch_number ?? null,
    notes: notesByProduct.get(row.id) ?? null,
    lastUpdated: row.updated_at,
    monthlyMovement: monthKeys.map((month) => historyByProduct.get(row.id)?.get(month) ?? 0),
  }));

  const latestImport = importResult.data;
  return {
    source: "supabase",
    months: monthKeys,
    products,
    historyRowCount: historyRows.length,
    importSummary: latestImport
      ? {
          id: latestImport.id,
          sourceFilename: latestImport.source_filename,
          sourceSnapshotAt: latestImport.source_snapshot_at,
          rowCount: latestImport.row_count,
          acceptedCount: latestImport.accepted_count,
          warningCount: latestImport.warning_count,
          rejectedCount: latestImport.rejected_count,
          committedAt: latestImport.committed_at,
        }
      : null,
  };
}
