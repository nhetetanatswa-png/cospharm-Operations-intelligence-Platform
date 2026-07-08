import { STAFF_ROSTER } from "./staff";

export type PresenceStatus = "PRESENT" | "ABSENT" | "OUT";
export type PresenceArea = "Warehouse" | "Office" | "Field";

export type PresenceRecord = {
  name: string;
  role: string;
  area: PresenceArea;
  status: PresenceStatus;
  delegatedTo?: string;
  delegationReason?: string;
  expectedReturn?: string;
  notes?: string;
  activeTasks?: string[];
};

const AREA_BY_ROLE: Record<string, PresenceArea> = {
  warehouse_supervisor: "Warehouse",
  warehouse_staff: "Warehouse",
  warehouse_checker: "Warehouse",
  dispatch: "Warehouse",
  dispatch_staff: "Warehouse",
  dispatch_supervisor: "Warehouse",
  procurement: "Warehouse",
  regulatory: "Office",
  front_desk: "Office",
  general_manager: "Office",
  ops_manager: "Office",
  admin: "Office",
  telesales: "Office",
  marketing_lead: "Office",
  marketing_supervisor: "Office",
  marketer: "Field",
  hr: "Office",
  staff: "Warehouse",
  supervisor: "Office",
};

export const INITIAL_PRESENCE: PresenceRecord[] = STAFF_ROSTER
  .filter((s) => s.role !== "hr") // HR module removed — HR staff hidden
  .map((s, i) => ({
    name: s.name,
    role: s.title,
    area: AREA_BY_ROLE[s.role] ?? "Office",
    // Seed a realistic mix
    status: (i % 7 === 3 ? "OUT" : i % 5 === 4 ? "ABSENT" : "PRESENT") as PresenceStatus,
    activeTasks: [],
  }));

const KEY = "cospharm_presence_v1";

export function loadPresence(): PresenceRecord[] {
  if (typeof window === "undefined") return INITIAL_PRESENCE;
  try {
    const raw = window.localStorage.getItem(KEY);
    if (!raw) return INITIAL_PRESENCE;
    const parsed = JSON.parse(raw) as PresenceRecord[];
    if (!Array.isArray(parsed) || parsed.length === 0) return INITIAL_PRESENCE;
    return parsed;
  } catch {
    return INITIAL_PRESENCE;
  }
}

export function savePresence(list: PresenceRecord[]) {
  if (typeof window === "undefined") return;
  try { window.localStorage.setItem(KEY, JSON.stringify(list)); } catch { /* ignore */ }
}