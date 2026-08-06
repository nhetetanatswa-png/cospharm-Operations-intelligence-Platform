// ============================================================================
// Illustrative demonstration dataset.
//
// Everything is built from a single `now` timestamp that is supplied AFTER
// hydration, so no date is ever derived at module scope (which is what produced
// the 1969/1970 dates on the published Worker build).
// ============================================================================

import { CLIENT_CONTACTS } from "./mockClients";
import { makeSteps } from "./operations";
import { STEP_TARGET_MINUTES, type DeliveryTimings, type StepTiming } from "./delivery-timing";
import type {
  AuditEntry,
  AuthorisationRequest,
  BatchRecord,
  CalendarEvent,
  ColdChainZone,
  ControlledDrugLog,
  Delivery,
  EmergencyOrder,
  FieldLogEntry,
  FieldVisit,
  Inspection,
  Inspection as InspectionType,
  License,
  PromoStockItem,
  StockItem,
  Task,
} from "./types";

export const TARGET_DELIVERIES_PER_DAY = 8;

const MIN = 60_000;
const HOUR = 60 * MIN;
const DAY = 24 * HOUR;

const iso = (ms: number) => new Date(ms).toISOString();
const day = (now: number, offset = 0) => new Date(now + offset * DAY).toISOString().slice(0, 10);
const monthStamp = (now: number, monthsAhead: number) => {
  const d = new Date(now);
  d.setUTCDate(1);
  d.setUTCMonth(d.getUTCMonth() + monthsAhead);
  return d.toISOString().slice(0, 7);
};

/** Deterministic 0..1 from a string — keeps the demo stable across renders. */
function hashUnit(key: string): number {
  let h = 2166136261;
  for (let i = 0; i < key.length; i++) {
    h ^= key.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return ((h >>> 0) % 10_000) / 10_000;
}

// ===== Tasks =====

function buildTasks(now: number): Task[] {
  return [
    { id: "T-1042", title: "Morning cold-chain temperature log", assignee: "Legkotla P.", shift: "Morning", due: "07:30", status: "green", note: "All readings within range.", verifiedBy: "Mr. T", verifiedAt: iso(now - 5 * HOUR) },
    { id: "T-1043", title: "Restock dispensary shelves A–C", assignee: "TT", shift: "Morning", due: "09:00", status: "yellow", note: "Started — shelf C pending" },
    { id: "T-1044", title: "Sign off overnight delivery manifest", assignee: "Mr. T", shift: "Morning", due: "08:00", status: "red", note: "Not signed — driver waiting" },
    { id: "T-1045", title: "Controlled drugs cabinet count", assignee: "Tariro", shift: "Morning", due: "10:00", status: "green", note: "Counts match register.", verifiedBy: "Mr. T", verifiedAt: iso(now - 3 * HOUR) },
    { id: "T-1046", title: "Clean & sanitise packing bench", assignee: "Tshepang", shift: "Afternoon", due: "13:00", status: "yellow", note: "In progress" },
    { id: "T-1047", title: "Cold-chain pack-out for Bokamoso order", assignee: "Phuso", shift: "Afternoon", due: "14:30", status: "red", note: "Insulin short — cannot pack" },
    { id: "T-1048", title: "Equipment calibration check", assignee: "Legkotla P.", shift: "Afternoon", due: "15:00", status: "green", note: "Calibrated, certificate filed.", pendingVerification: true },
    { id: "T-1049", title: "End-of-day dispatch reconciliation", assignee: "TT", shift: "Night", due: "20:00", status: "yellow", note: "Awaiting final POD scans" },
  ];
}

// ===== Stock — deliberate green / yellow / red mixture =====

function buildStock(now: number): StockItem[] {
  return [
    { id: "S-001", name: "Paracetamol 500mg", sku: "PCM-500", category: "Analgesics", onHand: 1240, reorder: 400, capacity: 2000, expiry: monthStamp(now, 20), status: "green", batch: "B-7741" },
    { id: "S-002", name: "Amoxicillin 250mg", sku: "AMX-250", category: "Antibiotics", onHand: 320, reorder: 500, capacity: 1500, expiry: monthStamp(now, 7), status: "yellow", issue: "Below reorder level", batch: "B-3320" },
    { id: "S-003", name: "Insulin Glargine 100IU", sku: "INS-GLA", category: "Cold chain", onHand: 28, reorder: 60, capacity: 200, expiry: monthStamp(now, 4), status: "red", issue: "Critically low — blocks Bokamoso cold-chain order", batch: "B-9011" },
    { id: "S-004", name: "Salbutamol Inhaler", sku: "SAL-INH", category: "Respiratory", onHand: 145, reorder: 80, capacity: 300, expiry: monthStamp(now, 14), status: "green", batch: "B-5520" },
    { id: "S-005", name: "Metformin 500mg", sku: "MET-500", category: "Diabetes", onHand: 880, reorder: 300, capacity: 1500, expiry: monthStamp(now, 17), status: "green", batch: "B-6610" },
    { id: "S-006", name: "Ceftriaxone 1g Vial", sku: "CEF-1G", category: "Antibiotics", onHand: 60, reorder: 100, capacity: 400, expiry: monthStamp(now, 5), status: "yellow", issue: "12 units damaged on receipt", batch: "B-4408", damagedUnits: 12 },
    { id: "S-007", name: "Loratadine 10mg", sku: "LOR-10", category: "Antihistamines", onHand: 12, reorder: 150, capacity: 600, expiry: monthStamp(now, 1), status: "red", issue: "Near expiry and critically low", batch: "B-2210" },
    { id: "S-008", name: "ORS Sachets", sku: "ORS-S", category: "Rehydration", onHand: 540, reorder: 200, capacity: 1000, expiry: monthStamp(now, 24), status: "green", batch: "B-8810" },
    { id: "S-009", name: "Surgical Gloves Medium", sku: "GLV-M", category: "Consumables", onHand: 2400, reorder: 800, capacity: 5000, expiry: monthStamp(now, 30), status: "green", batch: "B-1180" },
    { id: "S-010", name: "Sodium Chloride 0.9% 500ml", sku: "NACL-500", category: "IV fluids", onHand: 210, reorder: 250, capacity: 900, expiry: monthStamp(now, 11), status: "yellow", issue: "Below reorder level after Marina order", batch: "B-3390" },
  ];
}

// ===== Deliveries =====
// Today's operating picture plus seven days of closed history so the reports
// have real cycle-time and trend material to work from.

const HISTORY: { customer: string; marketer: string; ops: string; window: "MORNING" | "AFTERNOON"; late?: boolean }[] = [
  { customer: "Princess Marina Hospital", marketer: "Bisa", ops: "TT", window: "MORNING" },
  { customer: "Gaborone Private Hospital", marketer: "Bakang", ops: "Phuso", window: "AFTERNOON" },
  { customer: "Sidilega Private Hospital", marketer: "Bisa", ops: "Tshepang", window: "MORNING", late: true },
  { customer: "Medswana", marketer: "Lebo", ops: "TT", window: "AFTERNOON" },
  { customer: "Acacia Medicare Clinic", marketer: "Bisa", ops: "Phuso", window: "MORNING" },
  { customer: "Medplus Medical Centre", marketer: "Lebo", ops: "TT", window: "AFTERNOON" },
  { customer: "Life Gaborone Private Hospital", marketer: "Bakang", ops: "Tshepang", window: "MORNING" },
  { customer: "Mediland Healthcare Distributors", marketer: "Lebo", ops: "Phuso", window: "AFTERNOON" },
  { customer: "Lenmed Bokamoso Private Hospital", marketer: "Bakang", ops: "TT", window: "MORNING" },
  { customer: "Sir Ketumile Masire Teaching Hospital", marketer: "Bisa", ops: "Tshepang", window: "AFTERNOON", late: true },
  { customer: "Bokamoso Pharmacy", marketer: "Lebo", ops: "TT", window: "MORNING" },
  { customer: "Riverwalk Pharmacy", marketer: "Bakang", ops: "Phuso", window: "AFTERNOON" },
];

function buildDeliveries(now: number): Delivery[] {
  const today = day(now);

  const live: Delivery[] = [
    {
      id: "D-1042", customerName: "Princess Marina Hospital", assignedMarketer: "Bisa", assignedOps: "TT",
      dueDate: today, status: "IN_PROGRESS", steps: makeSteps(5),
      requiredStockIds: ["S-001", "S-010"], requiredTaskIds: ["T-1043"],
      dispatchWindow: "AFTERNOON",
    },
    {
      id: "D-1043", customerName: "Sidilega Private Hospital", assignedMarketer: "Bisa", assignedOps: "Phuso",
      dueDate: today, status: "AT_RISK", steps: makeSteps(3),
      requiredStockIds: ["S-002", "S-006"], requiredTaskIds: ["T-1046"],
      dispatchWindow: "AFTERNOON",
      delayReason: "Ceftriaxone damage on receipt is still being re-counted",
      responsibleDept: "Warehouse",
    },
    {
      id: "D-1044", customerName: "Lenmed Bokamoso Private Hospital", assignedMarketer: "Bakang", assignedOps: "Tshepang",
      dueDate: today, status: "BLOCKED", steps: makeSteps(2),
      requiredStockIds: ["S-003"], requiredTaskIds: ["T-1047"],
      delayReason: "Insulin Glargine critically low — cold-chain line cannot be packed",
      responsibleDept: "Procurement",
      dispatchWindow: "AFTERNOON",
      priority: "emergency",
      emergencyFlaggedAt: iso(now - 25 * MIN),
    },
    {
      id: "D-1045", customerName: "Mediland Healthcare Distributors", assignedMarketer: "Lebo", assignedOps: "TT",
      dueDate: day(now, -1), status: "LATE", steps: makeSteps(4),
      requiredStockIds: ["S-007"], requiredTaskIds: [],
      dispatchWindow: "MORNING",
      wasLate: true,
      lateDetectedAt: iso(now - 20 * HOUR),
      delayReason: "Proof of delivery outstanding from the previous route; driver returned after the 10:30 cutoff.",
      responsibleDept: "Dispatch",
      customerNotified: true,
      notificationMethod: "CALL",
      resolutionPlan: "Re-slotted into today's afternoon window with a signed POD requirement.",
    },
    {
      id: "D-1046", customerName: "Acacia Medicare Clinic", assignedMarketer: "Bisa", assignedOps: "Phuso",
      dueDate: today, status: "DELIVERED", steps: makeSteps(7),
      requiredStockIds: ["S-001", "S-005"], requiredTaskIds: [],
      dispatchWindow: "MORNING",
    },
    {
      id: "D-1047", customerName: "Gaborone Private Hospital", assignedMarketer: "Bakang", assignedOps: "TT",
      dueDate: today, status: "DISPATCHED", steps: makeSteps(7),
      requiredStockIds: ["S-004"], requiredTaskIds: [],
      dispatchWindow: "MORNING",
    },
    {
      id: "D-1048", customerName: "Medswana", assignedMarketer: "Lebo", assignedOps: "Tshepang",
      dueDate: today, status: "IN_PROGRESS", steps: makeSteps(3),
      requiredStockIds: ["S-005"], requiredTaskIds: [],
      dispatchWindow: "AFTERNOON",
    },
    {
      id: "D-1049", customerName: "Medplus Medical Centre", assignedMarketer: "Lebo", assignedOps: "Phuso",
      dueDate: today, status: "DELIVERED", steps: makeSteps(7),
      requiredStockIds: ["S-008"], requiredTaskIds: [],
      dispatchWindow: "MORNING",
    },
    {
      id: "D-1050", customerName: "Life Gaborone Private Hospital", assignedMarketer: "Bakang", assignedOps: "TT",
      dueDate: today, status: "DISPATCHED", steps: makeSteps(7),
      requiredStockIds: ["S-009"], requiredTaskIds: [],
      dispatchWindow: "AFTERNOON",
    },
  ];

  const history: Delivery[] = [];
  let seq = 900;
  for (let offset = 7; offset >= 1; offset--) {
    const perDay = 3 + Math.round(hashUnit(`vol-${offset}`) * 2); // 3–5 closed jobs a day
    for (let i = 0; i < perDay; i++) {
      const tpl = HISTORY[(offset * 3 + i) % HISTORY.length];
      const id = `D-0${seq++}`;
      const late = Boolean(tpl.late && i === 0);
      history.push({
        id,
        customerName: tpl.customer,
        assignedMarketer: tpl.marketer,
        assignedOps: tpl.ops,
        dueDate: day(now, -offset),
        status: "DELIVERED",
        steps: makeSteps(7),
        requiredStockIds: [],
        requiredTaskIds: [],
        dispatchWindow: tpl.window,
        wasLate: late || undefined,
        delayReason: late ? "Customer receiving bay closed on arrival" : undefined,
        responsibleDept: late ? "Dispatch" : undefined,
      });
    }
  }

  return [...live, ...history];
}

// ===== Step timings that agree with the delivery records =====

const DELAY_REASONS = [
  "Picking list arrived late from front desk",
  "Customer receiving bay closed on arrival",
  "Batch recheck required after a scanning error",
  "Vehicle turnaround delay on the previous route",
];

const STEP_OWNERS = ["Legkotla P.", "TT", "Phuso", "Tshepang", "Mr. T"];

function buildTimingsFor(d: Delivery, now: number): Record<number, StepTiming> {
  const out: Record<number, StepTiming> = {};

  const completedThrough =
    d.status === "DELIVERED" ? 7 : d.status === "DISPATCHED" ? 6 : d.steps.filter((s) => s.completed).length;
  if (completedThrough === 0 && d.status !== "DISPATCHED") return out;

  // Anchor the chain so a same-day job finishes before "now".
  const dayOffset = Math.round((new Date(`${d.dueDate}T00:00:00Z`).getTime() - new Date(day(now) + "T00:00:00Z").getTime()) / DAY);
  const totalTarget = Object.values(STEP_TARGET_MINUTES).reduce((a, b) => a + b, 0);
  let cursor = now + dayOffset * DAY - (totalTarget + 45) * MIN;

  for (let n = 1; n <= 7; n++) {
    const target = STEP_TARGET_MINUTES[n] ?? 30;
    const factor = 0.55 + hashUnit(`${d.id}-${n}`) * 0.9; // 0.55 – 1.45
    const duration = Math.max(2, Math.round(target * factor));
    const owner = STEP_OWNERS[Math.floor(hashUnit(`${d.id}-owner-${n}`) * STEP_OWNERS.length)];

    if (n <= completedThrough) {
      out[n] = {
        startTime: iso(cursor),
        completionTime: iso(cursor + duration * MIN),
        assignedPerson: owner,
        delayReason: duration > target
          ? DELAY_REASONS[Math.floor(hashUnit(`${d.id}-reason-${n}`) * DELAY_REASONS.length)]
          : undefined,
      };
      cursor += (duration + 4) * MIN;
    } else if (n === completedThrough + 1 && d.status !== "DELIVERED") {
      // The step currently on the clock.
      const started = Math.min(cursor, now - 5 * MIN);
      out[n] = { startTime: iso(started), assignedPerson: owner };
      break;
    } else {
      break;
    }
  }

  // A dispatched job has step 7 running, not finished.
  if (d.status === "DISPATCHED" && !out[7]?.startTime) {
    out[7] = { startTime: iso(now - 40 * MIN), assignedPerson: d.assignedOps };
  }

  return out;
}

export function buildTimings(deliveries: Delivery[], now: number): DeliveryTimings {
  const out: DeliveryTimings = {};
  for (const d of deliveries) out[d.id] = buildTimingsFor(d, now);
  return out;
}

// ===== Audit trail =====

function buildAudit(now: number, deliveries: Delivery[]): AuditEntry[] {
  const base: AuditEntry[] = [
    { id: "A-001", entityType: "task", entityId: "T-1045", entityLabel: "Controlled drugs cabinet count", field: "status", oldValue: "yellow", newValue: "green", user: "Tariro", role: "regulatory", comment: "Counts match register; witnessed by supervisor.", timestamp: iso(now - 90 * MIN) },
    { id: "A-002", entityType: "stock", entityId: "S-006", entityLabel: "Ceftriaxone 1g Vial", field: "issue", oldValue: "—", newValue: "12 units damaged on receipt", user: "Legkotla P.", role: "warehouse_supervisor", comment: "Damage report filed against shipment INV-9921.", timestamp: iso(now - 45 * MIN) },
    { id: "A-003", entityType: "stock", entityId: "S-003", entityLabel: "Insulin Glargine 100IU", field: "status", oldValue: "yellow", newValue: "red", user: "Mpho", role: "procurement", comment: "Supplier confirmed a two-day delay; Bokamoso order blocked.", timestamp: iso(now - 3 * HOUR) },
    { id: "A-004", entityType: "task", entityId: "D-1045", entityLabel: "Delivery Mediland Healthcare Distributors", field: "status", oldValue: "IN_PROGRESS", newValue: "LATE", user: "System", role: "admin", comment: "Auto-marked LATE after the 10:30 morning cutoff.", timestamp: iso(now - 20 * HOUR) },
  ];

  // Historical activity so the 7/14-day trends are populated.
  let n = 100;
  for (const d of deliveries) {
    if (d.status !== "DELIVERED" || d.dueDate >= day(now)) continue;
    const events = 2 + Math.round(hashUnit(`aud-${d.id}`) * 2);
    for (let i = 0; i < events; i++) {
      const dayMs = new Date(`${d.dueDate}T09:00:00Z`).getTime() + i * 47 * MIN;
      base.push({
        id: `A-${n++}`,
        entityType: "task",
        entityId: d.id,
        entityLabel: `Delivery ${d.customerName}`,
        field: "status",
        oldValue: "IN_PROGRESS",
        newValue: i === events - 1 ? "DELIVERED" : `step ${i + 1} completed`,
        user: d.assignedOps,
        role: "dispatch",
        comment: i === events - 1 ? "Signed POD received." : "Step completed and checked.",
        timestamp: iso(dayMs),
      });
    }
  }
  return base.sort((a, b) => b.timestamp.localeCompare(a.timestamp));
}

// ===== Emergency orders =====

function buildEmergencyOrders(now: number): EmergencyOrder[] {
  return [
    {
      id: "EMG-1001",
      orderedBy: "Bisa",
      orderedAt: iso(now - 45 * MIN),
      customerName: "Medplus Medical Centre",
      clientContact: CLIENT_CONTACTS["Medplus Medical Centre"],
      items: [{ productName: "Amoxicillin 250mg", quantity: 50, urgencyNote: "Customer ran out mid-week" }],
      reason: "Customer ran out mid-week; the next scheduled dispatch is tomorrow.",
      status: "PENDING_APPROVAL",
    },
    {
      id: "EMG-1002",
      orderedBy: "Lesego",
      orderedAt: iso(now - 3 * HOUR),
      customerName: "Sir Ketumile Masire Teaching Hospital",
      clientContact: CLIENT_CONTACTS["Sir Ketumile Masire Teaching Hospital"],
      items: [
        { productName: "Surgical Gloves Medium", quantity: 100, urgencyNote: "Theatre running low" },
        { productName: "Paracetamol 500mg", quantity: 200, urgencyNote: "" },
      ],
      reason: "Theatre stock-out risk before tomorrow's window.",
      authorisedBy: "Mr. T",
      authorisedAt: iso(now - 2 * HOUR),
      driverAssigned: "TT",
      estimatedDelivery: "14:30",
      status: "DISPATCHED",
    },
    {
      id: "EMG-1003",
      orderedBy: "Bakang",
      orderedAt: iso(now - 70 * MIN),
      customerName: "Lenmed Bokamoso Private Hospital",
      clientContact: CLIENT_CONTACTS["Lenmed Bokamoso Private Hospital"],
      items: [{ productName: "Insulin Glargine 100IU", quantity: 30, urgencyNote: "Ward request — cold chain" }],
      reason: "Cold-chain line is blocked by low insulin stock; ward has escalated.",
      status: "PENDING_APPROVAL",
    },
  ];
}

// ===== Marketing / calendar / regulatory seeds =====

function buildPromoStock(now: number): PromoStockItem[] {
  return [
    { id: "PS-001", name: "Branded Sample Packs", sku: "PRM-SP-01", category: "Samples", onHand: 200, allocated: 40, expiry: monthStamp(now, 16), requestedBy: "Bisa", reasonForRequest: "Princess Marina open day this Friday — need 50 samples to hand out.", requestStatus: "APPROVED", decidedBy: "Aobakwe", notes: [{ id: "PN-1", authorName: "Lesego", authorRole: "marketing_supervisor", message: "Reserve 50 for the OSC on Friday.", createdAt: iso(now - DAY) }] },
    { id: "PS-002", name: "Promo Pens", sku: "PRM-PN-01", category: "Giveaways", onHand: 500, allocated: 120, requestedBy: "Sofia", reasonForRequest: "Telesales follow-up bundle for 60 pharmacies.", requestStatus: "PENDING", notes: [] },
    { id: "PS-003", name: "Paracetamol Sample Strips", sku: "PRM-PCM", category: "Samples", onHand: 80, allocated: 10, expiry: monthStamp(now, 12), requestedBy: "Bakang", reasonForRequest: "Sample drop to 3 new clinics in Mogoditshane.", requestStatus: "DECLINED", decidedBy: "Aobakwe", notes: [] },
    { id: "PS-004", name: "Branded Tote Bags", sku: "PRM-TT-02", category: "Giveaways", onHand: 300, allocated: 60, notes: [] },
    { id: "PS-005", name: "Vitamin C Sample Sachets", sku: "PRM-VC-03", category: "Samples", onHand: 600, allocated: 150, expiry: monthStamp(now, 19), requestedBy: "Lebo", reasonForRequest: "Gaborone Mall activation 80 samples.", requestStatus: "APPROVED", decidedBy: "Lesego", notes: [{ id: "PN-2", authorName: "Lebo", authorRole: "marketer", message: "Holding 80 for the Gaborone activation.", createdAt: iso(now - 2 * DAY) }] },
    { id: "PS-006", name: "A5 Product Brochures", sku: "PRM-BR-04", category: "Print collateral", onHand: 1200, allocated: 300, requestedBy: "Sofia", reasonForRequest: "Mailout pack for telesales pipeline.", requestStatus: "PENDING", notes: [] },
    { id: "PS-007", name: "Branded Lanyards", sku: "PRM-LN-05", category: "Giveaways", onHand: 250, allocated: 50, notes: [] },
    { id: "PS-008", name: "Hand Sanitiser 60ml", sku: "PRM-HS-06", category: "Samples", onHand: 420, allocated: 90, expiry: monthStamp(now, 14), notes: [] },
    { id: "PS-009", name: "Pull-up Banners", sku: "PRM-BN-07", category: "Activation kit", onHand: 18, allocated: 4, notes: [{ id: "PN-3", authorName: "Aobakwe", authorRole: "marketing_lead", message: "Two banners are at the warehouse, ready for collection.", createdAt: iso(now - HOUR) }] },
    { id: "PS-010", name: "Cospharm Branded Notebooks", sku: "PRM-NB-08", category: "Giveaways", onHand: 350, allocated: 70, notes: [] },
    { id: "PS-011", name: "Multivitamin Sample Packs", sku: "PRM-MV-09", category: "Samples", onHand: 240, allocated: 60, expiry: monthStamp(now, 17), notes: [] },
    { id: "PS-012", name: "Cough Syrup Mini Bottles", sku: "PRM-CS-10", category: "Samples", onHand: 96, allocated: 16, expiry: monthStamp(now, 13), notes: [] },
  ];
}

function buildVisits(now: number): FieldVisit[] {
  return [
    { id: "FV-1", title: "Princess Marina quarterly review", date: day(now, 1), time: "10:00", type: "MEETING", marketer: "Bisa", customer: "Princess Marina Hospital", location: "Gaborone", notes: "Bring Q3 sales report", status: "PLANNED" },
    { id: "FV-2", title: "OSC — Acacia Medicare Clinic", date: day(now, 2), time: "14:00", type: "OSC", marketer: "Bisa", customer: "Acacia Medicare Clinic", status: "PLANNED" },
  ];
}

function buildFieldLog(now: number): FieldLogEntry[] {
  return [
    { id: "FL-1", date: day(now, -1), marketer: "Bisa", customer: "Sidilega Private Hospital", visitType: "CUSTOMER_VISIT", outcome: "FOLLOW_UP", productsUsed: [{ promoStockId: "PS-001", productName: "Branded Sample Packs", quantity: 5 }], notes: "Procurement lead interested in an expanded antibiotics range; will revert next week.", createdAt: iso(now - DAY), activities: ["SITE_VISIT", "SAMPLE_DROP"] },
    { id: "FL-2", date: day(now, -2), marketer: "Bakang", customer: "Lenmed Bokamoso Private Hospital", visitType: "CUSTOMER_VISIT", outcome: "SALE", productsUsed: [], notes: "Closed order for the cardiovascular range; PO to follow.", createdAt: iso(now - 2 * DAY), activities: ["SITE_VISIT", "PROMO_TALK"] },
    { id: "FL-3", date: day(now, -3), marketer: "Lebo", customer: "Medplus Medical Centre", visitType: "ACTIVATION", outcome: "SAMPLE_GIVEN", productsUsed: [{ promoStockId: "PS-005", productName: "Vitamin C Sample Sachets", quantity: 40 }], notes: "Activation table outside reception; 40 sachets handed out.", createdAt: iso(now - 3 * DAY), activities: ["SITE_VISIT", "SAMPLE_DROP", "PROMO_TALK"] },
    { id: "FL-4", date: day(now, -4), marketer: "Sofia", customer: "Mediland Healthcare Distributors", visitType: "CUSTOMER_VISIT", outcome: "FOLLOW_UP", productsUsed: [], notes: "Telesales call with procurement.", createdAt: iso(now - 4 * DAY), activities: ["TELESALES_CALL"] },
    { id: "FL-5", date: day(now, -5), marketer: "Bisa", customer: "Acacia Medicare Clinic", visitType: "CUSTOMER_VISIT", outcome: "INFO_ONLY", productsUsed: [], notes: "Stock check — re-orders due in two weeks.", createdAt: iso(now - 5 * DAY), activities: ["STOCK_CHECK"] },
    { id: "FL-6", date: day(now, -7), marketer: "Bakang", customer: "Life Gaborone Private Hospital", visitType: "MEETING", outcome: "FOLLOW_UP", productsUsed: [], notes: "Training session on the new respiratory range delivered to ward sisters.", createdAt: iso(now - 7 * DAY), activities: ["TRAINING", "PROMO_TALK"] },
    { id: "FL-7", date: day(now, -9), marketer: "Lebo", customer: "Gaborone Private Hospital", visitType: "CUSTOMER_VISIT", outcome: "SALE", productsUsed: [], notes: "Order placed for the paediatric line; awaiting credit clearance.", createdAt: iso(now - 9 * DAY), activities: ["SITE_VISIT"] },
  ];
}

function buildAuthRequests(now: number): AuthorisationRequest[] {
  return [
    { id: "AR-001", type: "PROMO_RELEASE", requestedBy: "Bisa", requestedByRole: "marketer", customer: "Princess Marina Hospital", details: "Release 30 sample packs for the clinic open day", amount: 30, createdAt: iso(now - HOUR), status: "PENDING" },
  ];
}

function buildCalendar(now: number): CalendarEvent[] {
  return [
    { id: "CE-1", title: "Monthly stocktake", date: day(now, 3), time: "07:00", type: "STOCKTAKE", owner: "Legkotla P.", description: "Full warehouse count", important: true },
    { id: "CE-2", title: "BoMRA inspection", date: day(now, 7), type: "AUDIT", owner: "Tariro", important: true },
    { id: "CE-3", title: "Activation — Gaborone Mall", date: day(now, 5), time: "09:00", type: "ACTIVATION", owner: "Bisa", location: "Gaborone Mall" },
    { id: "CE-4", title: "Marketers monthly meeting", date: day(now, 10), time: "10:00", type: "MEETING", owner: "Aobakwe" },
    { id: "CE-5", title: "Quarterly report deadline", date: day(now, 14), type: "DEADLINE", owner: "Mr. T", important: true },
  ];
}

function buildLicenses(now: number): License[] {
  return [
    { id: "LIC-1", type: "Wholesale Dealer's License", holder: "Cospharm (Pty) Ltd", issueDate: day(now, -500), expiryDate: day(now, 120) },
    { id: "LIC-2", type: "Qualified Person License", holder: "Tariro M. (QP)", issueDate: day(now, -700), expiryDate: day(now, 45) },
    { id: "LIC-3", type: "Import Permit", holder: "Shipment INV-7732", issueDate: day(now, -15), expiryDate: day(now, 15) },
    { id: "LIC-4", type: "Import Permit", holder: "Shipment INV-7741", issueDate: day(now, -10), expiryDate: day(now, 80) },
    { id: "LIC-5", type: "Export Permit", holder: "Shipment EXP-2210", issueDate: day(now, -5), expiryDate: day(now, -2) },
    { id: "LIC-6", type: "Export Permit", holder: "Shipment EXP-2244", issueDate: day(now, -1), expiryDate: day(now, 28) },
  ];
}

function buildZones(now: number): ColdChainZone[] {
  return [
    { id: "Z-1", name: "Cooler A — Vaccines", currentTempC: 4.1, targetRange: [2, 8], resolved: true },
    { id: "Z-2", name: "Cooler B — Insulin", currentTempC: 6.5, targetRange: [2, 8], lastBreachAt: iso(now - 9 * DAY), breachDurationMins: 22, resolved: true },
    { id: "Z-3", name: "Cooler C — Biologics", currentTempC: 9.2, targetRange: [2, 8], lastBreachAt: iso(now - 2 * HOUR), breachDurationMins: 75, resolved: false },
    { id: "Z-4", name: "Ambient Bay — Controlled", currentTempC: 22.0, targetRange: [15, 25], resolved: true },
  ];
}

function buildBatches(now: number): BatchRecord[] {
  return [
    { id: "B-1", batchNumber: "B-7741", product: "Paracetamol 500mg", expiry: day(now, 600), quantity: 1240, linkedDeliveryIds: ["D-1042", "D-1046"] },
    { id: "B-2", batchNumber: "B-3320", product: "Amoxicillin 250mg", expiry: day(now, 210), quantity: 320, linkedDeliveryIds: ["D-1043"] },
    { id: "B-3", batchNumber: "B-9011", product: "Insulin Glargine 100IU", expiry: day(now, 120), quantity: 28, linkedDeliveryIds: ["D-1044"] },
    { id: "B-4", batchNumber: "B-2210", product: "Loratadine 10mg", expiry: day(now, 25), quantity: 12, linkedDeliveryIds: [] },
    { id: "B-5", batchNumber: "B-8810", product: "ORS Sachets", expiry: day(now, 720), quantity: 540, linkedDeliveryIds: ["D-1049"] },
  ];
}

function buildControlled(now: number): ControlledDrugLog[] {
  return [
    { id: "CD-1", product: "Pethidine 50mg", batch: "B-PD-091", handler: "Tariro", action: "RECEIVED", timestamp: iso(now - 6 * HOUR) },
    { id: "CD-2", product: "Morphine 10mg/ml", batch: "B-MP-244", handler: "Aman", action: "DISPENSED", timestamp: iso(now - 3 * HOUR) },
    { id: "CD-3", product: "Diazepam 5mg", batch: "B-DZ-115", handler: "Alaska", action: "TRANSFERRED", timestamp: iso(now - HOUR) },
  ];
}

function buildInspection(now: number): InspectionType {
  return {
    lastDate: day(now, -90),
    nextDate: day(now, 10),
    actions: [
      { id: "CA-1", description: "Replace the temperature logger in Cooler C", due: day(now, -3), status: "OPEN" },
      { id: "CA-2", description: "Update the SOP for controlled drug transfers", due: day(now, 5), status: "OPEN" },
      { id: "CA-3", description: "Renew the QP delegation letter", due: day(now, -20), status: "CLOSED" },
    ],
  };
}

// ===== Public API =====

export type SeedData = ReturnType<typeof buildSeed>;

export function buildSeed(now: number) {
  const deliveries = buildDeliveries(now);
  return {
    todayIso: day(now),
    tasks: buildTasks(now),
    stock: buildStock(now),
    deliveries,
    timings: buildTimings(deliveries, now),
    audit: buildAudit(now, deliveries),
    emergencyOrders: buildEmergencyOrders(now),
    promoStock: buildPromoStock(now),
    visits: buildVisits(now),
    fieldLog: buildFieldLog(now),
    authRequests: buildAuthRequests(now),
    calendar: buildCalendar(now),
    licenses: buildLicenses(now),
    zones: buildZones(now),
    batches: buildBatches(now),
    controlled: buildControlled(now),
    inspection: buildInspection(now),
  };
}

export type { Inspection };
