import { cn } from "@/lib/utils";
import { Card, CardContent } from "@/components/ui/card";
import { PARTY_LABEL, RAG_CLASS, RAG_LABEL } from "./logic";
import type { Rag, ResponsibleParty } from "./types";

export function RagBadge({ rag, className }: { rag: Rag; className?: string }) {
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1.5 whitespace-nowrap rounded-full px-2.5 py-0.5 text-xs font-medium ring-1 ring-inset",
        RAG_CLASS[rag],
        className,
      )}
    >
      <span className="inline-block size-2 rounded-full bg-current" />
      {RAG_LABEL[rag]}
    </span>
  );
}

export function PartyChip({ party }: { party: ResponsibleParty }) {
  return (
    <span className="inline-flex items-center rounded-md border px-2 py-0.5 text-[11px] font-medium text-muted-foreground">
      {PARTY_LABEL[party]}
    </span>
  );
}

export function KpiCard({
  label,
  value,
  sub,
  tone = "default",
}: {
  label: string;
  value: string | number;
  sub?: string;
  tone?: "default" | "red" | "amber" | "green";
}) {
  const toneClass =
    tone === "red"
      ? "text-status-red"
      : tone === "amber"
        ? "text-status-yellow-foreground"
        : tone === "green"
          ? "text-status-green"
          : "text-foreground";
  return (
    <Card>
      <CardContent className="p-4">
        <p className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">{label}</p>
        <p className={cn("mt-1 text-2xl font-semibold tracking-tight", toneClass)}>{value}</p>
        {sub ? <p className="mt-0.5 text-[11px] text-muted-foreground">{sub}</p> : null}
      </CardContent>
    </Card>
  );
}

export function EmptyState({ message }: { message: string }) {
  return (
    <p className="rounded-md border border-dashed p-6 text-center text-xs text-muted-foreground">{message}</p>
  );
}

export function Bar({ value, max, tone = "primary" }: { value: number; max: number; tone?: "primary" | "red" }) {
  const w = max > 0 ? Math.min(100, Math.round((value / max) * 100)) : 0;
  return (
    <div className="h-2 w-full overflow-hidden rounded-full bg-secondary">
      <div className={cn("h-full rounded-full", tone === "red" ? "bg-status-red" : "bg-primary")} style={{ width: `${w}%` }} />
    </div>
  );
}