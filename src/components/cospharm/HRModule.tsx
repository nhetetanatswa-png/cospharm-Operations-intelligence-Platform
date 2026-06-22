import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { StatusBadge } from "./StatusBadge";
import { Users, ShieldAlert, BadgeCheck } from "lucide-react";
import type { LeaveRecord, License, StaffCertification } from "./types";

const CERT_LABEL: Record<StaffCertification["type"], string> = {
  DRIVERS_LICENSE_PDP: "Driver's License / PDP",
  COLD_CHAIN_HANDLING: "Cold-chain handling",
  CONTROLLED_SUBSTANCES: "Controlled substances",
  QUALIFIED_PERSON: "Qualified Person license",
  FIRST_AID: "First aid",
  FORKLIFT: "Forklift operator",
};

function daysUntil(iso?: string) {
  if (!iso) return -1;
  return Math.round((new Date(iso).getTime() - Date.now()) / 86400000);
}

function certStatus(c: StaffCertification) {
  if (c.missing) return "red" as const;
  const d = daysUntil(c.expiryDate);
  if (d < 30) return "red" as const;
  if (d < 60) return "yellow" as const;
  return "green" as const;
}

export function HRModule({
  certifications,
  leave,
  licenses,
}: {
  certifications: StaffCertification[];
  leave: LeaveRecord[];
  licenses: License[];
}) {
  // Coverage risk: critical roles with someone on leave today
  const today = new Date().toISOString().slice(0, 10);
  const onLeaveToday = leave.filter((l) => l.from <= today && l.to >= today);
  const criticalRolesOnLeave = onLeaveToday.filter((l) => l.critical);

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle className="text-base font-semibold flex items-center gap-2"><BadgeCheck className="size-4" /> Certifications & compliance</CardTitle>
          <p className="text-xs text-muted-foreground">60-day green · 30–60 yellow · &lt;30 / expired / missing red.</p>
        </CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Staff</TableHead>
                <TableHead>Role</TableHead>
                <TableHead>Certification</TableHead>
                <TableHead>Issued</TableHead>
                <TableHead>Expires</TableHead>
                <TableHead className="text-right">Status</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {certifications.map((c) => (
                <TableRow key={c.id}>
                  <TableCell className="font-medium">{c.staffName}</TableCell>
                  <TableCell className="text-sm text-muted-foreground">{c.staffRole}</TableCell>
                  <TableCell className="text-sm">{CERT_LABEL[c.type]}</TableCell>
                  <TableCell className="text-xs">{c.issueDate ?? "—"}</TableCell>
                  <TableCell className="text-xs">{c.expiryDate ?? (c.missing ? "MISSING" : "—")}</TableCell>
                  <TableCell className="text-right"><StatusBadge status={certStatus(c)} label={c.missing ? "Missing" : undefined} /></TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base font-semibold flex items-center gap-2"><ShieldAlert className="size-4" /> Coverage risk</CardTitle>
          <p className="text-xs text-muted-foreground">Critical roles with staff on leave today.</p>
        </CardHeader>
        <CardContent>
          {criticalRolesOnLeave.length === 0 ? (
            <p className="rounded-md border border-dashed p-3 text-center text-xs text-muted-foreground">All critical roles covered today.</p>
          ) : (
            <ul className="space-y-2">
              {criticalRolesOnLeave.map((l) => (
                <li key={l.id} className="flex items-center justify-between rounded-md border border-status-red/40 bg-status-red/10 p-3">
                  <div>
                    <p className="text-sm font-semibold">{l.staffRole} — {l.staffName}</p>
                    <p className="text-[11px] text-muted-foreground">On leave {l.from} → {l.to}{l.reason ? ` · ${l.reason}` : ""}</p>
                  </div>
                  <StatusBadge status="red" label="Coverage gap" />
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base font-semibold flex items-center gap-2"><Users className="size-4" /> Regulatory licenses (read-only summary)</CardTitle>
        </CardHeader>
        <CardContent>
          <ul className="grid gap-2 sm:grid-cols-2">
            {licenses.slice(0, 6).map((l) => {
              const d = daysUntil(l.expiryDate);
              const tone = d < 30 ? "red" : d < 60 ? "yellow" : "green";
              return (
                <li key={l.id} className="flex items-center justify-between rounded-md border p-2">
                  <div className="min-w-0">
                    <p className="truncate text-sm">{l.type}</p>
                    <p className="text-[11px] text-muted-foreground">expires {l.expiryDate}</p>
                  </div>
                  <StatusBadge status={tone} />
                </li>
              );
            })}
          </ul>
        </CardContent>
      </Card>
    </div>
  );
}