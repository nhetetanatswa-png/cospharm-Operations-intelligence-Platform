import type { Role } from "./types";

export const ROLE_LABEL: Record<Role, string> = {
  admin: "Admin",
  supervisor: "Supervisor",
  staff: "Staff",
};

export const ROLE_DESCRIPTION: Record<Role, string> = {
  admin: "Manage users, tasks, stock, alerts, and reports.",
  supervisor: "Assign tasks, verify completion, resolve alerts, view reports.",
  staff: "View assigned tasks, update progress, comment, report damaged stock.",
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
  | "users.manage";

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
  ],
  staff: ["task.update.assigned", "stock.report"],
};

export function can(role: Role, permission: Permission): boolean {
  return MATRIX[role].includes(permission);
}