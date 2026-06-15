import type { Status } from "./StatusBadge";

export type Role = "admin" | "supervisor" | "staff";

export type Task = {
  id: string;
  title: string;
  assignee: string;
  shift: "Morning" | "Afternoon" | "Night";
  due: string;
  status: Status;
  note?: string;
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