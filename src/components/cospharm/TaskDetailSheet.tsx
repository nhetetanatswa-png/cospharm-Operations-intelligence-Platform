import { useEffect, useState } from "react";
import { AlertCircle, Clock, History, ShieldCheck } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Separator } from "@/components/ui/separator";
import { StatusBadge, type Status } from "./StatusBadge";
import { AuditList } from "./AuditTrailCard";
import { can, ROLE_LABEL } from "./roles";
import type { AuditEntry, CurrentUser, Role, Task } from "./types";

const STATUS_OPTIONS: { value: Status; label: string; hint: string; icon: React.ReactNode }[] = [
  { value: "red", label: "Not done / overdue", hint: "Task has not been started or is blocked.", icon: <AlertCircle className="size-4" /> },
  { value: "yellow", label: "In progress / attention", hint: "Started but incomplete, or needs supervisor input.", icon: <Clock className="size-4" /> },
  { value: "green", label: "Completed & logged", hint: "Done and verified. A comment or evidence note is required.", icon: <ShieldCheck className="size-4" /> },
];

export function TaskDetailSheet({
  task,
  audit,
  role,
  user,
  onClose,
  onUpdate,
}: {
  task: Task | null;
  audit: AuditEntry[];
  role: Role;
  user: CurrentUser;
  onClose: () => void;
  onUpdate: (task: Task, next: Status, comment: string) => void;
}) {
  const [next, setNext] = useState<Status>("yellow");
  const [comment, setComment] = useState("");
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (task) {
      setNext(task.status);
      setComment("");
      setError(null);
    }
  }, [task]);

  if (!task) return null;
  const t: Task = task;

  const canUpdateAny = can(role, "task.update.any");
  const canUpdateAssigned = can(role, "task.update.assigned");
  const isAssignee = t.assignee === user.name;
  const canEdit = canUpdateAny || (canUpdateAssigned && isAssignee);
  const greenNeedsComment = next === "green" && comment.trim().length < 4;

  function handleSubmit() {
    if (!canEdit) return;
    if (next === "green" && comment.trim().length < 4) {
      setError("A comment or evidence note is required before marking this task green.");
      return;
    }
    if (next !== t.status && comment.trim().length < 1) {
      setError("Please add a short comment describing the change.");
      return;
    }
    onUpdate(t, next, comment.trim() || t.note || "");
    onClose();
  }

  return (
    <Sheet open={!!task} onOpenChange={(open) => (!open ? onClose() : null)}>
      <SheetContent className="w-full overflow-y-auto sm:max-w-lg">
        <SheetHeader>
          <div className="flex items-center justify-between gap-2">
            <span className="font-mono text-xs text-muted-foreground">{t.id}</span>
            <StatusBadge status={t.status} />
          </div>
          <SheetTitle className="text-left text-lg">{t.title}</SheetTitle>
          <SheetDescription className="text-left">
            Assigned to <span className="font-medium text-foreground">{t.assignee}</span> · {t.shift} shift · due {t.due}
          </SheetDescription>
        </SheetHeader>

        <div className="mt-6 space-y-6">
          <section>
            <h3 className="mb-2 text-sm font-semibold">Current note</h3>
            <p className="rounded-md border bg-secondary/50 p-3 text-sm text-muted-foreground">
              {t.note || "No note recorded yet."}
            </p>
          </section>

          <Separator />

          <section>
            <h3 className="mb-3 text-sm font-semibold">Update status</h3>
            {!canEdit ? (
              <p className="rounded-md border border-dashed bg-secondary/40 p-3 text-xs text-muted-foreground">
                You are signed in as {ROLE_LABEL[role]}. Only the assignee or a supervisor can update this task.
              </p>
            ) : (
              <div className="space-y-3">
                <div className="grid gap-2">
                  {STATUS_OPTIONS.map((opt) => {
                    const active = next === opt.value;
                    return (
                      <button
                        key={opt.value}
                        type="button"
                        onClick={() => {
                          setNext(opt.value);
                          setError(null);
                        }}
                        className={`flex items-start gap-3 rounded-md border p-3 text-left transition ${
                          active ? "border-primary bg-primary/5" : "hover:bg-secondary/60"
                        }`}
                      >
                        <StatusBadge status={opt.value} label={opt.label} />
                        <span className="text-xs text-muted-foreground">{opt.hint}</span>
                      </button>
                    );
                  })}
                </div>

                <div>
                  <label className="mb-1 block text-xs font-medium">
                    Comment / evidence note
                    {next === "green" ? <span className="ml-1 text-status-red">*</span> : null}
                  </label>
                  <Textarea
                    value={comment}
                    onChange={(e) => {
                      setComment(e.target.value);
                      setError(null);
                    }}
                    placeholder={
                      next === "green"
                        ? "Describe what was completed and any evidence (e.g. log #, witness)…"
                        : "Short note about this change…"
                    }
                    rows={3}
                  />
                  {greenNeedsComment ? (
                    <p className="mt-1 text-xs text-muted-foreground">
                      Required before marking green to prevent false logs.
                    </p>
                  ) : null}
                </div>

                {error ? (
                  <p className="rounded-md bg-status-red/10 px-3 py-2 text-xs text-status-red">{error}</p>
                ) : null}

                <div className="flex items-center justify-end gap-2">
                  <Button variant="ghost" onClick={onClose}>
                    Cancel
                  </Button>
                  <Button onClick={handleSubmit} disabled={next === t.status && !comment.trim()}>
                    Save update
                  </Button>
                </div>
              </div>
            )}
          </section>

          <Separator />

          <section>
            <h3 className="mb-3 flex items-center gap-2 text-sm font-semibold">
              <History className="size-4" /> Audit history
            </h3>
            {audit.length === 0 ? (
              <p className="rounded-md border border-dashed p-3 text-xs text-muted-foreground">
                No changes recorded yet. Status updates will appear here automatically.
              </p>
            ) : (
              <AuditList entries={audit} dense />
            )}
          </section>
        </div>
      </SheetContent>
    </Sheet>
  );
}