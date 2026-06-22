import type { CurrentUser, Role } from "./types";

export type StaffMember = {
  name: string;
  title: string;
  role: Role;
  shift?: "Morning" | "Afternoon" | "Night" | "All-day";
};

export const STAFF_ROSTER: StaffMember[] = [
  { name: "Mr. T", title: "Operations Manager", role: "ops_manager", shift: "All-day" },
  { name: "Legkotla P.", title: "Warehouse Supervisor", role: "warehouse_supervisor", shift: "Morning" },
  { name: "TT", title: "Dispatch", role: "dispatch", shift: "Morning" },
  { name: "Phuso", title: "Dispatch", role: "dispatch", shift: "Afternoon" },
  { name: "Tshepang", title: "Dispatch", role: "dispatch", shift: "Morning" },
  { name: "Tariro", title: "Regulatory", role: "regulatory", shift: "All-day" },
  { name: "Aman", title: "Regulatory", role: "regulatory", shift: "All-day" },
  { name: "Alaska", title: "Regulatory", role: "regulatory", shift: "All-day" },
  { name: "Pearl", title: "Front Desk", role: "front_desk", shift: "Morning" },
  { name: "Kells", title: "General Manager", role: "general_manager", shift: "All-day" },
  { name: "Mothusi", title: "IT", role: "admin", shift: "All-day" },
  { name: "Mpho", title: "Procurement Manager", role: "procurement", shift: "All-day" },
  { name: "Nametso", title: "HR", role: "hr", shift: "All-day" },
  { name: "Sofia", title: "Telesales", role: "telesales", shift: "Morning" },
  { name: "Bisa", title: "Marketer", role: "marketer", shift: "All-day" },
  { name: "Aobakwe", title: "Marketing Lead", role: "marketing_lead", shift: "All-day" },
  { name: "Lesego", title: "Marketing Supervisor", role: "marketing_supervisor", shift: "All-day" },
  { name: "Bakang", title: "Marketer", role: "marketer", shift: "All-day" },
  { name: "Lebo", title: "Marketer", role: "marketer", shift: "All-day" },
];

export const ROLE_USERS_FULL: Record<Role, CurrentUser> = (() => {
  const out: Partial<Record<Role, CurrentUser>> = {};
  for (const s of STAFF_ROSTER) {
    if (!out[s.role]) out[s.role] = { name: s.name, role: s.role };
  }
  // Fallbacks for legacy roles not in roster
  out.supervisor ??= { name: "Lesego", role: "supervisor" };
  out.staff ??= { name: "TT", role: "staff" };
  out.warehouse_staff ??= { name: "Legkotla P.", role: "warehouse_staff" };
  out.warehouse_checker ??= { name: "Legkotla P.", role: "warehouse_checker" };
  out.dispatch_supervisor ??= { name: "Mr. T", role: "dispatch_supervisor" };
  out.dispatch_staff ??= { name: "TT", role: "dispatch_staff" };
  return out as Record<Role, CurrentUser>;
})();