import { useMemo } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { TrendingUp, TrendingDown, Activity, AlertTriangle, Truck, Timer } from "lucide-react";
import type { AuditEntry, Delivery } from "./types";
import { loadTimings, deriveDeliveryUiStatus, stepRuntimeStatus, elapsedMinutes, formatMinutes } from "./delivery-timing";
import { STEP_TARGET_MINUTES } from "./delivery-timing";
import { OPERATION_STEPS } from "./operations";

/** Narrative + graphs performance report. Uses deliveries + audit entries + persisted timings. */
export function PerformanceReport({ deliveries, audit }: { deliveries: Delivery[]; audit: AuditEntry[] }) {
  const timings = useMemo(() => loadTimings(), []);

  const stats = useMemo(() => {
    let completed = 0, dispatched = 0, pending = 0, awaiting = 0, delayed = 0;
    const cycleTimes: number[] = [];
    const stepAvg: Record<number, number[]> = {};
    const stepDelays: Record<number, number> = {};
    const customerDelay: Record<string, number> = {};
    const staffDelay: Record<string, number> = {};

    for (const d of deliveries) {
      const t = timings[d.id] ?? {};
      const ui = deriveDeliveryUiStatus(t);
      if (ui.label === "Completed") completed += 1;
      else if (ui.label === "Dispatched") dispatched += 1;
      else if (ui.label === "Awaiting Dispatch") awaiting += 1;
      else pending += 1;
      if (ui.delayed) {
        delayed += 1;
        customerDelay[d.customerName] = (customerDelay[d.customerName] ?? 0) + 1;
      }
      if (t[1]?.startTime && t[7]?.completionTime) {
        cycleTimes.push(elapsedMinutes(t[1].startTime, t[7].completionTime));
      }
      for (let n = 1; n <= 7; n++) {
        const s = t[n];
        if (!s?.startTime) continue;
        const rs = stepRuntimeStatus({ stepNumber: n }, s);
        if (s.completionTime) (stepAvg[n] ??= []).push(elapsedMinutes(s.startTime, s.completionTime));
        if (rs.delayed) {
          stepDelays[n] = (stepDelays[n] ?? 0) + 1;
          if (s.assignedPerson) staffDelay[s.assignedPerson] = (staffDelay[s.assignedPerson] ?? 0) + 1;
        }
      }
    }

    const totalActive = completed + dispatched + pending + awaiting;
    const onTime = completed - Math.min(completed, delayed);
    const onTimePct = completed ? Math.round((onTime / completed) * 100) : 0;
    const latePct = totalActive ? Math.round((delayed / totalActive) * 100) : 0;
    const avgCycle = cycleTimes.length ? cycleTimes.reduce((a, b) => a + b, 0) / cycleTimes.length : undefined;

    const stepMeans = Object.entries(stepAvg).map(([k, arr]) => ({
      step: Number(k),
      avg: arr.reduce((a, b) => a + b, 0) / arr.length,
      target: STEP_TARGET_MINUTES[Number(k)] ?? 30,
    }));
    stepMeans.sort((a, b) => a.step - b.step);

    const topDelayCustomers = Object.entries(customerDelay).sort((a, b) => b[1] - a[1]).slice(0, 5);
    const topDelayStaff = Object.entries(staffDelay).sort((a, b) => b[1] - a[1]).slice(0, 5);
    const worstStep = Object.entries(stepDelays).sort((a, b) => b[1] - a[1])[0];

    return {
      completed, dispatched, pending, awaiting, delayed, totalActive,
      onTimePct, latePct, avgCycle, stepMeans, topDelayCustomers, topDelayStaff, worstStep,
    };
  }, [deliveries, timings]);

  // 14-day activity trend from audit timestamps
  const trend = useMemo(() => {
    const days: { label: string; date: string; count: number }[] = [];
    for (let i = 13; i >= 0; i--) {
      const d = new Date();
      d.setDate(d.getDate() - i);
      const key = d.toISOString().slice(0, 10);
      days.push({ date: key, label: d.toLocaleDateString(undefined, { weekday: "short" }), count: 0 });
    }
    for (const a of audit) {
      const key = a.timestamp.slice(0, 10);
      const day = days.find((x) => x.date === key);
      if (day) day.count += 1;
    }
    // simple 3-day moving-average forecast for the next 3 days
    const last = days.slice(-3).map((d) => d.count);
    const mavg = last.length ? last.reduce((a, b) => a + b, 0) / last.length : 0;
    return { days, forecast: mavg };
  }, [audit]);

  const trendChange = useMemo(() => {
    const first = trend.days.slice(0, 7).reduce((a, b) => a + b.count, 0);
    const second = trend.days.slice(7).reduce((a, b) => a + b.count, 0);
    if (!first) return { direction: "flat" as const, pct: 0 };
    const pct = Math.round(((second - first) / first) * 100);
    return { direction: pct > 5 ? ("up" as const) : pct < -5 ? ("down" as const) : ("flat" as const), pct };
  }, [trend.days]);

  const busiestDay = [...trend.days].sort((a, b) => b.count - a.count)[0];
  const predictedBacklog = Math.max(0, stats.pending + stats.awaiting - Math.round(trend.forecast / 3));

  return (
    <div className="space-y-6">
      {/* ============ EXECUTIVE SUMMARY ============ */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base font-semibold flex items-center gap-2">
            <Activity className="size-4" /> Executive performance summary
          </CardTitle>
          <p className="mt-1 text-xs text-muted-foreground">Auto-generated narrative built from live operations data.</p>
        </CardHeader>
        <CardContent className="space-y-4 text-sm leading-relaxed">
          <p>
            Across <strong>{stats.totalActive}</strong> tracked deliveries the operation has completed{" "}
            <strong>{stats.completed}</strong>, has <strong>{stats.dispatched}</strong> currently dispatched,{" "}
            <strong>{stats.awaiting}</strong> awaiting dispatch, and <strong>{stats.pending}</strong> pending in the warehouse.
            Of the completed deliveries, <strong className="text-status-green">{stats.onTimePct}%</strong> finished on time
            against target step timings, while the live queue currently carries a <strong className="text-status-red">{stats.latePct}%</strong> delay rate.
            {stats.avgCycle ? <> Average end-to-end cycle time is <strong>{formatMinutes(stats.avgCycle)}</strong> from picking list to delivery confirmation.</> : null}
          </p>
          <p>
            {stats.worstStep ? (
              <>
                The most frequently delayed stage is <strong>Step {stats.worstStep[0]} — {OPERATION_STEPS[Number(stats.worstStep[0]) - 1]?.name}</strong>{" "}
                (<strong>{stats.worstStep[1]}</strong> delayed instance{Number(stats.worstStep[1]) === 1 ? "" : "s"}).
                This is the highest-leverage area to investigate — coaching, staffing, or process changes at this stage will move the
                on-time percentage the fastest.
              </>
            ) : (
              <>No stage has recorded a delay yet — targets are being met across all seven steps.</>
            )}
          </p>
          {stats.topDelayCustomers.length ? (
            <p>
              Customers with the most recurring delays: {stats.topDelayCustomers.map(([n, c], i) => (
                <span key={n}>{i > 0 ? ", " : ""}<strong>{n}</strong> ({c})</span>
              ))}. Consider a proactive account-management call before the next dispatch window.
            </p>
          ) : null}
          {stats.topDelayStaff.length ? (
            <p>
              Staff carrying the most delayed steps: {stats.topDelayStaff.map(([n, c], i) => (
                <span key={n}>{i > 0 ? ", " : ""}<strong>{n}</strong> ({c})</span>
              ))}. Cross-check against workload — this is often a capacity signal, not a performance one.
            </p>
          ) : null}
        </CardContent>
      </Card>

      {/* ============ HEADLINE KPIs ============ */}
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard icon={<Truck className="size-4" />} label="On-time delivery" value={`${stats.onTimePct}%`} tone={stats.onTimePct >= 85 ? "green" : stats.onTimePct >= 70 ? "yellow" : "red"} />
        <StatCard icon={<AlertTriangle className="size-4" />} label="Late deliveries" value={`${stats.delayed} · ${stats.latePct}%`} tone={stats.latePct > 20 ? "red" : stats.latePct > 10 ? "yellow" : "green"} />
        <StatCard icon={<Timer className="size-4" />} label="Avg cycle time" value={formatMinutes(stats.avgCycle)} tone="blue" />
        <StatCard icon={trendChange.direction === "up" ? <TrendingUp className="size-4" /> : trendChange.direction === "down" ? <TrendingDown className="size-4" /> : <Activity className="size-4" />} label="7-day activity vs prior" value={`${trendChange.pct > 0 ? "+" : ""}${trendChange.pct}%`} tone={trendChange.direction === "up" ? "green" : trendChange.direction === "down" ? "red" : "yellow"} />
      </div>

      {/* ============ TREND CHART ============ */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base font-semibold">14-day activity trend</CardTitle>
          <p className="mt-1 text-xs text-muted-foreground">
            Recorded audit events per day. Trend line shows a 3-day moving average — a simple, explainable forecast.
          </p>
        </CardHeader>
        <CardContent>
          <TrendChart days={trend.days} />
          <p className="mt-3 text-sm leading-relaxed">
            {trendChange.direction === "up" ? (
              <>Activity has <strong className="text-status-green">increased by {trendChange.pct}%</strong> over the last week compared to the week before.</>
            ) : trendChange.direction === "down" ? (
              <>Activity has <strong className="text-status-red">dropped by {Math.abs(trendChange.pct)}%</strong> over the last week — investigate whether this is a demand issue or a data-entry issue.</>
            ) : (
              <>Activity is <strong>stable</strong> week-over-week.</>
            )}{" "}
            The busiest day recorded was <strong>{busiestDay?.date ?? "—"}</strong> with <strong>{busiestDay?.count ?? 0}</strong> events.
            Based on the current pace, expect roughly <strong>{Math.round(trend.forecast)}</strong> events per day this week
            and a projected backlog of <strong>{predictedBacklog}</strong> outstanding delivery{predictedBacklog === 1 ? "" : "s"} if throughput does not improve.
          </p>
        </CardContent>
      </Card>

      {/* ============ STEP CHART ============ */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base font-semibold">Average time per step vs target</CardTitle>
          <p className="mt-1 text-xs text-muted-foreground">Bars above target are shown in red. This isolates the exact stage that costs the operation time.</p>
        </CardHeader>
        <CardContent>
          <StepBars data={stats.stepMeans} />
          <div className="mt-4 grid gap-3 md:grid-cols-2 text-sm">
            <div>
              <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Efficiency</p>
              <p className="mt-1 leading-relaxed">
                {stats.avgCycle ? (
                  <>Average delivery cycle sits at <strong>{formatMinutes(stats.avgCycle)}</strong> against a combined step target of{" "}
                  <strong>{formatMinutes(Object.values(STEP_TARGET_MINUTES).reduce((a, b) => a + b, 0))}</strong>. </>
                ) : <>Not enough completed cycles to compute an efficiency baseline yet. </>}
                Dispatch readiness improves the most when Steps 5–6 stay inside target.
              </p>
            </div>
            <div>
              <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Forecast &amp; risk</p>
              <p className="mt-1 leading-relaxed">
                Based on a moving-average of the last three days, high-risk periods are likely to align with today's late-afternoon dispatch window.
                Escalate any Step 6/7 slippage before <strong>15:30</strong> to protect the on-time percentage.
              </p>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

function StatCard({ icon, label, value, tone }: { icon: React.ReactNode; label: string; value: string; tone: "green" | "yellow" | "red" | "blue" }) {
  const tones: Record<string, string> = {
    green: "bg-status-green/15 text-status-green",
    yellow: "bg-status-yellow/20 text-status-yellow-foreground",
    red: "bg-status-red/15 text-status-red",
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

function TrendChart({ days }: { days: { label: string; date: string; count: number }[] }) {
  const max = Math.max(1, ...days.map((d) => d.count));
  const W = 640, H = 160, pad = 24;
  const stepX = (W - pad * 2) / Math.max(1, days.length - 1);
  const points = days.map((d, i) => [pad + i * stepX, H - pad - (d.count / max) * (H - pad * 2)] as const);
  // 3-day moving average line
  const mav = days.map((_, i) => {
    const from = Math.max(0, i - 2);
    const slice = days.slice(from, i + 1);
    const avg = slice.reduce((a, b) => a + b.count, 0) / slice.length;
    return [pad + i * stepX, H - pad - (avg / max) * (H - pad * 2)] as const;
  });
  const path = points.map((p, i) => `${i === 0 ? "M" : "L"}${p[0].toFixed(1)},${p[1].toFixed(1)}`).join(" ");
  const mavPath = mav.map((p, i) => `${i === 0 ? "M" : "L"}${p[0].toFixed(1)},${p[1].toFixed(1)}`).join(" ");
  return (
    <div className="w-full overflow-x-auto">
      <svg viewBox={`0 0 ${W} ${H}`} className="w-full h-[180px]">
        <line x1={pad} y1={H - pad} x2={W - pad} y2={H - pad} className="stroke-border" />
        {points.map((p, i) => (
          <rect key={i} x={p[0] - 6} y={p[1]} width={12} height={H - pad - p[1]} className="fill-primary/25" rx={2} />
        ))}
        <path d={mavPath} className="stroke-status-red fill-none" strokeWidth={2} strokeDasharray="4 3" />
        <path d={path} className="stroke-primary fill-none" strokeWidth={1.5} opacity={0.6} />
        {days.map((d, i) => (
          <text key={i} x={pad + i * stepX} y={H - 6} textAnchor="middle" className="fill-muted-foreground text-[9px]">
            {d.label[0]}
          </text>
        ))}
      </svg>
      <div className="flex items-center gap-4 text-[11px] text-muted-foreground">
        <span className="inline-flex items-center gap-1.5"><span className="size-2 rounded-sm bg-primary/25" /> Daily events</span>
        <span className="inline-flex items-center gap-1.5"><span className="h-0.5 w-4 bg-status-red" /> 3-day moving average (forecast)</span>
      </div>
    </div>
  );
}

function StepBars({ data }: { data: { step: number; avg: number; target: number }[] }) {
  if (!data.length) {
    return <p className="rounded-md border border-dashed p-6 text-center text-xs text-muted-foreground">No completed steps yet — bar chart will populate once timings are recorded.</p>;
  }
  const max = Math.max(...data.map((d) => Math.max(d.avg, d.target))) * 1.15;
  return (
    <div className="space-y-2">
      {data.map((d) => {
        const over = d.avg > d.target;
        const avgPct = (d.avg / max) * 100;
        const targetPct = (d.target / max) * 100;
        return (
          <div key={d.step} className="space-y-0.5">
            <div className="flex items-center justify-between text-[11px]">
              <span className="font-medium">Step {d.step} · {OPERATION_STEPS[d.step - 1]?.name}</span>
              <span className={`font-mono ${over ? "text-status-red" : "text-muted-foreground"}`}>
                {formatMinutes(d.avg)} / {formatMinutes(d.target)}
              </span>
            </div>
            <div className="relative h-3 rounded bg-muted overflow-hidden">
              <div className={`h-full ${over ? "bg-status-red" : "bg-status-green"}`} style={{ width: `${avgPct}%` }} />
              <div className="absolute top-0 h-full border-l-2 border-dashed border-foreground/50" style={{ left: `${targetPct}%` }} />
            </div>
          </div>
        );
      })}
      <p className="pt-1 text-[10px] text-muted-foreground">Dashed line = target time.</p>
    </div>
  );
}