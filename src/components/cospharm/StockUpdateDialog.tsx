import { useEffect, useState } from "react";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { can, ROLE_LABEL } from "./roles";
import type { Role, StockItem } from "./types";
import type { Status } from "./StatusBadge";

export function StockUpdateDialog({
  item,
  role,
  onClose,
  onSubmit,
}: {
  item: StockItem | null;
  role: Role;
  onClose: () => void;
  onSubmit: (item: StockItem, next: { onHand: number; issue?: string; status: Status }, comment: string) => void;
}) {
  const [onHand, setOnHand] = useState("0");
  const [status, setStatus] = useState<Status>("green");
  const [issue, setIssue] = useState("");
  const [comment, setComment] = useState("");
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (item) {
      setOnHand(String(item.onHand));
      setStatus(item.status);
      setIssue(item.issue ?? "");
      setComment("");
      setError(null);
    }
  }, [item]);

  if (!item) return null;
  const it: StockItem = item;

  const canEdit = can(role, "stock.update");
  const canReport = can(role, "stock.report");
  const editMode: "full" | "report" | "none" = canEdit ? "full" : canReport ? "report" : "none";

  function handleSubmit() {
    if (!comment.trim()) {
      setError("A comment is required for stock changes.");
      return;
    }
    const parsed = Number(onHand);
    if (Number.isNaN(parsed) || parsed < 0) {
      setError("On-hand must be a non-negative number.");
      return;
    }
    onSubmit(
      it,
      {
        onHand: editMode === "full" ? parsed : it.onHand,
        issue: issue.trim() || undefined,
        status: editMode === "full" ? status : it.onHand === 0 ? "red" : it.status,
      },
      comment.trim(),
    );
    onClose();
  }

  return (
    <Dialog open={!!item} onOpenChange={(open) => (!open ? onClose() : null)}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>{editMode === "full" ? "Update stock" : "Report stock issue"}</DialogTitle>
          <DialogDescription>
            {it.name} · <span className="font-mono">{it.sku}</span>
          </DialogDescription>
        </DialogHeader>

        {editMode === "none" ? (
          <p className="rounded-md border border-dashed p-3 text-xs text-muted-foreground">
            You are signed in as {ROLE_LABEL[role]} and cannot update stock.
          </p>
        ) : (
          <div className="space-y-4">
            {editMode === "full" ? (
              <>
                <div>
                  <label className="mb-1 block text-xs font-medium">On-hand count</label>
                  <Input
                    type="number"
                    min={0}
                    value={onHand}
                    onChange={(e) => setOnHand(e.target.value)}
                  />
                  <p className="mt-1 text-xs text-muted-foreground">
                    Reorder threshold: {it.reorder} · capacity {it.capacity}
                  </p>
                </div>
                <div>
                  <label className="mb-1 block text-xs font-medium">Stock status</label>
                  <Select value={status} onValueChange={(v) => setStatus(v as Status)}>
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="green">Green — healthy</SelectItem>
                      <SelectItem value="yellow">Yellow — low / minor issue</SelectItem>
                      <SelectItem value="red">Red — critical / damaged / expired</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </>
            ) : null}

            <div>
              <label className="mb-1 block text-xs font-medium">
                Issue note {editMode === "report" ? <span className="text-status-red">*</span> : null}
              </label>
              <Textarea
                value={issue}
                onChange={(e) => setIssue(e.target.value)}
                placeholder="e.g. 12 units damaged on receipt, near expiry, batch recalled…"
                rows={2}
              />
            </div>

            <div>
              <label className="mb-1 block text-xs font-medium">
                Comment <span className="text-status-red">*</span>
              </label>
              <Textarea
                value={comment}
                onChange={(e) => {
                  setComment(e.target.value);
                  setError(null);
                }}
                placeholder="Why is this changing? Include reference numbers if any."
                rows={3}
              />
            </div>

            {error ? (
              <p className="rounded-md bg-status-red/10 px-3 py-2 text-xs text-status-red">{error}</p>
            ) : null}
          </div>
        )}

        <DialogFooter>
          <Button variant="ghost" onClick={onClose}>
            Cancel
          </Button>
          {editMode !== "none" ? (
            <Button onClick={handleSubmit}>
              {editMode === "full" ? "Save update" : "Submit report"}
            </Button>
          ) : null}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}