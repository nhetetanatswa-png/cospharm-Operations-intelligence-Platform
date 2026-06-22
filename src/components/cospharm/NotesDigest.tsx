import { useMemo, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { FileText } from "lucide-react";
import { ROLE_LABEL } from "./roles";
import type { AuditEntry, Comment, FieldLogEntry } from "./types";

export type DigestNote = {
  id: string;
  module: "Deliveries" | "Stock" | "Regulatory" | "HR" | "Marketing" | "Tasks" | "General";
  author: string;
  authorRole?: string;
  timestamp: string;
  text: string;
};

const MODULE_TONE: Record<DigestNote["module"], string> = {
  Deliveries: "bg-blue-100 text-blue-800",
  Stock: "bg-amber-100 text-amber-800",
  Regulatory: "bg-emerald-100 text-emerald-800",
  HR: "bg-fuchsia-100 text-fuchsia-800",
  Marketing: "bg-rose-100 text-rose-800",
  Tasks: "bg-slate-100 text-slate-800",
  General: "bg-secondary text-foreground",
};

export function collectNotes({
  audit,
  comments,
  fieldLog,
}: {
  audit: AuditEntry[];
  comments: Comment[];
  fieldLog: FieldLogEntry[];
}): DigestNote[] {
  const out: DigestNote[] = [];

  for (const a of audit) {
    if (!a.comment?.trim()) continue;
    const module: DigestNote["module"] =
      a.entityType === "stock" ? "Stock" :
      a.entityLabel.toLowerCase().includes("delivery") ? "Deliveries" :
      a.entityLabel.toLowerCase().includes("emergency") ? "Deliveries" : "Tasks";
    out.push({
      id: `n-a-${a.id}`,
      module,
      author: a.user,
      authorRole: ROLE_LABEL[a.role],
      timestamp: a.timestamp,
      text: a.comment,
    });
  }

  for (const c of comments) {
    if (c.hidden) continue;
    const module: DigestNote["module"] =
      c.relatedEntityType === "STOCK" ? "Stock" :
      c.relatedEntityType === "DELIVERY" ? "Deliveries" :
      c.relatedEntityType === "TASK" ? "Tasks" : "General";
    out.push({
      id: `n-c-${c.id}`,
      module,
      author: c.authorName,
      authorRole: ROLE_LABEL[c.authorRole],
      timestamp: c.createdAt,
      text: c.message,
    });
  }

  for (const f of fieldLog) {
    if (!f.notes?.trim()) continue;
    out.push({
      id: `n-f-${f.id}`,
      module: "Marketing",
      author: f.marketer,
      timestamp: f.createdAt,
      text: `Visit to ${f.customer}: ${f.notes}`,
    });
  }

  return out.sort((a, b) => b.timestamp.localeCompare(a.timestamp));
}

/**
 * generateWeeklySynopsis — placeholder aggregator.
 * Swap with an LLM call once a backend is wired in.
 */
export function generateWeeklySynopsis(notes: DigestNote[]) {
  const byModule = notes.reduce<Record<string, DigestNote[]>>((acc, n) => {
    (acc[n.module] ??= []).push(n);
    return acc;
  }, {});
  return Object.entries(byModule).map(([module, items]) => ({
    module,
    count: items.length,
    excerpt: items[0]?.text.slice(0, 140) ?? "",
    contributors: Array.from(new Set(items.map((i) => i.author))).slice(0, 4),
  }));
}

function startOfDayIso(d: Date) {
  const x = new Date(d);
  x.setHours(0, 0, 0, 0);
  return x.toISOString();
}

export function NotesDigest({
  audit, comments, fieldLog,
}: {
  audit: AuditEntry[];
  comments: Comment[];
  fieldLog: FieldLogEntry[];
}) {
  const allNotes = useMemo(() => collectNotes({ audit, comments, fieldLog }), [audit, comments, fieldLog]);
  const [weekOffset, setWeekOffset] = useState(0);

  const { weekNotes, weekLabel } = useMemo(() => {
    const now = new Date();
    const end = new Date(now);
    end.setDate(end.getDate() - weekOffset * 7);
    const start = new Date(end);
    start.setDate(start.getDate() - 7);
    const startIso = startOfDayIso(start);
    const endIso = startOfDayIso(end);
    const notes = allNotes.filter((n) => n.timestamp >= startIso && n.timestamp < endIso);
    const label = `${start.toLocaleDateString(undefined, { month: "short", day: "numeric" })} – ${end.toLocaleDateString(undefined, { month: "short", day: "numeric" })}`;
    return { weekNotes: notes, weekLabel: label };
  }, [allNotes, weekOffset]);

  const synopsis = useMemo(() => generateWeeklySynopsis(weekNotes), [weekNotes]);

  const grouped = useMemo(() => {
    const g: Record<string, DigestNote[]> = {};
    for (const n of allNotes) {
      const day = new Date(n.timestamp).toLocaleDateString(undefined, { weekday: "long", day: "numeric", month: "long", year: "numeric" });
      (g[day] ??= []).push(n);
    }
    return g;
  }, [allNotes]);

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader className="flex flex-row items-start justify-between gap-3">
          <div>
            <CardTitle className="text-base font-semibold flex items-center gap-2">
              <FileText className="size-4" /> Weekly synopsis
            </CardTitle>
            <p className="mt-1 text-xs text-muted-foreground">
              Auto-generated summary across all modules for <span className="font-medium text-foreground">{weekLabel}</span>.
            </p>
          </div>
          <Select value={String(weekOffset)} onValueChange={(v) => setWeekOffset(Number(v))}>
            <SelectTrigger className="w-[170px]"><SelectValue /></SelectTrigger>
            <SelectContent>
              {[0,1,2,3,4,5,6,7].map((o) => (
                <SelectItem key={o} value={String(o)}>
                  {o === 0 ? "This week" : o === 1 ? "Last week" : `${o} weeks ago`}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </CardHeader>
        <CardContent>
          {synopsis.length === 0 ? (
            <p className="rounded-md border border-dashed p-4 text-center text-xs text-muted-foreground">
              No notes logged this week.
            </p>
          ) : (
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
              {synopsis.map((s) => (
                <div key={s.module} className="rounded-lg border p-3">
                  <div className="flex items-center justify-between">
                    <span className={`rounded-full px-2 py-0.5 text-[10px] font-medium ${MODULE_TONE[s.module as DigestNote["module"]] ?? "bg-secondary"}`}>{s.module}</span>
                    <span className="text-xs font-semibold">{s.count} note{s.count === 1 ? "" : "s"}</span>
                  </div>
                  <p className="mt-2 text-xs text-muted-foreground line-clamp-3">{s.excerpt || "—"}</p>
                  {s.contributors.length > 0 && (
                    <p className="mt-2 text-[10px] text-muted-foreground">Contributors: {s.contributors.join(", ")}</p>
                  )}
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base font-semibold">Full notes timeline</CardTitle>
          <p className="mt-1 text-xs text-muted-foreground">Every free-text note from every module, newest first.</p>
        </CardHeader>
        <CardContent className="space-y-4">
          {Object.keys(grouped).length === 0 && (
            <p className="rounded-md border border-dashed p-4 text-center text-xs text-muted-foreground">No notes yet.</p>
          )}
          {Object.entries(grouped).map(([day, items]) => (
            <div key={day}>
              <p className="mb-2 text-xs font-semibold text-muted-foreground">{day}</p>
              <ol className="space-y-2">
                {items.map((n) => (
                  <li key={n.id} className="rounded-md border p-3">
                    <div className="mb-1 flex items-center justify-between gap-2">
                      <span className={`rounded-full px-2 py-0.5 text-[10px] font-medium ${MODULE_TONE[n.module]}`}>{n.module}</span>
                      <span className="text-[10px] text-muted-foreground">{new Date(n.timestamp).toLocaleTimeString()}</span>
                    </div>
                    <p className="text-sm">{n.text}</p>
                    <p className="mt-1 text-[11px] text-muted-foreground">{n.author}{n.authorRole ? ` · ${n.authorRole}` : ""}</p>
                  </li>
                ))}
              </ol>
            </div>
          ))}
        </CardContent>
      </Card>
    </div>
  );
}