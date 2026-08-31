import { useMemo, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Progress } from "@/components/ui/progress";
import { Button } from "@/components/ui/button";
import { AlertTriangle, Boxes, PackageX, ScanLine, TrendingDown } from "lucide-react";
import { StatusBadge, StatusDot } from "./StatusBadge";
import {
  computeDiscrepancies, damageValue, DETECTION_LABEL, monthsToExpiry,
  type DamageRecord, type InventoryCount,
} from "./inventory";
import type { Delivery, Role, StockItem } from "./types";
import { InventoryImportDialog, type ImportedRow } from "./InventoryImport";
import { can } from "./roles";

function bwp(n: number) {
  return `P${n.toLocaleString(undefined, { maximumFractionDigits: 0 })}`;
}

export function InventoryIntegrity({
  stock,
  counts,
  damages,
  deliveries,
  role,
  onOpenStock,
  onOpenDelivery,
  onImport,
  onImportFailure,
}: {
  stock: StockItem[];
  counts: InventoryCount[];
  damages: DamageRecord[];
  deliveries: Delivery[];
  role: Role;
  onOpenStock: (item: StockItem) => void;
  onOpenDelivery: (id: string) => void;
  onImport: (rows: ImportedRow[], sheet: string, fileName: string) => void;
  onImportFailure: (fileName: string, reason: string) => void;
}) {
  const [tab, setTab] = useState("discrepancy");
  const discrepancies = useMemo(() => computeDiscrepancies(stock, counts), [stock, counts]);
  const red = discrepancies.filter((d) => d.tone === "red");
  const yellow = discrepancies.filter((d) => d.tone === "yellow");
  const lossValue = damageValue(damages);
  const canEdit = can(role, "stock.update");

  const blockedDeliveries = useMemo(() => {
    const badIds = new Set(red.map((d) => d.stockId));
    return deliveries.filter((d) => d.requiredStockIds.some((id) => badIds.has(id)));
  }, [red, deliveries]);

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <h2 className="text-lg font-semibold">Inventory</h2>
          <p className="text-xs text-muted-foreground">Stock integrity, damages, expiry and reorder pressure.</p>
        </div>
        <InventoryImportDialog onImport={onImport} onFailure={onImportFailure} disabled={!canEdit} />
      </div>
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <MetricCard icon={<ScanLine className="size-5" />} label="Lines counted" value={discrepancies.length} sub="System vs warehouse vs customer" tone="green" />
        <MetricCard icon={<AlertTriangle className="size-5" />} label="Red discrepancies" value={red.length} sub="Gap of 10% or more" tone="red" />
        <MetricCard icon={<TrendingDown className="size-5" />} label="Watch list" value={yellow.length} sub="Gap of 3–9%" tone="yellow" />
        <MetricCard icon={<PackageX className="size-5" />} label="Damage value" value={bwp(lossValue)} sub={`${damages.reduce((s, d) => s + d.quantity, 0)} units written off`} tone="red" />
      </div>

      <Tabs value={tab} onValueChange={setTab} className="space-y-4">
        <TabsList className="flex w-full flex-wrap sm:inline-flex">
          <TabsTrigger value="discrepancy">Discrepancy board</TabsTrigger>
          <TabsTrigger value="damages">Damages &amp; losses</TabsTrigger>
          <TabsTrigger value="expiry">Expiry &amp; batch watch</TabsTrigger>
          <TabsTrigger value="reorder">Reorder pressure</TabsTrigger>
        </TabsList>

        <TabsContent value="discrepancy" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle className="text-base font-semibold flex items-center gap-2">
                <Boxes className="size-4" /> Discrepancy board
              </CardTitle>
              <p className="mt-1 text-xs text-muted-foreground">
                Green: the three figures agree. Yellow: 3–9% gap. Red: 10%+ gap — treat customer-facing availability as unreliable until recounted.
              </p>
            </CardHeader>
            <CardContent>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Item</TableHead>
                    <TableHead className="text-right">System</TableHead>
                    <TableHead className="text-right">Warehouse</TableHead>
                    <TableHead className="text-right">Customer-facing</TableHead>
                    <TableHead>Reading</TableHead>
                    <TableHead className="text-right">Signal</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {discrepancies.map((d) => {
                    const item = stock.find((s) => s.id === d.stockId);
                    return (
                      <TableRow key={d.stockId}>
                        <TableCell>
                          <div className="font-medium">{d.name}</div>
                          <div className="font-mono text-xs text-muted-foreground">{d.sku}</div>
                        </TableCell>
                        <TableCell className="text-right text-sm">{d.system}</TableCell>
                        <TableCell className="text-right text-sm">{d.warehouse}</TableCell>
                        <TableCell className="text-right text-sm">{d.customerFacing}</TableCell>
                        <TableCell className="max-w-[280px] text-xs text-muted-foreground">{d.note}</TableCell>
                        <TableCell className="text-right">
                          <div className="flex items-center justify-end gap-2">
                            <StatusBadge status={d.tone} label={`${d.worstGapPct}%`} />
                            {item && canEdit ? (
                              <Button size="sm" variant="ghost" onClick={() => onOpenStock(item)}>Recount</Button>
                            ) : null}
                          </div>
                        </TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="text-base font-semibold">Deliveries exposed to a red line</CardTitle>
              <p className="mt-1 text-xs text-muted-foreground">These orders require a SKU whose availability is currently unreliable.</p>
            </CardHeader>
            <CardContent className="space-y-2">
              {blockedDeliveries.length === 0 ? (
                <p className="rounded-md border border-dashed p-3 text-center text-xs text-muted-foreground">No delivery is exposed to a red stock line.</p>
              ) : blockedDeliveries.map((d) => (
                <button key={d.id} onClick={() => onOpenDelivery(d.id)} className="flex w-full items-center justify-between gap-2 rounded-md border p-3 text-left transition hover:bg-secondary/50">
                  <div className="min-w-0">
                    <p className="truncate text-sm font-medium">{d.customerName}</p>
                    <p className="truncate text-xs text-muted-foreground">{d.id} · due {d.dueDate} · {d.assignedOps}</p>
                  </div>
                  <StatusBadge status="red" label="Stock unreliable" />
                </button>
              ))}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="damages">
          <Card>
            <CardHeader>
              <CardTitle className="text-base font-semibold">Damages &amp; losses register</CardTitle>
              <p className="mt-1 text-xs text-muted-foreground">
                Every write-off with the stage it was detected at. Total value feeds the profitability section of the weekly intelligence report.
              </p>
            </CardHeader>
            <CardContent>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Product</TableHead>
                    <TableHead>Batch</TableHead>
                    <TableHead className="text-right">Qty</TableHead>
                    <TableHead className="text-right">Value</TableHead>
                    <TableHead>Detected at</TableHead>
                    <TableHead>Action taken</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {damages.map((d) => (
                    <TableRow key={d.id}>
                      <TableCell>
                        <div className="font-medium">{d.product}</div>
                        <div className="font-mono text-xs text-muted-foreground">{d.sku}</div>
                      </TableCell>
                      <TableCell className="font-mono text-xs">{d.batch ?? "—"}</TableCell>
                      <TableCell className="text-right text-sm">{d.quantity}</TableCell>
                      <TableCell className="text-right text-sm">{bwp(d.quantity * d.unitCostBWP)}</TableCell>
                      <TableCell className="text-sm">{DETECTION_LABEL[d.detectionStage]}</TableCell>
                      <TableCell className="text-xs text-muted-foreground">{d.actionTaken}</TableCell>
                    </TableRow>
                  ))}
                  {damages.length === 0 ? (
                    <TableRow><TableCell colSpan={6} className="text-center text-xs text-muted-foreground">No damages recorded.</TableCell></TableRow>
                  ) : null}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="expiry">
          <Card>
            <CardHeader>
              <CardTitle className="text-base font-semibold">Expiry &amp; batch watch</CardTitle>
              <p className="mt-1 text-xs text-muted-foreground">Sorted by time to expiry. Red is expired or within a month.</p>
            </CardHeader>
            <CardContent className="space-y-2">
              {[...stock]
                .sort((a, b) => monthsToExpiry(a.expiry) - monthsToExpiry(b.expiry))
                .map((s) => {
                  const m = monthsToExpiry(s.expiry);
                  const tone = m <= 1 ? "red" : m <= 6 ? "yellow" : "green";
                  return (
                    <div key={s.id} className="flex items-center justify-between gap-3 rounded-md border p-3">
                      <div className="min-w-0">
                        <p className="truncate text-sm font-medium">{s.name}</p>
                        <p className="font-mono text-xs text-muted-foreground">{s.batch ?? "no batch"} · exp {s.expiry}</p>
                      </div>
                      <div className="flex items-center gap-2 text-xs">
                        <span className="text-muted-foreground">{m < 0 ? "expired" : `${m} month${m === 1 ? "" : "s"} left`}</span>
                        <StatusDot status={tone} />
                      </div>
                    </div>
                  );
                })}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="reorder">
          <Card>
            <CardHeader>
              <CardTitle className="text-base font-semibold">Reorder pressure</CardTitle>
              <p className="mt-1 text-xs text-muted-foreground">Cover against reorder level, using the physical warehouse count rather than the system figure.</p>
            </CardHeader>
            <CardContent className="space-y-3">
              {stock.map((s) => {
                const c = counts.find((x) => x.stockId === s.id);
                const onHand = c?.warehouseCount ?? s.onHand;
                const pct = Math.min(100, Math.round((onHand / Math.max(1, s.reorder)) * 100));
                const tone = pct < 60 ? "red" : pct < 110 ? "yellow" : "green";
                return (
                  <div key={s.id} className="space-y-1">
                    <div className="flex items-center justify-between text-xs">
                      <span className="font-medium">{s.name}</span>
                      <span className="text-muted-foreground">{onHand} counted · reorder at {s.reorder}</span>
                    </div>
                    <Progress value={pct} className="h-1.5" />
                    <div className="flex justify-end"><StatusBadge status={tone} label={`${pct}% of reorder level`} /></div>
                  </div>
                );
              })}
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}

function MetricCard({ icon, label, value, sub, tone }: { icon: React.ReactNode; label: string; value: string | number; sub: string; tone: "green" | "yellow" | "red" }) {
  const toneClasses = {
    green: "bg-status-green/15 text-status-green",
    yellow: "bg-status-yellow/20 text-status-yellow-foreground",
    red: "bg-status-red/15 text-status-red",
  } as const;
  return (
    <Card>
      <CardContent className="flex items-start gap-3 p-5">
        <div className={`grid size-10 place-items-center rounded-md ${toneClasses[tone]}`}>{icon}</div>
        <div className="min-w-0 flex-1">
          <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">{label}</p>
          <p className="mt-1 text-2xl font-semibold tracking-tight">{value}</p>
          <p className="mt-0.5 text-xs text-muted-foreground">{sub}</p>
        </div>
      </CardContent>
    </Card>
  );
}