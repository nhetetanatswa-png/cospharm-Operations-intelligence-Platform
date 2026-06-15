import { cn } from "@/lib/utils";

export type Status = "green" | "yellow" | "red";

const LABELS: Record<Status, string> = {
  green: "On track",
  yellow: "Attention",
  red: "Critical",
};

export function StatusBadge({
  status,
  label,
  className,
}: {
  status: Status;
  label?: string;
  className?: string;
}) {
  const styles: Record<Status, string> = {
    green: "bg-status-green/15 text-status-green ring-status-green/30",
    yellow: "bg-status-yellow/25 text-status-yellow-foreground ring-status-yellow/40",
    red: "bg-status-red/15 text-status-red ring-status-red/30",
  };
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-xs font-medium ring-1 ring-inset",
        styles[status],
        className,
      )}
    >
      <StatusDot status={status} />
      {label ?? LABELS[status]}
    </span>
  );
}

export function StatusDot({
  status,
  className,
}: {
  status: Status;
  className?: string;
}) {
  const dot: Record<Status, string> = {
    green: "bg-status-green",
    yellow: "bg-status-yellow",
    red: "bg-status-red",
  };
  return <span className={cn("inline-block size-2 rounded-full", dot[status], className)} />;
}