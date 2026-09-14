import { existsSync } from "node:fs";
import process from "node:process";
import { PREPARED_MOVEMENTS, PREPARED_PRODUCTS } from "../src/components/cospharm/inventoryData.ts";

for (const file of [".env.local", ".env"]) {
  if (existsSync(file)) process.loadEnvFile(file);
}

const url = (process.env.VITE_SUPABASE_URL ?? process.env.SUPABASE_URL)?.replace(/\/$/, "");
const key = process.env.VITE_SUPABASE_PUBLISHABLE_KEY ?? process.env.SUPABASE_PUBLISHABLE_KEY;
if (!url || !key) {
  throw new Error("Set VITE_SUPABASE_URL and VITE_SUPABASE_PUBLISHABLE_KEY in .env.local.");
}

const months = [
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

async function request(path, init = {}) {
  const response = await fetch(`${url}/rest/v1/${path}`, {
    ...init,
    headers: { apikey: key, "Content-Type": "application/json", ...(init.headers ?? {}) },
  });
  if (!response.ok)
    throw new Error((await response.text()) || `Request failed (${response.status}).`);
  return response;
}

const productRows = PREPARED_PRODUCTS.map((product) => ({
  item_code: product.sku,
  item_description: product.name,
  portfolio: product.category,
  qty_on_hand: product.onHand,
  unit_cost: product.unitCost,
  monthly_target: product.reorder,
  expiry_date: product.expiry === "—" ? null : `${product.expiry}-01`,
  batch: product.batch ?? null,
  notes: product.issue ?? null,
}));

const movementRows = PREPARED_MOVEMENTS.map((movement) => ({
  item_code: movement.sku,
  month_name: months[Number(movement.month.slice(5, 7)) - 1],
  quantity: movement.quantity,
}));

await request("inventory_products?on_conflict=item_code", {
  method: "POST",
  headers: { Prefer: "resolution=merge-duplicates,return=minimal" },
  body: JSON.stringify(productRows),
});

for (let index = 0; index < movementRows.length; index += 400) {
  await request("inventory_movements?on_conflict=item_code,month_name", {
    method: "POST",
    headers: { Prefer: "resolution=merge-duplicates,return=minimal" },
    body: JSON.stringify(movementRows.slice(index, index + 400)),
  });
}

await request("inventory_audit_log", {
  method: "POST",
  headers: { Prefer: "return=minimal" },
  body: JSON.stringify({
    action: "SEED",
    source: "COIP_GITHUB",
    record_label: "Prepared Sep 3 inventory",
    new_value: `${productRows.length} products; ${movementRows.length} monthly movement records`,
    actor_name: "COIP migration",
    actor_role: "system",
    detail: "Idempotent seed from the GitHub-maintained inventory data set.",
  }),
});

const counts = {};
for (const table of ["inventory_products", "inventory_movements"]) {
  const response = await request(`${table}?select=*&limit=1`, {
    headers: { Prefer: "count=exact" },
  });
  counts[table] = Number(response.headers.get("content-range")?.split("/")[1] ?? 0);
}

console.log(
  `Inventory database ready: ${counts.inventory_products} products, ${counts.inventory_movements} monthly movements.`,
);
