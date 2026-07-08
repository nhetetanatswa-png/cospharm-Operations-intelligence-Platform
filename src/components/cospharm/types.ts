import type { Status } from "./StatusBadge";

export type Role =
  | "admin"
  | "supervisor"
  | "staff"
  | "marketer"
  | "warehouse_staff"
  | "warehouse_checker"
  | "dispatch_supervisor"
  | "dispatch_staff"
  | "ops_manager"
  | "warehouse_supervisor"
  | "dispatch"
  | "regulatory"
  | "front_desk"
  | "general_manager"
  | "procurement"
  | "hr"
  | "telesales"
  | "marketing_lead"
  | "marketing_supervisor";

export type Task = {
  id: string;
  title: string;
  assignee: string;
  shift: "Morning" | "Afternoon" | "Night";
  due: string;
  status: Status;
  note?: string;
  /** Staff-marked complete but pending supervisor verification */
  pendingVerification?: boolean;
  verifiedBy?: string;
  verifiedAt?: string;
};

export type StockItem = {
  id: string;
  name: string;
  sku: string;
  category: string;
  onHand: number;
  reorder: number;
  capacity: number;
  expiry: string;
  status: Status;
  issue?: string;
  batch?: string;
  damagedUnits?: number;
};

export type AuditEntry = {
  id: string;
  entityType: "task" | "stock";
  entityId: string;
  entityLabel: string;
  field: "status" | "onHand" | "issue";
  oldValue: string;
  newValue: string;
  user: string;
  role: Role;
  comment: string;
  timestamp: string; // ISO
};

export type CurrentUser = {
  name: string;
  role: Role;
};

// ===== Operational workflow =====

export type DeliveryStatus =
  | "PENDING"
  | "IN_PROGRESS"
  | "AT_RISK"
  | "BLOCKED"
  | "DISPATCHED"
  | "DELIVERED"
  | "LATE";

export type OperationStep = {
  stepNumber: number;
  name: string;
  allowedRoles: Role[];
  completed: boolean;
  completedBy?: string;
  completedAt?: string;
  comment?: string;
  assignedPerson?: string;
  department?: string;
  startTime?: string;
  completionTime?: string;
  targetMinutes?: number;
  actualMinutes?: number;
  delayed?: boolean;
  delayReason?: string;
  handoffToNextPerson?: string;
};

export type Delivery = {
  id: string;
  customerName: string;
  assignedMarketer: string;
  assignedOps: string;
  dueDate: string; // YYYY-MM-DD
  status: DeliveryStatus;
  steps: OperationStep[];
  requiredStockIds: string[];
  requiredTaskIds: string[];
  delayReason?: string;
  resolutionNote?: string;
  responsibleDept?: string;
  dispatchWindow?: DispatchWindow;
  wasLate?: boolean;
  lateDetectedAt?: string;
  customerNotified?: boolean;
  notificationMethod?: "CALL" | "WHATSAPP" | "EMAIL";
  resolutionPlan?: string;
  delayReasonAt?: string;
  priority?: "normal" | "emergency";
  emergencyFlaggedAt?: string;
};

export type DispatchWindow = "MORNING" | "AFTERNOON" | "EMERGENCY";

export type EmergencyOrderItem = {
  productName: string;
  sku?: string;
  quantity: number;
  urgencyNote: string;
};

export type EmergencyOrderStatus =
  | "PENDING_APPROVAL"
  | "APPROVED"
  | "ASSIGNED_TO_DRIVER"
  | "DISPATCHED"
  | "DELIVERED"
  | "CANCELLED";

export type EmergencyOrder = {
  id: string;
  deliveryId?: string;
  orderedBy: string;
  orderedAt: string;
  customerName: string;
  clientContact: string;
  items: EmergencyOrderItem[];
  reason: string;
  authorisedBy?: string;
  authorisedAt?: string;
  status: EmergencyOrderStatus;
  cancellationReason?: string;
  driverAssigned?: string;
  estimatedDelivery?: string;
  note?: string;
};

export type CommentType =
  | "GENERAL"
  | "DELIVERY_NOTE"
  | "DELAY_REASON"
  | "STOCK_NOTE"
  | "CUSTOMER_NOTE"
  | "SUPERVISOR_NOTE";

export type Comment = {
  id: string;
  relatedEntityType: "DELIVERY" | "TASK" | "STOCK" | "ALERT" | "STEP";
  relatedEntityId: string;
  authorName: string;
  authorRole: Role;
  commentType: CommentType;
  message: string;
  createdAt: string;
  hidden?: boolean;
  hiddenBy?: string;
};

export type HandoverNote = {
  id: string;
  shiftFrom: "Morning" | "Afternoon" | "Night";
  shiftTo: "Morning" | "Afternoon" | "Night";
  authorName: string;
  authorRole: Role;
  message: string;
  createdAt: string;
};

export type Alert = {
  id: string;
  severity: "red" | "yellow";
  source: "delivery" | "task" | "stock";
  sourceId: string;
  title: string;
  body: string;
  createdAt: string;
  resolved?: boolean;
  resolutionComment?: string;
};

export type ActivityEvent = {
  id: string;
  kind: "task" | "stock" | "verification" | "alert" | "delivery" | "comment" | "handover";
  message: string;
  actor: string;
  role: Role;
  timestamp: string;
};

// ===== Marketer module =====

export type PromoStockNote = {
  id: string;
  authorName: string;
  authorRole: Role;
  message: string;
  createdAt: string;
};

export type PromoStockItem = {
  id: string;
  name: string;
  sku: string;
  category: string;
  onHand: number;
  allocated: number;
  expiry?: string;
  notes: PromoStockNote[];
  requestedBy?: string;
  reasonForRequest?: string;
  requestStatus?: "PENDING" | "APPROVED" | "DECLINED";
  decidedBy?: string;
};

export type FieldVisitType =
  | "CUSTOMER_VISIT"
  | "ACTIVATION"
  | "OSC"
  | "MEETING"
  | "TRIP"
  | "AUDIT"
  | "STOCKTAKE"
  | "DEADLINE"
  | "OTHER";

export type FieldVisit = {
  id: string;
  title: string;
  date: string; // YYYY-MM-DD
  time?: string;
  type: FieldVisitType;
  marketer?: string;
  customer?: string;
  location?: string;
  notes?: string;
  status: "PLANNED" | "DONE" | "CANCELLED";
};

export type FieldLogEntry = {
  id: string;
  date: string;
  marketer: string;
  customer: string;
  visitType: FieldVisitType;
  outcome: "SALE" | "FOLLOW_UP" | "SAMPLE_GIVEN" | "NO_INTEREST" | "INFO_ONLY";
  productsUsed: { promoStockId: string; productName: string; quantity: number }[];
  notes: string;
  createdAt: string;
  activities?: MarketingActivity[];
};

export type MarketingActivity =
  | "SITE_VISIT"
  | "SAMPLE_DROP"
  | "PROMO_TALK"
  | "TRAINING"
  | "STOCK_CHECK"
  | "TELESALES_CALL";

// ===== Regulatory =====
export type RegulatoryStatus = "green" | "yellow" | "red";

export type License = {
  id: string;
  type: string;
  holder: string;
  issueDate: string;
  expiryDate: string;
};

export type ColdChainZone = {
  id: string;
  name: string;
  currentTempC: number;
  targetRange: [number, number];
  lastBreachAt?: string;
  breachDurationMins?: number;
  resolved: boolean;
};

export type BatchRecord = {
  id: string;
  batchNumber: string;
  product: string;
  expiry: string; // YYYY-MM-DD
  quantity: number;
  linkedDeliveryIds: string[];
};

export type ControlledDrugLog = {
  id: string;
  product: string;
  batch: string;
  handler: string;
  action: "RECEIVED" | "DISPENSED" | "TRANSFERRED";
  timestamp: string;
};

export type CorrectiveAction = {
  id: string;
  description: string;
  due: string; // YYYY-MM-DD
  status: "OPEN" | "CLOSED";
};

export type Inspection = {
  lastDate?: string;
  nextDate?: string;
  actions: CorrectiveAction[];
};

// ===== HR =====
export type CertificationType =
  | "DRIVERS_LICENSE_PDP"
  | "COLD_CHAIN_HANDLING"
  | "CONTROLLED_SUBSTANCES"
  | "QUALIFIED_PERSON"
  | "FIRST_AID"
  | "FORKLIFT";

export type StaffCertification = {
  id: string;
  staffName: string;
  staffRole: string;
  type: CertificationType;
  issueDate?: string;
  expiryDate?: string;
  missing?: boolean;
};

export type LeaveRecord = {
  id: string;
  staffName: string;
  staffRole: string; // e.g. "Driver", "Warehouse lead"
  critical: boolean;
  from: string;
  to: string;
  reason?: string;
};

export type AuthRequestType = "PROMO_RELEASE" | "PRICE_OVERRIDE" | "CREDIT_TERM" | "EMERGENCY_ORDER" | "TRAVEL" | "EXPENSE";
export type AuthRequestStatus = "PENDING" | "APPROVED" | "REJECTED";

export type AuthorisationRequest = {
  id: string;
  type: AuthRequestType;
  requestedBy: string;
  requestedByRole: Role;
  customer?: string;
  details: string;
  amount?: number;
  createdAt: string;
  status: AuthRequestStatus;
  decidedBy?: string;
  decidedAt?: string;
  decisionNote?: string;
};

// ===== Operations calendar =====

export type CalendarEventType =
  | "MEETING"
  | "AUDIT"
  | "TRIP"
  | "ACTIVATION"
  | "OSC"
  | "DEADLINE"
  | "STOCKTAKE"
  | "TRAINING"
  | "HOLIDAY"
  | "OTHER";

export type CalendarEvent = {
  id: string;
  title: string;
  date: string; // YYYY-MM-DD
  endDate?: string;
  time?: string;
  type: CalendarEventType;
  owner?: string;
  location?: string;
  description?: string;
  important?: boolean;
};