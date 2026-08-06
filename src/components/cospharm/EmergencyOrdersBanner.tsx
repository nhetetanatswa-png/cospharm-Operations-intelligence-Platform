import { Siren } from "lucide-react";
import { Button } from "@/components/ui/button";
import { formatRelative, useHydratedNow } from "./clock";
import type { Delivery, EmergencyOrder } from "./types";

export function EmergencyOrdersBanner({
  deliveries,
  emergencyOrders,
  onOpen,
}: {
  deliveries: Delivery[];
  emergencyOrders: EmergencyOrder[];
  onOpen: () => void;
}) {
  // Rendered only after hydration so server and client markup match.
  const now = useHydratedNow();
  const flagged = deliveries.filter((d) => d.priority === "emergency" && d.status !== "DELIVERED");
  const liveEmergency = emergencyOrders.filter((o) => !["DELIVERED", "CANCELLED"].includes(o.status));
  const total = flagged.length + liveEmergency.length;

  if (total === 0) return null;

  return (
    <section
      role="alert"
      className="rounded-xl border-2 border-status-red bg-status-red/10 p-4 shadow-sm animate-pulse-once"
      style={{ animation: "none" }}
    >
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <span className="grid size-9 place-items-center rounded-full bg-status-red text-white">
            <Siren className="size-5" />
          </span>
          <div>
            <p className="text-base font-bold text-status-red">🚨 Emergency orders ({total})</p>
            <p className="text-xs text-status-red/80">Pinned at top — needs immediate action.</p>
          </div>
        </div>
        <Button size="sm" variant="destructive" onClick={onOpen}>Open emergency queue</Button>
      </div>

      <ul className="grid gap-2 sm:grid-cols-2">
        {flagged.map((d) => (
          <li key={d.id} className="flex items-center justify-between gap-2 rounded-md border border-status-red/40 bg-card px-3 py-2">
            <div className="min-w-0">
              <p className="truncate text-sm font-semibold">{d.customerName}</p>
              <p className="truncate text-[11px] text-muted-foreground">{d.id} · marked emergency {formatRelative(d.emergencyFlaggedAt, now)}</p>
            </div>
            <span className="shrink-0 rounded-full bg-status-red px-2 py-0.5 text-[10px] font-bold text-white">EMERGENCY</span>
          </li>
        ))}
        {liveEmergency.map((o) => (
          <li key={o.id} className="flex items-center justify-between gap-2 rounded-md border border-status-red/40 bg-card px-3 py-2">
            <div className="min-w-0">
              <p className="truncate text-sm font-semibold">{o.customerName}</p>
              <p className="truncate text-[11px] text-muted-foreground">{o.id} · raised {formatRelative(o.orderedAt, now)} · {o.status.replace(/_/g, " ").toLowerCase()}</p>
            </div>
            <span className="shrink-0 rounded-full bg-status-red px-2 py-0.5 text-[10px] font-bold text-white">{o.status === "PENDING_APPROVAL" ? "PENDING" : "ACTIVE"}</span>
          </li>
        ))}
      </ul>
    </section>
  );
}