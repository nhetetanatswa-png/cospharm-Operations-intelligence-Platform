// Live-timer state for the 7-step timed delivery workflow.
// Persists per-delivery step timings to localStorage.

export const STEP_TARGET_MINUTES: Record<number, number> = {
  1: 15,
  2: 30,
  3: 20,
  4: 15,
  5: 20,
  6: 25,
  7: 90, // dispatch → delivery confirmation
};

export const STEP_DEPARTMENT: Record<number, string> = {
  1: "Warehouse",
  2: "Warehouse",
  3: "Warehouse",
  4: "Warehouse",
  5: "Warehouse",
  6: "Dispatch",
  7: "Dispatch",
};

export type StepTiming = {
  startTime?: string; // ISO
  completionTime?: string; // ISO
  assignedPerson?: string;
  delayReason?: string;
};

export type DeliveryTimings = Record<string, Record<number, StepTiming>>;

const KEY = "cospharm_delivery_timings_v1";

export function loadTimings(): DeliveryTimings {
  if (typeof window === "undefined") return {};
  try {
    const raw = window.localStorage.getItem(KEY);
    return raw ? (JSON.parse(raw) as DeliveryTimings) : {};
  } catch { return {}; }
}

export function saveTimings(t: DeliveryTimings) {
  if (typeof window === "undefined") return;
  try { window.localStorage.setItem(KEY, JSON.stringify(t)); } catch { /* ignore */ }
}

export function elapsedMinutes(startIso: string, endIso?: string): number {
  const end = endIso ? new Date(endIso).getTime() : Date.now();
  return Math.max(0, (end - new Date(startIso).getTime()) / 60000);
}

export type StepRuntimeStatus = "NOT_STARTED" | "IN_PROGRESS" | "COMPLETED" | "DELAYED";

export function stepRuntimeStatus(step: { stepNumber: number }, timing?: StepTiming): {
  status: StepRuntimeStatus;
  actualMinutes?: number;
  target: number;
  delayed: boolean;
} {
  const target = STEP_TARGET_MINUTES[step.stepNumber] ?? 30;
  if (!timing?.startTime) return { status: "NOT_STARTED", target, delayed: false };
  const actual = elapsedMinutes(timing.startTime, timing.completionTime);
  const delayed = actual > target;
  if (timing.completionTime) {
    return { status: delayed ? "DELAYED" : "COMPLETED", actualMinutes: actual, target, delayed };
  }
  return { status: delayed ? "DELAYED" : "IN_PROGRESS", actualMinutes: actual, target, delayed };
}

/** Business-facing status from the 7 steps + timings. */
export type DeliveryUiStatus =
  | "Pending"
  | "Awaiting Dispatch"
  | "Dispatched"
  | "Completed";

export function deriveDeliveryUiStatus(
  timings: Record<number, StepTiming> | undefined,
): { label: DeliveryUiStatus; delayed: boolean } {
  const t = timings ?? {};
  const done = (n: number) => Boolean(t[n]?.completionTime);
  const started = (n: number) => Boolean(t[n]?.startTime);

  let delayed = false;
  for (let n = 1; n <= 7; n++) {
    const rs = stepRuntimeStatus({ stepNumber: n }, t[n]);
    if (rs.delayed) { delayed = true; break; }
  }

  if (done(7)) return { label: "Completed", delayed };
  if (started(7)) return { label: "Dispatched", delayed };
  if (done(5) || started(6)) return { label: "Awaiting Dispatch", delayed };
  return { label: "Pending", delayed };
}

export function formatMinutes(m?: number): string {
  if (m == null) return "—";
  if (m < 1) return `${Math.round(m * 60)}s`;
  if (m < 60) return `${m.toFixed(m < 10 ? 1 : 0)}m`;
  const h = Math.floor(m / 60);
  const rem = Math.round(m - h * 60);
  return `${h}h ${rem}m`;
}