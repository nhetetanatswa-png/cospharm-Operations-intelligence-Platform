import { useState } from "react";
import { AlertTriangle, Check, ShieldAlert } from "lucide-react";
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Separator } from "@/components/ui/separator";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { StatusBadge } from "./StatusBadge";
import { DeliveryProgress } from "./DeliveryProgress";
import { CommentsBox } from "./CommentsBox";
import {
  canCompleteStep,
  completeStep,
  deliveryStatusBadge,
  deriveDeliveryRisk,
  previousStepsCompleted,
} from "./operations";
import type { Comment, CommentType, CurrentUser, Delivery, StockItem, Task } from "./types";

export function DeliveryDetailSheet({
  delivery,
  tasks,
  stock,
  comments,
  user,
  onClose,
  onUpdate,
  onAddComment,
  onHideComment,
  onResolveLate,
}: {
  delivery: Delivery | null;
  tasks: Task[];
  stock: StockItem[];
  comments: Comment[];
  user: CurrentUser;
  onClose: () => void;
  onUpdate: (next: Delivery, message: string) => void;
  onAddComment: (entityId: string, type: CommentType, message: string) => void;
  onHideComment: (id: string) => void;
  onResolveLate: (d: Delivery, reason: string) => void;
}) {
  const [stepComment, setStepComment] = useState("");
  const [override, setOverride] = useState(false);
  const [resolveReason, setResolveReason] = useState("");
  const [error, setError] = useState<string | null>(null);

  if (!delivery) return null;
  const d: Delivery = delivery;
  const badge = deliveryStatusBadge(d.status);
  const risk = deriveDeliveryRisk(d, tasks, stock);

  function tryComplete(stepNumber: number) {
    try {
      const nextSteps = completeStep(d.steps, stepNumber, user.role, user.name, stepComment, override);
      const allDone = nextSteps.every((s) => s.completed);
      onUpdate(
        {
          ...d,
          steps: nextSteps,
          status: allDone ? "DELIVERED" : d.status === "PENDING" ? "IN_PROGRESS" : d.status,
        },
        `Step ${stepNumber} completed${override ? " (supervisor override)" : ""}: ${stepComment}`,
      );
      setStepComment("");
      setOverride(false);
      setError(null);
    } catch (e) {
      setError((e as Error).message);
    }
  }

  return (
    <Sheet open={!!delivery} onOpenChange={(open) => (!open ? onClose() : null)}>
      <SheetContent className="w-full overflow-y-auto sm:max-w-xl">
        <SheetHeader>
          <div className="flex items-center justify-between gap-2">
            <span className="font-mono text-xs text-muted-foreground">{d.id}</span>
            <StatusBadge status={badge.tone} label={badge.label} />
          </div>
          <SheetTitle className="text-left text-lg">{d.customerName}</SheetTitle>
          <SheetDescription className="text-left">
            Marketer <span className="font-medium text-foreground">{d.assignedMarketer}</span> · Ops{" "}
            <span className="font-medium text-foreground">{d.assignedOps}</span> · due {d.dueDate}
          </SheetDescription>
        </SheetHeader>

        <div className="mt-6 space-y-6">
          <section>
            <DeliveryProgress steps={d.steps} />
          </section>

          {risk.risk !== "READY" ? (
            <div
              className={`rounded-md border p-3 text-xs ${
                risk.risk === "BLOCKED" ? "border-status-red/40 bg-status-red/10" : "border-status-yellow/50 bg-status-yellow/15"
              }`}
            >
              <div className="mb-1 flex items-center gap-1.5 font-semibold">
                {risk.risk === "BLOCKED" ? <ShieldAlert className="size-3.5" /> : <AlertTriangle className="size-3.5" />}
                {risk.risk === "BLOCKED" ? "Blocked" : "At risk"}
              </div>
              <ul className="list-disc pl-4">
                {risk.reasons.map((r, i) => (
                  <li key={i}>{r}</li>
                ))}
              </ul>
            </div>
          ) : null}

          <Separator />

          <section>
            <h3 className="mb-3 text-sm font-semibold">7-step operational workflow</h3>
            <ol className="space-y-2">
              {d.steps.map((s) => {
                const allowed = canCompleteStep(s, user.role) || override;
                const ready = previousStepsCompleted(d.steps, s.stepNumber) || override;
                return (
                  <li key={s.stepNumber} className="rounded-md border p-3">
                    <div className="flex items-start justify-between gap-2">
                      <div className="min-w-0">
                        <p className="text-sm font-medium">
                          {s.completed ? <Check className="mr-1 inline size-3.5 text-status-green" /> : null}
                          Step {s.stepNumber}: {s.name}
                        </p>
                        <p className="text-[11px] text-muted-foreground">
                          Allowed: {s.allowedRoles.join(", ").replace(/_/g, " ")}
                        </p>
                        {s.completed ? (
                          <p className="mt-1 text-xs text-muted-foreground">
                            ✓ by {s.completedBy} · {s.completedAt ? new Date(s.completedAt).toLocaleString() : ""}
                            {s.comment ? ` — ${s.comment}` : ""}
                          </p>
                        ) : null}
                      </div>
                      {!s.completed ? (
                        <Button
                          size="sm"
                          disabled={!allowed || !ready}
                          variant={allowed && ready ? "default" : "ghost"}
                          onClick={() => tryComplete(s.stepNumber)}
                        >
                          Complete
                        </Button>
                      ) : (
                        <span className="text-[11px] text-status-green">Done</span>
                      )}
                    </div>
                  </li>
                );
              })}
            </ol>
            <div className="mt-3 space-y-2">
              <Textarea
                value={stepComment}
                onChange={(e) => setStepComment(e.target.value)}
                placeholder="Comment required for each step (min 3 chars)…"
                rows={2}
              />
              {user.role === "supervisor" || user.role === "admin" ? (
                <label className="flex items-center gap-2 text-xs text-muted-foreground">
                  <input type="checkbox" checked={override} onChange={(e) => setOverride(e.target.checked)} />
                  Supervisor override (bypass role / sequence — reason required)
                </label>
              ) : null}
              {error ? (
                <p className="rounded-md bg-status-red/10 px-3 py-2 text-xs text-status-red">{error}</p>
              ) : null}
            </div>
          </section>

          {d.status === "LATE" ? (
            <section className="rounded-md border border-status-red/40 bg-status-red/10 p-3">
              <h3 className="mb-1 text-sm font-semibold text-status-red">Late delivery — resolution required</h3>
              <p className="mb-2 text-xs text-muted-foreground">
                Reason: {d.delayReason ?? "—"}
              </p>
              <Textarea
                value={resolveReason}
                onChange={(e) => setResolveReason(e.target.value)}
                placeholder="Final resolution note (required to resolve)…"
                rows={2}
              />
              <Button
                size="sm"
                className="mt-2"
                disabled={resolveReason.trim().length < 4}
                onClick={() => onResolveLate(d, resolveReason.trim())}
              >
                Resolve late delivery
              </Button>
            </section>
          ) : null}

          <Separator />

          <CommentsBox
            comments={comments}
            user={user}
            defaultType="DELIVERY_NOTE"
            onAdd={(t, m) => onAddComment(d.id, t, m)}
            onHide={onHideComment}
          />
        </div>
      </SheetContent>
    </Sheet>
  );
}