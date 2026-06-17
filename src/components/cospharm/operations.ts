import type { Delivery, DeliveryStatus, DispatchWindow, OperationStep, Role, StockItem, Task } from "./types";
import type { Status } from "./StatusBadge";

export const OPERATION_STEPS: OperationStep[] = [
  { stepNumber: 1, name: "Order / picking list received", allowedRoles: ["admin", "supervisor", "marketer"], completed: false },
  { stepNumber: 2, name: "Products picked from shelves", allowedRoles: ["admin", "supervisor", "warehouse_staff"], completed: false },
  { stepNumber: 3, name: "Batch numbers checked", allowedRoles: ["admin", "supervisor", "warehouse_checker"], completed: false },
  { stepNumber: 4, name: "Expiry dates checked", allowedRoles: ["admin", "supervisor", "warehouse_checker"], completed: false },
  { stepNumber: 5, name: "Quantity and stock integrity verified", allowedRoles: ["admin", "supervisor"], completed: false },
  { stepNumber: 6, name: "Packed and approved for dispatch", allowedRoles: ["admin", "supervisor", "dispatch_supervisor"], completed: false },
  { stepNumber: 7, name: "Dispatched / delivered confirmation", allowedRoles: ["admin", "supervisor", "dispatch_staff", "marketer"], completed: false },
];

export function makeSteps(initiallyCompleted = 0): OperationStep[] {
  return OPERATION_STEPS.map((s, i) => ({ ...s, completed: i < initiallyCompleted }));
}

export function getCompletedSteps(steps: OperationStep[]) {
  return steps.filter((s) => s.completed).length;
}

export function getProgressPercentage(steps: OperationStep[]) {
  return Math.round((getCompletedSteps(steps) / steps.length) * 100);
}

export function getCurrentStep(steps: OperationStep[]) {
  return steps.find((s) => !s.completed) ?? steps[steps.length - 1];
}

const GRADIENT = [
  { label: "Not started", tone: "bg-red-700 text-white", token: "0/7" },
  { label: "Critical start", tone: "bg-red-600 text-white", token: "1/7" },
  { label: "Very low progress", tone: "bg-orange-600 text-white", token: "2/7" },
  { label: "In progress", tone: "bg-orange-400 text-black", token: "3/7" },
  { label: "Midway", tone: "bg-yellow-400 text-black", token: "4/7" },
  { label: "Almost ready", tone: "bg-lime-300 text-black", token: "5/7" },
  { label: "Ready for completion", tone: "bg-green-300 text-black", token: "6/7" },
  { label: "Complete", tone: "bg-green-600 text-white", token: "7/7" },
];

export function getGradientStatus(steps: OperationStep[]) {
  return GRADIENT[Math.min(getCompletedSteps(steps), 7)];
}

export function canCompleteStep(step: OperationStep, role: Role): boolean {
  return step.allowedRoles.includes(role);
}

export function previousStepsCompleted(steps: OperationStep[], stepNumber: number): boolean {
  return steps.filter((s) => s.stepNumber < stepNumber).every((s) => s.completed);
}

export function completeStep(
  steps: OperationStep[],
  stepNumber: number,
  role: Role,
  userName: string,
  comment: string,
  override = false,
): OperationStep[] {
  const step = steps.find((s) => s.stepNumber === stepNumber);
  if (!step) throw new Error("Step not found.");
  if (!override && !canCompleteStep(step, role)) {
    throw new Error("You do not have permission to complete this step.");
  }
  if (!override && !previousStepsCompleted(steps, stepNumber)) {
    throw new Error("Previous steps must be completed first.");
  }
  if (!comment || comment.trim().length < 3) {
    throw new Error("A comment is required before completing this step.");
  }
  return steps.map((s) =>
    s.stepNumber === stepNumber
      ? { ...s, completed: true, completedBy: userName, completedAt: new Date().toISOString(), comment }
      : s,
  );
}

// ===== Dispatch windows + late delivery logic =====

export const DISPATCH_WINDOW_CUTOFFS: Record<DispatchWindow, string> = {
  MORNING: "10:30",
  AFTERNOON: "15:30",
  EMERGENCY: "23:59",
};

export const DISPATCH_WINDOW_LABELS: Record<DispatchWindow, { label: string; sub: string; emoji: string; badge: string }> = {
  MORNING: { label: "Morning", sub: "Ready by 07:30 · cutoff 10:30", emoji: "🌅", badge: "bg-blue-100 text-blue-800 border-blue-200" },
  AFTERNOON: { label: "Afternoon", sub: "Ready by 12:30 · cutoff 15:30", emoji: "🌇", badge: "bg-orange-100 text-orange-800 border-orange-200" },
  EMERGENCY: { label: "Emergency", sub: "Urgent — see emergency order", emoji: "🚨", badge: "bg-red-100 text-red-800 border-red-200 animate-pulse" },
};

export function getWindowCutoffDate(dueDate: string, window: DispatchWindow): Date {
  const [h, m] = DISPATCH_WINDOW_CUTOFFS[window].split(":").map(Number);
  const d = new Date(dueDate + "T00:00:00");
  d.setHours(h, m, 0, 0);
  return d;
}

export function shouldMarkLate(d: Delivery, now: Date = new Date()): boolean {
  if (d.status === "DELIVERED" || d.status === "DISPATCHED" || d.status === "LATE") return false;
  const cutoff = getWindowCutoffDate(d.dueDate, d.dispatchWindow ?? "AFTERNOON");
  return now > cutoff;
}

export function getWindowState(window: DispatchWindow, now: Date = new Date()): "UPCOMING" | "OPEN" | "CLOSED" {
  if (window === "EMERGENCY") return "OPEN";
  const today = now.toISOString().slice(0, 10);
  const cutoff = getWindowCutoffDate(today, window);
  const open = getWindowCutoffDate(today, window);
  open.setHours(window === "MORNING" ? 8 : 13, 0, 0, 0);
  if (now < open) return "UPCOMING";
  if (now > cutoff) return "CLOSED";
  return "OPEN";
}

// ===== Risk derivation =====

export function deriveDeliveryRisk(
  d: Delivery,
  tasks: Task[],
  stock: StockItem[],
): { risk: "READY" | "AT_RISK" | "BLOCKED"; reasons: string[] } {
  const reasons: string[] = [];
  let risk: "READY" | "AT_RISK" | "BLOCKED" = "READY";

  for (const id of d.requiredTaskIds) {
    const t = tasks.find((x) => x.id === id);
    if (!t) continue;
    if (t.status === "red") {
      risk = "BLOCKED";
      reasons.push(`Task ${t.id} (${t.title}) is overdue / red`);
    } else if (t.status === "yellow" && risk !== "BLOCKED") {
      risk = "AT_RISK";
      reasons.push(`Task ${t.id} (${t.title}) needs attention`);
    }
  }
  for (const id of d.requiredStockIds) {
    const s = stock.find((x) => x.id === id);
    if (!s) continue;
    if (s.status === "red") {
      risk = "BLOCKED";
      reasons.push(`Stock ${s.name} is critical (${s.issue ?? "low/expired/damaged"})`);
    } else if (s.status === "yellow" && risk !== "BLOCKED") {
      risk = "AT_RISK";
      reasons.push(`Stock ${s.name} low or minor issue`);
    }
  }
  return { risk, reasons };
}

export function deliveryStatusBadge(status: DeliveryStatus): { label: string; tone: Status } {
  switch (status) {
    case "DELIVERED":
      return { label: "Delivered", tone: "green" };
    case "DISPATCHED":
      return { label: "Dispatched", tone: "green" };
    case "IN_PROGRESS":
      return { label: "In progress", tone: "yellow" };
    case "PENDING":
      return { label: "Pending", tone: "yellow" };
    case "AT_RISK":
      return { label: "At risk", tone: "yellow" };
    case "BLOCKED":
      return { label: "Blocked", tone: "red" };
    case "LATE":
      return { label: "Late", tone: "red" };
  }
}