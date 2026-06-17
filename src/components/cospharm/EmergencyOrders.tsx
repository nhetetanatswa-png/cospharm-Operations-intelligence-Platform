import { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Plus, Siren, Trash2 } from "lucide-react";
import { can } from "./roles";
import type { CurrentUser, EmergencyOrder, EmergencyOrderItem, EmergencyOrderStatus } from "./types";

const STATUS_TONE: Record<EmergencyOrderStatus, string> = {
  PENDING_APPROVAL: "bg-status-yellow/20 text-status-yellow-foreground",
  APPROVED: "bg-blue-100 text-blue-800",
  ASSIGNED_TO_DRIVER: "bg-blue-100 text-blue-800",
  DISPATCHED: "bg-status-green/15 text-status-green-foreground",
  DELIVERED: "bg-status-green/25 text-status-green-foreground",
  CANCELLED: "bg-secondary text-muted-foreground",
};

export function EmergencyOrders({
  orders,
  user,
  onCreate,
  onUpdateStatus,
  onAssignDriver,
}: {
  orders: EmergencyOrder[];
  user: CurrentUser;
  onCreate: (o: Omit<EmergencyOrder, "id" | "orderedBy" | "orderedAt" | "status">) => void;
  onUpdateStatus: (id: string, status: EmergencyOrderStatus, note?: string) => void;
  onAssignDriver: (id: string, driver: string, eta: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const [filter, setFilter] = useState<"ALL" | EmergencyOrderStatus>("ALL");
  const visible = orders.filter((o) => filter === "ALL" || o.status === filter);
  const canApprove = user.role === "admin" || user.role === "supervisor";
  const canAssign = user.role === "dispatch_supervisor" || canApprove;

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between gap-2 space-y-0">
        <div>
          <CardTitle className="flex items-center gap-2 text-base font-semibold">
            <Siren className="size-4 text-status-red" /> Emergency / post-dispatch orders
          </CardTitle>
          <p className="mt-1 text-xs text-muted-foreground">
            Raised when an order cannot wait for the next scheduled dispatch window.
          </p>
        </div>
        <Button size="sm" onClick={() => setOpen(true)}><Plus className="size-3.5" /> Raise emergency order</Button>
      </CardHeader>
      <CardContent className="space-y-3">
        <div className="flex flex-wrap gap-1.5">
          {(["ALL", "PENDING_APPROVAL", "APPROVED", "ASSIGNED_TO_DRIVER", "DISPATCHED", "DELIVERED", "CANCELLED"] as const).map((f) => (
            <button
              key={f}
              onClick={() => setFilter(f)}
              className={`rounded-full border px-2.5 py-0.5 text-[11px] ${filter === f ? "bg-primary text-primary-foreground border-primary" : "bg-card"}`}
            >
              {f.replace(/_/g, " ")}
            </button>
          ))}
        </div>
        {visible.length === 0 ? (
          <p className="rounded-md border border-dashed p-6 text-center text-xs text-muted-foreground">No emergency orders.</p>
        ) : (
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>ID</TableHead>
                  <TableHead>Customer</TableHead>
                  <TableHead>Raised by</TableHead>
                  <TableHead>Items</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Driver / ETA</TableHead>
                  <TableHead className="text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {visible.map((o) => (
                  <TableRow key={o.id}>
                    <TableCell className="font-mono text-xs">{o.id}</TableCell>
                    <TableCell>
                      <div className="font-medium">{o.customerName}</div>
                      <div className="text-[11px] text-muted-foreground">{o.clientContact}</div>
                    </TableCell>
                    <TableCell className="text-xs">
                      {o.orderedBy}<br />
                      <span className="text-muted-foreground">{new Date(o.orderedAt).toLocaleString()}</span>
                    </TableCell>
                    <TableCell className="text-xs">
                      {o.items.map((it, i) => (
                        <div key={i}>{it.quantity}× {it.productName}</div>
                      ))}
                    </TableCell>
                    <TableCell>
                      <span className={`rounded-full px-2 py-0.5 text-[10px] font-medium ${STATUS_TONE[o.status]}`}>
                        {o.status.replace(/_/g, " ")}
                      </span>
                      {o.authorisedBy ? <div className="mt-1 text-[10px] text-muted-foreground">Auth: {o.authorisedBy}</div> : null}
                    </TableCell>
                    <TableCell className="text-xs">
                      {o.driverAssigned ?? "—"}<br />
                      <span className="text-muted-foreground">{o.estimatedDelivery ?? ""}</span>
                    </TableCell>
                    <TableCell className="text-right">
                      <OrderActions order={o} canApprove={canApprove} canAssign={canAssign} onUpdateStatus={onUpdateStatus} onAssignDriver={onAssignDriver} />
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        )}
      </CardContent>
      <CreateEmergencyDialog open={open} onClose={() => setOpen(false)} onCreate={onCreate} />
    </Card>
  );
}

function OrderActions({
  order, canApprove, canAssign, onUpdateStatus, onAssignDriver,
}: {
  order: EmergencyOrder;
  canApprove: boolean;
  canAssign: boolean;
  onUpdateStatus: (id: string, status: EmergencyOrderStatus, note?: string) => void;
  onAssignDriver: (id: string, driver: string, eta: string) => void;
}) {
  const [driver, setDriver] = useState("");
  const [eta, setEta] = useState("");

  if (order.status === "PENDING_APPROVAL" && canApprove) {
    return (
      <div className="flex justify-end gap-1.5">
        <Button size="sm" variant="outline" onClick={() => onUpdateStatus(order.id, "CANCELLED", "Rejected")}>Reject</Button>
        <Button size="sm" onClick={() => onUpdateStatus(order.id, "APPROVED")}>Approve</Button>
      </div>
    );
  }
  if (order.status === "APPROVED" && canAssign) {
    return (
      <div className="flex items-center justify-end gap-1.5">
        <Input className="h-7 w-24 text-xs" placeholder="Driver" value={driver} onChange={(e) => setDriver(e.target.value)} />
        <Input className="h-7 w-20 text-xs" placeholder="ETA" value={eta} onChange={(e) => setEta(e.target.value)} />
        <Button size="sm" disabled={!driver || !eta} onClick={() => onAssignDriver(order.id, driver, eta)}>Assign</Button>
      </div>
    );
  }
  if (order.status === "ASSIGNED_TO_DRIVER") {
    return <Button size="sm" onClick={() => onUpdateStatus(order.id, "DISPATCHED")}>Mark dispatched</Button>;
  }
  if (order.status === "DISPATCHED") {
    return <Button size="sm" onClick={() => onUpdateStatus(order.id, "DELIVERED")}>Confirm delivered</Button>;
  }
  return <span className="text-[11px] text-muted-foreground">—</span>;
}

function CreateEmergencyDialog({
  open, onClose, onCreate,
}: {
  open: boolean;
  onClose: () => void;
  onCreate: (o: Omit<EmergencyOrder, "id" | "orderedBy" | "orderedAt" | "status">) => void;
}) {
  const [customer, setCustomer] = useState("");
  const [contact, setContact] = useState("");
  const [reason, setReason] = useState("");
  const [items, setItems] = useState<EmergencyOrderItem[]>([{ productName: "", quantity: 1, urgencyNote: "" }]);

  const valid = customer && contact && reason.length >= 5 && items.every((i) => i.productName && i.quantity > 0);

  function submit() {
    onCreate({ customerName: customer, clientContact: contact, reason, items });
    setCustomer(""); setContact(""); setReason(""); setItems([{ productName: "", quantity: 1, urgencyNote: "" }]);
    onClose();
  }

  return (
    <Dialog open={open} onOpenChange={(o) => (!o ? onClose() : null)}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>Raise emergency order</DialogTitle>
        </DialogHeader>
        <div className="space-y-3">
          <div className="grid grid-cols-2 gap-3">
            <div><Label>Customer name</Label><Input value={customer} onChange={(e) => setCustomer(e.target.value)} /></div>
            <div><Label>Contact</Label><Input value={contact} onChange={(e) => setContact(e.target.value)} placeholder="Phone / name" /></div>
          </div>
          <div>
            <Label>Reason this cannot wait for next scheduled window</Label>
            <Textarea rows={2} value={reason} onChange={(e) => setReason(e.target.value)} />
          </div>
          <div>
            <div className="mb-1 flex items-center justify-between">
              <Label>Items</Label>
              <Button size="sm" variant="ghost" onClick={() => setItems([...items, { productName: "", quantity: 1, urgencyNote: "" }])}>
                <Plus className="size-3.5" /> Add item
              </Button>
            </div>
            <div className="space-y-2">
              {items.map((it, i) => (
                <div key={i} className="flex items-center gap-2">
                  <Input placeholder="Product" value={it.productName} onChange={(e) => setItems(items.map((x, j) => j === i ? { ...x, productName: e.target.value } : x))} />
                  <Input type="number" min={1} className="w-20" value={it.quantity} onChange={(e) => setItems(items.map((x, j) => j === i ? { ...x, quantity: Number(e.target.value) } : x))} />
                  <Input placeholder="Urgency note" value={it.urgencyNote} onChange={(e) => setItems(items.map((x, j) => j === i ? { ...x, urgencyNote: e.target.value } : x))} />
                  {items.length > 1 ? (
                    <Button size="icon" variant="ghost" onClick={() => setItems(items.filter((_, j) => j !== i))}><Trash2 className="size-3.5" /></Button>
                  ) : null}
                </div>
              ))}
            </div>
          </div>
        </div>
        <DialogFooter>
          <Button variant="ghost" onClick={onClose}>Cancel</Button>
          <Button disabled={!valid} onClick={submit}>Raise order</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}