import { ArrowRight, Boxes, ClipboardList, History, User } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { ROLE_LABEL } from "./roles";
import type { AuditEntry } from "./types";

export function AuditTrailCard({ entries }: { entries: AuditEntry[] }) {
  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-base font-semibold">
          <History className="size-4" /> Audit trail
        </CardTitle>
        <p className="mt-1 text-xs text-muted-foreground">
          Every task status change and stock update is recorded with the user, time, old → new value, and the comment provided.
        </p>
      </CardHeader>
      <CardContent>
        {entries.length === 0 ? (
          <p className="rounded-md border border-dashed p-6 text-center text-sm text-muted-foreground">
            No activity yet.
          </p>
        ) : (
          <AuditList entries={entries} />
        )}
      </CardContent>
    </Card>
  );
}

export function AuditList({
  entries,
  dense = false,
}: {
  entries: AuditEntry[];
  dense?: boolean;
}) {
  return (
    <ol className="relative space-y-3 border-l pl-4">
      {entries.map((e) => (
        <li key={e.id} className="relative">
          <span className="absolute -left-[21px] top-1.5 grid size-3 place-items-center rounded-full border bg-background">
            <span className="size-1.5 rounded-full bg-primary" />
          </span>
          <div className={`rounded-md border bg-card p-3 ${dense ? "text-xs" : "text-sm"}`}>
            <div className="flex flex-wrap items-center gap-2">
              <span className="inline-flex items-center gap-1 rounded-full bg-secondary px-2 py-0.5 text-xs text-secondary-foreground">
                {e.entityType === "task" ? (
                  <ClipboardList className="size-3" />
                ) : (
                  <Boxes className="size-3" />
                )}
                {e.entityType === "task" ? "Task" : "Stock"}
              </span>
              <span className="font-medium">{e.entityLabel}</span>
              <span className="font-mono text-xs text-muted-foreground">{e.entityId}</span>
            </div>
            <div className="mt-2 flex flex-wrap items-center gap-2 text-xs">
              <span className="text-muted-foreground capitalize">{labelField(e.field)}:</span>
              <ValuePill value={e.oldValue} field={e.field} />
              <ArrowRight className="size-3 text-muted-foreground" />
              <ValuePill value={e.newValue} field={e.field} highlight />
            </div>
            {e.comment ? (
              <p className="mt-2 text-xs text-muted-foreground">
                <span className="font-medium text-foreground">Comment:</span> {e.comment}
              </p>
            ) : null}
            <div className="mt-2 flex flex-wrap items-center gap-1.5 text-xs text-muted-foreground">
              <User className="size-3" />
              <span className="font-medium text-foreground">{e.user}</span>
              <span>· {ROLE_LABEL[e.role]}</span>
              <span>· {formatTime(e.timestamp)}</span>
            </div>
          </div>
        </li>
      ))}
    </ol>
  );
}

function labelField(field: AuditEntry["field"]) {
  switch (field) {
    case "status":
      return "status";
    case "onHand":
      return "on-hand count";
    case "issue":
      return "issue note";
  }
}

function ValuePill({
  value,
  field,
  highlight,
}: {
  value: string;
  field: AuditEntry["field"];
  highlight?: boolean;
}) {
  if (field === "status") {
    const cls =
      value === "green"
        ? "bg-status-green/15 text-status-green"
        : value === "yellow"
          ? "bg-status-yellow/25 text-status-yellow-foreground"
          : value === "red"
            ? "bg-status-red/15 text-status-red"
            : "bg-secondary text-secondary-foreground";
    return (
      <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs capitalize ${cls}`}>
        {value}
      </span>
    );
  }
  return (
    <span
      className={`inline-flex max-w-[200px] truncate rounded-md border px-2 py-0.5 text-xs ${
        highlight ? "border-primary/40 bg-primary/5 text-foreground" : "text-muted-foreground"
      }`}
    >
      {value}
    </span>
  );
}

function formatTime(iso: string) {
  const d = new Date(iso);
  const diff = Date.now() - d.getTime();
  const mins = Math.round(diff / 60000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.round(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  return d.toLocaleString();
}