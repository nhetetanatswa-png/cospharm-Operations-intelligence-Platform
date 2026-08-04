import type { StockItem } from "./types";
import type { Status } from "./StatusBadge";

/** Counts that are not held on StockItem: what the warehouse physically counted
 * and what customers can currently see as available. */
export type InventoryCount = {
  stockId: string;
  warehouseCount: number;
  customerFacing: number;
  unitCostBWP: number;
  lastCountedAt?: string;
  countedBy?: string;
};

export type DetectionStage =
  | "RECEIVING"
  | "PICKING"
  | "BATCH_CHECK"
  | "PACKING"
  | "IN_TRANSIT"
  | "CUSTOMER_RETURN";

export type DamageRecord = {
  id: string;
  stockId: string;
  product: string;
  sku: string;
  batch?: string;
  quantity: number;
  unitCostBWP: number;
  detectionStage: DetectionStage;
  actionTaken: string;
  reportedBy: string;
  reportedAt: string;
};

const COUNT_KEY = "cospharm_inventory_counts_v1";
const DAMAGE_KEY = "cospharm_damage_register_v1";

/** Deterministic seed: derives plausible variances from the stock id so no
 * Math.random() sneaks into render. */
function seedVariance(id: string, mod: number) {
  let h = 0;
  for (let i = 0; i < id.length; i++) h = (h * 31 + id.charCodeAt(i)) % 997;
  return h % mod;
}

export function seedCounts(stock: StockItem[]): InventoryCount[] {
  return stock.map((s) => {
    const drift = seedVariance(s.id, 9) - 4; // -4..+4
    const held = seedVariance(s.sku, 7);
    return {
      stockId: s.id,
      warehouseCount: Math.max(0, s.onHand + drift),
      customerFacing: Math.max(0, s.onHand - (s.damagedUnits ?? 0) - held),
      unitCostBWP: 4 + seedVariance(s.name, 40) / 2,
    };
  });
}

export function seedDamages(stock: StockItem[]): DamageRecord[] {
  const stages: DetectionStage[] = ["RECEIVING", "PICKING", "BATCH_CHECK", "PACKING", "IN_TRANSIT"];
  return stock
    .filter((s) => (s.damagedUnits ?? 0) > 0)
    .map((s, i) => ({
      id: `DMG-${s.id}`,
      stockId: s.id,
      product: s.name,
      sku: s.sku,
      batch: s.batch,
      quantity: s.damagedUnits ?? 0,
      unitCostBWP: 4 + seedVariance(s.name, 40) / 2,
      detectionStage: stages[i % stages.length],
      actionTaken: "Quarantined — supplier claim raised",
      reportedBy: "Warehouse checker",
      reportedAt: new Date(Date.now() - (i + 1) * 86_400_000).toISOString(),
    }));
}

export function loadCounts(stock: StockItem[]): InventoryCount[] {
  if (typeof window === "undefined") return seedCounts(stock);
  try {
    const raw = window.localStorage.getItem(COUNT_KEY);
    const parsed = raw ? (JSON.parse(raw) as InventoryCount[]) : null;
    if (!parsed?.length) return seedCounts(stock);
    const known = new Set(parsed.map((c) => c.stockId));
    return [...parsed, ...seedCounts(stock).filter((c) => !known.has(c.stockId))];
  } catch {
    return seedCounts(stock);
  }
}

export function saveCounts(counts: InventoryCount[]) {
  if (typeof window === "undefined") return;
  try { window.localStorage.setItem(COUNT_KEY, JSON.stringify(counts)); } catch { /* ignore */ }
}

export function loadDamages(stock: StockItem[]): DamageRecord[] {
  if (typeof window === "undefined") return seedDamages(stock);
  try {
    const raw = window.localStorage.getItem(DAMAGE_KEY);
    const parsed = raw ? (JSON.parse(raw) as DamageRecord[]) : null;
    return parsed?.length ? parsed : seedDamages(stock);
  } catch {
    return seedDamages(stock);
  }
}

export function saveDamages(list: DamageRecord[]) {
  if (typeof window === "undefined") return;
  try { window.localStorage.setItem(DAMAGE_KEY, JSON.stringify(list)); } catch { /* ignore */ }
}

export type Discrepancy = {
  stockId: string;
  name: string;
  sku: string;
  system: number;
  warehouse: number;
  customerFacing: number;
  systemVsWarehouse: number;
  warehouseVsCustomer: number;
  worstGapPct: number;
  tone: Status;
  note: string;
};

export function computeDiscrepancies(stock: StockItem[], counts: InventoryCount[]): Discrepancy[] {
  const byId = new Map(counts.map((c) => [c.stockId, c]));
  return stock.map((s) => {
    const c = byId.get(s.id);
    const warehouse = c?.warehouseCount ?? s.onHand;
    const customerFacing = c?.customerFacing ?? s.onHand;
    const a = s.onHand - warehouse;
    const b = warehouse - customerFacing;
    const base = Math.max(1, s.onHand);
    const worstGapPct = Math.round((Math.max(Math.abs(a), Math.abs(b)) / base) * 100);
    const tone: Status = worstGapPct >= 10 ? "red" : worstGapPct >= 3 ? "yellow" : "green";
    const note =
      tone === "green"
        ? "System, warehouse and customer-facing figures agree."
        : Math.abs(a) >= Math.abs(b)
          ? `System is ${a > 0 ? "over" : "under"}-stating stock by ${Math.abs(a)} units versus the physical count.`
          : `${b} units are held back from customer-facing availability (damage, quarantine or allocation).`;
    return {
      stockId: s.id, name: s.name, sku: s.sku,
      system: s.onHand, warehouse, customerFacing,
      systemVsWarehouse: a, warehouseVsCustomer: b,
      worstGapPct, tone, note,
    };
  });
}

export function damageValue(list: DamageRecord[]) {
  return list.reduce((sum, d) => sum + d.quantity * d.unitCostBWP, 0);
}

export const DETECTION_LABEL: Record<DetectionStage, string> = {
  RECEIVING: "Receiving",
  PICKING: "Picking",
  BATCH_CHECK: "Batch check",
  PACKING: "Packing",
  IN_TRANSIT: "In transit",
  CUSTOMER_RETURN: "Customer return",
};

export function monthsToExpiry(expiry: string, now = new Date()) {
  const e = new Date(expiry.length === 7 ? `${expiry}-01` : expiry);
  if (isNaN(e.getTime())) return 99;
  return (e.getFullYear() - now.getFullYear()) * 12 + (e.getMonth() - now.getMonth());
}