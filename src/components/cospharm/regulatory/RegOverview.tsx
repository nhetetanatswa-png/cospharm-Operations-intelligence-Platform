import { useMemo } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { formatDay } from "../clock";
import { computeMetrics, computeRag, PARTY_LABEL, pct, PROCESS_LABEL, stagesFor, summariseClocks } from "./logic";
import { workingDaysUntil } from "./workdays";
import { Bar, EmptyState, KpiCard, RagBadge } from "./RegBits";
import type { RegulatoryState } from "./types";

export function RegOverview({
  state,
  nowMs,
  onOpenCase,
}: {
  state: RegulatoryState;
  nowMs: number;
  onOpenCase: (id: string) => void;
}) {
  const { cases, queries, tasks, holidays, sla } = state;

  const m = useMemo(
    () => computeMetrics({ cases, tasks, queries, nowMs, holidays }),
    [cases, tasks, queries, nowMs, holidays],
  );

  const rags = useMemo(
    () => new Map(cases.map((c) => [c.id, computeRag(c, { nowMs, holidays, sla, queries })] as const)),
    [cases, nowMs, holidays, sla, queries],
  );

  const stageCounts = useMemo(() => {
    const rows: { stage: string; process: string; count: number; avgAge: number }[] = [];
    for (const p of ["registration", "variation", "exemption"] as const) {
      for (const stage of stagesFor(p)) {
        const list = cases.filter((c) => c.processType === p && c.currentStage === stage && c.status === "active");
        if (!list.length) continue;
        const avgAge =
          list.reduce((a, c) => a + summariseClocks(c, state.clocks, nowMs, holidays).stageAgeDays, 0) / list.length;
        rows.push({ stage, process: PROCESS_LABEL[p], count: list.length, avgAge: Math.round(avgAge) });
      }
    }
    return rows.sort((a, b) => b.avgAge - a.avgAge);
  }, [cases, state.clocks, nowMs, holidays]);

  const deadlines = useMemo(() => {
    const rows = cases
      .filter((c) => ["active", "paused"].includes(c.status))
      .flatMap((c) =>
        (
          [
            ["Internal milestone", c.internalDueAt],
            ["Regulatory deadline", c.regulatoryDueAt],
          ] as const
        )
          .filter(([, d]) => !!d)
          .map(([kind, d]) => ({
            id: c.id,
            caseNumber: c.caseNumber,
            title: c.title,
            kind,
            due: d as string,
            days: workingDaysUntil(d as string, nowMs, holidays) ?? 0,
          })),
      );
    return rows.sort((a, b) => a.days - b.days).slice(0, 12);
  }, [cases, nowMs, holidays]);

  const exceptions = cases.filter((c) => rags.get(c.id) === "red");

  const manufacturerScore = useMemo(() => {
    const map = new Map<string, { days: number; n: number }>();
    for (const c of cases) {
      const s = summariseClocks(c, state.clocks, nowMs, holidays);
      const cur = map.get(c.manufacturerName) ?? { days: 0, n: 0 };
      map.set(c.manufacturerName, { days: cur.days + s.externalDays, n: cur.n + 1 });
    }
    return [...map.entries()]
      .map(([name, v]) => ({ name, avg: Math.round(v.days / Math.max(1, v.n)), cases: v.n }))
      .sort((a, b) => b.avg - a.avg);
  }, [cases, state.clocks, nowMs, holidays]);

  const outcomes = useMemo(() => {
    const counts = { approved: 0, rejected: 0, withdrawn: 0, pending: 0 };
    for (const c of cases) {
      if (c.status === "approved") counts.approved++;
      else if (c.status === "rejected") counts.rejected++;
      else if (c.status === "withdrawn") counts.withdrawn++;
      else counts.pending++;
    }
    return counts;
  }, [cases]);

  const queryCategories = useMemo(() => {
    const map = new Map<string, number>();
    for (const q of queries) map.set(q.category, (map.get(q.category) ?? 0) + 1);
    return [...map.entries()].sort((a, b) => b[1] - a[1]);
  }, [queries]);

  const maxStageAge = Math.max(1, ...stageCounts.map((s) => s.avgAge));

  return (
    <div className="space-y-4">
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <KpiCard label="Active registrations" value={m.activeRegistrations} sub="Open dossier files" />
        <KpiCard label="Active variations" value={m.activeVariations} sub="Change control in flight" />
        <KpiCard label="Active exemptions" value={m.activeExemptions} sub="Named-patient & consignment" />
        <KpiCard label="Overdue Cospharm milestones" value={m.overdueMilestones} tone={m.overdueMilestones ? "red" : "green"} sub="Controllable tasks past due" />
        <KpiCard label="Queries due within 7 days" value={m.queriesDueIn7} tone={m.queriesDueIn7 ? "amber" : "green"} sub="Regulator response deadlines" />
        <KpiCard label="Waiting on manufacturers" value={m.waitingManufacturer} sub="External clock running" />
        <KpiCard label="Currently with BoMRA" value={m.withBomra} sub="Under regulatory review" />
        <KpiCard label="Overdue case rate" value={pct(m.overdueCaseRate)} tone={(m.overdueCaseRate.value ?? 0) > 0.2 ? "red" : "green"} sub={`${m.overdueCaseRate.numerator}/${m.overdueCaseRate.denominator} active cases`} />
      </div>

      <div className="grid gap-3 sm:grid-cols-3">
        <KpiCard label="On-time controllable milestone rate" value={pct(m.onTimeControllableMilestoneRate)} sub={`${m.onTimeControllableMilestoneRate.numerator}/${m.onTimeControllableMilestoneRate.denominator} completed milestones`} />
        <KpiCard label="First-pass dossier completeness" value={pct(m.firstPassDossierCompleteness)} sub={`${m.firstPassDossierCompleteness.numerator}/${m.firstPassDossierCompleteness.denominator} dossiers reviewed`} />
        <KpiCard label="Query response compliance" value={pct(m.queryResponseCompliance)} sub={`${m.queryResponseCompliance.numerator}/${m.queryResponseCompliance.denominator} queries submitted`} />
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle className="text-base font-semibold">Stage age & bottlenecks</CardTitle>
            <p className="text-xs text-muted-foreground">Average working days active cases have spent in their current stage.</p>
          </CardHeader>
          <CardContent className="space-y-3">
            {stageCounts.length === 0 ? <EmptyState message="No active cases." /> : stageCounts.slice(0, 10).map((s) => (
              <div key={`${s.process}-${s.stage}`}>
                <div className="flex items-baseline justify-between gap-3 text-xs">
                  <span className="truncate font-medium">{s.stage}</span>
                  <span className="shrink-0 text-muted-foreground">{s.count} · {s.avgAge}d</span>
                </div>
                <div className="mt-1"><Bar value={s.avgAge} max={maxStageAge} tone={s.avgAge >= maxStageAge * 0.75 ? "red" : "primary"} /></div>
                <p className="mt-0.5 text-[10px] uppercase tracking-wide text-muted-foreground">{s.process}</p>
              </div>
            ))}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-base font-semibold">Critical exception list</CardTitle>
            <p className="text-xs text-muted-foreground">Red cases: overdue, expired, unresolved critical deficiency or unlawful-implementation risk.</p>
          </CardHeader>
          <CardContent className="space-y-2">
            {exceptions.length === 0 ? <EmptyState message="No critical exceptions." /> : exceptions.map((c) => (
              <button key={c.id} onClick={() => onOpenCase(c.id)} className="flex w-full items-center justify-between gap-3 rounded-md border border-status-red/40 bg-status-red/5 p-3 text-left transition hover:bg-status-red/10">
                <div className="min-w-0">
                  <p className="truncate text-sm font-medium">{c.title}</p>
                  <p className="truncate text-xs text-muted-foreground">{c.caseNumber} · {c.currentStage} · {PARTY_LABEL[c.currentResponsibleParty]}</p>
                </div>
                <RagBadge rag="red" />
              </button>
            ))}
          </CardContent>
        </Card>
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader><CardTitle className="text-base font-semibold">Upcoming deadlines</CardTitle></CardHeader>
          <CardContent>
            {deadlines.length === 0 ? <EmptyState message="No dated milestones." /> : (
              <Table>
                <TableHeader>
                  <TableRow><TableHead>Case</TableHead><TableHead>Milestone</TableHead><TableHead>Due</TableHead><TableHead className="text-right">Working days</TableHead></TableRow>
                </TableHeader>
                <TableBody>
                  {deadlines.map((d, i) => (
                    <TableRow key={`${d.id}-${i}`} className="cursor-pointer" onClick={() => onOpenCase(d.id)}>
                      <TableCell className="text-xs font-medium">{d.caseNumber}</TableCell>
                      <TableCell className="text-xs">{d.kind}</TableCell>
                      <TableCell className="text-xs">{formatDay(d.due)}</TableCell>
                      <TableCell className={`text-right text-xs font-medium ${d.days < 0 ? "text-status-red" : d.days <= 5 ? "text-status-yellow-foreground" : ""}`}>
                        {d.days < 0 ? `${Math.abs(d.days)} overdue` : d.days}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            )}
          </CardContent>
        </Card>

        <div className="space-y-4">
          <Card>
            <CardHeader><CardTitle className="text-base font-semibold">Outcomes</CardTitle></CardHeader>
            <CardContent className="grid grid-cols-4 gap-2 text-center">
              {([["Approved", outcomes.approved], ["Rejected", outcomes.rejected], ["Withdrawn", outcomes.withdrawn], ["In progress", outcomes.pending]] as const).map(([l, v]) => (
                <div key={l} className="rounded-md border p-2">
                  <p className="text-lg font-semibold">{v}</p>
                  <p className="text-[10px] uppercase tracking-wide text-muted-foreground">{l}</p>
                </div>
              ))}
            </CardContent>
          </Card>

          <Card>
            <CardHeader><CardTitle className="text-base font-semibold">Query categories</CardTitle></CardHeader>
            <CardContent className="flex flex-wrap gap-2">
              {queryCategories.length === 0 ? <EmptyState message="No queries recorded." /> : queryCategories.map(([cat, n]) => (
                <span key={cat} className="rounded-full border px-2.5 py-0.5 text-xs capitalize">{cat} · {n}</span>
              ))}
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="text-base font-semibold">Manufacturer response scorecard</CardTitle>
              <p className="text-xs text-muted-foreground">Average external waiting days attributed per manufacturer.</p>
            </CardHeader>
            <CardContent className="space-y-2">
              {manufacturerScore.slice(0, 6).map((mf) => (
                <div key={mf.name} className="flex items-center justify-between gap-3 text-xs">
                  <span className="truncate">{mf.name}</span>
                  <span className="shrink-0 text-muted-foreground">{mf.avg}d avg · {mf.cases} cases</span>
                </div>
              ))}
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}