import { useEffect, useMemo, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Download, FileText, RefreshCw } from "lucide-react";
import { Area, AreaChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { StatusBadge } from "./StatusBadge";
import {
  archiveToCsv, backfillArchive, buildForecasts, buildSnapshot, downloadText,
  isoWeekKey, lastCompletedWeekStart, loadArchive, snapshotToMarkdown, upsertSnapshot,
  type IntelligenceInputs, type WeeklySnapshot,
} from "./weekly-intelligence";

/** Weekly intelligence report. Every number here is computed deterministically
 * from operational state; the SWOT/PESTLE wording is rule-based narrative built
 * on top of those same numbers. */
export function IntelligenceModule({ inputs }: { inputs: IntelligenceInputs }) {
  const [archive, setArchive] = useState<WeeklySnapshot[]>([]);
  const [selected, setSelected] = useState<string>("");

  useEffect(() => {
    const list = backfillArchive(inputs, 6);
    setArchive(list);
    setSelected(list.length ? list[list.length - 1].weekKey : "");
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const report = useMemo(() => {
    const base = archive.find((s) => s.weekKey === selected) ?? archive[archive.length - 1];
    if (!base) return null;
    return { ...base, forecasts: buildForecasts(archive, base) };
  }, [archive, selected]);

  function regenerate() {
    const snap = buildSnapshot(lastCompletedWeekStart(), inputs);
    const list = upsertSnapshot(snap);
    setArchive(list);
    setSelected(snap.weekKey);
  }

  if (!report) {
    return (
      <Card>
        <CardContent className="p-6 text-sm text-muted-foreground">
          Building the first weekly report…
          <Button className="ml-3" size="sm" onClick={regenerate}>Generate now</Button>
        </CardContent>
      </Card>
    );
  }

  const k = report.kpis;

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <Select value={selected} onValueChange={setSelected}>
            <SelectTrigger className="w-56"><SelectValue /></SelectTrigger>
            <SelectContent>
              {[...archive].reverse().map((s) => (
                <SelectItem key={s.weekKey} value={s.weekKey}>{s.weekKey} · {s.weekStart} → {s.weekEnd}</SelectItem>
              ))}
            </SelectContent>
          </Select>
          <StatusBadge
            status={report.dataQuality.score >= 80 ? "green" : report.dataQuality.score >= 55 ? "yellow" : "red"}
            label={`Data quality ${report.dataQuality.score}/100`}
          />
          {isoWeekKey(lastCompletedWeekStart()) === report.weekKey ? (
            <span className="text-xs text-muted-foreground">Latest completed week</span>
          ) : null}
        </div>
        <div className="flex flex-wrap gap-2">
          <Button size="sm" variant="outline" className="gap-1.5" onClick={regenerate}><RefreshCw className="size-4" /> Regenerate</Button>
          <Button size="sm" variant="outline" className="gap-1.5" onClick={() => downloadText(`cospharm-${report.weekKey}.md`, snapshotToMarkdown(report))}>
            <FileText className="size-4" /> Download this week
          </Button>
          <Button size="sm" variant="outline" className="gap-1.5" onClick={() => downloadText("cospharm-weekly-history.csv", archiveToCsv(archive), "text/csv")}>
            <Download className="size-4" /> Download history (CSV)
          </Button>
        </div>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base font-semibold">Executive summary — {report.weekKey}</CardTitle>
          <p className="mt-1 text-xs text-muted-foreground">Week of {report.weekStart} to {report.weekEnd}</p>
        </CardHeader>
        <CardContent className="space-y-3 text-sm leading-relaxed">
          <p>{report.executiveSummary}</p>
          <p className="text-xs text-muted-foreground">
            Figures are deterministic calculations from operational records. The SWOT, PESTLE and root-cause wording is generated narrative built on those figures — read it as interpretation, not measurement.
          </p>
        </CardContent>
      </Card>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Kpi label="Deliveries in scope" value={String(k.totalDeliveries)} sub={`${k.completed} completed (${k.completionRate}%)`} />
        <Kpi label="On-time rate" value={`${k.onTimeRate}%`} sub={`${k.late} late · ${k.blocked} blocked`} />
        <Kpi label="Average cycle" value={`${k.avgCycleHours} h`} sub={`${k.deliveriesPerStaff} deliveries per staff member`} />
        <Kpi label="Damage value" value={`P${k.damageValueBWP.toLocaleString()}`} sub={`${k.damageUnits} units · ${k.stockRedLines} red stock lines`} />
      </div>

      <Tabs defaultValue="trends" className="space-y-4">
        <TabsList className="flex w-full flex-wrap sm:inline-flex">
          <TabsTrigger value="trends">Trends &amp; forecast</TabsTrigger>
          <TabsTrigger value="causes">Root causes</TabsTrigger>
          <TabsTrigger value="swot">SWOT &amp; PESTLE</TabsTrigger>
          <TabsTrigger value="actions">Accountable actions</TabsTrigger>
          <TabsTrigger value="history">History</TabsTrigger>
        </TabsList>

        <TabsContent value="trends" className="space-y-4">
          <Card>
            <CardHeader><CardTitle className="text-base font-semibold">Daily activity</CardTitle></CardHeader>
            <CardContent className="h-64">
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart data={report.daily}>
                  <CartesianGrid strokeDasharray="3 3" className="stroke-border" />
                  <XAxis dataKey="day" tick={{ fontSize: 11 }} />
                  <YAxis allowDecimals={false} tick={{ fontSize: 11 }} />
                  <Tooltip />
                  <Area type="monotone" dataKey="created" name="Due" stroke="hsl(var(--muted-foreground))" fill="hsl(var(--muted))" />
                  <Area type="monotone" dataKey="delivered" name="Delivered" stroke="var(--color-status-green)" fill="var(--color-status-green)" fillOpacity={0.25} />
                  <Area type="monotone" dataKey="late" name="Late" stroke="var(--color-status-red)" fill="var(--color-status-red)" fillOpacity={0.25} />
                </AreaChart>
              </ResponsiveContainer>
            </CardContent>
          </Card>
          <Card>
            <CardHeader>
              <CardTitle className="text-base font-semibold">Forecasts</CardTitle>
              <p className="mt-1 text-xs text-muted-foreground">Least-squares projection over the archived weeks. Confidence reflects how much history exists, not how certain the future is.</p>
            </CardHeader>
            <CardContent className="space-y-2">
              {report.forecasts.map((f) => (
                <div key={f.metric} className="rounded-md border p-3">
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-sm font-medium">{f.metric}</span>
                    <span className="text-sm font-semibold">{f.value}</span>
                  </div>
                  <p className="mt-1 text-xs text-muted-foreground">{f.method} · Confidence: {f.confidence}. {f.caveat}</p>
                </div>
              ))}
            </CardContent>
          </Card>
          <Card>
            <CardHeader><CardTitle className="text-base font-semibold">Data quality notes</CardTitle></CardHeader>
            <CardContent>
              <ul className="list-disc space-y-1 pl-5 text-xs text-muted-foreground">
                {report.dataQuality.notes.map((n) => <li key={n}>{n}</li>)}
              </ul>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="causes">
          <Card>
            <CardHeader><CardTitle className="text-base font-semibold">Root causes</CardTitle></CardHeader>
            <CardContent className="space-y-2">
              {report.rootCauses.length === 0 ? (
                <p className="rounded-md border border-dashed p-3 text-center text-xs text-muted-foreground">No causes could be derived — delay reasons were not recorded.</p>
              ) : report.rootCauses.map((r) => (
                <div key={r.cause} className="rounded-md border p-3">
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-sm font-medium">{r.cause}</span>
                    <span className="text-xs text-muted-foreground">{r.count} occurrence(s)</span>
                  </div>
                  <p className="mt-1 text-xs text-muted-foreground">{r.examples.join(" · ")}</p>
                </div>
              ))}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="swot" className="space-y-4">
          <div className="grid gap-4 md:grid-cols-2">
            <SwotCard title="Strengths" items={report.swot.strengths} />
            <SwotCard title="Weaknesses" items={report.swot.weaknesses} />
            <SwotCard title="Opportunities" items={report.swot.opportunities} />
            <SwotCard title="Threats" items={report.swot.threats} />
          </div>
          <Card>
            <CardHeader><CardTitle className="text-base font-semibold">PESTLE</CardTitle></CardHeader>
            <CardContent className="space-y-2 text-sm">
              {Object.entries(report.pestle).map(([k2, v]) => (
                <p key={k2}><span className="font-medium capitalize">{k2}: </span><span className="text-muted-foreground">{v}</span></p>
              ))}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="actions">
          <Card>
            <CardHeader><CardTitle className="text-base font-semibold">Accountable actions</CardTitle></CardHeader>
            <CardContent>
              <Table>
                <TableHeader>
                  <TableRow><TableHead>Action</TableHead><TableHead>Owner</TableHead><TableHead>Due</TableHead><TableHead>Source</TableHead></TableRow>
                </TableHeader>
                <TableBody>
                  {report.actions.map((a) => (
                    <TableRow key={a.action}>
                      <TableCell className="text-sm">{a.action}</TableCell>
                      <TableCell className="text-sm">{a.owner}</TableCell>
                      <TableCell className="text-sm">{a.due}</TableCell>
                      <TableCell className="text-xs text-muted-foreground">{a.source}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="history">
          <Card>
            <CardHeader>
              <CardTitle className="text-base font-semibold">Archived weekly snapshots</CardTitle>
              <p className="mt-1 text-xs text-muted-foreground">Stored in this browser. Download the CSV to keep a copy outside the app.</p>
            </CardHeader>
            <CardContent>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Week</TableHead><TableHead className="text-right">Deliveries</TableHead>
                    <TableHead className="text-right">On-time</TableHead><TableHead className="text-right">Late</TableHead>
                    <TableHead className="text-right">Damage value</TableHead><TableHead className="text-right"></TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {[...archive].reverse().map((s) => (
                    <TableRow key={s.weekKey}>
                      <TableCell className="text-sm">{s.weekKey}<div className="text-xs text-muted-foreground">{s.weekStart} → {s.weekEnd}</div></TableCell>
                      <TableCell className="text-right text-sm">{s.kpis.totalDeliveries}</TableCell>
                      <TableCell className="text-right text-sm">{s.kpis.onTimeRate}%</TableCell>
                      <TableCell className="text-right text-sm">{s.kpis.late}</TableCell>
                      <TableCell className="text-right text-sm">P{s.kpis.damageValueBWP.toLocaleString()}</TableCell>
                      <TableCell className="text-right">
                        <Button size="sm" variant="ghost" onClick={() => downloadText(`cospharm-${s.weekKey}.md`, snapshotToMarkdown({ ...s, forecasts: buildForecasts(archive, s) }))}>Download</Button>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}

function SwotCard({ title, items }: { title: string; items: string[] }) {
  return (
    <Card>
      <CardHeader><CardTitle className="text-base font-semibold">{title}</CardTitle></CardHeader>
      <CardContent>
        <ul className="list-disc space-y-1 pl-5 text-sm text-muted-foreground">
          {items.map((i) => <li key={i}>{i}</li>)}
        </ul>
      </CardContent>
    </Card>
  );
}

function Kpi({ label, value, sub }: { label: string; value: string; sub: string }) {
  return (
    <Card>
      <CardContent className="p-5">
        <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">{label}</p>
        <p className="mt-1 text-2xl font-semibold tracking-tight">{value}</p>
        <p className="mt-0.5 text-xs text-muted-foreground">{sub}</p>
      </CardContent>
    </Card>
  );
}