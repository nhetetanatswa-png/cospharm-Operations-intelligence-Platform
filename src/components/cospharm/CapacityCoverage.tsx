import { useEffect, useMemo, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { Users, UserMinus, Truck, Shuffle } from "lucide-react";
import { StatusBadge } from "./StatusBadge";
import { PresenceBoard } from "./PresenceBoard";
import { loadPresence, type PresenceRecord } from "./presence";
import type { Delivery, Task } from "./types";

/** Capacity & Coverage keeps the FigJam presence board, but leads with the
 * question management actually asks: do we have enough people today for the
 * work that is due? */
export function CapacityCoverage({
  deliveries,
  tasks,
  activeAssignments,
}: {
  deliveries: Delivery[];
  tasks: Task[];
  activeAssignments: Record<string, string[]>;
}) {
  const [presence, setPresence] = useState<PresenceRecord[]>([]);

  useEffect(() => {
    setPresence(loadPresence());
    const id = setInterval(() => setPresence(loadPresence()), 5000);
    return () => clearInterval(id);
  }, []);

  const stats = useMemo(() => {
    const areas: PresenceRecord["area"][] = ["Warehouse", "Office", "Field"];
    const byArea = areas.map((area) => {
      const list = presence.filter((p) => p.area === area);
      const present = list.filter((p) => p.status === "PRESENT").length;
      const pct = list.length ? Math.round((present / list.length) * 100) : 0;
      return { area, total: list.length, present, pct };
    });
    const present = presence.filter((p) => p.status === "PRESENT").length;
    const away = presence.length - present;
    const delegated = presence.filter((p) => p.delegatedTo).length;
    return { byArea, present, away, delegated };
  }, [presence]);

  const today = new Date().toISOString().slice(0, 10);
  const dueToday = deliveries.filter((d) => d.dueDate <= today && d.status !== "DELIVERED").length;
  const warehousePresent = stats.byArea.find((a) => a.area === "Warehouse")?.present ?? 0;
  const perHead = warehousePresent ? Math.round((dueToday / warehousePresent) * 10) / 10 : dueToday;
  const coverageTone = perHead <= 2 ? "green" : perHead <= 4 ? "yellow" : "red";
  const openTasks = tasks.filter((t) => t.status !== "green").length;

  return (
    <div className="space-y-4">
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Kpi icon={<Users className="size-5" />} tone="green" label="On site now" value={String(stats.present)} sub={`${presence.length} on the roster`} />
        <Kpi icon={<UserMinus className="size-5" />} tone="yellow" label="Absent / off-site" value={String(stats.away)} sub={`${stats.delegated} with work delegated`} />
        <Kpi icon={<Truck className="size-5" />} tone={coverageTone} label="Deliveries per warehouse head" value={String(perHead)} sub={`${dueToday} due against ${warehousePresent} present`} />
        <Kpi icon={<Shuffle className="size-5" />} tone="yellow" label="Open assignments" value={String(openTasks)} sub="Non-delivery work still to cover" />
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base font-semibold">Coverage by area</CardTitle>
          <p className="mt-1 text-xs text-muted-foreground">Below 60% attendance in an area means the shift plan needs reworking, not just reassigning.</p>
        </CardHeader>
        <CardContent className="space-y-3">
          {stats.byArea.map((a) => (
            <div key={a.area} className="space-y-1">
              <div className="flex items-center justify-between text-xs">
                <span className="font-medium">{a.area}</span>
                <span className="text-muted-foreground">{a.present} of {a.total} present</span>
              </div>
              <Progress value={a.pct} className="h-1.5" />
              <div className="flex justify-end">
                <StatusBadge status={a.pct >= 80 ? "green" : a.pct >= 60 ? "yellow" : "red"} label={`${a.pct}% covered`} />
              </div>
            </div>
          ))}
        </CardContent>
      </Card>

      <PresenceBoard activeAssignments={activeAssignments} />
    </div>
  );
}

function Kpi({ icon, label, value, sub, tone }: { icon: React.ReactNode; label: string; value: string; sub: string; tone: "green" | "yellow" | "red" }) {
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