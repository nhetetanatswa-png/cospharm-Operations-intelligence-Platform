import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Truck } from "lucide-react";
import { StatusBadge, type Status } from "./StatusBadge";
import { DeliveryProgress } from "./DeliveryProgress";
import { deliveryStatusBadge, type deriveDeliveryRisk } from "./operations";
import type { Delivery } from "./types";

export type DeliveryRiskItem = { d: Delivery; risk: ReturnType<typeof deriveDeliveryRisk> };

export function DeliveryRiskPanel({
  items,
  onOpen,
  className,
}: {
  items: DeliveryRiskItem[];
  onOpen: (id: string) => void;
  className?: string;
}) {
  return (
    <Card className={className}>
      <CardHeader>
        <CardTitle className="text-base font-semibold flex items-center gap-2">
          <Truck className="size-4" /> Delivery risk panel
        </CardTitle>
        <p className="mt-1 text-xs text-muted-foreground">
          Ready · At risk (any required task or stock yellow) · Blocked (any required task or stock red).
        </p>
      </CardHeader>
      <CardContent className="space-y-2">
        {items.map(({ d, risk }) => {
          const badge = deliveryStatusBadge(d.status);
          const tone: Status = risk.risk === "BLOCKED" ? "red" : risk.risk === "AT_RISK" ? "yellow" : "green";
          const label = risk.risk === "BLOCKED" ? "Blocked" : risk.risk === "AT_RISK" ? "At risk" : "Ready";
          return (
            <button
              key={d.id}
              onClick={() => onOpen(d.id)}
              className="flex w-full flex-col gap-1.5 rounded-md border p-3 text-left transition hover:bg-secondary/50"
            >
              <div className="flex items-center justify-between gap-2">
                <div className="min-w-0">
                  <p className="truncate text-sm font-medium">{d.customerName}</p>
                  <p className="truncate text-xs text-muted-foreground">{d.id} · due {d.dueDate} · {d.assignedOps}</p>
                </div>
                <div className="flex items-center gap-1.5">
                  <StatusBadge status={tone} label={label} />
                  <StatusBadge status={badge.tone} label={badge.label} />
                </div>
              </div>
              <DeliveryProgress steps={d.steps} showLabels={false} />
              {risk.reasons.length ? (
                <p className="text-[11px] text-muted-foreground">⚠ {risk.reasons[0]}</p>
              ) : null}
            </button>
          );
        })}
        {items.length === 0 ? (
          <p className="rounded-md border border-dashed p-4 text-center text-xs text-muted-foreground">No deliveries to show.</p>
        ) : null}
      </CardContent>
    </Card>
  );
}
