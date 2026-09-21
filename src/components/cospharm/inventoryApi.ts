import { PREPARED_MOVEMENTS, PREPARED_PRODUCTS } from "./inventoryData";
import type { AuditEntry, InventoryMovement, InventoryProduct } from "./types";

type ProductRow = {
  item_code: string;
  item_description: string;
  portfolio: string;
  qty_on_hand: number;
  unit_cost: number;
  monthly_target: number;
  expiry_date: string | null;
  batch: string | null;
  notes: string | null;
  last_updated: string;
};

type MovementRow = {
  id: string;
  item_code: string;
  month_name: string;
  quantity: number;
  created_at: string;
};

const monthNames = [
  "January",
  "February",
  "March",
  "April",
  "May",
  "June",
  "July",
  "August",
  "September",
  "October",
  "November",
  "December",
];

function config() {
  const url = import.meta.env.VITE_SUPABASE_URL as string | undefined;
  const key = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY as string | undefined;
  return url && key ? { url: url.replace(/\/$/, ""), key } : null;
}

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const current = config();
  if (!current) throw new Error("Inventory database is not configured.");
  const response = await fetch(`${current.url}/rest/v1/${path}`, {
    ...init,
    headers: {
      apikey: current.key,
      "Content-Type": "application/json",
      ...(init?.headers ?? {}),
    },
  });
  if (!response.ok)
    throw new Error((await response.text()) || `Database request failed (${response.status}).`);
  if (response.status === 204) return undefined as T;
  return (await response.json()) as T;
}

async function loadAll<T>(path: string): Promise<T[]> {
  const rows: T[] = [];
  for (let offset = 0; ; offset += 1000) {
    const page = await request<T[]>(path, { headers: { Range: `${offset}-${offset + 999}` } });
    rows.push(...page);
    if (page.length < 1000) return rows;
  }
}

function statusFor(onHand: number, reorder: number): InventoryProduct["status"] {
  if (onHand <= reorder * 0.45) return "red";
  if (onHand <= reorder) return "yellow";
  return "green";
}

function toProduct(row: ProductRow): InventoryProduct {
  const prepared = PREPARED_PRODUCTS.find((item) => item.sku === row.item_code);
  const reorder = Number(row.monthly_target);
  const onHand = Number(row.qty_on_hand);
  const status = statusFor(onHand, reorder);
  return {
    id: prepared?.id ?? `INV-${row.item_code}`,
    sku: row.item_code,
    name: row.item_description,
    category: row.portfolio,
    onHand,
    reorder,
    capacity: prepared?.capacity ?? Math.max(onHand, reorder * 4, 1),
    expiry: row.expiry_date?.slice(0, 7) ?? "—",
    status,
    issue:
      row.notes ??
      (status === "red"
        ? "Critically below reorder level"
        : status === "yellow"
          ? "Below reorder level"
          : undefined),
    batch: row.batch ?? undefined,
    damagedUnits: prepared?.damagedUnits,
    unit: prepared?.unit ?? "Each",
    packSize: prepared?.packSize ?? "—",
    supplier: prepared?.supplier ?? "—",
    location: prepared?.location ?? "—",
    unitCost: Number(row.unit_cost),
    lastCounted: row.last_updated.slice(0, 10),
    active: true,
  };
}

function toProductRow(product: InventoryProduct): Omit<ProductRow, "last_updated"> {
  return {
    item_code: product.sku,
    item_description: product.name,
    portfolio: product.category,
    qty_on_hand: product.onHand,
    unit_cost: product.unitCost,
    monthly_target: product.reorder,
    expiry_date: product.expiry && product.expiry !== "—" ? `${product.expiry}-01` : null,
    batch: product.batch ?? null,
    notes: product.issue ?? null,
  };
}

function monthName(period: string) {
  const month = Number(period.slice(5, 7));
  return monthNames[month - 1] ?? period;
}

function periodFor(name: string, createdAt: string) {
  const index = monthNames.findIndex((month) => month.toLowerCase() === name.toLowerCase());
  return index >= 0
    ? `${createdAt.slice(0, 4)}-${String(index + 1).padStart(2, "0")}`
    : name.slice(0, 7);
}

export function inventoryDatabaseConfigured() {
  return Boolean(config());
}

export async function loadInventoryDatabase() {
  const [productRows, movementRows] = await Promise.all([
    loadAll<ProductRow>("inventory_products?select=*&order=item_code"),
    loadAll<MovementRow>("inventory_movements?select=*&order=item_code,month_name"),
  ]);
  const products = productRows.map(toProduct);
  const preparedByKey = new Map(
    PREPARED_MOVEMENTS.map((item) => [`${item.sku}|${monthName(item.month)}`, item]),
  );
  const movements = movementRows.map((row) => {
    const prepared = preparedByKey.get(`${row.item_code}|${row.month_name}`);
    const period = prepared?.month ?? periodFor(row.month_name, row.created_at);
    return {
      id: row.id,
      productId: products.find((item) => item.sku === row.item_code)?.id ?? `INV-${row.item_code}`,
      sku: row.item_code,
      month: period,
      date: prepared?.date ?? `${period}-01`,
      type: prepared?.type ?? "ADJUSTMENT",
      quantity: Number(row.quantity),
      balance: prepared?.balance ?? 0,
      reference: prepared?.reference ?? "Database movement",
      note: prepared?.note,
    } satisfies InventoryMovement;
  });
  return { products, movements };
}

export async function seedPreparedInventoryDatabase() {
  const products = PREPARED_PRODUCTS.map(toProductRow);
  const movements = PREPARED_MOVEMENTS.map((movement) => ({
    item_code: movement.sku,
    month_name: monthName(movement.month),
    quantity: movement.quantity,
  }));
  await request("inventory_products?on_conflict=item_code", {
    method: "POST",
    headers: { Prefer: "resolution=merge-duplicates,return=minimal" },
    body: JSON.stringify(products),
  });
  for (let index = 0; index < movements.length; index += 400) {
    await request("inventory_movements?on_conflict=item_code,month_name", {
      method: "POST",
      headers: { Prefer: "resolution=merge-duplicates,return=minimal" },
      body: JSON.stringify(movements.slice(index, index + 400)),
    });
  }
  await request("inventory_audit_log", {
    method: "POST",
    headers: { Prefer: "return=minimal" },
    body: JSON.stringify({
      action: "SEED",
      source: "COIP_GITHUB",
      record_label: "Prepared Sep 3 inventory",
      new_value: `${products.length} products; ${movements.length} monthly movement records`,
      actor_name: "COIP migration",
      actor_role: "system",
      detail: "Idempotent seed from the GitHub-maintained COIP data set.",
    }),
  });
}

export async function saveInventoryProduct(product: InventoryProduct) {
  await request("inventory_products?on_conflict=item_code", {
    method: "POST",
    headers: { Prefer: "resolution=merge-duplicates,return=minimal" },
    body: JSON.stringify(toProductRow(product)),
  });
}

export async function saveInventorySync(
  products: InventoryProduct[],
  movements: InventoryMovement[],
  audit: AuditEntry[],
  fileName: string,
  counts: {
    rowsRead: number;
    rowsNew: number;
    rowsChanged: number;
    rowsUnchanged: number;
    rowsConflicted: number;
  },
) {
  if (products.length) {
    await request("inventory_products?on_conflict=item_code", {
      method: "POST",
      headers: { Prefer: "resolution=merge-duplicates,return=minimal" },
      body: JSON.stringify(products.map(toProductRow)),
    });
  }
  if (movements.length) {
    const rows = movements.map((movement) => ({
      item_code: movement.sku,
      month_name: monthName(movement.month),
      quantity: movement.quantity,
    }));
    await request("inventory_movements?on_conflict=item_code,month_name", {
      method: "POST",
      headers: { Prefer: "resolution=merge-duplicates,return=minimal" },
      body: JSON.stringify(rows),
    });
  }
  if (audit.length) {
    await request("inventory_audit_log", {
      method: "POST",
      headers: { Prefer: "return=minimal" },
      body: JSON.stringify(
        audit.map((entry) => ({
          action: entry.field === "product" ? "CREATE" : "UPDATE",
          source: "EXCEL_SYNC",
          item_code: entry.entityId,
          record_label: entry.entityLabel,
          field_name: entry.field,
          old_value: entry.oldValue,
          new_value: entry.newValue,
          actor_name: entry.user,
          actor_role: entry.role,
          detail: entry.comment,
          created_at: entry.timestamp,
        })),
      ),
    });
  }
  await request("inventory_imports", {
    method: "POST",
    headers: { Prefer: "return=minimal" },
    body: JSON.stringify({
      file_name: fileName,
      status: "APPLIED",
      rows_read: counts.rowsRead,
      rows_new: counts.rowsNew,
      rows_changed: counts.rowsChanged,
      rows_unchanged: counts.rowsUnchanged,
      rows_conflicted: counts.rowsConflicted,
      rows_skipped: counts.rowsConflicted,
      actor_name: audit[0]?.user ?? "System",
    }),
  });
}
