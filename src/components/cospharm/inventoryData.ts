import type { InventoryMovement, InventoryProduct } from "./types";

const families = [
  ["Analgesics", ["Paracetamol", "Ibuprofen", "Diclofenac", "Aspirin", "Tramadol", "Naproxen"]],
  [
    "Antibiotics",
    ["Amoxicillin", "Azithromycin", "Ceftriaxone", "Ciprofloxacin", "Doxycycline", "Metronidazole"],
  ],
  [
    "Cardiovascular",
    ["Amlodipine", "Atenolol", "Losartan", "Enalapril", "Furosemide", "Simvastatin"],
  ],
  ["Diabetes", ["Metformin", "Gliclazide", "Insulin Glargine", "Insulin Soluble", "Sitagliptin"]],
  ["Respiratory", ["Salbutamol", "Budesonide", "Montelukast", "Beclometasone", "Ipratropium"]],
  [
    "Gastrointestinal",
    ["Omeprazole", "Loperamide", "Ondansetron", "Lactulose", "ORS", "Bisacodyl"],
  ],
  ["Antihistamines", ["Loratadine", "Cetirizine", "Chlorpheniramine", "Promethazine"]],
  [
    "Vitamins & minerals",
    ["Vitamin C", "Folic Acid", "Ferrous Sulphate", "Calcium", "Multivitamin", "Zinc"],
  ],
  ["Dermatology", ["Clotrimazole", "Hydrocortisone", "Aqueous Cream", "Mupirocin", "Calamine"]],
  ["Cold chain", ["Tetanus Vaccine", "Hepatitis B Vaccine", "Oxytocin", "Erythropoietin"]],
  [
    "Medical supplies",
    ["Surgical Gloves", "Gauze Swabs", "Syringes", "IV Giving Set", "Face Masks", "Cannula"],
  ],
] as const;

const forms = [
  "500mg Tablets",
  "250mg Capsules",
  "100ml Syrup",
  "1g Vial",
  "10mg Tablets",
  "2% Cream",
  "20mg Tablets",
  "5ml Ampoules",
];
const suppliers = [
  "Cospharm Distribution",
  "MedSupply Botswana",
  "Kalahari Pharma",
  "Delta Healthcare",
  "Botswana Medical Stores",
];
const locations = ["A-01", "A-02", "B-01", "B-02", "COLD-01", "BULK-01", "SECURE-01"];

function statusFor(onHand: number, reorder: number): InventoryProduct["status"] {
  if (onHand <= Math.round(reorder * 0.45)) return "red";
  if (onHand <= reorder) return "yellow";
  return "green";
}

export const PREPARED_PRODUCTS: InventoryProduct[] = Array.from({ length: 199 }, (_, index) => {
  const family = families[index % families.length];
  const base = family[1][Math.floor(index / families.length) % family[1].length];
  const form = forms[(index * 3 + Math.floor(index / 7)) % forms.length];
  const sequence = String(index + 1).padStart(3, "0");
  const reorder = 40 + (index % 9) * 20;
  const capacity = reorder * (4 + (index % 4));
  const onHand = 18 + ((index * 73) % Math.max(40, capacity - 18));
  const status = statusFor(onHand, reorder);
  const expiryYear = 2026 + (index % 4);
  const expiryMonth = String(((index * 5) % 12) + 1).padStart(2, "0");
  return {
    id: `S-${sequence}`,
    sku: `CP-${family[0]
      .slice(0, 3)
      .toUpperCase()
      .replace(/[^A-Z]/g, "X")}-${sequence}`,
    name: `${base} ${form}`,
    category: family[0],
    onHand,
    reorder,
    capacity,
    expiry: `${expiryYear}-${expiryMonth}`,
    status,
    issue:
      status === "red"
        ? "Critically below reorder level"
        : status === "yellow"
          ? "Below reorder level"
          : undefined,
    batch: `BT${String(260000 + index * 37)}`,
    damagedUnits: index % 41 === 0 ? 2 + (index % 5) : undefined,
    unit: family[0] === "Medical supplies" ? "Each" : "Pack",
    packSize: `${10 + (index % 9) * 10} units`,
    supplier: suppliers[index % suppliers.length],
    location: locations[index % locations.length],
    unitCost: Number((4.5 + ((index * 197) % 8200) / 100).toFixed(2)),
    lastCounted: `2026-09-${String((index % 3) + 1).padStart(2, "0")}`,
    active: true,
  };
});

const months = ["2026-04", "2026-05", "2026-06", "2026-07", "2026-08", "2026-09"];

export const PREPARED_MOVEMENTS: InventoryMovement[] = PREPARED_PRODUCTS.flatMap(
  (product, productIndex) => {
    const productMonths = productIndex < 165 ? months : months.slice(1);
    let balance = Math.max(product.reorder, product.onHand - productMonths.length * 7);
    return productMonths.map((month, monthIndex) => {
      const receipt = 15 + ((productIndex * 11 + monthIndex * 17) % 90);
      const issue = 12 + ((productIndex * 19 + monthIndex * 13) % 82);
      const adjustment = (productIndex + monthIndex) % 17 === 0 ? -2 : 0;
      const net = receipt - issue + adjustment;
      balance =
        monthIndex === productMonths.length - 1 ? product.onHand : Math.max(0, balance + net);
      return {
        id: `MV-${String(productIndex + 1).padStart(3, "0")}-${month.replace("-", "")}`,
        productId: product.id,
        sku: product.sku,
        month,
        date: `${month}-${String(8 + ((productIndex + monthIndex * 3) % 20)).padStart(2, "0")}`,
        type: net >= 0 ? "RECEIPT" : "ISSUE",
        quantity: Math.abs(net),
        balance,
        reference: `MON-${month.replace("-", "")}-${String(productIndex + 1).padStart(3, "0")}`,
        note: `Received ${receipt} · issued ${issue}${adjustment ? ` · adjusted ${adjustment}` : ""}`,
      } satisfies InventoryMovement;
    });
  },
);

export const INVENTORY_SEED_VERSION = "sep-03-2026-v1";
