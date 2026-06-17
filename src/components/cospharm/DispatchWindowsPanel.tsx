import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Sunrise, Sunset, Siren } from "lucide-react";
import { DISPATCH_WINDOW_LABELS, getWindowState } from "./operations";
import type { Delivery, DispatchWindow, EmergencyOrder } from "./types";

export function DispatchWindowsPanel({
  deliveries,
  emergencyOrders,
  onOpenEmergency,
}: {
  deliveries: Delivery[];
  emergencyOrders: EmergencyOrder[];
  onOpenEmergency: () => void;
}) {
  const todayIso = new Date().toISOString().slice(0, 10);
  const today = deliveries.filter((d) => d.dueDate === todayIso);

  const stats = (w: DispatchWindow) => {
    const list = today.filter((d) => (d.dispatchWindow ?? "AFTERNOON") === w);
    return {
      assigned: list.length,
      dispatched: list.filter((d) => d.status === "DISPATCHED" || d.status === "DELIVERED").length,
      late: list.filter((d) => d.status === "LATE").length,
    };
  };

  const m = stats("MORNING");
  const a = stats("AFTERNOON");
  const openEmergencies = emergencyOrders.filter((e) => e.status !== "DELIVERED" && e.status !== "CANCELLED").length;

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base font-semibold">Today's dispatch windows</CardTitle>
      </CardHeader>
      <CardContent className="grid gap-3 sm:grid-cols-3">
        <WindowBox
          icon={<Sunrise className="size-4 text-blue-700" />}
          title="Morning"
          state={getWindowState("MORNING")}
          sub={DISPATCH_WINDOW_LABELS.MORNING.sub}
          assigned={m.assigned}
          dispatched={m.dispatched}
          late={m.late}
          tone="border-blue-200"
        />
        <WindowBox
          icon={<Sunset className="size-4 text-orange-700" />}
          title="Afternoon"
          state={getWindowState("AFTERNOON")}
          sub={DISPATCH_WINDOW_LABELS.AFTERNOON.sub}
          assigned={a.assigned}
          dispatched={a.dispatched}
          late={a.late}
          tone="border-orange-200"
        />
        <div className={`rounded-md border p-3 ${openEmergencies > 0 ? "border-status-red/50 bg-status-red/5" : "border-border"}`}>
          <div className="flex items-center gap-2 text-sm font-semibold">
            <Siren className={`size-4 ${openEmergencies > 0 ? "text-status-red" : "text-muted-foreground"}`} />
            Emergency orders
          </div>
          <p className={`mt-2 text-3xl font-bold ${openEmergencies > 0 ? "text-status-red" : ""}`}>{openEmergencies}</p>
          <p className="text-[11px] text-muted-foreground">Open / requiring action</p>
          <Button size="sm" variant="outline" className="mt-2 w-full" onClick={onOpenEmergency}>
            View emergency orders
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}

function WindowBox({
  icon, title, state, sub, assigned, dispatched, late, tone,
}: {
  icon: React.ReactNode; title: string; state: "UPCOMING" | "OPEN" | "CLOSED"; sub: string;
  assigned: number; dispatched: number; late: number; tone: string;
}) {
  const stateBadge =
    state === "OPEN" ? "bg-status-green/15 text-status-green-foreground" :
    state === "CLOSED" ? "bg-secondary text-muted-foreground" : "bg-status-yellow/15 text-status-yellow-foreground";
  return (
    <div className={`rounded-md border p-3 ${tone}`}>
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2 text-sm font-semibold">{icon} {title}</div>
        <span className={`rounded-full px-2 py-0.5 text-[10px] font-medium ${stateBadge}`}>{state}</span>
      </div>
      <p className="mt-1 text-[11px] text-muted-foreground">{sub}</p>
      <div className="mt-3 grid grid-cols-3 gap-2 text-center">
        <Stat label="Assigned" value={assigned} />
        <Stat label="Dispatched" value={dispatched} tone="text-status-green" />
        <Stat label="Late" value={late} tone={late > 0 ? "text-status-red" : ""} />
      </div>
    </div>
  );
}

function Stat({ label, value, tone = "" }: { label: string; value: number; tone?: string }) {
  return (
    <div>
      <p className={`text-lg font-bold ${tone}`}>{value}</p>
      <p className="text-[10px] uppercase tracking-wide text-muted-foreground">{label}</p>
    </div>
  );
}