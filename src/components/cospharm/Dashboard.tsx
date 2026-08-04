import { useEffect, useMemo, useState } from "react";
import {
  Activity,
  AlertTriangle,
  Boxes,
  ClipboardList,
  Clock,
  CalendarDays,
  History,
  LayoutDashboard,
  Lock,
  Megaphone,
  Package,
  Plus,
  Search,
  ShieldCheck,
  Truck,
  UserCog,
  Users,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Progress } from "@/components/ui/progress";
import { Separator } from "@/components/ui/separator";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { StatusBadge, StatusDot, type Status } from "./StatusBadge";
import { TaskDetailSheet } from "./TaskDetailSheet";
import { StockUpdateDialog } from "./StockUpdateDialog";
import { AuditTrailCard } from "./AuditTrailCard";
import { WeeklyDigestButton } from "./WeeklyDigest";
import { DeliveryDetailSheet } from "./DeliveryDetailSheet";
import { DeliveryProgress } from "./DeliveryProgress";
import { CommentsBox } from "./CommentsBox";
import { DispatchWindowsPanel } from "./DispatchWindowsPanel";
import { DelayReasonDialog } from "./DelayReasonDialog";
import { EmergencyOrders } from "./EmergencyOrders";
import { MarketerModule } from "./MarketerModule";
import { OperationsCalendar } from "./OperationsCalendar";
import { can, ROLE_DESCRIPTION, ROLE_LABEL } from "./roles";
import { ROLE_USERS_FULL, STAFF_ROSTER } from "./staff";
import { ALL_CLIENTS, CLIENT_CONTACTS, HOSPITALS_AND_CLINICS, PHARMA_DISTRIBUTORS } from "./mockClients";
import { NotesDigest } from "./NotesDigest";
import { PerformanceReport } from "./PerformanceReport";
import { EmergencyOrdersBanner } from "./EmergencyOrdersBanner";
import { RegulatoryModule } from "./RegulatoryModule";
import { Shield, UserCheck } from "lucide-react";
import { TimedDeliveries } from "./TimedDeliveries";
import { PresenceBoard } from "./PresenceBoard";
import { DeliveryRiskPanel } from "./DeliveryRiskPanel";
import { InventoryIntegrity } from "./InventoryIntegrity";
import { WorkAssignments } from "./WorkAssignments";
import { CapacityCoverage } from "./CapacityCoverage";
import { ComplianceKyc } from "./ComplianceKyc";
import { IntelligenceModule } from "./IntelligenceModule";
import { loadCounts, loadDamages, type DamageRecord, type InventoryCount } from "./inventory";
import { loadKyc, saveKyc, type KycRecord, type KycStatus } from "./kyc";
import {
  deliveryStatusBadge,
  deriveDeliveryRisk,
  makeSteps,
  shouldMarkLate,
  getProgressPercentage,
  getCurrentStep,
  getCompletedSteps,
  DISPATCH_WINDOW_LABELS,
} from "./operations";
import type {
  ActivityEvent,
  Alert,
  AuditEntry,
  AuthorisationRequest,
  CalendarEvent,
  Comment,
  CommentType,
  CurrentUser,
  Delivery,
  EmergencyOrder,
  EmergencyOrderStatus,
  FieldLogEntry,
  FieldVisit,
  PromoStockItem,
  Role,
  StockItem,
  Task,
  BatchRecord,
  ColdChainZone,
  ControlledDrugLog,
  Inspection,
  License,
} from "./types";
import cospharmLogo from "@/assets/cospharm-logo.png.asset.json";

// ===== Seed data =====

const todayIso = new Date().toISOString().slice(0, 10);
const yesterdayIso = new Date(Date.now() - 86400000).toISOString().slice(0, 10);

const INITIAL_TASKS: Task[] = [
  { id: "T-1042", title: "Morning cold-chain temperature log", assignee: "Ada Bello", shift: "Morning", due: "07:30", status: "green", note: "All readings within range." },
  { id: "T-1043", title: "Restock dispensary shelves A–C", assignee: "John Mensah", shift: "Morning", due: "09:00", status: "yellow", note: "Started — shelf C pending" },
  { id: "T-1044", title: "Sign off overnight delivery manifest", assignee: "Mary Adeyemi", shift: "Morning", due: "08:00", status: "red", note: "Not signed — driver waiting" },
  { id: "T-1045", title: "Controlled drugs cabinet count", assignee: "Grace Okoye", shift: "Morning", due: "10:00", status: "green", note: "Counts match register.", verifiedBy: "Mary Adeyemi", verifiedAt: new Date().toISOString() },
  { id: "T-1046", title: "Clean & sanitise compounding bench", assignee: "Tunde Aliu", shift: "Afternoon", due: "13:00", status: "yellow", note: "In progress" },
  { id: "T-1047", title: "Patient delivery batch #B-228", assignee: "John Mensah", shift: "Afternoon", due: "14:30", status: "red", note: "2 items short — see stock" },
  { id: "T-1048", title: "Equipment calibration check", assignee: "Ada Bello", shift: "Afternoon", due: "15:00", status: "green", note: "Calibrated, certificate filed.", pendingVerification: true },
  { id: "T-1049", title: "End-of-day handover log", assignee: "Mary Adeyemi", shift: "Night", due: "20:00", status: "yellow", note: "Awaiting pharmacist sign-off" },
];

const INITIAL_STOCK: StockItem[] = [
  { id: "S-001", name: "Paracetamol 500mg", sku: "PCM-500", category: "Analgesics", onHand: 1240, reorder: 400, capacity: 2000, expiry: "2027-04", status: "green", batch: "B-7741" },
  { id: "S-002", name: "Amoxicillin 250mg", sku: "AMX-250", category: "Antibiotics", onHand: 320, reorder: 500, capacity: 1500, expiry: "2026-09", status: "yellow", issue: "Below reorder level", batch: "B-3320" },
  { id: "S-003", name: "Insulin Glargine 100IU", sku: "INS-GLA", category: "Cold chain", onHand: 28, reorder: 60, capacity: 200, expiry: "2026-03", status: "red", issue: "Critically low — affects 3 deliveries", batch: "B-9011" },
  { id: "S-004", name: "Salbutamol Inhaler", sku: "SAL-INH", category: "Respiratory", onHand: 145, reorder: 80, capacity: 300, expiry: "2026-11", status: "green", batch: "B-5520" },
  { id: "S-005", name: "Metformin 500mg", sku: "MET-500", category: "Diabetes", onHand: 880, reorder: 300, capacity: 1500, expiry: "2027-01", status: "green", batch: "B-6610" },
  { id: "S-006", name: "Ceftriaxone 1g Vial", sku: "CEF-1G", category: "Antibiotics", onHand: 60, reorder: 100, capacity: 400, expiry: "2026-02", status: "yellow", issue: "12 units damaged on receipt", batch: "B-4408", damagedUnits: 12 },
  { id: "S-007", name: "Loratadine 10mg", sku: "LOR-10", category: "Antihistamines", onHand: 12, reorder: 150, capacity: 600, expiry: "2025-12", status: "red", issue: "Near expiry & critically low", batch: "B-2210" },
  { id: "S-008", name: "ORS Sachets", sku: "ORS-S", category: "Rehydration", onHand: 540, reorder: 200, capacity: 1000, expiry: "2027-08", status: "green", batch: "B-8810" },
];

const INITIAL_DELIVERIES: Delivery[] = [
  {
    id: "D-1042", customerName: "Princess Marina Hospital", assignedMarketer: "Bisa", assignedOps: "TT",
    dueDate: todayIso, status: "IN_PROGRESS", steps: makeSteps(5),
    requiredStockIds: ["S-001", "S-002"], requiredTaskIds: ["T-1043"],
    dispatchWindow: "MORNING",
  },
  {
    id: "D-1043", customerName: "Sidilega Private Hospital", assignedMarketer: "Bisa", assignedOps: "Phuso",
    dueDate: todayIso, status: "AT_RISK", steps: makeSteps(3),
    requiredStockIds: ["S-002", "S-006"], requiredTaskIds: ["T-1046"],
    dispatchWindow: "MORNING",
  },
  {
    id: "D-1044", customerName: "Lenmed Bokamoso Private Hospital", assignedMarketer: "Bakang", assignedOps: "Tshepang",
    dueDate: todayIso, status: "BLOCKED", steps: makeSteps(2),
    requiredStockIds: ["S-003"], requiredTaskIds: ["T-1047"],
    delayReason: "Insulin Glargine critically low",
    dispatchWindow: "AFTERNOON",
    priority: "emergency",
    emergencyFlaggedAt: new Date(Date.now() - 1000 * 60 * 25).toISOString(),
  },
  {
    id: "D-1045", customerName: "Mediland Healthcare Distributors", assignedMarketer: "Lebo", assignedOps: "TT",
    dueDate: yesterdayIso, status: "IN_PROGRESS", steps: makeSteps(4),
    requiredStockIds: ["S-007"], requiredTaskIds: [],
    dispatchWindow: "MORNING",
    wasLate: true,
    delayReason: "POD pending from previous delivery slowed route. Driver returned after 10:30 cutoff.",
    responsibleDept: "Dispatch",
    customerNotified: true,
    notificationMethod: "CALL",
  },
  {
    id: "D-1046", customerName: "Acacia Medicare Clinic", assignedMarketer: "Bisa", assignedOps: "Phuso",
    dueDate: todayIso, status: "DELIVERED", steps: makeSteps(7),
    requiredStockIds: ["S-001", "S-005"], requiredTaskIds: [],
    dispatchWindow: "AFTERNOON",
  },
  {
    id: "D-1047", customerName: "Gaborone Private Hospital", assignedMarketer: "Bakang", assignedOps: "TT",
    dueDate: todayIso, status: "DISPATCHED", steps: makeSteps(7),
    requiredStockIds: ["S-004"], requiredTaskIds: [],
    dispatchWindow: "MORNING",
  },
  {
    id: "D-1048", customerName: "Medswana", assignedMarketer: "Lebo", assignedOps: "Tshepang",
    dueDate: todayIso, status: "IN_PROGRESS", steps: makeSteps(3),
    requiredStockIds: ["S-005"], requiredTaskIds: [],
    dispatchWindow: "AFTERNOON",
  },
];

const ROLE_USERS = ROLE_USERS_FULL;

const STAFF = STAFF_ROSTER.map((s) => ({
  name: s.name,
  role: s.title,
  shift: s.shift ?? "All-day",
  tasksDone: Math.floor(Math.random() * 7) + 1,
  tasksPending: Math.floor(Math.random() * 3),
}));

const seedAudit = (): AuditEntry[] => [
  {
    id: "A-001", entityType: "task", entityId: "T-1045", entityLabel: "Controlled drugs cabinet count",
    field: "status", oldValue: "yellow", newValue: "green",
    user: "Grace Okoye", role: "staff", comment: "Counts match register; witnessed by supervisor.",
    timestamp: new Date(Date.now() - 1000 * 60 * 90).toISOString(),
  },
  {
    id: "A-002", entityType: "stock", entityId: "S-006", entityLabel: "Ceftriaxone 1g Vial",
    field: "issue", oldValue: "—", newValue: "12 units damaged on receipt",
    user: "John Mensah", role: "staff", comment: "Damage report filed against shipment INV-9921.",
    timestamp: new Date(Date.now() - 1000 * 60 * 45).toISOString(),
  },
];

const SEED_PROMO_STOCK: PromoStockItem[] = [
  { id: "PS-001", name: "Branded Sample Packs", sku: "PRM-SP-01", category: "Samples", onHand: 200, allocated: 40, expiry: "2026-12",
    requestedBy: "Bisa", reasonForRequest: "Princess Marina open day this Friday — need 50 samples to hand out.",
    requestStatus: "APPROVED", decidedBy: "Aobakwe",
    notes: [
    { id: "PN-1", authorName: "Lesego", authorRole: "marketing_supervisor", message: "Reserve 50 for the OSC on Friday.", createdAt: new Date(Date.now() - 86400000).toISOString() },
  ]},
  { id: "PS-002", name: "Promo Pens", sku: "PRM-PN-01", category: "Giveaways", onHand: 500, allocated: 120,
    requestedBy: "Sofia", reasonForRequest: "Telesales follow-up bundle for 60 pharmacies.", requestStatus: "PENDING",
    notes: [] },
  { id: "PS-003", name: "Paracetamol Sample Strips", sku: "PRM-PCM", category: "Samples", onHand: 80, allocated: 10, expiry: "2026-08",
    requestedBy: "Bakang", reasonForRequest: "Sample drop to 3 new clinics in Mogoditshane.", requestStatus: "DECLINED",
    decidedBy: "Aobakwe",
    notes: [] },
  { id: "PS-004", name: "Branded Tote Bags", sku: "PRM-TT-02", category: "Giveaways", onHand: 300, allocated: 60, notes: [] },
  { id: "PS-005", name: "Vitamin C Sample Sachets", sku: "PRM-VC-03", category: "Samples", onHand: 600, allocated: 150, expiry: "2027-03",
    requestedBy: "Lebo", reasonForRequest: "Gaborone Mall activation 80 samples.", requestStatus: "APPROVED", decidedBy: "Lesego",
    notes: [
    { id: "PN-2", authorName: "Lebo", authorRole: "marketer", message: "Holding 80 for the Gaborone activation.", createdAt: new Date(Date.now() - 2 * 86400000).toISOString() },
  ]},
  { id: "PS-006", name: "A5 Product Brochures", sku: "PRM-BR-04", category: "Print collateral", onHand: 1200, allocated: 300,
    requestedBy: "Sofia", reasonForRequest: "Mailout pack for telesales pipeline.", requestStatus: "PENDING",
    notes: [] },
  { id: "PS-007", name: "Branded Lanyards", sku: "PRM-LN-05", category: "Giveaways", onHand: 250, allocated: 50, notes: [] },
  { id: "PS-008", name: "Hand Sanitiser 60ml", sku: "PRM-HS-06", category: "Samples", onHand: 420, allocated: 90, expiry: "2026-10", notes: [] },
  { id: "PS-009", name: "Pull-up Banners", sku: "PRM-BN-07", category: "Activation kit", onHand: 18, allocated: 4, notes: [
    { id: "PN-3", authorName: "Aobakwe", authorRole: "marketing_lead", message: "Two banners are at the warehouse, ready for collection.", createdAt: new Date(Date.now() - 3600000).toISOString() },
  ]},
  { id: "PS-010", name: "Cospharm Branded Notebooks", sku: "PRM-NB-08", category: "Giveaways", onHand: 350, allocated: 70, notes: [] },
  { id: "PS-011", name: "Multivitamin Sample Packs", sku: "PRM-MV-09", category: "Samples", onHand: 240, allocated: 60, expiry: "2027-01", notes: [] },
  { id: "PS-012", name: "Cough Syrup Mini Bottles", sku: "PRM-CS-10", category: "Samples", onHand: 96, allocated: 16, expiry: "2026-09", notes: [] },
];

const SEED_VISITS: FieldVisit[] = [
  { id: "FV-1", title: "Princess Marina quarterly review", date: new Date(Date.now() + 86400000).toISOString().slice(0, 10), time: "10:00", type: "MEETING", marketer: "Bisa", customer: "Princess Marina Hospital", location: "Gaborone", notes: "Bring Q3 sales report", status: "PLANNED" },
  { id: "FV-2", title: "OSC — Acacia Medicare Clinic", date: new Date(Date.now() + 2 * 86400000).toISOString().slice(0, 10), time: "14:00", type: "OSC", marketer: "Bisa", customer: "Acacia Medicare Clinic", status: "PLANNED" },
];

const SEED_FIELD_LOG: FieldLogEntry[] = [
  { id: "FL-1", date: new Date(Date.now() - 86400000).toISOString().slice(0, 10), marketer: "Bisa", customer: "Sidilega Private Hospital", visitType: "CUSTOMER_VISIT", outcome: "FOLLOW_UP", productsUsed: [{ promoStockId: "PS-001", productName: "Branded Sample Packs", quantity: 5 }], notes: "Procurement lead interested in expanded antibiotics range; will revert next week.", createdAt: new Date(Date.now() - 86400000).toISOString(), activities: ["SITE_VISIT", "SAMPLE_DROP"] },
  { id: "FL-2", date: new Date(Date.now() - 2 * 86400000).toISOString().slice(0, 10), marketer: "Bakang", customer: "Lenmed Bokamoso Private Hospital", visitType: "CUSTOMER_VISIT", outcome: "SALE", productsUsed: [], notes: "Closed order for cardiovascular range; PO to follow.", createdAt: new Date(Date.now() - 2 * 86400000).toISOString(), activities: ["SITE_VISIT", "PROMO_TALK"] },
  { id: "FL-3", date: new Date(Date.now() - 3 * 86400000).toISOString().slice(0, 10), marketer: "Lebo", customer: "Medplus Medical Centre", visitType: "ACTIVATION", outcome: "SAMPLE_GIVEN", productsUsed: [{ promoStockId: "PS-005", productName: "Vitamin C Sample Sachets", quantity: 40 }], notes: "Activation table outside reception; 40 sachets handed out.", createdAt: new Date(Date.now() - 3 * 86400000).toISOString(), activities: ["SITE_VISIT", "SAMPLE_DROP", "PROMO_TALK"] },
  { id: "FL-4", date: new Date(Date.now() - 4 * 86400000).toISOString().slice(0, 10), marketer: "Sofia", customer: "Mediland Healthcare Distributors", visitType: "CUSTOMER_VISIT", outcome: "FOLLOW_UP", productsUsed: [], notes: "Telesales call with procurement.", createdAt: new Date(Date.now() - 4 * 86400000).toISOString(), activities: ["TELESALES_CALL"] },
  { id: "FL-5", date: new Date(Date.now() - 5 * 86400000).toISOString().slice(0, 10), marketer: "Bisa", customer: "Acacia Medicare Clinic", visitType: "CUSTOMER_VISIT", outcome: "INFO_ONLY", productsUsed: [], notes: "Stock check — re-orders due in 2 weeks.", createdAt: new Date(Date.now() - 5 * 86400000).toISOString(), activities: ["STOCK_CHECK"] },
  { id: "FL-6", date: new Date(Date.now() - 7 * 86400000).toISOString().slice(0, 10), marketer: "Bakang", customer: "Life Gaborone Private Hospital", visitType: "MEETING", outcome: "FOLLOW_UP", productsUsed: [], notes: "Training session on new respiratory range delivered to ward sisters.", createdAt: new Date(Date.now() - 7 * 86400000).toISOString(), activities: ["TRAINING", "PROMO_TALK"] },
  { id: "FL-7", date: new Date(Date.now() - 9 * 86400000).toISOString().slice(0, 10), marketer: "Lebo", customer: "Gaborone Private Hospital", visitType: "CUSTOMER_VISIT", outcome: "SALE", productsUsed: [], notes: "Order placed for paediatric line; awaiting credit clearance.", createdAt: new Date(Date.now() - 9 * 86400000).toISOString(), activities: ["SITE_VISIT"] },
];

const SEED_AUTH_REQUESTS: AuthorisationRequest[] = [
  { id: "AR-001", type: "PROMO_RELEASE", requestedBy: "Bisa", requestedByRole: "marketer", customer: "Princess Marina Hospital", details: "Release 30 sample packs for clinic open day", amount: 30, createdAt: new Date(Date.now() - 3600000).toISOString(), status: "PENDING" },
];

const SEED_CALENDAR: CalendarEvent[] = [
  { id: "CE-1", title: "Monthly stocktake", date: new Date(Date.now() + 3 * 86400000).toISOString().slice(0, 10), time: "07:00", type: "STOCKTAKE", owner: "Legkotla P.", description: "Full warehouse count", important: true },
  { id: "CE-2", title: "BoMRA inspection", date: new Date(Date.now() + 7 * 86400000).toISOString().slice(0, 10), type: "AUDIT", owner: "Tariro", important: true },
  { id: "CE-3", title: "Activation — Gaborone Mall", date: new Date(Date.now() + 5 * 86400000).toISOString().slice(0, 10), time: "09:00", type: "ACTIVATION", owner: "Bisa", location: "Gaborone Mall" },
  { id: "CE-4", title: "Marketers monthly meeting", date: new Date(Date.now() + 10 * 86400000).toISOString().slice(0, 10), time: "10:00", type: "MEETING", owner: "Aobakwe" },
  { id: "CE-5", title: "Quarterly report deadline", date: new Date(Date.now() + 14 * 86400000).toISOString().slice(0, 10), type: "DEADLINE", owner: "Mr. T", important: true },
];

const TARGET_DELIVERIES_PER_DAY = 8;

const INITIAL_EMERGENCY_ORDERS: EmergencyOrder[] = [
  {
    id: "EMG-1001",
    orderedBy: "Bisa",
    orderedAt: new Date(Date.now() - 1000 * 60 * 45).toISOString(),
    customerName: "Medplus Medical Centre",
    clientContact: CLIENT_CONTACTS["Medplus Medical Centre"],
    items: [{ productName: "Amoxicillin 250mg", quantity: 50, urgencyNote: "Customer ran out mid-week" }],
    reason: "Customer ran out mid-week; next scheduled dispatch is tomorrow.",
    status: "PENDING_APPROVAL",
  },
  {
    id: "EMG-1002",
    orderedBy: "Lesego",
    orderedAt: new Date(Date.now() - 1000 * 60 * 60 * 3).toISOString(),
    customerName: "Sir Ketumile Masire Teaching Hospital",
    clientContact: CLIENT_CONTACTS["Sir Ketumile Masire Teaching Hospital"],
    items: [
      { productName: "Surgical Gloves Medium", quantity: 100, urgencyNote: "Theatre running low" },
      { productName: "Paracetamol 500mg", quantity: 200, urgencyNote: "" },
    ],
    reason: "Theatre stock-out risk before tomorrow's window.",
    authorisedBy: "Mr. T",
    authorisedAt: new Date(Date.now() - 1000 * 60 * 60 * 2).toISOString(),
    driverAssigned: "TT",
    estimatedDelivery: "14:30",
    status: "DISPATCHED",
  },
];

// ===== Regulatory & HR seed data =====
function daysFromNow(d: number) { return new Date(Date.now() + d * 86400000).toISOString().slice(0, 10); }

const SEED_LICENSES: License[] = [
  { id: "LIC-1", type: "Wholesale Dealer's License", holder: "Cospharm (Pty) Ltd", issueDate: "2024-03-01", expiryDate: daysFromNow(120) },
  { id: "LIC-2", type: "Qualified Person License", holder: "Tariro M. (QP)", issueDate: "2023-08-15", expiryDate: daysFromNow(45) },
  { id: "LIC-3", type: "Import Permit", holder: "Shipment INV-7732", issueDate: daysFromNow(-15), expiryDate: daysFromNow(15) },
  { id: "LIC-4", type: "Import Permit", holder: "Shipment INV-7741", issueDate: daysFromNow(-10), expiryDate: daysFromNow(80) },
  { id: "LIC-5", type: "Export Permit", holder: "Shipment EXP-2210", issueDate: daysFromNow(-5), expiryDate: daysFromNow(-2) },
  { id: "LIC-6", type: "Export Permit", holder: "Shipment EXP-2244", issueDate: daysFromNow(-1), expiryDate: daysFromNow(28) },
];

const SEED_ZONES: ColdChainZone[] = [
  { id: "Z-1", name: "Cooler A — Vaccines", currentTempC: 4.1, targetRange: [2, 8], lastBreachAt: undefined, resolved: true },
  { id: "Z-2", name: "Cooler B — Insulin", currentTempC: 6.5, targetRange: [2, 8], lastBreachAt: new Date(Date.now() - 9 * 86400000).toISOString(), breachDurationMins: 22, resolved: true },
  { id: "Z-3", name: "Cooler C — Biologics", currentTempC: 9.2, targetRange: [2, 8], lastBreachAt: new Date(Date.now() - 2 * 3600000).toISOString(), breachDurationMins: 75, resolved: false },
  { id: "Z-4", name: "Ambient Bay — Controlled", currentTempC: 22.0, targetRange: [15, 25], resolved: true },
];

const SEED_BATCHES: BatchRecord[] = [
  { id: "B-1", batchNumber: "B-7741", product: "Paracetamol 500mg", expiry: daysFromNow(800), quantity: 1240, linkedDeliveryIds: ["D-1042", "D-1046"] },
  { id: "B-2", batchNumber: "B-3320", product: "Amoxicillin 250mg", expiry: daysFromNow(120), quantity: 320, linkedDeliveryIds: ["D-1043"] },
  { id: "B-3", batchNumber: "B-9011", product: "Insulin Glargine 100IU", expiry: daysFromNow(60), quantity: 28, linkedDeliveryIds: ["D-1044"] },
  { id: "B-4", batchNumber: "B-2210", product: "Loratadine 10mg", expiry: daysFromNow(15), quantity: 12, linkedDeliveryIds: [] },
  { id: "B-5", batchNumber: "B-8810", product: "ORS Sachets", expiry: daysFromNow(600), quantity: 540, linkedDeliveryIds: ["D-1048"] },
];

const SEED_CONTROLLED: ControlledDrugLog[] = [
  { id: "CD-1", product: "Pethidine 50mg", batch: "B-PD-091", handler: "Tariro", action: "RECEIVED", timestamp: new Date(Date.now() - 6 * 3600000).toISOString() },
  { id: "CD-2", product: "Morphine 10mg/ml", batch: "B-MP-244", handler: "Aman", action: "DISPENSED", timestamp: new Date(Date.now() - 3 * 3600000).toISOString() },
  { id: "CD-3", product: "Diazepam 5mg", batch: "B-DZ-115", handler: "Alaska", action: "TRANSFERRED", timestamp: new Date(Date.now() - 1 * 3600000).toISOString() },
];

const SEED_INSPECTION: Inspection = {
  lastDate: daysFromNow(-90),
  nextDate: daysFromNow(10),
  actions: [
    { id: "CA-1", description: "Replace temperature logger in Cooler C", due: daysFromNow(-3), status: "OPEN" },
    { id: "CA-2", description: "Update SOP for controlled drug transfers", due: daysFromNow(5), status: "OPEN" },
    { id: "CA-3", description: "Renew QP delegation letter", due: daysFromNow(-20), status: "CLOSED" },
  ],
};

// ===== Component =====

export function CospharmDashboard() {
  const [tab, setTab] = useState("overview");
  const [search, setSearch] = useState("");
  const [role, setRole] = useState<Role>("admin");
  const currentUser = ROLE_USERS[role];

  const [tasks, setTasks] = useState<Task[]>(INITIAL_TASKS);
  const [stock, setStock] = useState<StockItem[]>(INITIAL_STOCK);
  const [audit, setAudit] = useState<AuditEntry[]>(seedAudit);
  const [deliveries, setDeliveries] = useState<Delivery[]>(INITIAL_DELIVERIES);
  const [comments, setComments] = useState<Comment[]>([]);
  const [calendarEvents, setCalendarEvents] = useState<CalendarEvent[]>(SEED_CALENDAR);
  const [promoStock, setPromoStock] = useState<PromoStockItem[]>(SEED_PROMO_STOCK);
  const [visits, setVisits] = useState<FieldVisit[]>(SEED_VISITS);
  const [fieldLog, setFieldLog] = useState<FieldLogEntry[]>(SEED_FIELD_LOG);
  const [authRequests, setAuthRequests] = useState<AuthorisationRequest[]>(SEED_AUTH_REQUESTS);
  const [alerts, setAlerts] = useState<Alert[]>([]);
  const [activity, setActivity] = useState<ActivityEvent[]>([]);
  const [emergencyOrders, setEmergencyOrders] = useState<EmergencyOrder[]>(INITIAL_EMERGENCY_ORDERS);
  const [delayDialog, setDelayDialog] = useState<Delivery | null>(null);
  const [deliveriesTab, setDeliveriesTab] = useState<"active" | "emergency">("active");
  const [activeAssignments, setActiveAssignments] = useState<Record<string, string[]>>({});

  const [openTaskId, setOpenTaskId] = useState<string | null>(null);
  const [stockDialog, setStockDialog] = useState<StockItem | null>(null);
  const [openDeliveryId, setOpenDeliveryId] = useState<string | null>(null);

  // Client-only registers (localStorage backed) for the inventory and compliance modules
  const [counts, setCounts] = useState<InventoryCount[]>([]);
  const [damages, setDamages] = useState<DamageRecord[]>([]);
  const [kyc, setKyc] = useState<KycRecord[]>([]);
  useEffect(() => {
    setCounts(loadCounts(INITIAL_STOCK));
    setDamages(loadDamages(INITIAL_STOCK));
    setKyc(loadKyc());
  }, []);

  function setKycStatus(customer: string, status: KycStatus) {
    setKyc((prev) => {
      const next = prev.map((r) => (r.customer === customer ? { ...r, status, lastReviewed: new Date().toISOString().slice(0, 10) } : r));
      saveKyc(next);
      return next;
    });
  }

  // ===== Late delivery auto-detection (on mount + every 60s) =====
  useEffect(() => {
    runLateCheck();
    const id = setInterval(runLateCheck, 60_000);
    return () => clearInterval(id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function runLateCheck() {
    const now = new Date();
    setDeliveries((prev) => {
      let changed = false;
      const next = prev.map((d) => {
        if (shouldMarkLate(d, now)) {
          changed = true;
          const cutoff = DISPATCH_WINDOW_LABELS[d.dispatchWindow ?? "AFTERNOON"].sub;
          queueMicrotask(() => {
            setAlerts((al) => {
              if (al.find((a) => a.sourceId === d.id && a.title.includes("Late"))) return al;
              return [
                {
                  id: `AL-${al.length + 1}`,
                  severity: "red",
                  source: "delivery",
                  sourceId: d.id,
                  title: `Late delivery: ${d.id}`,
                  body: `${d.customerName} missed its dispatch cutoff. Delay reason required before this delivery can be progressed.`,
                  createdAt: new Date().toISOString(),
                },
                ...al,
              ];
            });
            setAudit((au) => [
              {
                id: `A-${au.length + 100}`,
                entityType: "task",
                entityId: d.id,
                entityLabel: `Delivery ${d.customerName}`,
                field: "status",
                oldValue: d.status,
                newValue: "LATE",
                user: "System",
                role: "admin",
                comment: `Auto-marked LATE after dispatch cutoff. Window: ${d.dispatchWindow ?? "AFTERNOON"} (${cutoff}).`,
                timestamp: new Date().toISOString(),
              },
              ...au,
            ]);
            pushActivity({
              kind: "delivery",
              message: `Delivery ${d.id} (${d.customerName}) auto-marked LATE`,
              actor: "System",
              role: "admin",
            });
          });
          return { ...d, status: "LATE" as const, wasLate: true, lateDetectedAt: now.toISOString() };
        }
        return d;
      });
      return changed ? next : prev;
    });
  }

  function pushActivity(e: Omit<ActivityEvent, "id" | "timestamp">) {
    setActivity((prev) => [
      { ...e, id: `EV-${prev.length + 1}`, timestamp: new Date().toISOString() },
      ...prev,
    ].slice(0, 50));
  }

  function logAudit(entry: Omit<AuditEntry, "id" | "timestamp" | "user" | "role">) {
    setAudit((prev) => [
      {
        ...entry,
        id: `A-${String(prev.length + 100).padStart(3, "0")}`,
        user: currentUser.name,
        role: currentUser.role,
        timestamp: new Date().toISOString(),
      },
      ...prev,
    ]);
  }

  function updateTaskStatus(task: Task, next: Status, comment: string) {
    const isSupervisor = can(role, "task.verify");
    setTasks((prev) =>
      prev.map((t) => {
        if (t.id !== task.id) return t;
        if (next === "green" && !isSupervisor) {
          return { ...t, status: "yellow", note: comment, pendingVerification: true };
        }
        if (next === "green" && isSupervisor) {
          return { ...t, status: "green", note: comment, pendingVerification: false, verifiedBy: currentUser.name, verifiedAt: new Date().toISOString() };
        }
        return { ...t, status: next, note: comment };
      }),
    );
    logAudit({ entityType: "task", entityId: task.id, entityLabel: task.title, field: "status", oldValue: task.status, newValue: next === "green" && !isSupervisor ? "yellow (pending verification)" : next, comment });
    pushActivity({ kind: next === "green" && !isSupervisor ? "verification" : "task", message: `${task.title} → ${next}${next === "green" && !isSupervisor ? " (awaiting supervisor verification)" : ""}`, actor: currentUser.name, role: currentUser.role });
  }

  function verifyTask(task: Task) {
    setTasks((prev) =>
      prev.map((t) =>
        t.id === task.id
          ? { ...t, status: "green", pendingVerification: false, verifiedBy: currentUser.name, verifiedAt: new Date().toISOString() }
          : t,
      ),
    );
    logAudit({ entityType: "task", entityId: task.id, entityLabel: task.title, field: "status", oldValue: "yellow (pending verification)", newValue: "green (verified)", comment: `Verified by ${currentUser.name}` });
    pushActivity({ kind: "verification", message: `Verified ${task.title}`, actor: currentUser.name, role: currentUser.role });
  }

  function updateStock(item: StockItem, next: { onHand: number; issue?: string; status: Status }, comment: string) {
    setStock((prev) =>
      prev.map((s) => (s.id === item.id ? { ...s, onHand: next.onHand, issue: next.issue, status: next.status } : s)),
    );
    if (next.onHand !== item.onHand) {
      logAudit({ entityType: "stock", entityId: item.id, entityLabel: item.name, field: "onHand", oldValue: String(item.onHand), newValue: String(next.onHand), comment });
    }
    if ((next.issue ?? "") !== (item.issue ?? "")) {
      logAudit({ entityType: "stock", entityId: item.id, entityLabel: item.name, field: "issue", oldValue: item.issue ?? "—", newValue: next.issue ?? "—", comment });
    }
    pushActivity({ kind: "stock", message: `Stock ${item.name} updated`, actor: currentUser.name, role: currentUser.role });
  }

  function updateDelivery(next: Delivery, message: string) {
    setDeliveries((prev) => prev.map((d) => (d.id === next.id ? next : d)));
    logAudit({ entityType: "task", entityId: next.id, entityLabel: `Delivery ${next.customerName}`, field: "status", oldValue: String(getCompletedSteps(prev_steps_for(next, deliveries))), newValue: String(getCompletedSteps(next.steps)) + "/7", comment: message });
    pushActivity({ kind: "delivery", message: `Delivery ${next.id}: ${message}`, actor: currentUser.name, role: currentUser.role });
  }

  function addComment(entityId: string, type: CommentType, message: string, entityType: Comment["relatedEntityType"] = "DELIVERY") {
    const c: Comment = {
      id: `C-${comments.length + 1}`,
      relatedEntityType: entityType,
      relatedEntityId: entityId,
      authorName: currentUser.name,
      authorRole: currentUser.role,
      commentType: type,
      message,
      createdAt: new Date().toISOString(),
    };
    setComments((prev) => [...prev, c]);
    pushActivity({ kind: "comment", message: `${type.replace("_", " ")} on ${entityId}`, actor: currentUser.name, role: currentUser.role });
  }

  function hideComment(id: string) {
    setComments((prev) => prev.map((c) => (c.id === id ? { ...c, hidden: true, hiddenBy: currentUser.name } : c)));
  }

  function resolveLateDelivery(d: Delivery, reason: string) {
    setDeliveries((prev) => prev.map((x) => (x.id === d.id ? { ...x, status: "DELIVERED", resolutionNote: reason } : x)));
    setAlerts((prev) => prev.map((a) => (a.sourceId === d.id ? { ...a, resolved: true, resolutionComment: reason } : a)));
    logAudit({ entityType: "task", entityId: d.id, entityLabel: `Delivery ${d.customerName}`, field: "status", oldValue: "LATE", newValue: "DELIVERED", comment: `Resolved: ${reason}` });
    pushActivity({ kind: "alert", message: `Late delivery ${d.id} resolved`, actor: currentUser.name, role: currentUser.role });
  }

  function saveDelayReason(d: Delivery, payload: {
    delayReason: string;
    responsibleDept: string;
    customerNotified: "YES" | "NO" | "PENDING";
    notificationMethod?: "CALL" | "WHATSAPP" | "EMAIL";
    resolutionPlan: string;
  }) {
    setDeliveries((prev) => prev.map((x) => (x.id === d.id ? {
      ...x,
      delayReason: payload.delayReason,
      responsibleDept: payload.responsibleDept,
      customerNotified: payload.customerNotified === "YES",
      notificationMethod: payload.notificationMethod,
      resolutionPlan: payload.resolutionPlan,
      delayReasonAt: new Date().toISOString(),
    } : x)));
    logAudit({ entityType: "task", entityId: d.id, entityLabel: `Delivery ${d.customerName}`, field: "issue", oldValue: "—", newValue: "delay reason recorded", comment: `Delay reason for LATE ${d.id}: ${payload.delayReason} (responsible: ${payload.responsibleDept})` });
    pushActivity({ kind: "delivery", message: `Delay reason recorded for ${d.id}`, actor: currentUser.name, role: currentUser.role });
    setDelayDialog(null);
  }

  function createEmergencyOrder(o: Omit<EmergencyOrder, "id" | "orderedBy" | "orderedAt" | "status">) {
    const id = `EMG-${1000 + emergencyOrders.length + 1}`;
    const next: EmergencyOrder = {
      ...o,
      id,
      orderedBy: currentUser.name,
      orderedAt: new Date().toISOString(),
      status: "PENDING_APPROVAL",
    };
    setEmergencyOrders((prev) => [next, ...prev]);
    setAlerts((prev) => [{
      id: `AL-EMG-${id}`,
      severity: "yellow",
      source: "delivery",
      sourceId: id,
      title: `Emergency order raised: ${id}`,
      body: `${next.customerName} — awaiting supervisor approval.`,
      createdAt: new Date().toISOString(),
    }, ...prev]);
    logAudit({ entityType: "task", entityId: id, entityLabel: `Emergency order ${next.customerName}`, field: "status", oldValue: "—", newValue: "PENDING_APPROVAL", comment: next.reason });
    pushActivity({ kind: "delivery", message: `Emergency order ${id} raised for ${next.customerName}`, actor: currentUser.name, role: currentUser.role });
  }

  function updateEmergencyStatus(id: string, status: EmergencyOrderStatus, note?: string) {
    setEmergencyOrders((prev) => prev.map((o) => o.id === id ? {
      ...o,
      status,
      authorisedBy: status === "APPROVED" || status === "CANCELLED" ? currentUser.name : o.authorisedBy,
      authorisedAt: status === "APPROVED" || status === "CANCELLED" ? new Date().toISOString() : o.authorisedAt,
      cancellationReason: status === "CANCELLED" ? note : o.cancellationReason,
    } : o));
    logAudit({ entityType: "task", entityId: id, entityLabel: `Emergency order ${id}`, field: "status", oldValue: "—", newValue: status, comment: note ?? `Status changed to ${status}` });
    pushActivity({ kind: "delivery", message: `Emergency order ${id} → ${status}`, actor: currentUser.name, role: currentUser.role });
  }

  function assignEmergencyDriver(id: string, driver: string, eta: string) {
    setEmergencyOrders((prev) => prev.map((o) => o.id === id ? { ...o, driverAssigned: driver, estimatedDelivery: eta, status: "ASSIGNED_TO_DRIVER" } : o));
    logAudit({ entityType: "task", entityId: id, entityLabel: `Emergency order ${id}`, field: "status", oldValue: "APPROVED", newValue: "ASSIGNED_TO_DRIVER", comment: `Driver ${driver}, ETA ${eta}` });
    pushActivity({ kind: "delivery", message: `Emergency ${id} assigned to ${driver}`, actor: currentUser.name, role: currentUser.role });
  }

  function addCalendarEvent(e: Omit<CalendarEvent, "id">) {
    const id = `CE-${calendarEvents.length + 100}`;
    setCalendarEvents((prev) => [{ ...e, id }, ...prev]);
    pushActivity({ kind: "delivery", message: `Calendar event added: ${e.title}`, actor: currentUser.name, role: currentUser.role });
  }

  function addPromoNote(promoId: string, message: string) {
    setPromoStock((prev) => prev.map((p) => p.id === promoId ? {
      ...p,
      notes: [...p.notes, { id: `PN-${Date.now()}`, authorName: currentUser.name, authorRole: currentUser.role, message, createdAt: new Date().toISOString() }],
    } : p));
    pushActivity({ kind: "comment", message: `Promo note added`, actor: currentUser.name, role: currentUser.role });
  }

  function addVisit(v: Omit<FieldVisit, "id">) {
    setVisits((prev) => [...prev, { ...v, id: `FV-${prev.length + 100}` }]);
    pushActivity({ kind: "delivery", message: `Visit scheduled: ${v.title}`, actor: currentUser.name, role: currentUser.role });
  }

  function updateVisit(id: string, patch: Partial<FieldVisit>) {
    setVisits((prev) => prev.map((v) => v.id === id ? { ...v, ...patch } : v));
  }

  function addFieldLog(e: Omit<FieldLogEntry, "id" | "createdAt">) {
    const entry: FieldLogEntry = { ...e, id: `FL-${fieldLog.length + 100}`, createdAt: new Date().toISOString() };
    setFieldLog((prev) => [entry, ...prev]);
    // Auto-deduct promo stock
    if (e.productsUsed.length) {
      setPromoStock((prev) => prev.map((p) => {
        const used = e.productsUsed.find((u) => u.promoStockId === p.id);
        return used ? { ...p, onHand: Math.max(0, p.onHand - used.quantity) } : p;
      }));
    }
    pushActivity({ kind: "delivery", message: `Field log added for ${e.customer}`, actor: currentUser.name, role: currentUser.role });
  }

  function createAuthRequest(r: Omit<AuthorisationRequest, "id" | "createdAt" | "status" | "requestedBy" | "requestedByRole">) {
    const req: AuthorisationRequest = {
      ...r,
      id: `AR-${String(authRequests.length + 100).padStart(3, "0")}`,
      createdAt: new Date().toISOString(),
      status: "PENDING",
      requestedBy: currentUser.name,
      requestedByRole: currentUser.role,
    };
    setAuthRequests((prev) => [req, ...prev]);
    pushActivity({ kind: "alert", message: `Authorisation request ${req.id} raised`, actor: currentUser.name, role: currentUser.role });
  }

  function decideAuthRequest(id: string, decision: "APPROVED" | "REJECTED", note: string) {
    setAuthRequests((prev) => prev.map((r) => r.id === id ? {
      ...r, status: decision, decidedBy: currentUser.name, decidedAt: new Date().toISOString(), decisionNote: note,
    } : r));
    pushActivity({ kind: "alert", message: `Request ${id} ${decision.toLowerCase()}`, actor: currentUser.name, role: currentUser.role });
  }

  // ===== Derived =====

  const visibleTasks = useMemo(() => {
    if (["staff", "warehouse_staff", "warehouse_checker", "dispatch_staff"].includes(role)) {
      return tasks.filter((t) => t.assignee === currentUser.name);
    }
    return tasks;
  }, [tasks, role, currentUser.name]);

  const taskStats = useMemo(() => countByStatus(visibleTasks.map((t) => t.status)), [visibleTasks]);
  const stockStats = useMemo(() => countByStatus(stock.map((s) => s.status)), [stock]);

  const filteredTasks = visibleTasks.filter((t) =>
    [t.title, t.assignee, t.id].join(" ").toLowerCase().includes(search.toLowerCase()),
  );
  const filteredStock = stock.filter((s) =>
    [s.name, s.sku, s.category].join(" ").toLowerCase().includes(search.toLowerCase()),
  );

  const deliveriesWithRisk = useMemo(
    () => deliveries.map((d) => ({ d, risk: deriveDeliveryRisk(d, tasks, stock) })),
    [deliveries, tasks, stock],
  );

  const deliveredToday = deliveries.filter((d) => d.status === "DELIVERED" && d.dueDate === todayIso).length;
  const pendingDeliveries = deliveries.filter((d) => ["PENDING", "IN_PROGRESS"].includes(d.status)).length;
  const atRiskDeliveries = deliveries.filter((d) => d.status === "AT_RISK").length;
  const lateDeliveries = deliveries.filter((d) => d.status === "LATE").length;
  const blockedDeliveries = deliveries.filter((d) => d.status === "BLOCKED").length;

  const openTask = tasks.find((t) => t.id === openTaskId) ?? null;
  const taskAudit = audit.filter((a) => a.entityType === "task" && a.entityId === openTaskId);
  const openDelivery = deliveries.find((d) => d.id === openDeliveryId) ?? null;
  const deliveryComments = comments.filter((c) => c.relatedEntityId === openDeliveryId);

  // Critical actions: red+yellow tasks + critical stock + late/blocked deliveries
  const criticalActions = useMemo(() => {
    const items: { id: string; severity: 0 | 1 | 2; kind: "task" | "stock" | "delivery"; title: string; subtitle: string; due?: string; assignee?: string }[] = [];
    for (const t of visibleTasks) {
      if (t.status === "red") items.push({ id: t.id, severity: 2, kind: "task", title: t.title, subtitle: t.note ?? "", due: t.due, assignee: t.assignee });
      else if (t.status === "yellow") items.push({ id: t.id, severity: 1, kind: "task", title: t.title, subtitle: t.note ?? "", due: t.due, assignee: t.assignee });
    }
    for (const s of stock) {
      if (s.status === "red") items.push({ id: s.id, severity: 2, kind: "stock", title: s.name, subtitle: s.issue ?? "Critical" });
      else if (s.status === "yellow") items.push({ id: s.id, severity: 1, kind: "stock", title: s.name, subtitle: s.issue ?? "Low" });
    }
    for (const d of deliveries) {
      if (d.status === "LATE" || d.status === "BLOCKED") items.push({ id: d.id, severity: 2, kind: "delivery", title: `${d.id} · ${d.customerName}`, subtitle: d.delayReason ?? d.status, due: d.dueDate, assignee: d.assignedOps });
      else if (d.status === "AT_RISK") items.push({ id: d.id, severity: 1, kind: "delivery", title: `${d.id} · ${d.customerName}`, subtitle: "At risk", due: d.dueDate, assignee: d.assignedOps });
    }
    return items.sort((a, b) => b.severity - a.severity || (a.due ?? "").localeCompare(b.due ?? "")).slice(0, 8);
  }, [visibleTasks, stock, deliveries]);

  return (
    <div className="min-h-screen bg-background text-foreground">
      <Header role={role} setRole={setRole} user={currentUser} />
      <main className="mx-auto max-w-7xl px-4 py-6 sm:px-6 lg:px-8">
        <div className="mb-6 flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <h1 className="text-2xl font-semibold tracking-tight sm:text-3xl">Operations dashboard</h1>
            <p className="mt-1 text-sm text-muted-foreground">
              Signed in as <span className="font-medium text-foreground">{currentUser.name}</span> · {ROLE_LABEL[role]} — {ROLE_DESCRIPTION[role]}
            </p>
          </div>
          <div className="flex items-center gap-2">
            <div className="relative">
              <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
              <Input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search tasks or stock…" className="w-64 pl-9" />
            </div>
            {can(role, "task.create") ? (
              <Button variant="default" className="gap-1.5">
                <Plus className="size-4" /> New
              </Button>
            ) : null}
          </div>
        </div>

        <Tabs value={tab} onValueChange={setTab} className="space-y-6">
          <TabsList className="flex w-full flex-wrap sm:inline-flex">
            <TabsTrigger value="overview" className="gap-1.5"><LayoutDashboard className="size-4" /> Overview</TabsTrigger>
            <TabsTrigger value="deliveries" className="gap-1.5"><Truck className="size-4" /> Deliveries</TabsTrigger>
            <TabsTrigger value="tasks" className="gap-1.5"><ClipboardList className="size-4" /> Assignments</TabsTrigger>
            <TabsTrigger value="stock" className="gap-1.5"><Boxes className="size-4" /> Inventory</TabsTrigger>
            <TabsTrigger value="marketer" className="gap-1.5" disabled={!can(role, "marketer.view") && role !== "marketer" && role !== "telesales" && role !== "marketing_lead" && role !== "marketing_supervisor"}>
              <Megaphone className="size-4" /> Marketer
            </TabsTrigger>
            <TabsTrigger value="regulatory" className="gap-1.5" disabled={!can(role, "regulatory.view")}>
              <Shield className="size-4" /> Compliance
            </TabsTrigger>
            <TabsTrigger value="presence" className="gap-1.5">
              <UserCheck className="size-4" /> Capacity
            </TabsTrigger>
            <TabsTrigger value="calendar" className="gap-1.5"><CalendarDays className="size-4" /> Calendar</TabsTrigger>
            <TabsTrigger value="audit" className="gap-1.5"><History className="size-4" /> Intelligence</TabsTrigger>
            <TabsTrigger value="admin" className="gap-1.5" disabled={!can(role, "users.manage")}>
              <UserCog className="size-4" /> Admin
            </TabsTrigger>
          </TabsList>

          {/* ============ OVERVIEW ============ */}
          <TabsContent value="overview" className="space-y-6">
            <EmergencyOrdersBanner
              deliveries={deliveries}
              emergencyOrders={emergencyOrders}
              onOpen={() => { setTab("deliveries"); setDeliveriesTab("emergency"); }}
            />
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
              <KpiCard icon={<Truck className="size-5" />} label="Delivered today" value={`${deliveredToday} / ${TARGET_DELIVERIES_PER_DAY}`} sub="Target progress" tone="green" />
              <KpiCard icon={<Clock className="size-5" />} label="Pending" value={pendingDeliveries} sub="Awaiting completion" tone="yellow" />
              <KpiCard icon={<AlertTriangle className="size-5" />} label="At risk / Blocked" value={atRiskDeliveries + blockedDeliveries} sub="Need supervisor action" tone="yellow" />
              <KpiCard icon={<ShieldCheck className="size-5" />} label="Late deliveries" value={lateDeliveries} sub="Past dispatch cutoff" tone="red" />
            </div>

            <div className="grid gap-6 lg:grid-cols-3">
              <DeliveryRiskPanel items={deliveriesWithRisk} onOpen={setOpenDeliveryId} className="lg:col-span-2" />
              <CriticalActionsQueue items={criticalActions} onOpenTask={setOpenTaskId} onOpenDelivery={setOpenDeliveryId} onOpenStock={(id) => { const s = stock.find((x) => x.id === id); if (s) setStockDialog(s); }} />
            </div>

            <DispatchWindowsPanel
              deliveries={deliveries}
              emergencyOrders={emergencyOrders}
              onOpenEmergency={() => { setTab("deliveries"); setDeliveriesTab("emergency"); }}
            />

            <div className="grid gap-6 lg:grid-cols-3">
              <LiveActivityFeed events={activity} />
              <StockRiskSummary items={stock} />
              <UpcomingEventsCard events={calendarEvents} onSeeAll={() => setTab("calendar")} />
            </div>

            {tasks.some((t) => t.pendingVerification) && can(role, "task.verify") ? (
              <Card>
                <CardHeader>
                  <CardTitle className="text-base font-semibold flex items-center gap-2">
                    <ShieldCheck className="size-4" /> Awaiting supervisor verification
                  </CardTitle>
                </CardHeader>
                <CardContent className="space-y-2">
                  {tasks.filter((t) => t.pendingVerification).map((t) => (
                    <div key={t.id} className="flex items-center justify-between rounded-md border p-3">
                      <div className="min-w-0">
                        <p className="text-sm font-medium">{t.title}</p>
                        <p className="text-xs text-muted-foreground">Completed by {t.assignee} · {t.note}</p>
                      </div>
                      <Button size="sm" onClick={() => verifyTask(t)}>Verify</Button>
                    </div>
                  ))}
                </CardContent>
              </Card>
            ) : null}
          </TabsContent>

          {/* ============ DELIVERIES ============ */}
          <TabsContent value="deliveries" className="space-y-4">
            <Tabs value={deliveriesTab} onValueChange={(v) => setDeliveriesTab(v as "active" | "emergency")}>
              <TabsList>
                <TabsTrigger value="active">All deliveries</TabsTrigger>
                <TabsTrigger value="emergency" className="gap-1.5">
                  🚨 Emergency orders
                  {emergencyOrders.filter((o) => o.status === "PENDING_APPROVAL").length > 0 ? (
                    <span className="ml-1 rounded-full bg-status-red px-1.5 text-[10px] font-semibold text-white">
                      {emergencyOrders.filter((o) => o.status === "PENDING_APPROVAL").length}
                    </span>
                  ) : null}
                </TabsTrigger>
              </TabsList>
              <TabsContent value="active" className="mt-4">
                <TimedDeliveries
                  deliveries={deliveries}
                  riskItems={deliveriesWithRisk}
                  currentUserName={currentUser.name}
                  onOpenDelivery={setOpenDeliveryId}
                  onActiveAssignmentsChange={setActiveAssignments}
                />
              </TabsContent>
              <TabsContent value="emergency" className="mt-4">
                <EmergencyOrders
                  orders={emergencyOrders}
                  user={currentUser}
                  onCreate={createEmergencyOrder}
                  onUpdateStatus={updateEmergencyStatus}
                  onAssignDriver={assignEmergencyDriver}
                />
              </TabsContent>
            </Tabs>
          </TabsContent>

          {/* ============ TASKS ============ */}
          <TabsContent value="tasks">
            <Card>
              <CardHeader>
                <CardTitle className="text-base font-semibold">{["staff","warehouse_staff","warehouse_checker","dispatch_staff"].includes(role) ? "My tasks" : "All tasks"}</CardTitle>
                <p className="mt-1 text-xs text-muted-foreground">
                  Staff mark tasks complete with a comment/evidence note; supervisors verify before tasks become final green.
                </p>
              </CardHeader>
              <CardContent>
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead className="w-[90px]">ID</TableHead>
                      <TableHead>Task</TableHead>
                      <TableHead>Assignee</TableHead>
                      <TableHead>Due</TableHead>
                      <TableHead className="text-right">Status</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {filteredTasks.map((t) => (
                      <TableRow key={t.id} onClick={() => setOpenTaskId(t.id)} className="cursor-pointer">
                        <TableCell className="font-mono text-xs text-muted-foreground">{t.id}</TableCell>
                        <TableCell>
                          <div className="font-medium flex items-center gap-2">
                            {t.title}
                            {t.pendingVerification ? (
                              <span className="inline-flex items-center gap-1 rounded-full bg-status-yellow/20 px-2 py-0.5 text-[10px] text-status-yellow-foreground">
                                <ShieldCheck className="size-3" /> Pending verification
                              </span>
                            ) : null}
                          </div>
                          {t.note ? <div className="text-xs text-muted-foreground">{t.note}</div> : null}
                        </TableCell>
                        <TableCell className="text-sm">{t.assignee}</TableCell>
                        <TableCell className="text-sm">{t.due}</TableCell>
                        <TableCell className="text-right"><StatusBadge status={t.status} /></TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </CardContent>
            </Card>
          </TabsContent>

          {/* ============ STOCK ============ */}
          <TabsContent value="stock">
            <Card>
              <CardHeader>
                <CardTitle className="text-base font-semibold">Stock condition</CardTitle>
              </CardHeader>
              <CardContent>
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Item</TableHead>
                      <TableHead>Batch</TableHead>
                      <TableHead>Available / Damaged</TableHead>
                      <TableHead className="w-[160px]">Level</TableHead>
                      <TableHead>Expiry</TableHead>
                      <TableHead className="text-right">Action</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {filteredStock.map((s) => {
                      const pct = Math.min(100, Math.round((s.onHand / s.capacity) * 100));
                      const canEdit = can(role, "stock.update");
                      const canReport = can(role, "stock.report");
                      return (
                        <TableRow key={s.id}>
                          <TableCell>
                            <div className="font-medium">{s.name}</div>
                            <div className="font-mono text-xs text-muted-foreground">{s.sku}</div>
                          </TableCell>
                          <TableCell className="font-mono text-xs">{s.batch ?? "—"}</TableCell>
                          <TableCell className="text-sm">
                            {s.onHand - (s.damagedUnits ?? 0)}
                            {s.damagedUnits ? <span className="text-status-red"> · {s.damagedUnits} damaged</span> : null}
                          </TableCell>
                          <TableCell>
                            <Progress value={pct} className="h-1.5" />
                            {s.issue ? <div className="mt-1 text-xs text-muted-foreground">{s.issue}</div> : null}
                          </TableCell>
                          <TableCell className="text-sm">{s.expiry}</TableCell>
                          <TableCell className="text-right">
                            <div className="flex items-center justify-end gap-2">
                              <StatusBadge status={s.status} />
                              {canEdit || canReport ? (
                                <Button size="sm" variant="ghost" onClick={() => setStockDialog(s)}>
                                  {canEdit ? "Update" : "Report"}
                                </Button>
                              ) : null}
                            </div>
                          </TableCell>
                        </TableRow>
                      );
                    })}
                  </TableBody>
                </Table>
              </CardContent>
            </Card>
          </TabsContent>

          {/* ============ MARKETER ============ */}
          <TabsContent value="marketer" className="space-y-6">
            <MarketerModule
              user={currentUser}
              deliveries={deliveries}
              comments={comments}
              promoStock={promoStock}
              visits={visits}
              fieldLog={fieldLog}
              authRequests={authRequests}
              emergencyOrders={emergencyOrders}
              onOpenDelivery={setOpenDeliveryId}
              onAddPromoNote={addPromoNote}
              onAddVisit={addVisit}
              onUpdateVisit={updateVisit}
              onAddFieldLog={addFieldLog}
              onCreateAuthRequest={createAuthRequest}
              onDecideAuthRequest={decideAuthRequest}
            />
          </TabsContent>

          {/* ============ CALENDAR ============ */}
          <TabsContent value="calendar" className="space-y-4">
            <OperationsCalendar
              events={calendarEvents}
              user={currentUser}
              canCreate={["admin", "supervisor", "dispatch_supervisor", "marketer"].includes(role)}
              onAdd={addCalendarEvent}
            />
          </TabsContent>

          {/* ============ AUDIT ============ */}
          <TabsContent value="audit">
            <Tabs defaultValue="trail" className="space-y-4">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <TabsList>
                  <TabsTrigger value="trail">Audit trail</TabsTrigger>
                  <TabsTrigger value="performance">Performance report</TabsTrigger>
                  <TabsTrigger value="digest">Notes digest</TabsTrigger>
                </TabsList>
                <WeeklyDigestButton
                  deliveries={deliveries}
                  tasks={tasks}
                  stock={stock}
                  audit={audit}
                  comments={comments}
                  alerts={alerts}
                  calendarEvents={calendarEvents}
                  authRequests={authRequests}
                  fieldLog={fieldLog}
                />
              </div>
              <TabsContent value="trail"><AuditTrailCard entries={audit} /></TabsContent>
              <TabsContent value="performance">
                <PerformanceReport deliveries={deliveries} audit={audit} />
              </TabsContent>
              <TabsContent value="digest">
                <NotesDigest audit={audit} comments={comments} fieldLog={fieldLog} />
              </TabsContent>
            </Tabs>
          </TabsContent>

          {/* ============ REGULATORY ============ */}
          <TabsContent value="regulatory">
            <RegulatoryModule
              licenses={SEED_LICENSES}
              zones={SEED_ZONES}
              batches={SEED_BATCHES}
              controlled={SEED_CONTROLLED}
              inspection={SEED_INSPECTION}
              deliveries={deliveries}
            />
          </TabsContent>

          {/* ============ PRESENCE & DELEGATION ============ */}
          <TabsContent value="presence" className="space-y-4">
            <PresenceBoard activeAssignments={activeAssignments} />
          </TabsContent>

          {/* ============ ADMIN ============ */}
          <TabsContent value="admin" className="space-y-6">
            {!can(role, "users.manage") ? (
              <Card>
                <CardContent className="flex items-center gap-3 p-6 text-sm text-muted-foreground">
                  <Lock className="size-4" /> Admin tools are restricted to administrators.
                </CardContent>
              </Card>
            ) : (
              <Card>
                <CardHeader>
                  <CardTitle className="text-base font-semibold">Staff & accountability</CardTitle>
                </CardHeader>
                <CardContent>
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Name</TableHead>
                        <TableHead>Role</TableHead>
                        <TableHead>Shift</TableHead>
                        <TableHead>Done</TableHead>
                        <TableHead>Pending</TableHead>
                        <TableHead className="text-right">Health</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {STAFF.map((p) => {
                        const health: Status = p.tasksPending === 0 ? "green" : p.tasksPending > 1 ? "red" : "yellow";
                        return (
                          <TableRow key={p.name}>
                            <TableCell className="font-medium">{p.name}</TableCell>
                            <TableCell className="text-sm text-muted-foreground">{p.role}</TableCell>
                            <TableCell className="text-sm">{p.shift}</TableCell>
                            <TableCell className="text-sm">{p.tasksDone}</TableCell>
                            <TableCell className="text-sm">{p.tasksPending}</TableCell>
                            <TableCell className="text-right"><StatusBadge status={health} /></TableCell>
                          </TableRow>
                        );
                      })}
                    </TableBody>
                  </Table>
                </CardContent>
              </Card>
            )}
          </TabsContent>
        </Tabs>

        <footer className="mt-12 border-t pt-6 text-xs text-muted-foreground">
          Prototype · Cospharm operations dashboard · data shown is illustrative.
        </footer>
      </main>

      <TaskDetailSheet
        task={openTask}
        audit={taskAudit}
        role={role}
        user={currentUser}
        onClose={() => setOpenTaskId(null)}
        onUpdate={updateTaskStatus}
      />
      <StockUpdateDialog
        item={stockDialog}
        role={role}
        onClose={() => setStockDialog(null)}
        onSubmit={updateStock}
      />
      <DeliveryDetailSheet
        delivery={openDelivery}
        tasks={tasks}
        stock={stock}
        comments={deliveryComments}
        user={currentUser}
        onClose={() => setOpenDeliveryId(null)}
        onUpdate={updateDelivery}
        onAddComment={(id, t, m) => addComment(id, t, m, "DELIVERY")}
        onHideComment={hideComment}
        onResolveLate={resolveLateDelivery}
      />
      <DelayReasonDialog
        delivery={delayDialog}
        onClose={() => setDelayDialog(null)}
        onSave={(payload) => delayDialog && saveDelayReason(delayDialog, payload)}
      />
    </div>
  );
}

// Helper to look up prior step count for audit
function prev_steps_for(next: Delivery, list: Delivery[]) {
  return list.find((d) => d.id === next.id)?.steps ?? next.steps;
}

// ===== Header =====
function Header({ role, setRole, user }: { role: Role; setRole: (r: Role) => void; user: CurrentUser }) {
  const initials = user.name.split(" ").map((n) => n[0]).join("").slice(0, 2);
  return (
    <header className="sticky top-0 z-20 border-b bg-background/85 backdrop-blur">
      <div className="mx-auto flex max-w-7xl items-center justify-between gap-4 px-4 py-3 sm:px-6 lg:px-8">
        <div className="flex items-center gap-3">
          <img src={cospharmLogo.url} alt="Cospharm logo" className="size-11 object-contain" />
          <div>
            <p className="text-base font-semibold leading-tight tracking-tight text-primary">Cospharm</p>
            <p className="text-[11px] font-medium italic leading-tight text-status-red">Believe in Good</p>
          </div>
        </div>
        <div className="hidden items-center gap-2 md:flex">
          <LegendDot status="green" label="Healthy / done" />
          <LegendDot status="yellow" label="Attention" />
          <LegendDot status="red" label="Critical" />
        </div>
        <div className="flex items-center gap-2">
          <Select value={role} onValueChange={(v) => setRole(v as Role)}>
            <SelectTrigger className="w-[220px]" aria-label="Switch role">
              <SelectValue />
            </SelectTrigger>
            <SelectContent className="max-h-[380px]">
              {(Object.keys(ROLE_LABEL) as Role[]).map((r) => (
                <SelectItem key={r} value={r}>{ROLE_LABEL[r]}</SelectItem>
              ))}
            </SelectContent>
          </Select>
          <div className="hidden text-right sm:block">
            <p className="text-sm font-medium leading-tight">{user.name}</p>
            <p className="text-xs text-muted-foreground leading-tight">{ROLE_LABEL[user.role]}</p>
          </div>
          <div className="grid size-9 place-items-center rounded-full bg-secondary text-sm font-semibold text-secondary-foreground">
            {initials}
          </div>
        </div>
      </div>
    </header>
  );
}

function KpiCard({ icon, label, value, sub, tone = "neutral" }: { icon: React.ReactNode; label: string; value: string | number; sub: string; tone?: "neutral" | "green" | "yellow" | "red" }) {
  const toneClasses: Record<typeof tone, string> = {
    neutral: "bg-secondary text-secondary-foreground",
    green: "bg-status-green/15 text-status-green",
    yellow: "bg-status-yellow/20 text-status-yellow-foreground",
    red: "bg-status-red/15 text-status-red",
  };
  return (
    <Card>
      <CardContent className="flex items-start gap-3 p-5">
        <div className={`grid size-10 place-items-center rounded-md ${toneClasses[tone]}`}>{icon}</div>
        <div className="min-w-0 flex-1">
          <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">{label}</p>
          <p className="mt-1 text-2xl font-semibold tracking-tight">{value}</p>
          <p className="mt-0.5 text-xs text-muted-foreground">{sub}</p>
        </div>
      </CardContent>
    </Card>
  );
}

function LegendDot({ status, label }: { status: Status; label: string }) {
  return (
    <span className="flex items-center gap-1.5 rounded-full border bg-card px-2.5 py-1 text-xs text-muted-foreground">
      <StatusDot status={status} />
      {label}
    </span>
  );
}

function countByStatus(items: Status[]) {
  return items.reduce(
    (acc, s) => { acc[s] += 1; return acc; },
    { green: 0, yellow: 0, red: 0 } as Record<Status, number>,
  );
}

// ===== Overview sections =====

function CriticalActionsQueue({
  items,
  onOpenTask,
  onOpenDelivery,
  onOpenStock,
}: {
  items: { id: string; severity: 0 | 1 | 2; kind: "task" | "stock" | "delivery"; title: string; subtitle: string; due?: string; assignee?: string }[];
  onOpenTask: (id: string) => void;
  onOpenDelivery: (id: string) => void;
  onOpenStock: (id: string) => void;
}) {
  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base font-semibold flex items-center gap-2">
          <AlertTriangle className="size-4" /> Critical actions queue
        </CardTitle>
        <p className="mt-1 text-xs text-muted-foreground">Sorted by severity and due time.</p>
      </CardHeader>
      <CardContent className="space-y-2">
        {items.length === 0 ? (
          <p className="rounded-md border border-dashed p-3 text-center text-xs text-muted-foreground">All clear.</p>
        ) : (
          items.map((it) => {
            const tone: Status = it.severity === 2 ? "red" : "yellow";
            return (
              <div key={`${it.kind}-${it.id}`} className="flex items-start justify-between gap-2 rounded-md border p-3">
                <div className="min-w-0">
                  <p className="text-sm font-medium truncate">{it.title}</p>
                  <p className="text-[11px] text-muted-foreground truncate">
                    {it.kind.toUpperCase()} · {it.assignee ?? "—"}{it.due ? ` · due ${it.due}` : ""}
                  </p>
                  <p className="text-xs text-muted-foreground truncate">{it.subtitle}</p>
                </div>
                <div className="flex flex-col items-end gap-1">
                  <StatusBadge status={tone} label={it.severity === 2 ? "Critical" : "Attention"} />
                  <Button size="sm" variant="outline" onClick={() => {
                    if (it.kind === "task") onOpenTask(it.id);
                    else if (it.kind === "delivery") onOpenDelivery(it.id);
                    else onOpenStock(it.id);
                  }}>Open</Button>
                </div>
              </div>
            );
          })
        )}
      </CardContent>
    </Card>
  );
}

function LiveActivityFeed({ events }: { events: ActivityEvent[] }) {
  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base font-semibold flex items-center gap-2">
          <Activity className="size-4" /> Live activity feed
        </CardTitle>
      </CardHeader>
      <CardContent>
        {events.length === 0 ? (
          <p className="rounded-md border border-dashed p-3 text-center text-xs text-muted-foreground">Activity will appear here as you work.</p>
        ) : (
          <ol className="space-y-2 max-h-72 overflow-y-auto pr-1">
            {events.map((e) => (
              <li key={e.id} className="rounded-md border p-2 text-xs">
                <p className="font-medium">{e.message}</p>
                <p className="text-muted-foreground">
                  {e.actor} · {ROLE_LABEL[e.role]} · {new Date(e.timestamp).toLocaleTimeString()}
                </p>
              </li>
            ))}
          </ol>
        )}
      </CardContent>
    </Card>
  );
}

function StockRiskSummary({ items }: { items: StockItem[] }) {
  const now = new Date();
  const nearExpiry = items.filter((s) => {
    const e = new Date(s.expiry + "-01");
    const diffMonths = (e.getFullYear() - now.getFullYear()) * 12 + (e.getMonth() - now.getMonth());
    return diffMonths >= 0 && diffMonths <= 6;
  });
  const expired = items.filter((s) => {
    const e = new Date(s.expiry + "-01");
    return e < now;
  });
  const damaged = items.filter((s) => (s.damagedUnits ?? 0) > 0);

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base font-semibold flex items-center gap-2">
          <Package className="size-4" /> Stock risk summary
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-3 text-xs">
        <SummaryRow label="Near expiry (≤6mo)" count={nearExpiry.length} tone="yellow" />
        <SummaryRow label="Expired" count={expired.length} tone="red" />
        <SummaryRow label="Damaged units flagged" count={damaged.length} tone="red" />
        <Separator />
        <div className="space-y-1.5 max-h-40 overflow-y-auto pr-1">
          {nearExpiry.concat(damaged.filter((d) => !nearExpiry.includes(d))).slice(0, 6).map((s) => (
            <div key={s.id} className="flex items-center justify-between gap-2">
              <span className="truncate">{s.name}</span>
              <span className="font-mono text-[10px] text-muted-foreground">
                {s.batch} · exp {s.expiry}{s.damagedUnits ? ` · ${s.damagedUnits} dmg` : ""}
              </span>
            </div>
          ))}
        </div>
      </CardContent>
    </Card>
  );
}

function SummaryRow({ label, count, tone }: { label: string; count: number; tone: Status }) {
  return (
    <div className="flex items-center justify-between">
      <span className="flex items-center gap-2">
        <StatusDot status={tone} /> {label}
      </span>
      <span className="font-semibold">{count}</span>
    </div>
  );
}

function UpcomingEventsCard({ events, onSeeAll }: { events: CalendarEvent[]; onSeeAll: () => void }) {
  const today = new Date().toISOString().slice(0, 10);
  const upcoming = [...events]
    .filter((e) => e.date >= today)
    .sort((a, b) => a.date.localeCompare(b.date))
    .slice(0, 5);
  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between">
        <CardTitle className="text-base font-semibold flex items-center gap-2">
          <CalendarDays className="size-4" /> Upcoming events
        </CardTitle>
        <Button size="sm" variant="ghost" onClick={onSeeAll}>See all</Button>
      </CardHeader>
      <CardContent className="space-y-2">
        {upcoming.length === 0 ? (
          <p className="rounded-md border border-dashed p-3 text-center text-xs text-muted-foreground">No upcoming events.</p>
        ) : (
          upcoming.map((e) => (
            <div key={e.id} className="rounded-md border p-2 text-xs">
              <div className="flex items-center justify-between gap-2">
                <p className="font-medium truncate">{e.important ? "★ " : ""}{e.title}</p>
                <span className="text-[10px] uppercase text-muted-foreground">{e.type}</span>
              </div>
              <p className="text-[11px] text-muted-foreground">
                {new Date(e.date + "T00:00:00").toLocaleDateString(undefined, { weekday: "short", day: "numeric", month: "short" })}
                {e.time ? ` · ${e.time}` : ""}{e.owner ? ` · ${e.owner}` : ""}
              </p>
            </div>
          ))
        )}
      </CardContent>
    </Card>
  );
}
