import { useMemo } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { ClipboardList, ShieldCheck, Timer, UserCheck } from "lucide-react";
import { StatusBadge } from "./StatusBadge";
import type { Role, Task } from "./types";
import { can } from "./roles";

/** Work Assignments replaces the old Tasks tab: the same task records, but
 * organised around ownership, verification and overdue exposure instead of a
 * flat list that duplicated the delivery workflow. */
export function WorkAssignments({
  tasks,
  role,
  currentUserName,
  onOpenTask,
  onVerify,
}: {
  tasks: Task[];
  role: Role;
  currentUserName: string;
  onOpenTask: (id: string) => void;
  onVerify: (task: Task) => void;
}) {
  const canVerify = can(role, "task.verify");
  const pending = tasks.filter((t) => t.pendingVerification);
  const overdue = tasks.filter((t) => t.status === "red");
  const mine = tasks.filter((t) => t.assignee === currentUserName);

  const byAssignee = useMemo(() => {
    const map = new Map<string, Task[]>();
    for (const t of tasks) map.set(t.assignee, [...(map.get(t.assignee) ?? []), t]);
    return [...map.entries()].sort((a, b) => b[1].length - a[1].length);
  }, [tasks]);

  return (
    <div className="space-y-4">
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Kpi icon={<ClipboardList className="size-5" />} tone="green" label="Open assignments" value={tasks.filter((t) => t.status !== "green").length} sub={`${tasks.length} on the board`} />
        <Kpi icon={<ShieldCheck className="size-5" />} tone="yellow" label="Awaiting verification" value={pending.length} sub="Staff-complete, supervisor pending" />
        <Kpi icon={<Timer className="size-5" />} tone="red" label="Overdue / critical" value={overdue.length} sub="Past due or escalated" />
        <Kpi icon={<UserCheck className="size-5" />} tone="green" label="Assigned to me" value={mine.length} sub={currentUserName} />
      </div>

      {canVerify && pending.length > 0 ? (
        <Card>
          <CardHeader>
            <CardTitle className="text-base font-semibold flex items-center gap-2"><ShieldCheck className="size-4" /> Verification queue</CardTitle>
            <p className="mt-1 text-xs text-muted-foreground">Nothing turns green until a supervisor confirms the evidence note.</p>
          </CardHeader>
          <CardContent className="space-y-2">
            {pending.map((t) => (
              <div key={t.id} className="flex items-center justify-between gap-3 rounded-md border p-3">
                <div className="min-w-0">
                  <p className="truncate text-sm font-medium">{t.title}</p>
                  <p className="truncate text-xs text-muted-foreground">{t.assignee} · {t.note ?? "no note"}</p>
                </div>
                <div className="flex items-center gap-2">
                  <Button size="sm" variant="ghost" onClick={() => onOpenTask(t.id)}>Open</Button>
                  <Button size="sm" onClick={() => onVerify(t)}>Verify</Button>
                </div>
              </div>
            ))}
          </CardContent>
        </Card>
      ) : null}

      <Card>
        <CardHeader>
          <CardTitle className="text-base font-semibold">Assignment board</CardTitle>
          <p className="mt-1 text-xs text-muted-foreground">Non-delivery work: cleaning, cold-room checks, stock counts, maintenance and admin.</p>
        </CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="w-[90px]">ID</TableHead>
                <TableHead>Assignment</TableHead>
                <TableHead>Owner</TableHead>
                <TableHead>Shift</TableHead>
                <TableHead>Due</TableHead>
                <TableHead className="text-right">Status</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {tasks.map((t) => (
                <TableRow key={t.id} onClick={() => onOpenTask(t.id)} className="cursor-pointer">
                  <TableCell className="font-mono text-xs text-muted-foreground">{t.id}</TableCell>
                  <TableCell>
                    <div className="flex items-center gap-2 font-medium">
                      {t.title}
                      {t.pendingVerification ? (
                        <span className="inline-flex items-center gap-1 rounded-full bg-status-yellow/20 px-2 py-0.5 text-[10px] text-status-yellow-foreground">
                          <ShieldCheck className="size-3" /> Pending verification
                        </span>
                      ) : null}
                    </div>
                    {t.note ? <div className="text-xs text-muted-foreground">{t.note}</div> : null}
                  </TableCell>
                  <TableCell className="text-sm">{t.assignee}</TableCell>
                  <TableCell className="text-sm">{t.shift}</TableCell>
                  <TableCell className="text-sm">{t.due}</TableCell>
                  <TableCell className="text-right"><StatusBadge status={t.status} /></TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base font-semibold">Load per person</CardTitle>
          <p className="mt-1 text-xs text-muted-foreground">Who is carrying the work, and how much of it is still open.</p>
        </CardHeader>
        <CardContent className="space-y-2">
          {byAssignee.map(([person, list]) => {
            const open = list.filter((t) => t.status !== "green").length;
            return (
              <div key={person} className="flex items-center justify-between gap-3 rounded-md border p-3 text-sm">
                <span className="font-medium">{person}</span>
                <span className="text-xs text-muted-foreground">{open} open · {list.length} total</span>
              </div>
            );
          })}
        </CardContent>
      </Card>
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
          <p className="mt-0.5 truncate text-xs text-muted-foreground">{sub}</p>
        </div>
      </CardContent>
    </Card>
  );
}