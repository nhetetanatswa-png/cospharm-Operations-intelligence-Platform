import { useEffect, useMemo, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { StatusBadge } from "./StatusBadge";
import { Clock, Play, CheckCircle2, AlertTriangle, Timer, Truck, Trophy, User, Zap, Menu } from "lucide-react";
import type { Delivery } from "./types";
import {
  STEP_TARGET_MINUTES,
  STEP_DEPARTMENT,
  loadTimings,
  saveTimings,
  stepRuntimeStatus,
  deriveDeliveryUiStatus,
  elapsedMinutes,
  formatMinutes,
  trafficLightFor,
  deliveryTrafficLight,
  type TrafficLight,
  type DeliveryTimings,
  type StepTiming,
} from "./delivery-timing";
import { OPERATION_STEPS } from "./operations";

function TrafficDot({ light, size = "sm" }: { light: TrafficLight; size?: "sm" | "lg" }) {
  const dim = size === "lg" ? "size-3.5" : "size-2.5";
  const tone: Record<TrafficLight, string> = {
    idle: "bg-muted-foreground/30",
    green: "bg-status-green ring-2 ring-status-green/30",
    yellow: "bg-status-yellow ring-2 ring-status-yellow/40",
    red: "bg-status-red ring-2 ring-status-red/40 animate-pulse",
  };
  return <span className={`inline-block rounded-full ${dim} ${tone[light]}`} aria-label={`Status: ${light}`} />;
}

function TrafficStack({ light }: { light: TrafficLight }) {
  // Vertical 3-lamp signal — always shows all three; the active lamp is bright.
  const on: Record<TrafficLight, { r: boolean; y: boolean; g: boolean }> = {
    idle:   { r: false, y: false, g: false },
    green:  { r: false, y: false, g: true  },
    yellow: { r: false, y: true,  g: false },
    red:    { r: true,  y: false, g: false },
  };
  const s = on[light];
  const lamp = (active: boolean, cls: string) =>
    `size-2 rounded-full ${active ? cls : "bg-muted-foreground/15"} ${active && light === "red" ? "animate-pulse" : ""}`;
  return (
    <span className="inline-flex flex-col items-center gap-0.5 rounded-sm bg-foreground/5 px-1 py-1 ring-1 ring-border">
      <span className={lamp(s.r, "bg-status-red ring-1 ring-status-red/60")} />
      <span className={lamp(s.y, "bg-status-yellow ring-1 ring-status-yellow/60")} />
      <span className={lamp(s.g, "bg-status-green ring-1 ring-status-green/60")} />
    </span>
  );
}

function TimerBar({
  status,
  actual,
  target,
}: {
  status: "NOT_STARTED" | "IN_PROGRESS" | "COMPLETED" | "DELAYED";
  actual: number | undefined;
  target: number;
}) {
  if (status === "NOT_STARTED") return null;
  const pct = Math.min(100, ((actual ?? 0) / Math.max(1, target)) * 100);
  const over = (actual ?? 0) > target;
  const overPct = over ? Math.min(100, (((actual ?? 0) - target) / target) * 100) : 0;
  const light = trafficLightFor(status, actual, target);
  const tone =
    light === "green" ? "bg-status-green" : light === "yellow" ? "bg-status-yellow" : light === "red" ? "bg-status-red" : "bg-muted-foreground/40";
  return (
    <div className="mt-1 h-1 w-24 overflow-hidden rounded-full bg-muted">
      <div className={`h-full ${tone} ${over ? "animate-pulse" : ""}`} style={{ width: `${over ? 100 : pct}%` }} />
      {over ? <div className="-mt-1 h-1 rounded-full bg-status-red/60" style={{ width: `${overPct}%` }} /> : null}
    </div>
  );
}

function useTick(intervalMs = 1000) {
  const [, setT] = useState(0);
  useEffect(() => {
    const id = setInterval(() => setT((n) => n + 1), intervalMs);
    return () => clearInterval(id);
  }, [intervalMs]);
}

export function TimedDeliveries({
  deliveries,
  currentUserName,
  onOpenDelivery,
  onActiveAssignmentsChange,
}: {
  deliveries: Delivery[];
  currentUserName: string;
  onOpenDelivery?: (id: string) => void;
  onActiveAssignmentsChange?: (map: Record<string, string[]>) => void;
}) {
  useTick(1000);
  const [timings, setTimings] = useState<DeliveryTimings>({});
  const [filter, setFilter] = useState("");
  const [view, setView] = useState<"risk" | "workflow">("workflow");

  useEffect(() => { setTimings(loadTimings()); }, []);

  useEffect(() => {
    if (typeof window === "undefined") return;
    const saved = window.localStorage.getItem("cospharm_deliveries_view");
    if (saved === "risk" || saved === "workflow") setView(saved);
  }, []);

  useEffect(() => {
    if (typeof window === "undefined") return;
    try { window.localStorage.setItem("cospharm_deliveries_view", view); } catch { /* ignore */ }
  }, [view]);

  function update(dId: string, step: number, patch: Partial<StepTiming>) {
    setTimings((prev) => {
      const next: DeliveryTimings = {
        ...prev,
        [dId]: { ...(prev[dId] ?? {}), [step]: { ...(prev[dId]?.[step] ?? {}), ...patch } },
      };
      saveTimings(next);
      return next;
    });
  }

  function startStep(dId: string, step: number) {
    update(dId, step, { startTime: new Date().toISOString(), assignedPerson: currentUserName });
  }

  function completeStep(dId: string, step: number) {
    // ensure it was started
    setTimings((prev) => {
      const cur = prev[dId]?.[step] ?? {};
      const startTime = cur.startTime ?? new Date().toISOString();
      const next: DeliveryTimings = {
        ...prev,
        [dId]: { ...(prev[dId] ?? {}), [step]: { ...cur, startTime, completionTime: new Date().toISOString() } },
      };
      saveTimings(next);
      return next;
    });
  }

  // Report active assignments upstream (name → list of "D-… step N")
  useEffect(() => {
    if (!onActiveAssignmentsChange) return;
    const map: Record<string, string[]> = {};
    for (const d of deliveries) {
      const t = timings[d.id] ?? {};
      for (let n = 1; n <= 7; n++) {
        const s = t[n];
        if (s?.startTime && !s.completionTime && s.assignedPerson) {
          (map[s.assignedPerson] ??= []).push(`${d.id} step ${n}`);
        }
      }
    }
    onActiveAssignmentsChange(map);
  }, [timings, deliveries, onActiveAssignmentsChange]);

  const filtered = useMemo(() => deliveries.filter((d) =>
    [d.id, d.customerName, d.assignedOps, d.assignedMarketer].join(" ").toLowerCase().includes(filter.toLowerCase()),
  ), [deliveries, filter]);

  // ===== Aggregated analytics =====
  const analytics = useMemo(() => {
    const perStep: Record<number, number[]> = {};
    const perStaff: Record<string, { done: number; delayed: number; totalMin: number }> = {};
    let cycleTimes: number[] = [];
    let delayedDeliveries = 0;
    let totalWithData = 0;
    const stepDelayCount: Record<number, number> = {};

    for (const d of deliveries) {
      const t = timings[d.id] ?? {};
      let hasAny = false;
      let anyDelayed = false;
      const firstStart = t[1]?.startTime;
      const lastEnd = t[7]?.completionTime;

      for (let n = 1; n <= 7; n++) {
        const s = t[n];
        if (!s?.startTime) continue;
        hasAny = true;
        const actual = elapsedMinutes(s.startTime, s.completionTime);
        const rs = stepRuntimeStatus({ stepNumber: n }, s);
        if (s.completionTime) (perStep[n] ??= []).push(actual);
        if (rs.delayed) {
          anyDelayed = true;
          stepDelayCount[n] = (stepDelayCount[n] ?? 0) + 1;
        }
        if (s.assignedPerson) {
          const rec = (perStaff[s.assignedPerson] ??= { done: 0, delayed: 0, totalMin: 0 });
          if (s.completionTime) { rec.done += 1; rec.totalMin += actual; }
          if (rs.delayed) rec.delayed += 1;
        }
      }
      if (hasAny) totalWithData += 1;
      if (anyDelayed) delayedDeliveries += 1;
      if (firstStart && lastEnd) cycleTimes.push(elapsedMinutes(firstStart, lastEnd));
    }

    const avgPerStep: Record<number, number> = {};
    for (const [k, arr] of Object.entries(perStep)) {
      avgPerStep[Number(k)] = arr.reduce((a, b) => a + b, 0) / arr.length;
    }
    const stepEntries = Object.entries(avgPerStep).map(([k, v]) => ({ step: Number(k), avg: v }));
    stepEntries.sort((a, b) => a.avg - b.avg);
    const fastest = stepEntries[0];
    const slowest = stepEntries[stepEntries.length - 1];
    const mostDelayedStep = Object.entries(stepDelayCount).sort((a, b) => b[1] - a[1])[0];
    const avgCycle = cycleTimes.length ? cycleTimes.reduce((a, b) => a + b, 0) / cycleTimes.length : undefined;
    const delayedPct = totalWithData ? Math.round((delayedDeliveries / totalWithData) * 100) : 0;

    return { avgPerStep, avgCycle, fastest, slowest, mostDelayedStep, delayedDeliveries, delayedPct, perStaff };
  }, [deliveries, timings]);

  // Status counts
  const statusCounts = useMemo(() => {
    const c = { Pending: 0, "Awaiting Dispatch": 0, Dispatched: 0, Completed: 0, Delayed: 0 };
    for (const d of deliveries) {
      const s = deriveDeliveryUiStatus(timings[d.id]);
      c[s.label] += 1;
      if (s.delayed) c.Delayed += 1;
    }
    return c;
  }, [deliveries, timings]);

  return (
    <div className="space-y-5">
      {/* View toggle */}
      <div className="flex items-center justify-between gap-2">
        <div className="inline-flex rounded-md border bg-card p-0.5">
          <button
            onClick={() => setView("risk")}
            className={`inline-flex items-center gap-1.5 rounded px-3 py-1.5 text-xs font-medium transition ${view === "risk" ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:text-foreground"}`}
          >
            <Zap className="size-3.5" /> Risk Panel
          </button>
          <button
            onClick={() => setView("workflow")}
            className={`inline-flex items-center gap-1.5 rounded px-3 py-1.5 text-xs font-medium transition ${view === "workflow" ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:text-foreground"}`}
          >
            <Menu className="size-3.5" /> Step Workflow
          </button>
        </div>
      </div>

      {/* KPI cards */}
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
        <Kpi icon={<Clock className="size-4" />} label="Pending" value={statusCounts.Pending} tone="yellow" />
        <Kpi icon={<Truck className="size-4" />} label="Awaiting dispatch" value={statusCounts["Awaiting Dispatch"]} tone="orange" />
        <Kpi icon={<Truck className="size-4" />} label="Dispatched" value={statusCounts.Dispatched} tone="blue" />
        <Kpi icon={<CheckCircle2 className="size-4" />} label="Completed" value={statusCounts.Completed} tone="green" />
        <Kpi icon={<AlertTriangle className="size-4" />} label="Delayed" value={statusCounts.Delayed} tone="red" />
      </div>

      {/* Analytics row */}
      <div className="grid gap-3 md:grid-cols-4">
        <Kpi icon={<Timer className="size-4" />} label="Avg cycle time" value={formatMinutes(analytics.avgCycle)} tone="blue" />
        <Kpi icon={<Trophy className="size-4" />} label="Fastest step" value={analytics.fastest ? `#${analytics.fastest.step} · ${formatMinutes(analytics.fastest.avg)}` : "—"} tone="green" />
        <Kpi icon={<AlertTriangle className="size-4" />} label="Slowest step" value={analytics.slowest ? `#${analytics.slowest.step} · ${formatMinutes(analytics.slowest.avg)}` : "—"} tone="orange" />
        <Kpi icon={<AlertTriangle className="size-4" />} label="Delayed deliveries" value={`${analytics.delayedDeliveries} · ${analytics.delayedPct}%`} tone="red" />
      </div>

      {view === "risk" ? (
        <Card>
          <CardHeader className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <CardTitle className="text-base font-semibold">Delivery risk panel</CardTitle>
              <p className="mt-1 text-xs text-muted-foreground">One card per delivery. Click to open the full detail view.</p>
            </div>
            <Input value={filter} onChange={(e) => setFilter(e.target.value)} placeholder="Filter by ID, customer, staff…" className="max-w-xs" />
          </CardHeader>
          <CardContent>
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
              {filtered.map((d) => {
                const t = timings[d.id] ?? {};
                const ui = deriveDeliveryUiStatus(t);
                const light = deliveryTrafficLight(t);
                let completed = 0;
                for (let n = 1; n <= 7; n++) if (t[n]?.completionTime) completed += 1;
                const pct = Math.round((completed / 7) * 100);
                const barTone = light === "red" ? "bg-status-red" : light === "yellow" ? "bg-status-yellow" : light === "green" ? "bg-status-green" : "bg-muted-foreground/40";
                const badgeTone = ui.label === "Completed" ? "green" : "yellow";
                return (
                  <button
                    key={d.id}
                    onClick={() => onOpenDelivery?.(d.id)}
                    className={`text-left rounded-md border bg-card p-4 transition hover:border-primary hover:shadow-sm ${ui.delayed ? "border-status-red" : ""}`}
                  >
                    <div className="flex items-start justify-between gap-2">
                      <div className="min-w-0">
                        <p className="font-mono text-[11px] text-muted-foreground">{d.id}</p>
                        <p className="truncate text-sm font-semibold">{d.customerName}</p>
                      </div>
                      <TrafficStack light={light} />
                    </div>
                    <div className="mt-3 flex items-center justify-between text-[11px] text-muted-foreground">
                      <span>Steps {completed}/7</span>
                      <span>{pct}%</span>
                    </div>
                    <div className="mt-1 h-2 w-full overflow-hidden rounded-full bg-muted">
                      <div className={`h-full ${barTone}`} style={{ width: `${pct}%` }} />
                    </div>
                    <div className="mt-3 flex flex-wrap items-center gap-1.5">
                      {ui.delayed ? <StatusBadge status="red" label="Delayed" /> : null}
                      <StatusBadge status={badgeTone as "green" | "yellow" | "red"} label={ui.label} />
                    </div>
                  </button>
                );
              })}
              {filtered.length === 0 ? (
                <p className="col-span-full rounded-md border border-dashed p-4 text-center text-xs text-muted-foreground">No deliveries match this filter.</p>
              ) : null}
            </div>
          </CardContent>
        </Card>
      ) : (
      <Card>
        <CardHeader className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <CardTitle className="text-base font-semibold">Live delivery workflow · 7 timed steps</CardTitle>
            <p className="mt-1 text-xs text-muted-foreground">
              Each step has a target time. Start and complete steps to record actual times. Timers tick live and persist across refresh.
            </p>
          </div>
          <Input value={filter} onChange={(e) => setFilter(e.target.value)} placeholder="Filter by ID, customer, staff…" className="max-w-xs" />
        </CardHeader>
        <CardContent className="space-y-4">
          {filtered.map((d) => {
            const t = timings[d.id] ?? {};
            const ui = deriveDeliveryUiStatus(t);
            const badgeTone = ui.label === "Completed" ? "green" : ui.label === "Dispatched" ? "yellow" : ui.label === "Awaiting Dispatch" ? "yellow" : "yellow";
            const deliveryLight = deliveryTrafficLight(t);
            return (
              <div key={d.id} className={`rounded-md border p-4 ${ui.delayed ? "border-status-red" : ""}`}>
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <button className="flex items-center gap-3 text-left" onClick={() => onOpenDelivery?.(d.id)}>
                    <TrafficStack light={deliveryLight} />
                    <div>
                      <p className="font-mono text-[11px] text-muted-foreground">{d.id} · due {d.dueDate}</p>
                      <p className="text-sm font-semibold">{d.customerName}</p>
                      <p className="text-[11px] text-muted-foreground">Marketer {d.assignedMarketer} · Ops {d.assignedOps}</p>
                    </div>
                  </button>
                  <div className="flex items-center gap-2">
                    {ui.delayed ? <StatusBadge status="red" label="Delayed" /> : null}
                    <StatusBadge status={badgeTone as "green" | "yellow" | "red"} label={ui.label} />
                  </div>
                </div>
                <div className="mt-3 overflow-x-auto">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead className="w-[48px]">#</TableHead>
                        <TableHead>Step</TableHead>
                        <TableHead>Dept</TableHead>
                        <TableHead>Assigned</TableHead>
                        <TableHead className="text-right">Target</TableHead>
                        <TableHead className="text-right">Actual</TableHead>
                        <TableHead className="text-right">Status</TableHead>
                        <TableHead className="text-right">Action</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {OPERATION_STEPS.map((step) => {
                        const s = t[step.stepNumber];
                        const rs = stepRuntimeStatus(step, s);
                        const prev = t[step.stepNumber - 1];
                        const prevDone = step.stepNumber === 1 || Boolean(prev?.completionTime);
                        const rowTone = rs.delayed ? "bg-status-red/5" : rs.status === "COMPLETED" ? "bg-status-green/5" : rs.status === "IN_PROGRESS" ? "bg-blue-500/5" : "";
                        const light = trafficLightFor(rs.status, rs.actualMinutes, rs.target);
                        return (
                          <TableRow key={step.stepNumber} className={rowTone}>
                            <TableCell className="font-mono text-xs text-muted-foreground">
                              <span className="inline-flex items-center gap-1.5">
                                <TrafficDot light={light} />
                                {step.stepNumber}
                              </span>
                            </TableCell>
                            <TableCell className="text-sm">{step.name}</TableCell>
                            <TableCell className="text-xs text-muted-foreground">{STEP_DEPARTMENT[step.stepNumber]}</TableCell>
                            <TableCell className="text-xs">
                              {s?.assignedPerson ? <span className="inline-flex items-center gap-1"><User className="size-3" />{s.assignedPerson}</span> : "—"}
                            </TableCell>
                            <TableCell className="text-right text-xs">{STEP_TARGET_MINUTES[step.stepNumber]}m</TableCell>
                            <TableCell className="text-right text-xs font-mono">
                              <div className="flex flex-col items-end">
                                <span>{rs.status === "NOT_STARTED" ? "—" : formatMinutes(rs.actualMinutes)}</span>
                                <TimerBar status={rs.status} actual={rs.actualMinutes} target={rs.target} />
                              </div>
                            </TableCell>
                            <TableCell className="text-right">
                              <div className="inline-flex items-center gap-2">
                                <TrafficDot light={light} size="lg" />
                                {rs.status === "NOT_STARTED" ? <StatusBadge status="yellow" label="Not started" />
                                  : rs.status === "IN_PROGRESS" ? <StatusBadge status={light === "red" ? "red" : light === "yellow" ? "yellow" : "green"} label={light === "red" ? "Over target" : light === "yellow" ? "Nearing target" : "On track"} />
                                  : rs.status === "DELAYED" ? <StatusBadge status="red" label="Delayed" />
                                  : <StatusBadge status={light === "red" ? "red" : "green"} label={light === "red" ? "Completed late" : "Completed"} />}
                              </div>
                            </TableCell>
                            <TableCell className="text-right">
                              {!s?.startTime && prevDone ? (
                                <Button size="sm" variant="outline" className="h-7 gap-1 text-[11px]" onClick={() => startStep(d.id, step.stepNumber)}>
                                  <Play className="size-3" /> Start
                                </Button>
                              ) : s?.startTime && !s?.completionTime ? (
                                <Button size="sm" className="h-7 gap-1 text-[11px]" onClick={() => completeStep(d.id, step.stepNumber)}>
                                  <CheckCircle2 className="size-3" /> Complete
                                </Button>
                              ) : s?.completionTime ? (
                                <span className="text-[11px] text-muted-foreground">Done</span>
                              ) : (
                                <span className="text-[11px] text-muted-foreground">Waiting</span>
                              )}
                            </TableCell>
                          </TableRow>
                        );
                      })}
                    </TableBody>
                  </Table>
                </div>
              </div>
            );
          })}
          {filtered.length === 0 ? (
            <p className="rounded-md border border-dashed p-4 text-center text-xs text-muted-foreground">No deliveries match this filter.</p>
          ) : null}
        </CardContent>
      </Card>
      )}

      {/* Staff leaderboard */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base font-semibold flex items-center gap-2"><Trophy className="size-4" /> Staff accountability leaderboard</CardTitle>
        </CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Staff</TableHead>
                <TableHead className="text-right">Steps completed</TableHead>
                <TableHead className="text-right">Delayed</TableHead>
                <TableHead className="text-right">Avg time / step</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {Object.entries(analytics.perStaff).sort((a, b) => b[1].done - a[1].done).map(([name, r]) => (
                <TableRow key={name}>
                  <TableCell className="font-medium text-sm">{name}</TableCell>
                  <TableCell className="text-right text-sm">{r.done}</TableCell>
                  <TableCell className="text-right text-sm">
                    {r.delayed > 0 ? <StatusBadge status="red" label={String(r.delayed)} /> : <span className="text-muted-foreground">0</span>}
                  </TableCell>
                  <TableCell className="text-right text-sm font-mono">{r.done ? formatMinutes(r.totalMin / r.done) : "—"}</TableCell>
                </TableRow>
              ))}
              {Object.keys(analytics.perStaff).length === 0 ? (
                <TableRow><TableCell colSpan={4} className="text-center text-xs text-muted-foreground">No timing data recorded yet — start a step above.</TableCell></TableRow>
              ) : null}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  );
}

function Kpi({ icon, label, value, tone }: { icon: React.ReactNode; label: string; value: string | number; tone: "green" | "yellow" | "red" | "orange" | "blue" }) {
  const tones: Record<string, string> = {
    green: "bg-status-green/15 text-status-green",
    yellow: "bg-status-yellow/20 text-status-yellow-foreground",
    red: "bg-status-red/15 text-status-red",
    orange: "bg-orange-500/15 text-orange-600",
    blue: "bg-blue-500/15 text-blue-600",
  };
  return (
    <Card>
      <CardContent className="flex items-start gap-3 p-4">
        <div className={`grid size-9 place-items-center rounded-md ${tones[tone]}`}>{icon}</div>
        <div className="min-w-0">
          <p className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">{label}</p>
          <p className="mt-0.5 text-lg font-semibold">{value}</p>
        </div>
      </CardContent>
    </Card>
  );
}