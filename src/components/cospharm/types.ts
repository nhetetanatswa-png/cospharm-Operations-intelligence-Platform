import type { Status } from "./StatusBadge";

export type Role =
  | "admin"
  | "supervisor"
  | "staff"
  | "marketer"
  | "warehouse_staff"
  | "warehouse_checker"
  | "dispatch_supervisor"
  | "dispatch_staff";

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