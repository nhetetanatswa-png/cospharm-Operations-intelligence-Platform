// ============================================================================
// SINGLE SOURCE OF TRUTH for delivery classification.
//
// Rule: `delivery.status` is the primary business status. Recorded step timings
// only ENRICH it (cycle time, delayed steps, progress) — they can never demote a
// DELIVERED or DISPATCHED record back to "pending" just because the browser has
// no timing history for it.
// ============================================================================

import type { Delivery, DeliveryStatus } from "./types";
import {
  STEP_TARGET_MINUTES,
  elapsedMinutes,
  stepRuntimeStatus,
  type DeliveryTimings,
  type StepTiming,
} from "./delivery-timing";
import { getCompletedSteps } from "./operations";

export type Lifecycle = "Completed" | "Dispatched" | "Awaiting Dispatch" | "Pending";

export type ResolvedDelivery = {
  d: Delivery;
  /** Primary business status, straight off the record. */
  status: DeliveryStatus;
  lifecycle: Lifecycle;
  completed: boolean;
  dispatched: boolean;
  awaitingDispatch: boolean;
  pending: boolean;
  blocked: boolean;
  late: boolean;
  atRisk: boolean;
  /** Late, blocked, or any step that overran its target. */
  delayed: boolean;
  stepsCompleted: number;
  /** End-to-end minutes, only when step 1 start AND step 7 completion exist. */
  cycleMinutes?: number;
  /** Step numbers that overran their target. */
  delayedSteps: number[];
  delayReason?: string;
  timings: Record<number, StepTiming>;
};

const TERMINAL: DeliveryStatus[] = ["DELIVERED", "DISPATCHED"];

function lifecycleFrom(d: Delivery, timings: Record<number, StepTiming>): Lifecycle {
  if (d.status === "DELIVERED") return "Completed";
  if (d.status === "DISPATCHED") return "Dispatched";

  // Non-terminal: take the furthest point evidenced by either the step list or timings.
  const stepDone = getCompletedSteps(d.steps);
  const timingDone = (n: number) => Boolean(timings[n]?.completionTime);
  const timingStarted = (n: number) => Boolean(timings[n]?.startTime);

  if (timingDone(7)) return "Completed";
  if (timingStarted(7) || stepDone >= 7) return "Dispatched";
  if (stepDone >= 5 || timingDone(5) || timingStarted(6)) return "Awaiting Dispatch";
  return "Pending";
}

export function resolveDelivery(d: Delivery, all: DeliveryTimings): ResolvedDelivery {
  const timings = all[d.id] ?? {};
  const lifecycle = lifecycleFrom(d, timings);

  const delayedSteps: number[] = [];
  for (let n = 1; n <= 7; n++) {
    const t = timings[n];
    if (!t?.startTime) continue;
    if (stepRuntimeStatus({ stepNumber: n }, t).delayed) delayedSteps.push(n);
  }

  const late = d.status === "LATE" || Boolean(d.wasLate && d.status !== "DELIVERED");
  const blocked = d.status === "BLOCKED";
  const atRisk = d.status === "AT_RISK";

  let cycleMinutes: number | undefined;
  if (timings[1]?.startTime && timings[7]?.completionTime) {
    cycleMinutes = elapsedMinutes(timings[1].startTime, timings[7].completionTime);
  }

  return {
    d,
    status: d.status,
    lifecycle,
    completed: lifecycle === "Completed",
    dispatched: lifecycle === "Dispatched",
    awaitingDispatch: lifecycle === "Awaiting Dispatch",
    pending: lifecycle === "Pending",
    blocked,
    late,
    atRisk,
    delayed: late || blocked || delayedSteps.length > 0,
    stepsCompleted: Math.max(getCompletedSteps(d.steps), highestTimingStep(timings)),
    cycleMinutes,
    delayedSteps,
    delayReason: d.delayReason,
    timings,
  };
}

function highestTimingStep(timings: Record<number, StepTiming>): number {
  let highest = 0;
  for (let n = 1; n <= 7; n++) if (timings[n]?.completionTime) highest = n;
  return highest;
}

export function resolveAll(deliveries: Delivery[], timings: DeliveryTimings): ResolvedDelivery[] {
  return deliveries.map((d) => resolveDelivery(d, timings));
}

/** A delivery still on the operational floor (not a historical, closed record). */
export function isActiveDelivery(r: ResolvedDelivery, todayIso: string): boolean {
  if (!TERMINAL.includes(r.status)) return true;
  return r.d.dueDate >= todayIso;
}

// ===== Aggregation =====

export type DeliveryTotals = {
  total: number;
  dueToday: number;
  completed: number;
  completedToday: number;
  dispatched: number;
  awaitingDispatch: number;
  pending: number;
  atRisk: number;
  blocked: number;
  late: number;
  /** completed cycles with usable timing history */
  cycleSamples: number;
  avgCycleMinutes?: number;
  onTimeRate?: number;
  completionRate?: number;
  delayedRate?: number;
  backlog: number;
};

export const MIN_CYCLE_SAMPLES = 3;

export function summarise(list: ResolvedDelivery[], todayIso: string): DeliveryTotals {
  const cycles = list.map((r) => r.cycleMinutes).filter((n): n is number => typeof n === "number");
  const completedList = list.filter((r) => r.completed);
  const onTime = completedList.filter((r) => !r.delayed).length;
  const active = list.filter((r) => !r.completed);

  return {
    total: list.length,
    dueToday: list.filter((r) => r.d.dueDate === todayIso).length,
    completed: completedList.length,
    completedToday: completedList.filter((r) => r.d.dueDate === todayIso).length,
    dispatched: list.filter((r) => r.dispatched).length,
    awaitingDispatch: list.filter((r) => r.awaitingDispatch).length,
    pending: list.filter((r) => r.pending).length,
    atRisk: list.filter((r) => r.atRisk).length,
    blocked: list.filter((r) => r.blocked).length,
    late: list.filter((r) => r.late).length,
    cycleSamples: cycles.length,
    avgCycleMinutes: cycles.length >= MIN_CYCLE_SAMPLES
      ? cycles.reduce((a, b) => a + b, 0) / cycles.length
      : undefined,
    onTimeRate: completedList.length ? Math.round((onTime / completedList.length) * 100) : undefined,
    completionRate: list.length ? Math.round((completedList.length / list.length) * 100) : undefined,
    delayedRate: list.length
      ? Math.round((list.filter((r) => r.delayed && !r.completed).length / list.length) * 100)
      : undefined,
    backlog: active.filter((r) => !r.dispatched).length,
  };
}

/** Ranked bottleneck list: which of the 7 steps overran target most often. */
export function bottlenecks(list: ResolvedDelivery[]): {
  step: number;
  delays: number;
  samples: number;
  avgMinutes?: number;
  target: number;
}[] {
  const out: Record<number, { delays: number; durations: number[] }> = {};
  for (const r of list) {
    for (let n = 1; n <= 7; n++) {
      const t = r.timings[n];
      if (!t?.startTime) continue;
      const bucket = (out[n] ??= { delays: 0, durations: [] });
      if (r.delayedSteps.includes(n)) bucket.delays += 1;
      if (t.completionTime) bucket.durations.push(elapsedMinutes(t.startTime, t.completionTime));
    }
  }
  return Object.entries(out)
    .map(([k, v]) => ({
      step: Number(k),
      delays: v.delays,
      samples: v.durations.length,
      avgMinutes: v.durations.length
        ? v.durations.reduce((a, b) => a + b, 0) / v.durations.length
        : undefined,
      target: STEP_TARGET_MINUTES[Number(k)] ?? 30,
    }))
    .sort((a, b) => b.delays - a.delays || b.step - a.step);
}

export function topDelayReason(list: ResolvedDelivery[]): { reason: string; count: number } | undefined {
  const tally: Record<string, number> = {};
  for (const r of list) {
    const reasons = [r.delayReason, ...Object.values(r.timings).map((t) => t.delayReason)];
    for (const reason of reasons) {
      if (!reason) continue;
      tally[reason] = (tally[reason] ?? 0) + 1;
    }
  }
  const top = Object.entries(tally).sort((a, b) => b[1] - a[1])[0];
  return top ? { reason: top[0], count: top[1] } : undefined;
}
