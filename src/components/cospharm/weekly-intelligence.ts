import type { Alert, AuditEntry, Comment, Delivery, StockItem, Task } from "./types";
import { damageValue, computeDiscrepancies, type DamageRecord, type InventoryCount } from "./inventory";
import { isBlocking, type KycRecord } from "./kyc";

const MS_DAY = 86_400_000;
export const SNAPSHOT_KEY = "cospharm_weekly_intelligence_v1";

export type Kpis = {
  totalDeliveries: number;
  completed: number;
  late: number;
  blocked: number;
  onTimeRate: number;
  completionRate: number;
  avgCycleHours: number;
  damageValueBWP: number;
  damageUnits: number;
  stockRedLines: number;
  kycBlocked: number;
  openAlerts: number;
  tasksCompleted: number;
  tasksOverdue: number;
  deliveriesPerStaff: number;
};

export type Forecast = {
  metric: string;
  value: string;
  method: string;
  confidence: "Low" | "Medium" | "High";
  caveat: string;
};

export type RootCause = { cause: string; count: number; examples: string[] };
export type AccountableAction = { action: string; owner: string; due: string; source: string };
export type Swot = { strengths: string[]; weaknesses: string[]; opportunities: string[]; threats: string[] };
export type Pestle = Record<"political" | "economic" | "social" | "technological" | "legal" | "environmental", string>;

export type WeeklySnapshot = {
  weekKey: string;
  weekStart: string;
  weekEnd: string;
  generatedAt: string;
  kpis: Kpis;
  daily: { day: string; delivered: number; late: number; created: number }[];
  forecasts: Forecast[];
  rootCauses: RootCause[];
  actions: AccountableAction[];
  swot: Swot;
  pestle: Pestle;
  dataQuality: { score: number; notes: string[] };
  executiveSummary: string;
  narrative?: string;
  narrativeSource?: "ai" | "deterministic";
};

// ===== week helpers =====

export function isoWeekKey(d: Date) {
  const dt = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()));
  const day = dt.getUTCDay() || 7;
  dt.setUTCDate(dt.getUTCDate() + 4 - day);
  const yearStart = new Date(Date.UTC(dt.getUTCFullYear(), 0, 1));
  const wk = Math.ceil(((dt.getTime() - yearStart.getTime()) / MS_DAY + 1) / 7);
  return `${dt.getUTCFullYear()}-W${String(wk).padStart(2, "0")}`;
}

/** Monday 00:00 UTC of the week containing `d`. */
export function weekStartOf(d: Date) {
  const dt = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()));
  const day = dt.getUTCDay() || 7;
  dt.setUTCDate(dt.getUTCDate() - (day - 1));
  return dt;
}

export function lastCompletedWeekStart(now = new Date()) {
  return new Date(weekStartOf(now).getTime() - 7 * MS_DAY);
}

/** The N most recent completed week starts, oldest first. */
export function completedWeekStarts(count: number, now = new Date()) {
  const last = lastCompletedWeekStart(now);
  return Array.from({ length: count }, (_, i) => new Date(last.getTime() - (count - 1 - i) * 7 * MS_DAY));
}

function fmtDate(d: Date) {
  return d.toISOString().slice(0, 10);
}

function within(iso: string | undefined, start: Date, end: Date) {
  if (!iso) return false;
  const t = new Date(iso).getTime();
  return !isNaN(t) && t >= start.getTime() && t < end.getTime();
}

// ===== deterministic snapshot =====

export type IntelligenceInputs = {
  deliveries: Delivery[];
  tasks: Task[];
  stock: StockItem[];
  counts: InventoryCount[];
  damages: DamageRecord[];
  kyc: KycRecord[];
  audit: AuditEntry[];
  alerts: Alert[];
  comments: Comment[];
  staffCount: number;
};

export function buildSnapshot(weekStart: Date, src: IntelligenceInputs): WeeklySnapshot {
  const weekEnd = new Date(weekStart.getTime() + 7 * MS_DAY);
  const inWeek = src.deliveries.filter((d) => {
    const t = new Date(d.dueDate).getTime();
    return !isNaN(t) && t >= weekStart.getTime() && t < weekEnd.getTime();
  });
  const scoped = inWeek.length ? inWeek : src.deliveries; // fall back to the live board when the week holds no dated rows
  const completed = scoped.filter((d) => d.status === "DELIVERED");
  const late = scoped.filter((d) => d.wasLate || d.status === "LATE");
  const blocked = scoped.filter((d) => d.status === "BLOCKED");
  const onTimeRate = completed.length ? Math.round((completed.filter((d) => !d.wasLate).length / completed.length) * 100) : 0;
  const completionRate = scoped.length ? Math.round((completed.length / scoped.length) * 100) : 0;

  const cycleMinutes = scoped.flatMap((d) => d.steps.map((s) => s.actualMinutes ?? 0));
  const avgCycleHours = cycleMinutes.length
    ? Math.round((scoped.reduce((sum, d) => sum + d.steps.reduce((s2, s) => s2 + (s.actualMinutes ?? 0), 0), 0) / Math.max(1, scoped.length) / 60) * 10) / 10
    : 0;

  const discrepancies = computeDiscrepancies(src.stock, src.counts);
  const kycBlocked = src.kyc.filter((r) => isBlocking(r.status)).length;

  const kpis: Kpis = {
    totalDeliveries: scoped.length,
    completed: completed.length,
    late: late.length,
    blocked: blocked.length,
    onTimeRate,
    completionRate,
    avgCycleHours,
    damageValueBWP: Math.round(damageValue(src.damages)),
    damageUnits: src.damages.reduce((s, d) => s + d.quantity, 0),
    stockRedLines: discrepancies.filter((d) => d.tone === "red").length,
    kycBlocked,
    openAlerts: src.alerts.filter((a) => !a.resolved).length,
    tasksCompleted: src.tasks.filter((t) => t.status === "green").length,
    tasksOverdue: src.tasks.filter((t) => t.status === "red").length,
    deliveriesPerStaff: src.staffCount ? Math.round((scoped.length / src.staffCount) * 10) / 10 : 0,
  };

  const daily = Array.from({ length: 7 }, (_, i) => {
    const day = new Date(weekStart.getTime() + i * MS_DAY);
    const iso = fmtDate(day);
    const dueThatDay = scoped.filter((d) => d.dueDate === iso);
    return {
      day: day.toLocaleDateString(undefined, { weekday: "short" }),
      delivered: dueThatDay.filter((d) => d.status === "DELIVERED").length,
      late: dueThatDay.filter((d) => d.wasLate || d.status === "LATE").length,
      created: dueThatDay.length,
    };
  });

  // Root causes — grouped delay reasons plus structural blockers
  const causeMap = new Map<string, string[]>();
  for (const d of scoped) {
    if (d.delayReason) causeMap.set(d.delayReason, [...(causeMap.get(d.delayReason) ?? []), `${d.id} ${d.customerName}`]);
    for (const s of d.steps) {
      if (s.delayed && s.delayReason) causeMap.set(s.delayReason, [...(causeMap.get(s.delayReason) ?? []), `${d.id} step ${s.stepNumber}`]);
    }
  }
  if (kpis.stockRedLines > 0) {
    causeMap.set("Stock figures unreliable (system vs physical count)", discrepancies.filter((d) => d.tone === "red").map((d) => d.name));
  }
  if (kycBlocked > 0) {
    causeMap.set("Customer compliance documents incomplete or lapsed", src.kyc.filter((r) => isBlocking(r.status)).slice(0, 5).map((r) => r.customer));
  }
  const rootCauses: RootCause[] = [...causeMap.entries()]
    .map(([cause, examples]) => ({ cause, count: examples.length, examples: examples.slice(0, 4) }))
    .sort((a, b) => b.count - a.count)
    .slice(0, 6);

  const dueIso = fmtDate(new Date(weekEnd.getTime() + 5 * MS_DAY));
  const actions: AccountableAction[] = [];
  if (kpis.late > 0) actions.push({ action: `Review the ${kpis.late} late delivery/deliveries and confirm a documented delay reason for each`, owner: "Dispatch supervisor", due: dueIso, source: "Deliveries" });
  if (kpis.stockRedLines > 0) actions.push({ action: `Recount ${kpis.stockRedLines} red stock line(s) and correct the system figure`, owner: "Warehouse supervisor", due: dueIso, source: "Inventory integrity" });
  if (kycBlocked > 0) actions.push({ action: `Clear KYC for ${kycBlocked} customer account(s) before further orders are released`, owner: "Regulatory officer", due: dueIso, source: "Compliance & KYC" });
  if (kpis.damageValueBWP > 0) actions.push({ action: `Raise supplier claims for P${kpis.damageValueBWP.toLocaleString()} of damaged stock`, owner: "Procurement", due: dueIso, source: "Damages register" });
  if (kpis.tasksOverdue > 0) actions.push({ action: `Reassign or close ${kpis.tasksOverdue} overdue assignment(s)`, owner: "Operations manager", due: dueIso, source: "Work assignments" });
  if (actions.length === 0) actions.push({ action: "No corrective action required — hold current controls and re-check next week", owner: "Operations manager", due: dueIso, source: "All modules" });

  // Data quality
  const qNotes: string[] = [];
  let score = 100;
  if (!inWeek.length) { score -= 35; qNotes.push("No deliveries carried a due date inside this week, so the live board was used as a proxy. Treat volumes as indicative."); }
  const missingReasons = late.filter((d) => !d.delayReason).length;
  if (missingReasons) { score -= Math.min(20, missingReasons * 5); qNotes.push(`${missingReasons} late delivery/deliveries have no recorded delay reason, weakening root-cause analysis.`); }
  const timedSteps = scoped.flatMap((d) => d.steps).filter((s) => s.actualMinutes != null).length;
  if (timedSteps < scoped.length * 3) { score -= 15; qNotes.push("Fewer than half the workflow steps have recorded timings, so cycle-time figures are partial."); }
  if (src.damages.length === 0) { score -= 5; qNotes.push("No damage records this week — confirm this reflects reality rather than under-reporting."); }
  qNotes.push("All figures are computed in the browser from local operational state; this is not a warehouse-management-system extract.");
  const dataQuality = { score: Math.max(20, score), notes: qNotes };

  const swot: Swot = {
    strengths: [
      `${kpis.completionRate}% of scoped deliveries reached completion`,
      onTimeRate >= 80 ? `On-time performance held at ${onTimeRate}%` : `${kpis.tasksCompleted} assignments closed and verified`,
      "Seven-step workflow gives step-level accountability for every order",
    ],
    weaknesses: [
      kpis.late > 0 ? `${kpis.late} late delivery/deliveries against dispatch cutoffs` : "Delay reasons are recorded inconsistently",
      kpis.stockRedLines > 0 ? `${kpis.stockRedLines} stock line(s) where system and physical counts disagree` : "Stock counts rely on manual entry",
      kpis.damageValueBWP > 0 ? `P${kpis.damageValueBWP.toLocaleString()} lost to damages` : "Damage reporting depends on staff initiative",
    ],
    opportunities: [
      "Tighten the slowest workflow step to release capacity without extra headcount",
      "Convert verified KYC customers into standing-order accounts",
      "Use field-log outcomes to prioritise marketer visits by conversion",
    ],
    threats: [
      kycBlocked > 0 ? `${kycBlocked} customer account(s) trading with incomplete compliance documents` : "Regulatory document lapses",
      "Cold-chain excursions and expiry write-offs",
      "Dependence on a small number of warehouse staff for peak-day coverage",
    ],
  };

  const pestle: Pestle = {
    political: "Botswana public-health procurement cycles and tender timing drive demand peaks for hospital and clinic customers.",
    economic: `Damage and late-delivery costs of roughly P${kpis.damageValueBWP.toLocaleString()} this week are margin, not overhead — they are the fastest recoverable saving.`,
    social: "Customer expectation is same-window delivery; missed cutoffs are remembered longer than the delay itself.",
    technological: "Operational state is browser-local. A shared backend would remove double-entry and make these reports auditable across users.",
    legal: "Wholesale licensing, controlled-substance records and customer KYC must be defensible at inspection.",
    environmental: "Cold-chain integrity and route efficiency drive both compliance risk and fuel cost.",
  };

  const executiveSummary = [
    `In the week of ${fmtDate(weekStart)} to ${fmtDate(new Date(weekEnd.getTime() - MS_DAY))}, ${kpis.totalDeliveries} deliveries were in scope, of which ${kpis.completed} completed (${kpis.completionRate}%) and ${kpis.late} ran late.`,
    `On-time performance was ${onTimeRate}% against an average order cycle of ${avgCycleHours} hours, or ${kpis.deliveriesPerStaff} deliveries per member of staff.`,
    kpis.stockRedLines > 0
      ? `${kpis.stockRedLines} stock line(s) show a material gap between the system figure and the physical count, so customer-facing availability cannot be trusted on those SKUs.`
      : "System, warehouse and customer-facing stock figures were in agreement across all counted lines.",
    kpis.damageValueBWP > 0 ? `Damages removed about P${kpis.damageValueBWP.toLocaleString()} of value across ${kpis.damageUnits} units.` : "No damage value was written off this week.",
    kycBlocked > 0 ? `${kycBlocked} customer account(s) are trading with expired, missing or flagged compliance documents and should be held.` : "The customer compliance register carried no blocking exceptions.",
    `Data quality for this report is scored ${dataQuality.score}/100.`,
  ].join(" ");

  return {
    weekKey: isoWeekKey(weekStart),
    weekStart: fmtDate(weekStart),
    weekEnd: fmtDate(new Date(weekEnd.getTime() - MS_DAY)),
    generatedAt: new Date().toISOString(),
    kpis,
    daily,
    forecasts: [],
    rootCauses,
    actions,
    swot,
    pestle,
    dataQuality,
    executiveSummary,
    narrativeSource: "deterministic",
  };
}

/** Simple least-squares trend over archived weeks; confidence scales with history depth. */
export function buildForecasts(history: WeeklySnapshot[], current: WeeklySnapshot): Forecast[] {
  const series = [...history.filter((h) => h.weekKey !== current.weekKey), current];
  const n = series.length;
  const confidence: Forecast["confidence"] = n >= 6 ? "High" : n >= 3 ? "Medium" : "Low";
  const caveat =
    n >= 6
      ? "Based on six or more archived weeks; still browser-local data."
      : n >= 3
        ? "Based on a short history — direction is more reliable than the exact number."
        : "Only one or two weeks on record. Treat this as a placeholder until more weeks are archived.";

  function project(pick: (s: WeeklySnapshot) => number, label: string, unit: string): Forecast {
    const ys = series.map(pick);
    if (ys.length < 2) return { metric: label, value: `${Math.round(ys[0] ?? 0)}${unit}`, method: "Carry-forward of the current week", confidence: "Low", caveat };
    const xs = ys.map((_, i) => i);
    const mx = xs.reduce((a, b) => a + b, 0) / n;
    const my = ys.reduce((a, b) => a + b, 0) / n;
    const denom = xs.reduce((a, x) => a + (x - mx) ** 2, 0) || 1;
    const slope = xs.reduce((a, x, i) => a + (x - mx) * (ys[i] - my), 0) / denom;
    const next = my + slope * (n - mx);
    return {
      metric: label,
      value: `${Math.round(Math.max(0, next) * 10) / 10}${unit}`,
      method: `Least-squares trend over ${n} week(s), slope ${slope >= 0 ? "+" : ""}${Math.round(slope * 10) / 10}/week`,
      confidence,
      caveat,
    };
  }

  return [
    project((s) => s.kpis.totalDeliveries, "Delivery volume next week", ""),
    project((s) => s.kpis.onTimeRate, "On-time rate next week", "%"),
    project((s) => s.kpis.late, "Late deliveries next week", ""),
    project((s) => s.kpis.damageValueBWP, "Damage value next week", " BWP"),
  ];
}

// ===== archive =====

export function loadArchive(): WeeklySnapshot[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = window.localStorage.getItem(SNAPSHOT_KEY);
    const parsed = raw ? (JSON.parse(raw) as WeeklySnapshot[]) : [];
    return Array.isArray(parsed) ? parsed.sort((a, b) => a.weekStart.localeCompare(b.weekStart)) : [];
  } catch {
    return [];
  }
}

export function saveArchive(list: WeeklySnapshot[]) {
  if (typeof window === "undefined") return;
  try { window.localStorage.setItem(SNAPSHOT_KEY, JSON.stringify(list.slice(-26))); } catch { /* ignore */ }
}

export function upsertSnapshot(snap: WeeklySnapshot) {
  const list = loadArchive().filter((s) => s.weekKey !== snap.weekKey);
  const next = [...list, snap].sort((a, b) => a.weekStart.localeCompare(b.weekStart));
  saveArchive(next);
  return next;
}

/** Generate any completed weeks (up to `depth`) that are not yet archived. */
export function backfillArchive(src: IntelligenceInputs, depth = 6): WeeklySnapshot[] {
  const existing = loadArchive();
  const have = new Set(existing.map((s) => s.weekKey));
  const missing = completedWeekStarts(depth).filter((d) => !have.has(isoWeekKey(d)));
  if (missing.length === 0) return existing;
  const built = missing.map((d) => buildSnapshot(d, src));
  const next = [...existing, ...built].sort((a, b) => a.weekStart.localeCompare(b.weekStart));
  saveArchive(next);
  return next;
}

// ===== export =====

export function snapshotToMarkdown(s: WeeklySnapshot) {
  const L: string[] = [];
  L.push(`# Cospharm weekly intelligence — ${s.weekKey}`);
  L.push(`_Week of ${s.weekStart} to ${s.weekEnd}. Generated ${new Date(s.generatedAt).toLocaleString()}._`);
  L.push("", "## Executive summary", s.executiveSummary);
  if (s.narrative) L.push("", "## Narrative analysis", s.narrative, "", `_Narrative source: ${s.narrativeSource === "ai" ? "AI-generated from the deterministic figures above" : "rule-based"}._`);
  L.push("", "## Operational KPIs");
  L.push("| Metric | Value |", "| --- | --- |");
  L.push(`| Deliveries in scope | ${s.kpis.totalDeliveries} |`);
  L.push(`| Completed | ${s.kpis.completed} (${s.kpis.completionRate}%) |`);
  L.push(`| Late | ${s.kpis.late} |`);
  L.push(`| Blocked | ${s.kpis.blocked} |`);
  L.push(`| On-time rate | ${s.kpis.onTimeRate}% |`);
  L.push(`| Average cycle | ${s.kpis.avgCycleHours} h |`);
  L.push(`| Deliveries per staff member | ${s.kpis.deliveriesPerStaff} |`);
  L.push(`| Damage value | P${s.kpis.damageValueBWP.toLocaleString()} (${s.kpis.damageUnits} units) |`);
  L.push(`| Red stock lines | ${s.kpis.stockRedLines} |`);
  L.push(`| KYC-blocked customers | ${s.kpis.kycBlocked} |`);
  L.push(`| Open alerts | ${s.kpis.openAlerts} |`);
  L.push("", "## Daily activity");
  L.push("| Day | Due | Delivered | Late |", "| --- | --- | --- | --- |");
  for (const d of s.daily) L.push(`| ${d.day} | ${d.created} | ${d.delivered} | ${d.late} |`);
  L.push("", "## Forecasts");
  for (const f of s.forecasts) L.push(`- **${f.metric}: ${f.value}** — ${f.method}. Confidence: ${f.confidence}. ${f.caveat}`);
  L.push("", "## Data quality", `Score: ${s.dataQuality.score}/100`);
  for (const n of s.dataQuality.notes) L.push(`- ${n}`);
  L.push("", "## Root causes");
  for (const r of s.rootCauses) L.push(`- **${r.cause}** (${r.count}) — e.g. ${r.examples.join("; ")}`);
  if (s.rootCauses.length === 0) L.push("- None identified from recorded data.");
  L.push("", "## SWOT");
  L.push("**Strengths**"); for (const x of s.swot.strengths) L.push(`- ${x}`);
  L.push("**Weaknesses**"); for (const x of s.swot.weaknesses) L.push(`- ${x}`);
  L.push("**Opportunities**"); for (const x of s.swot.opportunities) L.push(`- ${x}`);
  L.push("**Threats**"); for (const x of s.swot.threats) L.push(`- ${x}`);
  L.push("", "## PESTLE");
  for (const [k, v] of Object.entries(s.pestle)) L.push(`- **${k[0].toUpperCase()}${k.slice(1)}**: ${v}`);
  L.push("", "## Accountable actions");
  L.push("| Action | Owner | Due | Source |", "| --- | --- | --- | --- |");
  for (const a of s.actions) L.push(`| ${a.action} | ${a.owner} | ${a.due} | ${a.source} |`);
  return L.join("\n");
}

export function archiveToCsv(list: WeeklySnapshot[]) {
  const head = [
    "week", "week_start", "week_end", "deliveries", "completed", "late", "blocked",
    "on_time_rate", "completion_rate", "avg_cycle_hours", "deliveries_per_staff",
    "damage_value_bwp", "damage_units", "red_stock_lines", "kyc_blocked", "open_alerts", "data_quality",
  ].join(",");
  const rows = list.map((s) =>
    [
      s.weekKey, s.weekStart, s.weekEnd, s.kpis.totalDeliveries, s.kpis.completed, s.kpis.late, s.kpis.blocked,
      s.kpis.onTimeRate, s.kpis.completionRate, s.kpis.avgCycleHours, s.kpis.deliveriesPerStaff,
      s.kpis.damageValueBWP, s.kpis.damageUnits, s.kpis.stockRedLines, s.kpis.kycBlocked, s.kpis.openAlerts, s.dataQuality.score,
    ].join(","),
  );
  return [head, ...rows].join("\n");
}

export function downloadText(filename: string, text: string, mime = "text/markdown") {
  const blob = new Blob([text], { type: `${mime};charset=utf-8` });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}