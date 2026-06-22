import { useMemo, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { ShieldCheck, Thermometer, FlaskConical, Lock, ClipboardCheck, Search } from "lucide-react";
import { StatusBadge } from "./StatusBadge";
import type { BatchRecord, ColdChainZone, ControlledDrugLog, Delivery, Inspection, License } from "./types";

function daysUntil(iso: string) {
  return Math.round((new Date(iso).getTime() - Date.now()) / 86400000);
}

function expiryStatus(iso: string, redDays = 30, yellowDays = 60) {
  const d = daysUntil(iso);
  if (d < redDays) return "red" as const;
  if (d < yellowDays) return "yellow" as const;
  return "green" as const;
}

function batchStatus(iso: string) {
  const d = daysUntil(iso);
  if (d < 30) return "red" as const;
  if (d < 90) return "yellow" as const;
  return "green" as const;
}

export function RegulatoryModule({
  licenses,
  zones,
  batches,
  controlled,
  inspection,
  deliveries,
}: {
  licenses: License[];
  zones: ColdChainZone[];
  batches: BatchRecord[];
  controlled: ControlledDrugLog[];
  inspection: Inspection;
  deliveries: Delivery[];
}) {
  const [batchSearch, setBatchSearch] = useState("");

  const matchingBatches = useMemo(() => {
    if (!batchSearch.trim()) return [] as BatchRecord[];
    return batches.filter((b) => b.batchNumber.toLowerCase().includes(batchSearch.toLowerCase()));
  }, [batches, batchSearch]);

  const overdueActions = inspection.actions.filter((a) => a.status === "OPEN" && a.due < new Date().toISOString().slice(0, 10));
  const inspectionStatus = overdueActions.length > 0 ? "red" : inspection.actions.some((a) => a.status === "OPEN") ? "yellow" : "green";

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle className="text-base font-semibold flex items-center gap-2"><ShieldCheck className="size-4" /> Licenses & permits</CardTitle>
          <p className="text-xs text-muted-foreground">Issued per-shipment for import/export permits. ≥60 days green · 30–60 yellow · &lt;30 / expired red.</p>
        </CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Type</TableHead>
                <TableHead>Holder</TableHead>
                <TableHead>Issued</TableHead>
                <TableHead>Expires</TableHead>
                <TableHead>Days left</TableHead>
                <TableHead className="text-right">Status</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {licenses.map((l) => {
                const s = expiryStatus(l.expiryDate);
                return (
                  <TableRow key={l.id}>
                    <TableCell className="font-medium">{l.type}</TableCell>
                    <TableCell className="text-sm">{l.holder}</TableCell>
                    <TableCell className="text-xs">{l.issueDate}</TableCell>
                    <TableCell className="text-xs">{l.expiryDate}</TableCell>
                    <TableCell className="text-xs">{daysUntil(l.expiryDate)}</TableCell>
                    <TableCell className="text-right"><StatusBadge status={s} /></TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base font-semibold flex items-center gap-2"><Thermometer className="size-4" /> Cold-chain & storage compliance</CardTitle>
        </CardHeader>
        <CardContent className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {zones.map((z) => {
            const inRange = z.currentTempC >= z.targetRange[0] && z.currentTempC <= z.targetRange[1];
            let tone: "green" | "yellow" | "red" = "green";
            if (!z.resolved && z.lastBreachAt) tone = "red";
            else if (z.lastBreachAt && daysUntil(z.lastBreachAt) > -30) tone = "yellow";
            if (!inRange) tone = "red";
            return (
              <div key={z.id} className="rounded-lg border p-3">
                <div className="flex items-center justify-between">
                  <p className="text-sm font-semibold">{z.name}</p>
                  <StatusBadge status={tone} />
                </div>
                <p className="mt-1 text-2xl font-semibold">{z.currentTempC.toFixed(1)}°C</p>
                <p className="text-[11px] text-muted-foreground">Target {z.targetRange[0]}–{z.targetRange[1]}°C</p>
                {z.lastBreachAt ? (
                  <p className="mt-2 text-[11px] text-muted-foreground">
                    Last breach: {new Date(z.lastBreachAt).toLocaleDateString()} · {z.breachDurationMins ?? 0} min · {z.resolved ? "resolved" : "UNRESOLVED"}
                  </p>
                ) : <p className="mt-2 text-[11px] text-muted-foreground">No breaches recorded.</p>}
              </div>
            );
          })}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base font-semibold flex items-center gap-2"><FlaskConical className="size-4" /> Batch & expiry tracking</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="relative max-w-md">
            <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
            <Input value={batchSearch} onChange={(e) => setBatchSearch(e.target.value)} placeholder="Recall lookup — enter batch number" className="pl-9" />
          </div>
          {batchSearch.trim() && (
            <div className="rounded-md border bg-secondary/40 p-3">
              <p className="text-xs font-semibold mb-1">Recall results for "{batchSearch}"</p>
              {matchingBatches.length === 0 ? (
                <p className="text-xs text-muted-foreground">No matching batches.</p>
              ) : matchingBatches.map((b) => (
                <div key={b.id} className="text-xs">
                  <span className="font-mono">{b.batchNumber}</span> · {b.product} — went out on:{" "}
                  {b.linkedDeliveryIds.length === 0 ? "none" : b.linkedDeliveryIds.map((id) => {
                    const d = deliveries.find((x) => x.id === id);
                    return d ? `${id} (${d.customerName})` : id;
                  }).join(", ")}
                </div>
              ))}
            </div>
          )}
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Batch</TableHead>
                <TableHead>Product</TableHead>
                <TableHead>Expiry</TableHead>
                <TableHead>Qty</TableHead>
                <TableHead>Deliveries</TableHead>
                <TableHead className="text-right">Status</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {batches.map((b) => (
                <TableRow key={b.id}>
                  <TableCell className="font-mono text-xs">{b.batchNumber}</TableCell>
                  <TableCell className="text-sm">{b.product}</TableCell>
                  <TableCell className="text-xs">{b.expiry}</TableCell>
                  <TableCell className="text-xs">{b.quantity}</TableCell>
                  <TableCell className="font-mono text-[11px]">{b.linkedDeliveryIds.join(", ") || "—"}</TableCell>
                  <TableCell className="text-right"><StatusBadge status={batchStatus(b.expiry)} /></TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base font-semibold flex items-center gap-2"><Lock className="size-4" /> Controlled / Schedule 4 medicines log</CardTitle>
          <p className="text-xs text-muted-foreground">Read-only — sourced from the Audit Trail.</p>
        </CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Product</TableHead>
                <TableHead>Batch</TableHead>
                <TableHead>Handler</TableHead>
                <TableHead>Action</TableHead>
                <TableHead>Time</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {controlled.map((c) => (
                <TableRow key={c.id}>
                  <TableCell className="text-sm">{c.product}</TableCell>
                  <TableCell className="font-mono text-xs">{c.batch}</TableCell>
                  <TableCell className="text-sm">{c.handler}</TableCell>
                  <TableCell className="text-xs">{c.action}</TableCell>
                  <TableCell className="text-xs">{new Date(c.timestamp).toLocaleString()}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="flex flex-row items-center justify-between">
          <div>
            <CardTitle className="text-base font-semibold flex items-center gap-2"><ClipboardCheck className="size-4" /> Inspection readiness</CardTitle>
            <p className="text-xs text-muted-foreground">Last: {inspection.lastDate ?? "—"} · Next: {inspection.nextDate ?? "TBC"}</p>
          </div>
          <StatusBadge status={inspectionStatus} />
        </CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow><TableHead>Corrective action</TableHead><TableHead>Due</TableHead><TableHead className="text-right">Status</TableHead></TableRow>
            </TableHeader>
            <TableBody>
              {inspection.actions.map((a) => {
                const overdue = a.status === "OPEN" && a.due < new Date().toISOString().slice(0, 10);
                return (
                  <TableRow key={a.id}>
                    <TableCell className="text-sm">{a.description}</TableCell>
                    <TableCell className="text-xs">{a.due}</TableCell>
                    <TableCell className="text-right"><StatusBadge status={a.status === "CLOSED" ? "green" : overdue ? "red" : "yellow"} label={a.status === "CLOSED" ? "Closed" : overdue ? "Overdue" : "Open"} /></TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  );
}