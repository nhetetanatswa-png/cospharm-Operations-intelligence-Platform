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
  ops_manager: "Operations Manager",
  warehouse_supervisor: "Warehouse Supervisor",
  dispatch: "Dispatch",
  regulatory: "Regulatory",
  front_desk: "Front Desk",
  general_manager: "General Manager",
  procurement: "Procurement Manager",
  hr: "HR",
  telesales: "Telesales",
  marketing_lead: "Marketing Lead",
  marketing_supervisor: "Marketing Supervisor",
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
  ops_manager: "Full Deliveries/Stock/Dispatch; read-only Marketing, HR, Regulatory.",
  warehouse_supervisor: "Full warehouse stock control.",
  dispatch: "Operate deliveries — pick, pack, dispatch.",
  regulatory: "Full Regulatory + Audit. Read-only HR certifications.",
  front_desk: "View delivery status and intake notes only.",
  general_manager: "View-all across every module. Cannot manage user accounts.",
  procurement: "Full stock procurement/ordering. View regulatory licenses.",
  hr: "Full HR module. Read-only summary of regulatory licenses.",
  telesales: "Operate marketing telesales section.",
  marketing_lead: "Full Marketing — approve/decline promo stock.",
  marketing_supervisor: "Full Marketing — approve/decline promo stock.",
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
  | "marketer.view"
  | "marketer.approve"
  | "regulatory.view"
  | "regulatory.edit"
  | "hr.view"
  | "hr.edit";

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
    "marketer.approve",
    "regulatory.view",
    "regulatory.edit",
    "hr.view",
    "hr.edit",
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
    "marketer.approve",
  ],
  staff: ["task.update.assigned", "stock.report"],
  marketer: ["task.update.assigned", "marketer.view"],
  warehouse_staff: ["task.update.assigned", "stock.report"],
  warehouse_checker: ["task.update.assigned", "stock.report"],
  dispatch_supervisor: ["task.update.assigned", "task.verify", "stock.report"],
  dispatch_staff: ["task.update.assigned"],
  ops_manager: [
    "task.update.any","task.verify","task.assign","task.create",
    "stock.update","stock.report","alert.resolve","report.view",
    "delivery.resolve","marketer.view","hr.view","regulatory.view",
  ],
  warehouse_supervisor: ["stock.update","stock.report","task.update.any","task.verify","report.view"],
  dispatch: ["task.update.assigned","delivery.resolve"],
  regulatory: ["regulatory.view","regulatory.edit","report.view","hr.view"],
  front_desk: [],
  general_manager: [
    "task.update.any","task.verify","stock.report","alert.resolve","report.view",
    "marketer.view","marketer.approve","hr.view","regulatory.view","delivery.resolve",
  ],
  procurement: ["stock.update","stock.report","report.view","regulatory.view"],
  hr: ["hr.view","hr.edit","regulatory.view"],
  telesales: ["marketer.view"],
  marketing_lead: ["marketer.view","marketer.approve","task.update.assigned"],
  marketing_supervisor: ["marketer.view","marketer.approve","task.update.assigned"],
};

export function can(role: Role, permission: Permission): boolean {
  return MATRIX[role].includes(permission);
}