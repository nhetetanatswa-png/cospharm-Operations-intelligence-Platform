// Deterministic backlog / overdue forecasting for each regulatory process.
// Pure function of the stored state + the hydrated clock: the same inputs always
// produce the same projection, so a demonstration never shows drifting numbers.

import { workingDaysBetween, workingDaysUntil } from "./workdays";
import { PROCESS_LABEL, slaFor } from "./logic";
import type { ProcessType, RegulatoryCase, RegulatoryQuery, RegulatoryState, RegTask } from "./types";

export type Confidence = "high" | "moderate" | "low";

export type ProcessForecast = {
  processType: ProcessType;
  label: string;
  /** Cases that are live right now. */
  backlogNow: number;
  /** Cases already past an internal or regulatory due date. */
  overdueNow: number;
  /** Projected live cases at each horizon. */
  backlogIn30: number;
  backlogIn60: number;
  backlogIn90: number;
  /** Cases forecast to breach a due date inside the horizon. */
  overdueIn30: number;
  overdueIn60: number;
  /** Completions per working day observed over the trailing window. */
  throughputPerWorkingDay: number;
  /** New cases opened per working day over the trailing window. */
  arrivalPerWorkingDay: number;
  /** Working days to clear the current backlog at observed throughput (null = no throughput). */
  clearanceWorkingDays: number | null;
  medianCycleDays: number | null;
  confidence: Confidence;
  confidenceReason: string;
  dataQuality: string[];
  basis: string;
};

const HORIZON_WORKING_DAYS = { d30: 21, d60: 42, d90: 64 };
const LOOKBACK_DAYS = 180;

function median(values: number[]): number | null {
  if (values.length === 0) return null;
  const s = [...values].sort((a, b) => a - b);
  const mid = Math.floor(s.length / 2);
  return s.length % 2 ? s[mid] : Math.round((s[mid - 1] + s[mid]) / 2);
}

const LIVE_EXCLUDED = ["draft", "closed", "withdrawn", "rejected"];

function isLive(c: RegulatoryCase) {
  return !LIVE_EXCLUDED.includes(c.status);
}

function dueDates(c: RegulatoryCase) {
  return [c.internalDueAt, c.regulatoryDueAt].filter(Boolean) as string[];
}

export function forecastProcess(
  processType: ProcessType,
  args: {
    cases: RegulatoryCase[];
    queries: RegulatoryQuery[];
    tasks: RegTask[];
    nowMs: number;
    holidays: string[];
    sla: RegulatoryState["sla"];
  },
): ProcessForecast {
  const { cases, queries, tasks, nowMs, holidays, sla } = args;
  const all = cases.filter((c) => c.processType === processType);
  const live = all.filter(isLive);
  const todayIso = new Date(nowMs).toISOString().slice(0, 10);
  const windowStart = new Date(nowMs - LOOKBACK_DAYS * 86_400_000).toISOString().slice(0, 10);
  const windowWorkingDays = Math.max(1, workingDaysBetween(windowStart, todayIso, holidays));

  // Observed completions: a decision recorded, or the case moved to a terminal status.
  const completed = all.filter((c) => {
    const at = (c.decisionAt ?? (LIVE_EXCLUDED.includes(c.status) && c.status !== "draft" ? c.updatedAt : undefined))?.slice(0, 10);
    return !!at && at >= windowStart && at <= todayIso;
  });
  const arrivals = all.filter((c) => c.openedAt.slice(0, 10) >= windowStart);

  const throughput = completed.length / windowWorkingDays;
  const arrival = arrivals.length / windowWorkingDays;

  const cycleDays = completed
    .filter((c) => c.decisionAt)
    .map((c) => Math.max(0, Math.round((new Date(c.decisionAt!).getTime() - new Date(c.openedAt).getTime()) / 86_400_000)));

  const project = (workingDays: number) =>
    Math.max(0, Math.round(live.length + arrival * workingDays - throughput * workingDays));

  const overdueNow = live.filter((c) => dueDates(c).some((d) => (workingDaysUntil(d, nowMs, holidays) ?? 0) < 0)).length;

  // A case breaches inside the horizon when its earliest due date lands inside the
  // horizon and the remaining runway is shorter than the median stage-to-decision time.
  const breachesWithin = (workingDays: number) =>
    live.filter((c) => {
      const dues = dueDates(c).map((d) => workingDaysUntil(d, nowMs, holidays)).filter((n): n is number => n !== null);
      if (dues.length === 0) return false;
      const earliest = Math.min(...dues);
      if (earliest < 0) return true;
      if (earliest > workingDays) return false;
      const rule = slaFor(sla, c.processType, c.subtypeOrPathway);
      const stageAge = workingDaysBetween(c.stageStartedAt, todayIso, holidays);
      const stageTarget = Math.max(3, Math.round((rule?.workingDays ?? 30) / 6));
      const openQueries = queries.filter(
        (q) => q.caseId === c.id && !["submitted", "accepted", "superseded"].includes(q.status),
      ).length;
      const openLateTasks = tasks.filter(
        (t) => t.caseId === c.id && t.status === "open" && t.dueAt && (workingDaysUntil(t.dueAt, nowMs, holidays) ?? 0) < 0,
      ).length;
      // Deterministic pressure score — no randomness, no time-of-day sensitivity.
      const pressure = stageAge / stageTarget + openQueries * 0.5 + openLateTasks * 0.5;
      return pressure >= 0.75 || earliest <= 3;
    }).length;

  const dataQuality: string[] = [];
  const missingDue = live.filter((c) => dueDates(c).length === 0).length;
  if (missingDue > 0) dataQuality.push(`${missingDue} live ${missingDue === 1 ? "case has" : "cases have"} no internal or regulatory due date — excluded from the breach projection.`);
  const missingSubmission = live.filter((c) => !c.actualSubmissionAt && c.currentStage.toLowerCase().includes("submitted")).length;
  if (missingSubmission > 0) dataQuality.push(`${missingSubmission} case(s) sit at a submitted stage without a recorded submission date.`);
  const paused = all.filter((c) => c.status === "paused").length;
  if (paused > 0) dataQuality.push(`${paused} paused case(s) hold stopped clocks and are projected at zero movement.`);
  if (completed.length === 0) dataQuality.push("No completions in the trailing 180 days — throughput is treated as zero.");
  if (cycleDays.length < 3) dataQuality.push("Fewer than three recorded decisions, so the median cycle time is indicative only.");
  if (dataQuality.length === 0) dataQuality.push("All live cases carry due dates and dated milestones — no gaps detected.");

  let confidence: Confidence = "low";
  let confidenceReason = "";
  if (completed.length >= 5 && missingDue === 0) {
    confidence = "high";
    confidenceReason = `${completed.length} completions and full due-date coverage over ${LOOKBACK_DAYS} days.`;
  } else if (completed.length >= 2) {
    confidence = "moderate";
    confidenceReason = `${completed.length} completions in the window${missingDue > 0 ? ` and ${missingDue} case(s) without due dates` : ""}.`;
  } else {
    confidenceReason = `Only ${completed.length} completion(s) in the trailing ${LOOKBACK_DAYS} days — treat the projection as directional.`;
  }

  return {
    processType,
    label: PROCESS_LABEL[processType],
    backlogNow: live.length,
    overdueNow,
    backlogIn30: project(HORIZON_WORKING_DAYS.d30),
    backlogIn60: project(HORIZON_WORKING_DAYS.d60),
    backlogIn90: project(HORIZON_WORKING_DAYS.d90),
    overdueIn30: breachesWithin(HORIZON_WORKING_DAYS.d30),
    overdueIn60: breachesWithin(HORIZON_WORKING_DAYS.d60),
    throughputPerWorkingDay: throughput,
    arrivalPerWorkingDay: arrival,
    clearanceWorkingDays: throughput > 0 ? Math.ceil(live.length / throughput) : null,
    medianCycleDays: median(cycleDays),
    confidence,
    confidenceReason,
    dataQuality,
    basis: `Trailing ${LOOKBACK_DAYS} days (${windowWorkingDays} working days): ${arrivals.length} opened, ${completed.length} completed. Horizons use ${HORIZON_WORKING_DAYS.d30}/${HORIZON_WORKING_DAYS.d60}/${HORIZON_WORKING_DAYS.d90} working days.`,
  };
}

export function forecastAll(args: {
  state: RegulatoryState;
  nowMs: number;
}): ProcessForecast[] {
  const { state, nowMs } = args;
  return (["registration", "variation", "exemption"] as ProcessType[]).map((p) =>
    forecastProcess(p, {
      cases: state.cases,
      queries: state.queries,
      tasks: state.tasks,
      nowMs,
      holidays: state.holidays,
      sla: state.sla,
    }),
  );
}

export const CONFIDENCE_LABEL: Record<Confidence, string> = {
  high: "High confidence",
  moderate: "Moderate confidence",
  low: "Low confidence",
};
