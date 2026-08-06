import { useMemo } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Activity, AlertTriangle, Timer, TrendingDown, TrendingUp, Truck } from "lucide-react";
import type { AuditEntry } from "./types";
import { STEP_TARGET_MINUTES, formatMinutes } from "./delivery-timing";
import { MIN_CYCLE_SAMPLES, bottlenecks, summarise, topDelayReason, type ResolvedDelivery } from "./delivery-status";
import { OPERATION_STEPS } from "./operations";
import { NO_DATA, countLabel, formatDay, plural } from "./clock";

/** Narrative + graphs performance report. Reads the same resolved delivery
 *  records as the Overview and the Command Centre, so every total agrees. */
export function PerformanceReport({
  resolved, audit, todayIso,
}: { resolved: ResolvedDelivery[]; audit: AuditEntry[]; todayIso: string }) {
  const totals = useMemo(() => summarise(resolved, todayIso), [resolved, todayIso]);
  const ranked = useMemo(() => bottlenecks(resolved), [resolved]);
  const worstStep = ranked.find((b) => b.delays > 0);
  const delayReason = useMemo(() => topDelayReason(resolved), [resolved]);

  const customerDelays = useMemo(() => {
    const tally: Record<string, number> = {};
    for (const r of resolved) if (r.delayed) tally[r.d.customerName] = (tally[r.d.customerName] ?? 0) + 1;
    return Object.entries(tally).sort((a, b) => b[1] - a[1]).slice(0, 5);
  }, [resolved]);

  const staffDelays = useMemo(() => {
    const tally: Record<string, number> = {};
    for (const r of resolved) {
      for (const n of r.delayedSteps) {
        const who = r.timings[n]?.assignedPerson;
        if (who) tally[who] = (tally[who] ?? 0) + 1;
      }
    }
    return Object.entries(tally).sort((a, b) => b[1] - a[1]).slice(0, 5);
  }, [resolved]);

  const trend = useMemo(() => {
    const days: { label: string; date: string; count: number }[] = [];
    for (let i = 13; i >= 0; i--) {
      const d = new Date(Date.now() - i * 86_400_000);
      days.push({ date: d.toISOString().slice(0, 10), label: d.toLocaleDateString("en-GB", { weekday: "short" }), count: 0 });
    }
    for (const a of audit) {
      const day = days.find((x) => x.date === a.timestamp.slice(0, 10));
      if (day) day.count += 1;
    }
    const activeDays = days.filter((d) => d.count > 0).length;
    const last3 = days.slice(-3).map((d) => d.count);
    return {
      days,
      activeDays,
      // A forecast is only defensible with enough recorded history behind it.
      forecast: activeDays >= 5 ? last3.reduce((a, b) => a + b, 0) / last3.length : undefined,
    };
  }, [audit]);

  const trendChange = useMemo(() => {
    const first = trend.days.slice(0, 7).reduce((a, b) => a + b.count, 0);
    const second = trend.days.slice(7).reduce((a, b) => a + b.count, 0);
    const firstActive = trend.days.slice(0, 7).filter((d) => d.count > 0).length;
    const secondActive = trend.days.slice(7).filter((d) => d.count > 0).length;
    if (firstActive < 3 || secondActive < 3 || !first) return undefined;
    const pct = Math.round(((second - first) / first) * 100);
    return { direction: pct > 5 ? ("up" as const) : pct < -5 ? ("down" as const) : ("flat" as const), pct };
  }, [trend.days]);

  const busiestDay = [...trend.days].sort((a, b) => b.count - a.count)[0];
  const cleanRun = totals.blocked === 0 && totals.late === 0 && totals.atRisk === 0;

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base font-semibold">
            <Activity className="size-4" /> Executive performance summary
          </CardTitle>
          <p className="mt-1 text-xs text-muted-foreground">Rule-based narrative over the same deterministic figures shown on the Overview.</p>
        </CardHeader>
        <CardContent className="space-y-4 text-sm leading-relaxed">
          <p>
            Across {countLabel(totals.total, "tracked delivery")} the operation has completed <strong>{totals.completed}</strong>,
            has <strong>{totals.dispatched}</strong> currently dispatched, <strong>{totals.awaitingDispatch}</strong> awaiting dispatch
            and <strong>{totals.pending}</strong> still pending in the warehouse.{" "}
            {totals.onTimeRate == null ? (
              <>On-time performance is not reported yet — no delivery has been completed.</>
            ) : (
              <>Of the completed deliveries, <strong className="text-status-green">{totals.onTimeRate}%</strong> finished inside the target step timings.</>
            )}{" "}
            {totals.avgCycleMinutes
              ? <>Average end-to-end cycle time is <strong>{formatMinutes(totals.avgCycleMinutes)}</strong> across {countLabel(totals.cycleSamples, "measured cycle")}.</>
              : <>Insufficient completed-cycle history to calculate average cycle time reliably ({countLabel(totals.cycleSamples, "cycle")} recorded, {MIN_CYCLE_SAMPLES} needed).</>}
          </p>
          <p>
            {cleanRun ? (
              <>No delivery is currently blocked, late or at risk, and no stage has overrun its target — targets are being met.</>
            ) : (
              <>
                Targets are <strong>not</strong> being met cleanly: {countLabel(totals.blocked, "delivery")} blocked,{" "}
                {countLabel(totals.late, "delivery")} past a dispatch cutoff and {countLabel(totals.atRisk, "delivery")} flagged at risk.
                {worstStep ? (
                  <> The most frequently delayed stage is <strong>Step {worstStep.step} — {OPERATION_STEPS[worstStep.step - 1]?.name}</strong>{" "}
                    ({countLabel(worstStep.delays, "overrun")}), which is the highest-leverage place to intervene.</>
                ) : null}
                {delayReason ? <> The dominant recorded reason is &ldquo;{delayReason.reason}&rdquo; ({countLabel(delayReason.count, "occurrence")}).</> : null}
              </>
            )}
          </p>
          {customerDelays.length ? (
            <p>
              Customers with the most recurring delays: {customerDelays.map(([n, c], i) => (
                <span key={n}>{i > 0 ? ", " : ""}<strong>{n}</strong> ({c})</span>
              ))}. Consider a proactive account call before the next dispatch window.
            </p>
          ) : null}
          {staffDelays.length ? (
            <p>
              Staff carrying the most delayed steps: {staffDelays.map(([n, c], i) => (
                <span key={n}>{i > 0 ? ", " : ""}<strong>{n}</strong> ({c})</span>
              ))}. Cross-check against workload — this is often a capacity signal, not a performance one.
            </p>
          ) : null}
        </CardContent>
      </Card>

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard icon={<Truck className="size-4" />} label="On-time delivery" value={totals.onTimeRate == null ? NO_DATA : `${totals.onTimeRate}%`} tone={(totals.onTimeRate ?? 0) >= 85 ? "green" : (totals.onTimeRate ?? 0) >= 70 ? "yellow" : "red"} />
        <StatCard icon={<AlertTriangle className="size-4" />} label="Delayed or blocked" value={totals.delayedRate == null ? NO_DATA : `${totals.late + totals.blocked} · ${totals.delayedRate}%`} tone={(totals.delayedRate ?? 0) > 20 ? "red" : (totals.delayedRate ?? 0) > 10 ? "yellow" : "green"} />
        <StatCard icon={<Timer className="size-4" />} label="Avg cycle time" value={totals.avgCycleMinutes ? formatMinutes(totals.avgCycleMinutes) : NO_DATA} tone="blue" />
        <StatCard
          icon={trendChange?.direction === "up" ? <TrendingUp className="size-4" /> : trendChange?.direction === "down" ? <TrendingDown className="size-4" /> : <Activity className="size-4" />}
          label="7-day activity vs prior"
          value={trendChange ? `${trendChange.pct > 0 ? "+" : ""}${trendChange.pct}%` : NO_DATA}
          tone={trendChange?.direction === "up" ? "green" : trendChange?.direction === "down" ? "red" : "yellow"}
        />
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base font-semibold">14-day activity trend</CardTitle>
          <p className="mt-1 text-xs text-muted-foreground">Recorded audit events per day. The dashed line is a 3-day moving average.</p>
        </CardHeader>
        <CardContent>
          <TrendChart days={trend.days} />
          <p className="mt-3 text-sm leading-relaxed">
            {trendChange ? (
              trendChange.direction === "up"
                ? <>Activity has <strong className="text-status-green">increased by {trendChange.pct}%</strong> week-on-week.</>
                : trendChange.direction === "down"
                  ? <>Activity has <strong className="text-status-red">dropped by {Math.abs(trendChange.pct)}%</strong> week-on-week — check whether this is demand or data entry.</>
                  : <>Activity is <strong>stable</strong> week-on-week.</>
            ) : (
              <>A week-on-week comparison is withheld: both seven-day periods need recorded activity on at least three days.</>
            )}{" "}
            The busiest day recorded was <strong>{formatDay(busiestDay?.date)}</strong> with {countLabel(busiestDay?.count ?? 0, "event")}.{" "}
            {trend.forecast != null ? (
              <>Based on the last three days, expect roughly <strong>{Math.round(trend.forecast)}</strong> {plural(Math.round(trend.forecast), "event")} per day,
                against a backlog of <strong>{totals.backlog}</strong> outstanding {plural(totals.backlog, "delivery")}.</>
            ) : (
              <>No forecast is published: {countLabel(trend.activeDays, "day")} of the last fourteen carry recorded activity, which is not enough history for a defensible projection.</>
            )}
          </p>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base font-semibold">Average time per step vs target</CardTitle>
          <p className="mt-1 text-xs text-muted-foreground">Bars above target are shown in red — this isolates the stage that costs the operation time.</p>
        </CardHeader>
        <CardContent>
          <StepBars data={ranked.filter((b) => b.samples > 0).map((b) => ({ step: b.step, avg: b.avgMinutes ?? 0, target: b.target })).sort((a, b) => a.step - b.step)} />
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
    blue: "bg-primary/15 text-primary",
  };
  return (
    <Card>
      <CardContent className="flex items-start gap-3 p-4">
        <div className={`grid size-9 place-items-center rounded-md ${tones[tone]}`}>{icon}</div>
        <div className="min-w-0">
          <p className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">{label}</p>
          <p className="mt-0.5 truncate text-lg font-semibold">{value}</p>
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
  const mav = days.map((_, i) => {
    const slice = days.slice(Math.max(0, i - 2), i + 1);
    const avg = slice.reduce((a, b) => a + b.count, 0) / slice.length;
    return [pad + i * stepX, H - pad - (avg / max) * (H - pad * 2)] as const;
  });
  const path = points.map((p, i) => `${i === 0 ? "M" : "L"}${p[0].toFixed(1)},${p[1].toFixed(1)}`).join(" ");
  const mavPath = mav.map((p, i) => `${i === 0 ? "M" : "L"}${p[0].toFixed(1)},${p[1].toFixed(1)}`).join(" ");
  return (
    <div className="w-full overflow-x-auto">
      <svg viewBox={`0 0 ${W} ${H}`} className="h-[180px] w-full">
        <line x1={pad} y1={H - pad} x2={W - pad} y2={H - pad} className="stroke-border" />
        {points.map((p, i) => (
          <rect key={i} x={p[0] - 6} y={p[1]} width={12} height={H - pad - p[1]} className="fill-primary/25" rx={2} />
        ))}
        <path d={mavPath} className="fill-none stroke-status-red" strokeWidth={2} strokeDasharray="4 3" />
        <path d={path} className="fill-none stroke-primary" strokeWidth={1.5} opacity={0.6} />
        {days.map((d, i) => (
          <text key={i} x={pad + i * stepX} y={H - 6} textAnchor="middle" className="fill-muted-foreground text-[9px]">{d.label[0]}</text>
        ))}
      </svg>
      <div className="flex items-center gap-4 text-[11px] text-muted-foreground">
        <span className="inline-flex items-center gap-1.5"><span className="size-2 rounded-sm bg-primary/25" /> Daily events</span>
        <span className="inline-flex items-center gap-1.5"><span className="h-0.5 w-4 bg-status-red" /> 3-day moving average</span>
      </div>
    </div>
  );
}

function StepBars({ data }: { data: { step: number; avg: number; target: number }[] }) {
  if (!data.length) {
    return <p className="rounded-md border border-dashed p-6 text-center text-xs text-muted-foreground">No completed steps recorded yet — this chart populates once timings exist.</p>;
  }
  const max = Math.max(...data.map((d) => Math.max(d.avg, d.target))) * 1.15;
  return (
    <div className="space-y-2">
      {data.map((d) => {
        const over = d.avg > d.target;
        return (
          <div key={d.step} className="space-y-0.5">
            <div className="flex items-center justify-between text-[11px]">
              <span className="font-medium">Step {d.step} · {OPERATION_STEPS[d.step - 1]?.name}</span>
              <span className={`font-mono ${over ? "text-status-red" : "text-muted-foreground"}`}>
                {formatMinutes(d.avg)} / {formatMinutes(d.target)}
              </span>
            </div>
            <div className="relative h-3 overflow-hidden rounded bg-muted">
              <div className={`h-full ${over ? "bg-status-red" : "bg-status-green"}`} style={{ width: `${(d.avg / max) * 100}%` }} />
              <div className="absolute top-0 h-full border-l-2 border-dashed border-foreground/50" style={{ left: `${(d.target / max) * 100}%` }} />
            </div>
          </div>
        );
      })}
      <p className="pt-1 text-[10px] text-muted-foreground">Dashed line = target time. Targets: {Object.values(STEP_TARGET_MINUTES).reduce((a, b) => a + b, 0)} minutes end to end.</p>
    </div>
  );
}
