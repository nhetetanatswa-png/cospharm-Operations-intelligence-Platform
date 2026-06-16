import { useMemo, useState } from "react";
import { EyeOff, MessageSquare, Send } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { can, ROLE_LABEL } from "./roles";
import type { Comment, CommentType, CurrentUser } from "./types";

const TYPES: { value: CommentType; label: string }[] = [
  { value: "GENERAL", label: "General note" },
  { value: "DELIVERY_NOTE", label: "Delivery note" },
  { value: "DELAY_REASON", label: "Delay reason" },
  { value: "STOCK_NOTE", label: "Stock note" },
  { value: "CUSTOMER_NOTE", label: "Customer note" },
  { value: "SUPERVISOR_NOTE", label: "Supervisor note" },
];

export function CommentsBox({
  comments,
  user,
  onAdd,
  onHide,
  defaultType = "GENERAL",
  compact = false,
}: {
  comments: Comment[];
  user: CurrentUser;
  onAdd: (type: CommentType, message: string) => void;
  onHide?: (id: string) => void;
  defaultType?: CommentType;
  compact?: boolean;
}) {
  const [type, setType] = useState<CommentType>(defaultType);
  const [message, setMessage] = useState("");
  const canHide = can(user.role, "comment.hide");

  const sorted = useMemo(
    () => [...comments].sort((a, b) => +new Date(a.createdAt) - +new Date(b.createdAt)),
    [comments],
  );

  function submit() {
    if (!message.trim()) return;
    onAdd(type, message.trim());
    setMessage("");
    setType(defaultType);
  }

  return (
    <div className={`rounded-lg border bg-card p-4 ${compact ? "" : "shadow-sm"}`}>
      <h3 className="flex items-center gap-2 text-sm font-semibold">
        <MessageSquare className="size-4" /> Comments & notes
      </h3>
      <p className="mb-3 text-xs text-muted-foreground">
        Notes are permanent and recorded in the audit log. Supervisors can hide inappropriate comments.
      </p>

      <div className="mb-3 space-y-2 max-h-64 overflow-y-auto pr-1">
        {sorted.length === 0 ? (
          <p className="rounded-md border border-dashed p-3 text-xs text-muted-foreground">No comments yet.</p>
        ) : (
          sorted.map((c) => (
            <div
              key={c.id}
              className={`rounded-md border p-2.5 text-xs ${c.hidden ? "opacity-60" : ""}`}
            >
              <div className="mb-1 flex items-center justify-between gap-2 text-[11px] text-muted-foreground">
                <span>
                  <span className="font-medium text-foreground">{c.authorName}</span> · {ROLE_LABEL[c.authorRole]}
                </span>
                <span>{new Date(c.createdAt).toLocaleString()}</span>
              </div>
              <div className="mb-1 inline-flex rounded-full bg-secondary px-2 py-0.5 text-[10px] font-medium">
                {c.commentType.replace("_", " ")}
              </div>
              <p className={`text-sm ${c.hidden ? "italic line-through" : "text-foreground"}`}>
                {c.hidden ? `Hidden by ${c.hiddenBy} — original kept in audit log` : c.message}
              </p>
              {canHide && !c.hidden && onHide ? (
                <button
                  onClick={() => onHide(c.id)}
                  className="mt-1 inline-flex items-center gap-1 text-[10px] text-muted-foreground hover:text-status-red"
                >
                  <EyeOff className="size-3" /> Hide
                </button>
              ) : null}
            </div>
          ))
        )}
      </div>

      <div className="space-y-2">
        <Select value={type} onValueChange={(v) => setType(v as CommentType)}>
          <SelectTrigger className="h-9 text-xs">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {TYPES.map((t) => (
              <SelectItem key={t.value} value={t.value}>
                {t.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Textarea
          value={message}
          onChange={(e) => setMessage(e.target.value)}
          placeholder="Add a note…"
          rows={2}
        />
        <div className="flex justify-end">
          <Button size="sm" onClick={submit} className="gap-1.5" disabled={!message.trim()}>
            <Send className="size-3.5" /> Post comment
          </Button>
        </div>
      </div>
    </div>
  );
}