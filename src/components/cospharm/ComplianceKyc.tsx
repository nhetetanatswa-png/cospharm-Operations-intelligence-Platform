import { useMemo, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { AlertTriangle, FileWarning, Search, ShieldCheck, Ban } from "lucide-react";
import { StatusBadge } from "./StatusBadge";
import { RegulatoryModule } from "./RegulatoryModule";
import {
  daysUntil, expiringDocuments, isBlocking, KYC_LABEL, kycTone,
  type KycRecord, type KycStatus,
} from "./kyc";
import type { BatchRecord, ColdChainZone, ControlledDrugLog, Delivery, Inspection, License, Role } from "./types";
import { can } from "./roles";

export function ComplianceKyc({
  records,
  deliveries,
  role,
  licenses,
  zones,
  batches,
  controlled,
  inspection,
  onSetStatus,
  onOpenDelivery,
}: {
  records: KycRecord[];
  deliveries: Delivery[];
  role: Role;
  licenses: License[];
  zones: ColdChainZone[];
  batches: BatchRecord[];
  controlled: ControlledDrugLog[];
  inspection: Inspection;
  onSetStatus: (customer: string, status: KycStatus) => void;
  onOpenDelivery: (id: string) => void;
}) {
  const [q, setQ] = useState("");
  const [filter, setFilter] = useState<"ALL" | KycStatus>("ALL");
  const canEdit = can(role, "regulatory.edit");

  const counts = useMemo(() => {
    const c: Record<KycStatus, number> = { VERIFIED: 0, PENDING: 0, EXPIRED: 0, MISSING: 0, FLAGGED: 0 };
    for (const r of records) c[r.status]++;
    return c;
  }, [records]);

  const filtered = useMemo(
    () =>
      records.filter(
        (r) =>
          (filter === "ALL" || r.status === filter) &&
          (q.trim() === "" || r.customer.toLowerCase().includes(q.trim().toLowerCase())),
      ),
    [records, filter, q],
  );

  const blockedNames = useMemo(
    () => new Set(records.filter((r) => isBlocking(r.status)).map((r) => r.customer)),
    [records],
  );
  const exposedDeliveries = deliveries.filter((d) => blockedNames.has(d.customerName));
  const expiring = useMemo(() => expiringDocuments(records, 60).slice(0, 25), [records]);

  return (
    <div className="space-y-4">
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Kpi icon={<ShieldCheck className="size-5" />} tone="green" label="Verified customers" value={counts.VERIFIED} sub={`of ${records.length} on the register`} />
        <Kpi icon={<FileWarning className="size-5" />} tone="yellow" label="Pending review" value={counts.PENDING} sub="Awaiting document checks" />
        <Kpi icon={<AlertTriangle className="size-5" />} tone="red" label="Expired or missing" value={counts.EXPIRED + counts.MISSING} sub="Orders should be held" />
        <Kpi icon={<Ban className="size-5" />} tone="red" label="Flagged accounts" value={counts.FLAGGED} sub="Escalate before dispatch" />
      </div>

      <Tabs defaultValue="register" className="space-y-4">
        <TabsList className="flex w-full flex-wrap sm:inline-flex">
          <TabsTrigger value="register">Customer register</TabsTrigger>
          <TabsTrigger value="exposure">Order exposure</TabsTrigger>
          <TabsTrigger value="expiries">Document expiries</TabsTrigger>
          <TabsTrigger value="facility">Facility compliance</TabsTrigger>
        </TabsList>

        <TabsContent value="register">
          <Card>
            <CardHeader className="gap-3">
              <CardTitle className="text-base font-semibold">Customer KYC register</CardTitle>
              <div className="flex flex-wrap items-center gap-2">
                <div className="relative">
                  <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
                  <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search customer…" className="w-64 pl-9" />
                </div>
                <Select value={filter} onValueChange={(v) => setFilter(v as "ALL" | KycStatus)}>
                  <SelectTrigger className="w-48"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="ALL">All statuses</SelectItem>
                    {(Object.keys(KYC_LABEL) as KycStatus[]).map((s) => (
                      <SelectItem key={s} value={s}>{KYC_LABEL[s]}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </CardHeader>
            <CardContent>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Customer</TableHead>
                    <TableHead>Type</TableHead>
                    <TableHead>Documents</TableHead>
                    <TableHead>Risk</TableHead>
                    <TableHead>Last reviewed</TableHead>
                    <TableHead className="text-right">KYC status</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filtered.slice(0, 120).map((r) => {
                    const present = r.documents.filter((d) => d.present).length;
                    return (
                      <TableRow key={r.customer}>
                        <TableCell>
                          <div className="font-medium">{r.customer}</div>
                          {r.note ? <div className="text-xs text-muted-foreground">{r.note}</div> : null}
                        </TableCell>
                        <TableCell className="text-sm">{r.type}</TableCell>
                        <TableCell className="text-sm">{present}/{r.documents.length}</TableCell>
                        <TableCell className="text-sm">{r.risk}</TableCell>
                        <TableCell className="text-sm">{r.lastReviewed ?? "—"}</TableCell>
                        <TableCell className="text-right">
                          <div className="flex items-center justify-end gap-2">
                            <StatusBadge status={kycTone(r.status)} label={KYC_LABEL[r.status]} />
                            {canEdit && r.status !== "VERIFIED" ? (
                              <Button size="sm" variant="ghost" onClick={() => onSetStatus(r.customer, "VERIFIED")}>Mark verified</Button>
                            ) : null}
                          </div>
                        </TableCell>
                      </TableRow>
                    );
                  })}
                  {filtered.length === 0 ? (
                    <TableRow><TableCell colSpan={6} className="text-center text-xs text-muted-foreground">No customers match.</TableCell></TableRow>
                  ) : null}
                </TableBody>
              </Table>
              {filtered.length > 120 ? (
                <p className="mt-2 text-xs text-muted-foreground">Showing the first 120 of {filtered.length} matches — narrow the search to see more.</p>
              ) : null}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="exposure">
          <Card>
            <CardHeader>
              <CardTitle className="text-base font-semibold">Orders held on compliance grounds</CardTitle>
              <p className="mt-1 text-xs text-muted-foreground">
                Live deliveries for customers whose KYC is expired, incomplete or flagged. These should not dispatch without a documented override.
              </p>
            </CardHeader>
            <CardContent className="space-y-2">
              {exposedDeliveries.length === 0 ? (
                <p className="rounded-md border border-dashed p-3 text-center text-xs text-muted-foreground">No active delivery is exposed to a compliance block.</p>
              ) : exposedDeliveries.map((d) => {
                const rec = records.find((r) => r.customer === d.customerName);
                return (
                  <button key={d.id} onClick={() => onOpenDelivery(d.id)} className="flex w-full items-center justify-between gap-3 rounded-md border border-status-red/40 bg-status-red/5 p-3 text-left transition hover:bg-status-red/10">
                    <div className="min-w-0">
                      <p className="truncate text-sm font-medium">{d.customerName}</p>
                      <p className="truncate text-xs text-muted-foreground">{d.id} · due {d.dueDate} · {rec ? KYC_LABEL[rec.status] : "unknown status"}</p>
                    </div>
                    <StatusBadge status="red" label="Hold" />
                  </button>
                );
              })}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="expiries">
          <Card>
            <CardHeader>
              <CardTitle className="text-base font-semibold">Documents expiring within 60 days</CardTitle>
            </CardHeader>
            <CardContent className="space-y-2">
              {expiring.length === 0 ? (
                <p className="rounded-md border border-dashed p-3 text-center text-xs text-muted-foreground">Nothing expiring in the next 60 days.</p>
              ) : expiring.map((e) => (
                <div key={`${e.customer}-${e.doc.name}`} className="flex items-center justify-between gap-3 rounded-md border p-3">
                  <div className="min-w-0">
                    <p className="truncate text-sm font-medium">{e.customer}</p>
                    <p className="truncate text-xs text-muted-foreground">{e.doc.name} · expires {e.doc.expiry}</p>
                  </div>
                  <StatusBadge status={e.days < 0 ? "red" : e.days <= 30 ? "yellow" : "green"} label={e.days < 0 ? `${Math.abs(e.days)}d overdue` : `${e.days}d left`} />
                </div>
              ))}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="facility">
          <RegulatoryModule
            licenses={licenses}
            zones={zones}
            batches={batches}
            controlled={controlled}
            inspection={inspection}
            deliveries={deliveries}
          />
        </TabsContent>
      </Tabs>
    </div>
  );
}

function Kpi({ icon, label, value, sub, tone }: { icon: React.ReactNode; label: string; value: number; sub: string; tone: "green" | "yellow" | "red" }) {
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