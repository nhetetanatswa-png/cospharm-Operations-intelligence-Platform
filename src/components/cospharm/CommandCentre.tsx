import { useEffect, useMemo, useState } from "react";
import { createPortal } from "react-dom";
import {
  AlertTriangle, ArrowRight, Copy, Gauge, LineChart,
  Printer, Sparkles, Target, Truck,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";
import { StatusBadge, StatusDot, type Status } from "./StatusBadge";
import { NO_DATA, countLabel, formatDay, formatRelative, plural } from "./clock";
import { formatMinutes, STEP_TARGET_MINUTES } from "./delivery-timing";
import { MIN_CYCLE_SAMPLES, bottlenecks, summarise, topDelayReason, type ResolvedDelivery } from "./delivery-status";
import { OPERATION_STEPS, DISPATCH_WINDOW_CUTOFFS } from "./operations";
import { TARGET_DELIVERIES_PER_DAY } from "./seed-data";
import type { Alert, AuditEntry, EmergencyOrder, StockItem, Task } from "./types";

type Severity = "red" | "yellow";

export type Decision = {
  key: string;
  severity: Severity;
  issue: string;
  impact: string;
  owner: string;
  deadline: string;
  action: string;
  state: string;
  open: () => void;
};

export type OverallStatus = { tone: Status; label: string; reason: string };

export function CommandCentre({
  now, userName, resolved, todayIso, tasks, stock, emergencyOrders, alerts, audit,
  onOpenDelivery, onOpenTask, onOpenStock, onOpenEmergency,
}: {
  now: number;
  userName: string;
  resolved: ResolvedDelivery[];
  todayIso: string;
  tasks: Task[];
  stock: StockItem[];
  emergencyOrders: EmergencyOrder[];
  alerts: Alert[];
  audit: AuditEntry[];
  onOpenDelivery: (id: string) => void;
  onOpenTask: (id: string) => void;
  onOpenStock: (id: string) => void;
  onOpenEmergency: () => void;
}) {
  const [showAllDecisions, setShowAllDecisions] = useState(false);
  const [copied, setCopied] = useState(false);

  const totals = useMemo(() => summarise(resolved, todayIso), [resolved, todayIso]);
  const today = useMemo(() => resolved.filter((r) => r.d.dueDate === todayIso), [resolved, todayIso]);
  const todayTotals = useMemo(() => summarise(today, todayIso), [today, todayIso]);

  const openEmergencies = emergencyOrders.filter((o) => !["DELIVERED", "CANCELLED"].includes(o.status));
  const unresolvedEmergencies = openEmergencies.filter((o) => o.status === "PENDING_APPROVAL");
  const criticalStock = stock.filter((s) => s.status === "red");
  const watchStock = stock.filter((s) => s.status === "yellow");
  const overdueTasks = tasks.filter((t) => t.status === "red");
  const pendingVerifications = tasks.filter((t) => t.pendingVerification);
  const openRedAlerts = alerts.filter((a) => a.severity === "red" && !a.resolved);

  const overall = useMemo<OverallStatus>(() => {
    const reasons: string[] = [];
    if (todayTotals.blocked > 0) reasons.push(`${countLabel(todayTotals.blocked, "delivery")} blocked`);
    if (unresolvedEmergencies.length) reasons.push(`${countLabel(unresolvedEmergencies.length, "emergency order")} unresolved`);
    if (criticalStock.length) reasons.push(`${countLabel(criticalStock.length, "stock line")} critical`);
    if (totals.late > 0) reasons.push(`${countLabel(totals.late, "dispatch commitment")} missed`);
    if (reasons.length) {
      return { tone: "red", label: "Red — intervention required", reason: reasons.join("; ") };
    }
    const belowTarget = todayTotals.completedToday < TARGET_DELIVERIES_PER_DAY;
    const yellowReasons: string[] = [];
    if (todayTotals.atRisk > 0) yellowReasons.push(`${countLabel(todayTotals.atRisk, "delivery")} at risk`);
    if (watchStock.length) yellowReasons.push(`${countLabel(watchStock.length, "stock line")} on watch`);
    if (belowTarget) yellowReasons.push(`${todayTotals.completedToday} of ${TARGET_DELIVERIES_PER_DAY} completed against today's target`);
    if (yellowReasons.length) {
      return { tone: "yellow", label: "Yellow — under pressure", reason: yellowReasons.join("; ") };
    }
    return { tone: "green", label: "Green — on target", reason: "No blocked or late deliveries and today's target is being met." };
  }, [todayTotals, unresolvedEmergencies.length, criticalStock.length, watchStock.length, totals.late]);

  // ===== Section 2 — decisions =====
  const decisions = useMemo<Decision[]>(() => {
    const out: Decision[] = [];

    for (const r of resolved) {
      if (!r.blocked && !r.late) continue;
      const windowCutoff = DISPATCH_WINDOW_CUTOFFS[r.d.dispatchWindow ?? "AFTERNOON"];
      out.push({
        key: `d-${r.d.id}`,
        severity: "red",
        issue: `${r.blocked ? "Blocked" : "Missed cutoff"}: ${r.d.id} · ${r.d.customerName}`,
        impact: r.blocked
          ? "Customer order cannot be packed — supply commitment at risk."
          : "Delivery commitment already missed; customer confidence exposed.",
        owner: r.d.responsibleDept ?? r.d.assignedOps ?? "Operations",
        deadline: `${formatDay(r.d.dueDate)} · cutoff ${windowCutoff}`,
        action: r.blocked
          ? "Authorise a substitute line or a partial dispatch, and confirm the supplier recovery date."
          : "Confirm the recorded delay reason, notify the customer, and re-slot into the next window.",
        state: r.delayReason ? "Reason recorded" : "Reason outstanding",
        open: () => onOpenDelivery(r.d.id),
      });
    }

    for (const o of unresolvedEmergencies) {
      out.push({
        key: `e-${o.id}`,
        severity: "red",
        issue: `Emergency order awaiting approval: ${o.id} · ${o.customerName}`,
        impact: o.reason,
        owner: `Raised by ${o.orderedBy}`,
        deadline: `Raised ${formatRelative(o.orderedAt, now)}`,
        action: "Approve or decline, then assign a driver and an ETA.",
        state: "Pending approval",
        open: onOpenEmergency,
      });
    }

    for (const s of criticalStock) {
      const affected = resolved.filter((r) => r.d.requiredStockIds.includes(s.id) && !r.completed);
      out.push({
        key: `s-${s.id}`,
        severity: "red",
        issue: `Critical stock: ${s.name}`,
        impact: affected.length
          ? `Blocks ${countLabel(affected.length, "open delivery")} (${affected.map((r) => r.d.customerName).join(", ")}).`
          : (s.issue ?? "On-hand below the level needed to fulfil orders."),
        owner: "Procurement",
        deadline: `On hand ${s.onHand} · reorder at ${s.reorder}`,
        action: "Raise an emergency purchase order or approve a clinically equivalent substitution.",
        state: s.issue ?? "Critical",
        open: () => onOpenStock(s.id),
      });
    }

    for (const a of openRedAlerts) {
      out.push({
        key: `a-${a.id}`,
        severity: "red",
        issue: a.title,
        impact: a.body,
        owner: "Operations",
        deadline: formatRelative(a.createdAt, now),
        action: "Resolve and record a closing comment against the alert.",
        state: "Unresolved",
        open: () => (a.source === "delivery" ? onOpenDelivery(a.sourceId) : onOpenTask(a.sourceId)),
      });
    }

    for (const r of resolved) {
      if (!r.atRisk) continue;
      out.push({
        key: `ar-${r.d.id}`,
        severity: "yellow",
        issue: `At risk: ${r.d.id} · ${r.d.customerName}`,
        impact: r.delayReason ?? "A required task or stock line is flagged amber.",
        owner: r.d.assignedOps ?? "Operations",
        deadline: `${formatDay(r.d.dueDate)} · cutoff ${DISPATCH_WINDOW_CUTOFFS[r.d.dispatchWindow ?? "AFTERNOON"]}`,
        action: "Clear the blocking task or confirm a substitution before the cutoff.",
        state: r.lifecycle,
        open: () => onOpenDelivery(r.d.id),
      });
    }

    for (const t of overdueTasks) {
      out.push({
        key: `t-${t.id}`,
        severity: "yellow",
        issue: `Overdue task: ${t.title}`,
        impact: t.note ?? "Operational task past its due time.",
        owner: t.assignee,
        deadline: `Due ${t.due} · ${t.shift} shift`,
        action: "Reassign or escalate to the shift supervisor.",
        state: "Red",
        open: () => onOpenTask(t.id),
      });
    }

    for (const t of pendingVerifications) {
      out.push({
        key: `v-${t.id}`,
        severity: "yellow",
        issue: `Awaiting supervisor verification: ${t.title}`,
        impact: "Work is complete but unverified, so it cannot be counted as closed.",
        owner: t.assignee,
        deadline: `Due ${t.due}`,
        action: "Verify the evidence note and sign the task off.",
        state: "Pending verification",
        open: () => onOpenTask(t.id),
      });
    }

    return out.sort((a, b) => (a.severity === b.severity ? 0 : a.severity === "red" ? -1 : 1));
  }, [resolved, unresolvedEmergencies, criticalStock, openRedAlerts, overdueTasks, pendingVerifications, now, onOpenDelivery, onOpenEmergency, onOpenStock, onOpenTask]);

  const visibleDecisions = showAllDecisions ? decisions : decisions.slice(0, 5);

  // ===== Section 3 — performance =====
  const ranked = useMemo(() => bottlenecks(resolved), [resolved]);
  const worstStep = ranked.find((b) => b.delays > 0);
  const delayReason = useMemo(() => topDelayReason(resolved), [resolved]);
  const attainment = Math.round((todayTotals.completedToday / TARGET_DELIVERIES_PER_DAY) * 100);

  // ===== Section 4 — seven-day movement =====
  const movement = useMemo(() => buildMovement(now, resolved, audit, emergencyOrders, stock), [now, resolved, audit, emergencyOrders, stock]);

  // ===== Section 5 — outlook =====
  const outlook = useMemo(
    () => buildOutlook(now, todayIso, resolved, criticalStock, openEmergencies, movement),
    [now, todayIso, resolved, criticalStock, openEmergencies, movement],
  );

  // ===== Executive summary (deterministic) =====
  const summary = useMemo(() => {
    const parts: string[] = [];
    parts.push(
      `${countLabel(todayTotals.total, "delivery")} ${todayTotals.total === 1 ? "is" : "are"} on today's book: ` +
      `${todayTotals.completedToday} completed against a target of ${TARGET_DELIVERIES_PER_DAY}, ` +
      `${todayTotals.dispatched} dispatched, ${todayTotals.awaitingDispatch} awaiting dispatch and ${todayTotals.pending} still pending.`,
    );
    if (todayTotals.blocked || totals.late || todayTotals.atRisk) {
      const bits: string[] = [];
      if (todayTotals.blocked) bits.push(`${countLabel(todayTotals.blocked, "delivery")} blocked`);
      if (totals.late) bits.push(`${countLabel(totals.late, "delivery")} past its dispatch cutoff`);
      if (todayTotals.atRisk) bits.push(`${countLabel(todayTotals.atRisk, "delivery")} at risk`);
      parts.push(`Targets are not being met cleanly: ${bits.join(", ")}. These are counted in every figure on this page.`);
    } else {
      parts.push("No delivery is blocked, late or flagged at risk, so today's commitments are intact.");
    }
    if (criticalStock.length) {
      parts.push(`${countLabel(criticalStock.length, "stock line")} ${criticalStock.length === 1 ? "sits" : "sit"} in the red — ${criticalStock.map((s) => s.name).join(", ")} — and ${criticalStock.length === 1 ? "is" : "are"} the main fulfilment constraint.`);
    }
    if (unresolvedEmergencies.length) {
      parts.push(`${countLabel(unresolvedEmergencies.length, "emergency order")} still ${unresolvedEmergencies.length === 1 ? "needs" : "need"} a management decision.`);
    }
    if (totals.avgCycleMinutes) {
      parts.push(`Average end-to-end cycle time across ${countLabel(totals.cycleSamples, "completed delivery")} is ${formatMinutes(totals.avgCycleMinutes)}.`);
    } else {
      parts.push(`Average cycle time is not reported: only ${countLabel(totals.cycleSamples, "completed cycle")} of timing history ${totals.cycleSamples === 1 ? "is" : "are"} recorded, below the ${MIN_CYCLE_SAMPLES}-cycle minimum.`);
    }
    if (worstStep) {
      parts.push(`The heaviest bottleneck is Step ${worstStep.step} — ${OPERATION_STEPS[worstStep.step - 1]?.name} — with ${countLabel(worstStep.delays, "overrun")} against target.`);
    }
    return parts;
  }, [todayTotals, totals, criticalStock, unresolvedEmergencies.length, worstStep]);

  const plainText = useMemo(
    () => buildPlainText({ userName, now, overall, summary, todayTotals, totals, decisions, worstStep, movement, outlook, attainment }),
    [userName, now, overall, summary, todayTotals, totals, decisions, worstStep, movement, outlook, attainment],
  );

  function printBrief() {
    if (typeof window === "undefined") return;
    document.body.classList.add("printing-brief");
    const cleanup = () => document.body.classList.remove("printing-brief");
    window.addEventListener("afterprint", cleanup, { once: true });
    window.print();
    setTimeout(cleanup, 1500);
  }

  async function copySummary() {
    try {
      await navigator.clipboard.writeText(plainText);
      setCopied(true);
      setTimeout(() => setCopied(false), 2500);
    } catch {
      setCopied(false);
    }
  }

  const greeting = greetingFor(now);

  return (
    <section aria-label="General Manager command centre" className="space-y-5">
      {/* ============ SECTION 1 — EXECUTIVE STATUS ============ */}
      <Card className="overflow-hidden border-primary/25">
        <div className="bg-primary px-5 py-4 text-primary-foreground sm:px-6">
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div className="min-w-0">
              <p className="text-[11px] font-semibold uppercase tracking-[0.18em] opacity-75">
                General Manager command centre
              </p>
              <h2 className="mt-1 text-xl font-semibold tracking-tight sm:text-2xl">
                {greeting}, {userName} — here is today&apos;s operational position.
              </h2>
              <p className="mt-1 text-xs opacity-80">
                {formatDay(todayIso)} · figures recalculated from the live operational record.
              </p>
            </div>
            <div className="flex shrink-0 flex-wrap items-center gap-2 print:hidden">
              <Button size="sm" variant="secondary" onClick={copySummary} className="gap-1.5">
                <Copy className="size-4" /> {copied ? "Copied" : "Copy summary"}
              </Button>
              <Button size="sm" variant="secondary" onClick={printBrief} className="gap-1.5">
                <Printer className="size-4" /> Print GM brief
              </Button>
            </div>
          </div>
        </div>

        <CardContent className="space-y-5 p-5 sm:p-6">
          <div className="flex flex-wrap items-center gap-3 rounded-lg border bg-secondary/40 p-4">
            <TrafficLamp tone={overall.tone} />
            <div className="min-w-0 flex-1">
              <p className="text-sm font-semibold">{overall.label}</p>
              <p className="text-xs text-muted-foreground">{overall.reason}</p>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
            <Metric label="Due today" value={todayTotals.total} />
            <Metric label="Delivered today" value={`${todayTotals.completedToday} / ${TARGET_DELIVERIES_PER_DAY}`} tone={todayTotals.completedToday >= TARGET_DELIVERIES_PER_DAY ? "green" : "yellow"} />
            <Metric label="Dispatched" value={todayTotals.dispatched} tone="green" />
            <Metric label="Pending" value={todayTotals.pending + todayTotals.awaitingDispatch} tone="yellow" />
            <Metric label="At risk" value={todayTotals.atRisk} tone={todayTotals.atRisk ? "yellow" : "green"} />
            <Metric label="Blocked" value={todayTotals.blocked} tone={todayTotals.blocked ? "red" : "green"} />
            <Metric label="Late" value={totals.late} tone={totals.late ? "red" : "green"} />
            <Metric label="Emergency orders" value={openEmergencies.length} tone={unresolvedEmergencies.length ? "red" : openEmergencies.length ? "yellow" : "green"} />
            <Metric label="Critical stock" value={criticalStock.length} tone={criticalStock.length ? "red" : "green"} />
            <Metric label="Escalations" value={decisions.filter((d) => d.severity === "red").length} tone={decisions.some((d) => d.severity === "red") ? "red" : "green"} />
          </div>

          <div className="space-y-2 rounded-lg border p-4 text-sm leading-relaxed">
            <p className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
              <Sparkles className="size-3.5" /> Executive summary
            </p>
            {summary.map((p, i) => <p key={i}>{p}</p>)}
          </div>
        </CardContent>
      </Card>

      {/* ============ SECTION 2 — DECISIONS REQUIRED ============ */}
      <Card className={decisions.some((d) => d.severity === "red") ? "border-status-red/40" : undefined}>
        <CardHeader className="flex flex-row flex-wrap items-center justify-between gap-2">
          <div>
            <CardTitle className="flex items-center gap-2 text-base font-semibold">
              <AlertTriangle className="size-4" /> Decisions required today
            </CardTitle>
            <p className="mt-1 text-xs text-muted-foreground">
              Red items first. {countLabel(decisions.length, "open item")} across deliveries, stock, emergencies and verification.
            </p>
          </div>
          {decisions.length > 5 ? (
            <Button size="sm" variant="outline" className="print:hidden" onClick={() => setShowAllDecisions((v) => !v)}>
              {showAllDecisions ? "Show top 5" : `See all ${decisions.length}`}
            </Button>
          ) : null}
        </CardHeader>
        <CardContent className="space-y-3">
          {decisions.length === 0 ? (
            <p className="rounded-md border border-dashed p-6 text-center text-sm text-muted-foreground">
              Nothing requires a management decision right now.
            </p>
          ) : (
            visibleDecisions.map((it) => (
              <div key={it.key} className={`rounded-lg border-l-4 border bg-card p-4 ${it.severity === "red" ? "border-l-status-red" : "border-l-status-yellow"}`}>
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div className="min-w-0 flex-1 space-y-1.5">
                    <p className="text-sm font-semibold">{it.issue}</p>
                    <p className="text-xs text-muted-foreground">{it.impact}</p>
                    <dl className="grid gap-x-6 gap-y-1 text-[11px] text-muted-foreground sm:grid-cols-2">
                      <Field label="Responsible" value={it.owner} />
                      <Field label="Deadline" value={it.deadline} />
                      <Field label="Status" value={it.state} />
                      <Field label="Recommended action" value={it.action} />
                    </dl>
                  </div>
                  <div className="flex shrink-0 flex-col items-end gap-2">
                    <StatusBadge status={it.severity} label={it.severity === "red" ? "Critical" : "Attention"} />
                    <Button size="sm" variant="outline" className="gap-1 print:hidden" onClick={it.open}>
                      Open <ArrowRight className="size-3.5" />
                    </Button>
                  </div>
                </div>
              </div>
            ))
          )}
        </CardContent>
      </Card>

      {/* ============ SECTION 3 — PERFORMANCE & BOTTLENECKS ============ */}
      <div className="grid gap-5 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base font-semibold">
              <Gauge className="size-4" /> Performance
            </CardTitle>
            <p className="mt-1 text-xs text-muted-foreground">Deterministic figures from the same delivery records used across the platform.</p>
          </CardHeader>
          <CardContent className="grid gap-3 sm:grid-cols-2">
            <Metric label="Target attainment" value={`${attainment}%`} sub={`${todayTotals.completedToday} of ${TARGET_DELIVERIES_PER_DAY} today`} tone={attainment >= 100 ? "green" : attainment >= 60 ? "yellow" : "red"} />
            <Metric label="On-time rate" value={totals.onTimeRate == null ? NO_DATA : `${totals.onTimeRate}%`} sub={`${countLabel(totals.completed, "completed delivery")}`} tone={totals.onTimeRate == null ? undefined : totals.onTimeRate >= 85 ? "green" : totals.onTimeRate >= 70 ? "yellow" : "red"} />
            <Metric label="Completion rate" value={totals.completionRate == null ? NO_DATA : `${totals.completionRate}%`} sub={`${totals.completed} of ${totals.total} tracked`} />
            <Metric
              label="Average cycle time"
              value={totals.avgCycleMinutes ? formatMinutes(totals.avgCycleMinutes) : NO_DATA}
              sub={totals.avgCycleMinutes ? `${countLabel(totals.cycleSamples, "cycle")} measured` : `Insufficient completed-cycle history to calculate this metric reliably.`}
            />
            <Metric label="Delayed / blocked rate" value={totals.delayedRate == null ? NO_DATA : `${totals.delayedRate}%`} tone={(totals.delayedRate ?? 0) > 15 ? "red" : (totals.delayedRate ?? 0) > 5 ? "yellow" : "green"} />
            <Metric label="Current backlog" value={totals.backlog} sub="Not yet dispatched" tone={totals.backlog > 4 ? "yellow" : "green"} />
            <div className="sm:col-span-2 space-y-1 rounded-md border p-3 text-xs">
              <p><span className="font-semibold">Most frequently delayed step:</span>{" "}
                {worstStep ? `Step ${worstStep.step} — ${OPERATION_STEPS[worstStep.step - 1]?.name} (${countLabel(worstStep.delays, "overrun")})` : "No step has overrun its target in the recorded history."}
              </p>
              <p><span className="font-semibold">Main recorded delay reason:</span>{" "}
                {delayReason ? `${delayReason.reason} (${countLabel(delayReason.count, "occurrence")})` : "No delay reason has been recorded."}
              </p>
              <p><span className="font-semibold">Critical issues:</span>{" "}
                {decisions.filter((d) => d.severity === "red").length} open · {alerts.filter((a) => a.resolved).length} resolved
              </p>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base font-semibold">
              <Target className="size-4" /> Bottlenecks by stage
            </CardTitle>
            <p className="mt-1 text-xs text-muted-foreground">Average recorded time against the target for each of the seven steps.</p>
          </CardHeader>
          <CardContent className="space-y-2.5">
            {ranked.filter((b) => b.samples > 0).length === 0 ? (
              <p className="rounded-md border border-dashed p-6 text-center text-xs text-muted-foreground">
                No completed step timings recorded yet — the stage ranking needs at least one measured step.
              </p>
            ) : (
              [...ranked].sort((a, b) => a.step - b.step).filter((b) => b.samples > 0).map((b) => {
                const target = STEP_TARGET_MINUTES[b.step] ?? 30;
                const over = (b.avgMinutes ?? 0) > target;
                const max = Math.max(target, b.avgMinutes ?? 0) * 1.2;
                return (
                  <div key={b.step} className="space-y-1">
                    <div className="flex items-center justify-between gap-2 text-[11px]">
                      <span className="truncate font-medium">Step {b.step} · {OPERATION_STEPS[b.step - 1]?.name}</span>
                      <span className={`shrink-0 font-mono ${over ? "text-status-red" : "text-muted-foreground"}`}>
                        {formatMinutes(b.avgMinutes)} / {formatMinutes(target)}
                        {b.delays ? ` · ${b.delays} over` : ""}
                      </span>
                    </div>
                    <div className="relative h-2.5 overflow-hidden rounded bg-muted">
                      <div className={`h-full ${over ? "bg-status-red" : "bg-status-green"}`} style={{ width: `${Math.min(100, ((b.avgMinutes ?? 0) / max) * 100)}%` }} />
                      <div className="absolute top-0 h-full border-l-2 border-dashed border-foreground/50" style={{ left: `${Math.min(100, (target / max) * 100)}%` }} />
                    </div>
                  </div>
                );
              })
            )}
            <p className="pt-1 text-[10px] text-muted-foreground">Dashed line marks the target time for the stage.</p>
          </CardContent>
        </Card>
      </div>

      {/* ============ SECTION 4 — SEVEN-DAY MOVEMENT ============ */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base font-semibold">
            <LineChart className="size-4" /> Seven-day movement
          </CardTitle>
          <p className="mt-1 text-xs text-muted-foreground">
            Demonstration data. {movement.comparison ?? "A period-on-period comparison needs a full preceding seven days of history; that history is not yet available."}
          </p>
        </CardHeader>
        <CardContent className="space-y-4">
          <MovementChart series={movement.days} />
          <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-5 text-xs">
            <MovementTotal label="Completed" value={movement.totals.completed} dot="green" />
            <MovementTotal label="At risk / blocked" value={movement.totals.risk} dot="red" />
            <MovementTotal label="Critical stock incidents" value={movement.totals.stockIncidents} dot="red" />
            <MovementTotal label="Emergency orders" value={movement.totals.emergencies} dot="yellow" />
            <MovementTotal label="Recorded activity" value={movement.totals.activity} dot="green" />
          </div>
        </CardContent>
      </Card>

      {/* ============ SECTION 5 — OUTLOOK ============ */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base font-semibold">
            <Truck className="size-4" /> Short-term outlook
          </CardTitle>
          <p className="mt-1 text-xs text-muted-foreground">
            Next window: {outlook.windowLabel} (cutoff {outlook.cutoff}). Every line carries its own confidence label.
          </p>
        </CardHeader>
        <CardContent className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {outlook.items.map((o) => (
            <div key={o.label} className="rounded-lg border p-3">
              <p className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">{o.label}</p>
              <p className="mt-1 text-xl font-semibold">{o.value}</p>
              <p className="mt-1 text-[11px] text-muted-foreground">{o.note}</p>
              <span className={`mt-2 inline-block rounded-full px-2 py-0.5 text-[10px] font-semibold ${confidenceTone(o.confidence)}`}>
                {o.confidence}
              </span>
            </div>
          ))}
        </CardContent>
      </Card>

      <GmBriefPrintout
        userName={userName}
        now={now}
        todayIso={todayIso}
        overall={overall}
        summary={summary}
        todayTotals={todayTotals}
        totals={totals}
        attainment={attainment}
        decisions={decisions}
        worstStep={worstStep}
        movement={movement}
        outlook={outlook}
      />
    </section>
  );
}

// ============================================================================
// Helpers & sub-components
// ============================================================================

function greetingFor(now: number): string {
  const h = new Date(now).getHours();
  if (h < 12) return "Good morning";
  if (h < 17) return "Good afternoon";
  return "Good evening";
}

function TrafficLamp({ tone }: { tone: Status }) {
  const lamp = (t: Status) => {
    const on = t === tone;
    const colour = t === "green" ? "bg-status-green" : t === "yellow" ? "bg-status-yellow" : "bg-status-red";
    return <span key={t} className={`size-5 rounded-full ${colour} ${on ? "opacity-100 ring-2 ring-offset-2 ring-offset-background ring-current" : "opacity-20"}`} />;
  };
  return (
    <div className="flex items-center gap-2 rounded-full border bg-card px-3 py-2">
      {(["red", "yellow", "green"] as Status[]).map(lamp)}
    </div>
  );
}

function Metric({ label, value, sub, tone }: { label: string; value: string | number; sub?: string; tone?: Status }) {
  const toneClass = tone === "green" ? "text-status-green" : tone === "yellow" ? "text-status-yellow-foreground" : tone === "red" ? "text-status-red" : "";
  return (
    <div className="rounded-lg border bg-card p-3">
      <p className="flex items-center gap-1.5 text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
        {tone ? <StatusDot status={tone} /> : null}{label}
      </p>
      <p className={`mt-1 truncate text-xl font-semibold tracking-tight ${toneClass}`}>{value}</p>
      {sub ? <p className="mt-0.5 text-[11px] text-muted-foreground">{sub}</p> : null}
    </div>
  );
}

function Field({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex gap-1.5">
      <dt className="shrink-0 font-semibold">{label}:</dt>
      <dd className="min-w-0">{value}</dd>
    </div>
  );
}

function MovementTotal({ label, value, dot }: { label: string; value: number; dot: Status }) {
  return (
    <div className="flex items-center justify-between rounded-md border px-3 py-2">
      <span className="flex items-center gap-2 truncate text-muted-foreground"><StatusDot status={dot} />{label}</span>
      <span className="font-semibold">{value}</span>
    </div>
  );
}

export type MovementDay = {
  date: string;
  label: string;
  completed: number;
  risk: number;
  stockIncidents: number;
  emergencies: number;
  activity: number;
};

export type Movement = {
  days: MovementDay[];
  previous: MovementDay[];
  totals: { completed: number; risk: number; stockIncidents: number; emergencies: number; activity: number };
  comparison?: string;
};

function buildMovement(
  now: number,
  resolved: ResolvedDelivery[],
  audit: AuditEntry[],
  emergencyOrders: EmergencyOrder[],
  stock: StockItem[],
): Movement {
  const mk = (offsetFrom: number): MovementDay[] => {
    const out: MovementDay[] = [];
    for (let i = offsetFrom + 6; i >= offsetFrom; i--) {
      const d = new Date(now - i * 86_400_000);
      const date = d.toISOString().slice(0, 10);
      out.push({
        date,
        label: d.toLocaleDateString("en-GB", { weekday: "short" }),
        completed: resolved.filter((r) => r.completed && r.d.dueDate === date).length,
        risk: resolved.filter((r) => (r.atRisk || r.blocked || r.late) && r.d.dueDate === date).length,
        stockIncidents: audit.filter((a) => a.entityType === "stock" && a.timestamp.slice(0, 10) === date).length,
        emergencies: emergencyOrders.filter((o) => o.orderedAt.slice(0, 10) === date).length,
        activity: audit.filter((a) => a.timestamp.slice(0, 10) === date).length,
      });
    }
    return out;
  };

  const days = mk(0);
  const previous = mk(7);
  const sum = (list: MovementDay[], key: keyof MovementDay) =>
    list.reduce((a, b) => a + (typeof b[key] === "number" ? (b[key] as number) : 0), 0);

  const currentActive = days.filter((d) => d.activity > 0 || d.completed > 0).length;
  const previousActive = previous.filter((d) => d.activity > 0 || d.completed > 0).length;

  let comparison: string | undefined;
  if (currentActive >= 4 && previousActive >= 4) {
    const a = sum(days, "completed");
    const b = sum(previous, "completed");
    const pct = b ? Math.round(((a - b) / b) * 100) : 0;
    comparison = `Completed deliveries are ${pct >= 0 ? "up" : "down"} ${Math.abs(pct)}% against the preceding seven days (${a} versus ${b}).`;
  }

  return {
    days,
    previous,
    totals: {
      completed: sum(days, "completed"),
      risk: sum(days, "risk"),
      stockIncidents: sum(days, "stockIncidents"),
      emergencies: sum(days, "emergencies"),
      activity: sum(days, "activity"),
    },
    comparison,
  };
}

function MovementChart({ series }: { series: MovementDay[] }) {
  const max = Math.max(1, ...series.map((d) => Math.max(d.completed, d.activity, d.risk)));
  return (
    <div className="w-full overflow-x-auto">
      <div className="flex min-w-[420px] items-end gap-2">
        {series.map((d) => (
          <div key={d.date} className="flex flex-1 flex-col items-center gap-1">
            <div className="flex h-28 w-full items-end justify-center gap-0.5">
              <Bar value={d.completed} max={max} className="bg-status-green" title={`${d.completed} completed`} />
              <Bar value={d.risk} max={max} className="bg-status-red" title={`${d.risk} at risk or blocked`} />
              <Bar value={d.emergencies} max={max} className="bg-status-yellow" title={`${d.emergencies} emergency orders`} />
              <Bar value={d.activity} max={max} className="bg-primary/40" title={`${d.activity} recorded events`} />
            </div>
            <span className="text-[10px] text-muted-foreground">{d.label}</span>
          </div>
        ))}
      </div>
      <div className="mt-2 flex flex-wrap items-center gap-3 text-[10px] text-muted-foreground">
        <Legend className="bg-status-green" label="Completed" />
        <Legend className="bg-status-red" label="At risk / blocked" />
        <Legend className="bg-status-yellow" label="Emergency orders" />
        <Legend className="bg-primary/40" label="Recorded activity" />
      </div>
    </div>
  );
}

function Bar({ value, max, className, title }: { value: number; max: number; className: string; title: string }) {
  return (
    <div
      title={title}
      className={`w-1.5 rounded-sm ${className}`}
      style={{ height: `${Math.max(value ? 6 : 2, (value / max) * 100)}%` }}
    />
  );
}

function Legend({ className, label }: { className: string; label: string }) {
  return <span className="inline-flex items-center gap-1.5"><span className={`size-2 rounded-sm ${className}`} />{label}</span>;
}

export type Confidence = "High confidence" | "Moderate confidence" | "Low confidence" | "Insufficient history";

export type Outlook = {
  windowLabel: string;
  cutoff: string;
  items: { label: string; value: string; note: string; confidence: Confidence }[];
};

function confidenceTone(c: Confidence): string {
  if (c === "High confidence") return "bg-status-green/15 text-status-green";
  if (c === "Moderate confidence") return "bg-status-yellow/25 text-status-yellow-foreground";
  if (c === "Low confidence") return "bg-status-red/15 text-status-red";
  return "bg-secondary text-muted-foreground";
}

function buildOutlook(
  now: number,
  todayIso: string,
  resolved: ResolvedDelivery[],
  criticalStock: StockItem[],
  openEmergencies: EmergencyOrder[],
  movement: Movement,
): Outlook {
  const d = new Date(now);
  const minutes = d.getHours() * 60 + d.getMinutes();
  const morningCutoff = 10 * 60 + 30;
  const isMorning = minutes < morningCutoff;
  const windowKey = isMorning ? "MORNING" : "AFTERNOON";
  const cutoff = DISPATCH_WINDOW_CUTOFFS[windowKey];
  const cutoffMinutes = isMorning ? morningCutoff : 15 * 60 + 30;
  const minutesToCutoff = cutoffMinutes - minutes;

  const inWindow = resolved.filter(
    (r) => r.d.dueDate === todayIso && (r.d.dispatchWindow ?? "AFTERNOON") === windowKey && !r.completed && !r.dispatched,
  );
  const backlog = resolved.filter((r) => !r.completed && !r.dispatched);
  const remainingTarget = (r: ResolvedDelivery) =>
    Object.entries(STEP_TARGET_MINUTES)
      .filter(([n]) => Number(n) > r.stepsCompleted)
      .reduce((a, [, v]) => a + v, 0);
  const atRiskOfMissing = inWindow.filter((r) => r.blocked || minutesToCutoff <= 0 || remainingTarget(r) > minutesToCutoff);

  const historyDays = movement.days.filter((x) => x.completed > 0).length;
  const throughputConfidence: Confidence =
    historyDays >= 5 ? "High confidence" : historyDays >= 3 ? "Moderate confidence" : historyDays >= 1 ? "Low confidence" : "Insufficient history";
  const avgCompleted = historyDays ? movement.totals.completed / 7 : undefined;

  return {
    windowLabel: isMorning ? "Morning" : "Afternoon",
    cutoff,
    items: [
      {
        label: `Expected in the ${isMorning ? "morning" : "afternoon"} window`,
        value: String(inWindow.length),
        note: minutesToCutoff > 0
          ? `${minutesToCutoff} ${plural(minutesToCutoff, "minute")} remain before the ${cutoff} cutoff.`
          : `The ${cutoff} cutoff has passed; anything outstanding rolls to the next window.`,
        confidence: "High confidence",
      },
      {
        label: "Current backlog",
        value: String(backlog.length),
        note: "Deliveries recorded but not yet dispatched.",
        confidence: "High confidence",
      },
      {
        label: "Likely to miss the cutoff",
        value: String(atRiskOfMissing.length),
        note: atRiskOfMissing.length
          ? `Remaining step targets exceed the time left: ${atRiskOfMissing.map((r) => r.d.customerName).join(", ")}.`
          : "Every open job in this window still has enough target time remaining.",
        confidence: atRiskOfMissing.length ? "Moderate confidence" : "High confidence",
      },
      {
        label: "Stock that could block fulfilment",
        value: String(criticalStock.length),
        note: criticalStock.length ? criticalStock.map((s) => s.name).join(", ") : "No stock line is currently in the red.",
        confidence: "High confidence",
      },
      {
        label: "Emergency orders still open",
        value: String(openEmergencies.length),
        note: openEmergencies.length
          ? openEmergencies.map((o) => `${o.id} (${o.status.replace(/_/g, " ").toLowerCase()})`).join(", ")
          : "No emergency order is outstanding.",
        confidence: "High confidence",
      },
      {
        label: "Projected daily throughput",
        value: throughputConfidence === "Insufficient history" || avgCompleted == null ? NO_DATA : `${avgCompleted.toFixed(1)} / day`,
        note: throughputConfidence === "Insufficient history"
          ? "A projection needs completed deliveries recorded on at least three of the last seven days."
          : `Seven-day mean of ${movement.totals.completed} completed ${plural(movement.totals.completed, "delivery")} across ${countLabel(historyDays, "active day")}.`,
        confidence: throughputConfidence,
      },
    ],
  };
}

// ===== Plain-text summary (copy to email / WhatsApp) =====

function buildPlainText(args: {
  userName: string; now: number; overall: OverallStatus; summary: string[];
  todayTotals: ReturnType<typeof summarise>; totals: ReturnType<typeof summarise>;
  decisions: Decision[]; worstStep?: { step: number; delays: number };
  movement: Movement; outlook: Outlook; attainment: number;
}): string {
  const { overall, summary, todayTotals, totals, decisions, worstStep, movement, outlook, attainment } = args;
  const lines: string[] = [];
  lines.push(`COSPHARM — GM OPERATIONAL BRIEF`);
  lines.push(`${formatDay(new Date(args.now).toISOString().slice(0, 10))}`);
  lines.push("");
  lines.push(`OVERALL STATUS: ${overall.label}`);
  lines.push(overall.reason);
  lines.push("");
  lines.push("EXECUTIVE SUMMARY");
  summary.forEach((s) => lines.push(`- ${s}`));
  lines.push("");
  lines.push("HEADLINE KPIs");
  lines.push(`- Due today: ${todayTotals.total}`);
  lines.push(`- Delivered today: ${todayTotals.completedToday} / ${TARGET_DELIVERIES_PER_DAY} (${attainment}% attainment)`);
  lines.push(`- Dispatched: ${todayTotals.dispatched} | Pending: ${todayTotals.pending + todayTotals.awaitingDispatch}`);
  lines.push(`- At risk: ${todayTotals.atRisk} | Blocked: ${todayTotals.blocked} | Late: ${totals.late}`);
  lines.push(`- On-time rate: ${totals.onTimeRate == null ? NO_DATA : `${totals.onTimeRate}%`}`);
  lines.push(`- Average cycle time: ${totals.avgCycleMinutes ? formatMinutes(totals.avgCycleMinutes) : "Insufficient completed-cycle history"}`);
  lines.push(`- Backlog: ${totals.backlog}`);
  lines.push("");
  lines.push(`DECISIONS REQUIRED (${decisions.length})`);
  decisions.slice(0, 5).forEach((d, i) => {
    lines.push(`${i + 1}. [${d.severity.toUpperCase()}] ${d.issue}`);
    lines.push(`   Impact: ${d.impact}`);
    lines.push(`   Owner: ${d.owner} | Deadline: ${d.deadline}`);
    lines.push(`   Action: ${d.action}`);
  });
  if (decisions.length > 5) lines.push(`   (+${decisions.length - 5} more in the dashboard)`);
  lines.push("");
  lines.push(`MAIN BOTTLENECK: ${worstStep ? `Step ${worstStep.step} — ${OPERATION_STEPS[worstStep.step - 1]?.name} (${countLabel(worstStep.delays, "overrun")})` : "None recorded"}`);
  lines.push("");
  lines.push("SEVEN-DAY MOVEMENT");
  lines.push(`- Completed: ${movement.totals.completed} | At risk/blocked: ${movement.totals.risk}`);
  lines.push(`- Critical stock incidents: ${movement.totals.stockIncidents} | Emergency orders: ${movement.totals.emergencies}`);
  lines.push(`- ${movement.comparison ?? "Period-on-period comparison withheld: insufficient preceding history."}`);
  lines.push("");
  lines.push(`OUTLOOK — next window ${outlook.windowLabel} (cutoff ${outlook.cutoff})`);
  outlook.items.forEach((o) => lines.push(`- ${o.label}: ${o.value} [${o.confidence}] — ${o.note}`));
  lines.push("");
  lines.push("DATA QUALITY: figures are deterministic calculations over the platform's operational records. Demonstration environment — the dataset is illustrative and contains no financial values.");
  return lines.join("\n");
}

// ===== Print-only one-page brief (portalled outside the app shell) =====

function GmBriefPrintout(props: {
  userName: string; now: number; todayIso: string; overall: OverallStatus; summary: string[];
  todayTotals: ReturnType<typeof summarise>; totals: ReturnType<typeof summarise>; attainment: number;
  decisions: Decision[]; worstStep?: { step: number; delays: number }; movement: Movement; outlook: Outlook;
}) {
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);
  if (!mounted) return null;

  const { overall, summary, todayTotals, totals, decisions, worstStep, movement, outlook, attainment } = props;

  return createPortal(
    <div id="gm-brief" aria-hidden="true">
      <header>
        <h1>Cospharm — General Manager operational brief</h1>
        <p>{formatDay(props.todayIso)} · reporting period: today, with a rolling seven-day movement window · prepared for {props.userName}</p>
      </header>

      <h2>Overall status</h2>
      <p><strong>{overall.label}.</strong> {overall.reason}</p>

      <h2>Executive summary</h2>
      {summary.map((s, i) => <p key={i}>{s}</p>)}

      <h2>Headline KPIs</h2>
      <table>
        <tbody>
          <tr><th>Due today</th><td>{todayTotals.total}</td><th>Delivered today</th><td>{todayTotals.completedToday} / {TARGET_DELIVERIES_PER_DAY} ({attainment}%)</td></tr>
          <tr><th>Dispatched</th><td>{todayTotals.dispatched}</td><th>Pending</th><td>{todayTotals.pending + todayTotals.awaitingDispatch}</td></tr>
          <tr><th>At risk</th><td>{todayTotals.atRisk}</td><th>Blocked</th><td>{todayTotals.blocked}</td></tr>
          <tr><th>Late</th><td>{totals.late}</td><th>Backlog</th><td>{totals.backlog}</td></tr>
          <tr><th>On-time rate</th><td>{totals.onTimeRate == null ? NO_DATA : `${totals.onTimeRate}%`}</td><th>Average cycle time</th><td>{totals.avgCycleMinutes ? formatMinutes(totals.avgCycleMinutes) : "Insufficient completed-cycle history"}</td></tr>
        </tbody>
      </table>

      <h2>Decisions required ({decisions.length})</h2>
      <ol>
        {decisions.slice(0, 5).map((d) => (
          <li key={d.key}>
            <strong>[{d.severity.toUpperCase()}] {d.issue}</strong><br />
            {d.impact}<br />
            <em>Owner:</em> {d.owner} · <em>Deadline:</em> {d.deadline} · <em>Status:</em> {d.state}<br />
            <em>Action:</em> {d.action}
          </li>
        ))}
        {decisions.length === 0 ? <li>No management decision is outstanding.</li> : null}
      </ol>

      <h2>Main bottleneck</h2>
      <p>{worstStep ? `Step ${worstStep.step} — ${OPERATION_STEPS[worstStep.step - 1]?.name}, with ${countLabel(worstStep.delays, "recorded overrun")} against target.` : "No stage has overrun its target in the recorded history."}</p>

      <h2>Seven-day movement</h2>
      <p>
        Completed {movement.totals.completed} · at risk or blocked {movement.totals.risk} · critical stock incidents {movement.totals.stockIncidents} ·
        emergency orders {movement.totals.emergencies} · recorded activity events {movement.totals.activity}.
      </p>
      <p>{movement.comparison ?? "Period-on-period comparison withheld: the preceding seven days do not contain enough recorded history."}</p>

      <h2>Short-term outlook — next {outlook.windowLabel.toLowerCase()} window (cutoff {outlook.cutoff})</h2>
      <ul>
        {outlook.items.map((o) => (
          <li key={o.label}><strong>{o.label}: {o.value}</strong> [{o.confidence}] — {o.note}</li>
        ))}
      </ul>

      <h2>Data quality statement</h2>
      <p>
        Every figure above is a deterministic calculation over the platform&apos;s operational records; the narrative is rule-based over those same
        numbers. Metrics without sufficient history are reported as &ldquo;{NO_DATA}&rdquo; rather than zero. This is a demonstration environment:
        the dataset is illustrative and deliberately contains no revenue, profit or other financial values.
      </p>
    </div>,
    document.body,
  );
}

