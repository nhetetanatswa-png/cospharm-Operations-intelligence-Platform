import { useState } from "react";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import type { Delivery } from "./types";

export function DelayReasonDialog({
  delivery,
  onClose,
  onSave,
}: {
  delivery: Delivery | null;
  onClose: () => void;
  onSave: (payload: {
    delayReason: string;
    responsibleDept: string;
    customerNotified: "YES" | "NO" | "PENDING";
    notificationMethod?: "CALL" | "WHATSAPP" | "EMAIL";
    resolutionPlan: string;
  }) => void;
}) {
  const [reason, setReason] = useState("");
  const [dept, setDept] = useState<string>("Dispatch");
  const [notified, setNotified] = useState<"YES" | "NO" | "PENDING">("PENDING");
  const [method, setMethod] = useState<"CALL" | "WHATSAPP" | "EMAIL">("CALL");
  const [plan, setPlan] = useState("");

  const valid = reason.trim().length >= 10 && plan.trim().length >= 5;

  return (
    <Dialog open={!!delivery} onOpenChange={(o) => (!o ? onClose() : null)}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Record delay reason — {delivery?.id}</DialogTitle>
          <DialogDescription>
            This late delivery cannot progress until a delay reason and resolution plan are on record.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-3">
          <div>
            <Label>Delay reason <span className="text-status-red">*</span></Label>
            <Textarea rows={3} value={reason} onChange={(e) => setReason(e.target.value)} placeholder="Minimum 10 characters…" className={reason && reason.length < 10 ? "border-status-red" : ""} />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label>Responsible department</Label>
              <Select value={dept} onValueChange={setDept}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="Warehouse">Warehouse</SelectItem>
                  <SelectItem value="Dispatch">Dispatch</SelectItem>
                  <SelectItem value="Marketing">Marketing</SelectItem>
                  <SelectItem value="Procurement">Procurement</SelectItem>
                  <SelectItem value="External">External (supplier/transport)</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label>Customer notified?</Label>
              <Select value={notified} onValueChange={(v) => setNotified(v as "YES" | "NO" | "PENDING")}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="YES">Yes</SelectItem>
                  <SelectItem value="NO">No</SelectItem>
                  <SelectItem value="PENDING">Pending</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
          {notified === "YES" ? (
            <div>
              <Label>Notification method</Label>
              <Select value={method} onValueChange={(v) => setMethod(v as "CALL" | "WHATSAPP" | "EMAIL")}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="CALL">Call</SelectItem>
                  <SelectItem value="WHATSAPP">WhatsApp</SelectItem>
                  <SelectItem value="EMAIL">Email</SelectItem>
                </SelectContent>
              </Select>
            </div>
          ) : null}
          <div>
            <Label>Resolution plan <span className="text-status-red">*</span></Label>
            <Textarea rows={2} value={plan} onChange={(e) => setPlan(e.target.value)} placeholder="What will be done to recover…" className={plan && plan.length < 5 ? "border-status-red" : ""} />
          </div>
        </div>
        <DialogFooter>
          <Button variant="ghost" onClick={onClose}>Cancel</Button>
          <Button
            disabled={!valid}
            onClick={() =>
              onSave({
                delayReason: reason.trim(),
                responsibleDept: dept,
                customerNotified: notified,
                notificationMethod: notified === "YES" ? method : undefined,
                resolutionPlan: plan.trim(),
              })
            }
          >
            Save delay reason
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}