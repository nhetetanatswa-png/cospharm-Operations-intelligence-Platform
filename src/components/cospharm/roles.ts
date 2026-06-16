import type { Role } from "./types";

export const ROLE_LABEL: Record<Role, string> = {
  admin: "Admin",
  supervisor: "Supervisor",
  staff: "Staff",
  marketer: "Marketer",
  warehouse_staff: "Warehouse Staff",
  warehouse_checker: "Warehouse Checker",
  dispatch_supervisor: "Dispatch Supervisor",
  dispatch_staff: "Dispatch Staff",
};

export const ROLE_DESCRIPTION: Record<Role, string> = {
  admin: "Manage users, tasks, stock, alerts, and reports.",
  supervisor: "Assign tasks, verify completion, resolve alerts, view reports.",
  staff: "View assigned tasks, update progress, comment, report damaged stock.",
  marketer: "Track delivered orders, follow up with customers, log delivery notes.",
  warehouse_staff: "Pick products from shelves and update operational steps.",
  warehouse_checker: "Verify batch numbers and expiry dates on picked stock.",
  dispatch_supervisor: "Approve packed orders for dispatch.",
  dispatch_staff: "Confirm dispatched and delivered orders.",
};

export type Permission =
  | "task.update.any"
  | "task.update.assigned"
  | "task.verify"
  | "task.assign"
  | "task.create"
  | "stock.update"
  | "stock.report"
  | "alert.resolve"
  | "report.view"
  | "users.manage"
  | "handover.create"
  | "comment.hide"
  | "delivery.resolve"
  | "marketer.view";

const MATRIX: Record<Role, Permission[]> = {
  admin: [
    "task.update.any",
    "task.update.assigned",
    "task.verify",
    "task.assign",
    "task.create",
    "stock.update",
    "stock.report",
    "alert.resolve",
    "report.view",
    "users.manage",
    "handover.create",
    "comment.hide",
    "delivery.resolve",
    "marketer.view",
  ],
  supervisor: [
    "task.update.any",
    "task.update.assigned",
    "task.verify",
    "task.assign",
    "task.create",
    "stock.update",
    "stock.report",
    "alert.resolve",
    "report.view",
    "handover.create",
    "comment.hide",
    "delivery.resolve",
    "marketer.view",
  ],
  staff: ["task.update.assigned", "stock.report"],
  marketer: ["task.update.assigned", "marketer.view"],
  warehouse_staff: ["task.update.assigned", "stock.report"],
  warehouse_checker: ["task.update.assigned", "stock.report"],
  dispatch_supervisor: ["task.update.assigned", "task.verify", "stock.report"],
  dispatch_staff: ["task.update.assigned"],
};

export function can(role: Role, permission: Permission): boolean {
  return MATRIX[role].includes(permission);
}