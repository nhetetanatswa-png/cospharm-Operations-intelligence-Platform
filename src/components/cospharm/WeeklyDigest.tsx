import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { FileText, Copy, Check } from "lucide-react";
import type {
  Delivery, Task, StockItem, AuditEntry, Comment, Alert,
  CalendarEvent, AuthorisationRequest, FieldLogEntry,
} from "./types";

type DigestSources = {
  deliveries: Delivery[];
  tasks: Task[];
  stock: StockItem[];
  audit: AuditEntry[];
  comments: Comment[];
  alerts: Alert[];
  calendarEvents: CalendarEvent[];
  authRequests: AuthorisationRequest[];
  fieldLog: FieldLogEntry[];
};

const HISTORY_KEY = "weeklyDigestHistory";
const MS_DAY = 86_400_000;

function weekKey(d: Date) {
  const dt = new Date(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()));
  const day = dt.getUTCDay() || 7;
  dt.setUTCDate(dt.getUTCDate() + 4 - day);
  const yearStart = new Date(Date.UTC(dt.getUTCFullYear(), 0, 1));
  const wk = Math.ceil((((dt.getTime() - yearStart.getTime()) / MS_DAY) + 1) / 7);
  return `${dt.getUTCFullYear()}-W${String(wk).padStart(2, "0")}`;
}

function fmt(d: Date) {
  return d.toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" });
}

function withinWeek(iso: string | undefined, since: Date) {
  if (!iso) return false;
  const t = new Date(iso).getTime();
  return !isNaN(t) && t >= since.getTime();
}

type PriorSnapshot = {
  weekKey: string;
  onTimeRate: number;
  lateCount: number;
  openAlerts: number;
  promoRequestsApproved: number;
  generatedAt: string;
};

function readHistory(): PriorSnapshot[] {
  try {
    const raw = localStorage.getItem(HISTORY_KEY);
    return raw ? (JSON.parse(raw) as PriorSnapshot[]) : [];
  } catch { return []; }
}

function saveHistory(entry: PriorSnapshot) {
  const hist = readHistory().filter((h) => h.weekKey !== entry.weekKey);
  hist.push(entry);
  localStorage.setItem(HISTORY_KEY, JSON.stringify(hist.slice(-8)));
}

export function generateWeeklyDigest(src: DigestSources): string {
  const now = new Date();
  const since = new Date(now.getTime() - 7 * MS_DAY);
  const wkKey = weekKey(now);
  const lines: string[] = [];
  const push = (s = "") => lines.push(s);

  push(`WEEKLY OPERATIONS DIGEST — Week of ${fmt(since)} to ${fmt(now)}`);
  push("═══════════════════════════════════════════════");
  push();

  // 1. Deliveries
  const weekDeliv = src.deliveries.filter((d) => {
    const t = new Date(d.dueDate).getTime();
    return !isNaN(t) && t >= since.getTime() - MS_DAY;
  });
  const delivered = weekDeliv.filter((d) => d.status === "DELIVERED");
  const onTime = delivered.filter((d) => !d.wasLate);
  const late = weekDeliv.filter((d) => d.wasLate || d.status === "LATE");
  const blocked = weekDeliv.filter((d) => d.status === "BLOCKED");
  const onTimeRate = delivered.length ? Math.round((onTime.length / delivered.length) * 100) : 0;

  push("1. DELIVERIES");
  push("─────────────");
  push(`Total due this week: ${weekDeliv.length}`);
  push(`Delivered on time: ${onTime.length}`);
  push(`Delivered late: ${late.length}`);
  for (const d of late) {
    push(`  - ${d.id} (${d.customerName}): delay — "${d.delayReason ?? "no reason recorded"}"${d.responsibleDept ? ` — ${d.responsibleDept} dept` : ""}`);
  }
  push(`Blocked/failed: ${blocked.length}`);
  for (const d of blocked) {
    push(`  - ${d.id} (${d.customerName}): blocked — ${d.delayReason ?? d.status}`);
  }
  push(`On-time rate: ${onTimeRate}%`);
  push();

  // 2. Promo stock requests (from authRequests type=PROMO_RELEASE)
  const promoReqs = src.authRequests.filter(
    (r) => r.type === "PROMO_RELEASE" && withinWeek(r.createdAt, since),
  );
  const approved = promoReqs.filter((r) => r.status === "APPROVED");
  const rejected = promoReqs.filter((r) => r.status === "REJECTED");
  const pending = promoReqs.filter((r) => r.status === "PENDING");
  push("2. PROMO STOCK REQUESTS");
  push("────────────────────────");
  push(`Total requests this week: ${promoReqs.length}`);
  push(`Approved: ${approved.length}`);
  for (const r of approved) push(`  - ${r.details} — by ${r.requestedBy}`);
  push(`Rejected: ${rejected.length}`);
  for (const r of rejected) push(`  - ${r.details} — reason: ${r.decisionNote ?? "not specified"}`);
  push(`Still pending: ${pending.length}`);
  for (const r of pending) {
    const days = Math.max(0, Math.round((now.getTime() - new Date(r.createdAt).getTime()) / MS_DAY));
    push(`  - ${r.details} (${days}d pending)`);
  }
  push();

  // 3. Notes (comments)
  const weekComments = src.comments.filter((c) => withinWeek(c.createdAt, since) && !c.hidden);
  const byCat = weekComments.reduce<Record<string, number>>((acc, c) => {
    acc[c.commentType] = (acc[c.commentType] ?? 0) + 1;
    return acc;
  }, {});
  const pinned = weekComments.filter((c) => c.commentType === "SUPERVISOR_NOTE" || c.commentType === "DELAY_REASON");
  push("3. NOTES THIS WEEK");
  push("──────────────────");
  push(`Total notes logged: ${weekComments.length}`);
  for (const [cat, n] of Object.entries(byCat)) push(`  ${cat}: ${n}`);
  push(`Priority notes: ${pinned.length}`);
  for (const c of pinned.slice(0, 10)) {
    const short = c.message.length > 90 ? c.message.slice(0, 87) + "…" : c.message;
    push(`  - [${c.commentType}] ${short} — ${c.authorName}`);
  }
  push();

  // 4. Calendar / Field activity
  const weekEvents = src.calendarEvents.filter((e) => {
    const t = new Date(e.date).getTime();
    return !isNaN(t) && t >= since.getTime() && t <= now.getTime();
  });
  const byType = weekEvents.reduce<Record<string, number>>((acc, e) => {
    acc[e.type] = (acc[e.type] ?? 0) + 1;
    return acc;
  }, {});
  const weekLogs = src.fieldLog.filter((f) => withinWeek(f.createdAt, since));
  push("4. CALENDAR / FIELD ACTIVITY");
  push("─────────────────────────────");
  push(`Total events this week: ${weekEvents.length}`);
  for (const [tp, n] of Object.entries(byType)) push(`  ${tp}: ${n}`);
  if (weekLogs.length) {
    push(`Field visits logged: ${weekLogs.length}`);
    const outcomes = weekLogs.reduce<Record<string, number>>((acc, f) => {
      acc[f.outcome] = (acc[f.outcome] ?? 0) + 1;
      return acc;
    }, {});
    for (const [o, n] of Object.entries(outcomes)) push(`  outcome ${o}: ${n}`);
  }
  push();

  // 5. Tasks
  const completedThisWeek = src.audit.filter(
    (a) => a.entityType === "task" && a.field === "status" && a.newValue.includes("green") && withinWeek(a.timestamp, since),
  );
  const overdue = src.tasks.filter((t) => t.status === "red");
  push("5. TASKS");
  push("────────");
  push(`Tasks completed this week: ${completedThisWeek.length}`);
  push(`Tasks still overdue/critical: ${overdue.length}`);
  for (const t of overdue) push(`  - ${t.title} — ${t.assignee}`);
  push();

  // 6. Alerts
  const weekAlerts = src.alerts.filter((a) => withinWeek(a.createdAt, since));
  const redRaised = weekAlerts.filter((a) => a.severity === "red");
  const redResolved = redRaised.filter((a) => a.resolved);
  const stillOpen = src.alerts.filter((a) => !a.resolved);
  push("6. ALERTS");
  push("─────────");
  push(`Red alerts raised this week: ${redRaised.length}`);
  push(`Red alerts resolved this week: ${redResolved.length}`);
  push(`Still open at week's end: ${stillOpen.length}`);
  for (const a of stillOpen) {
    const days = Math.max(0, Math.round((now.getTime() - new Date(a.createdAt).getTime()) / MS_DAY));
    push(`  - ${a.title} — open ${days}d`);
  }
  push();

  // 7. Key issues
  push("7. KEY ISSUES THIS WEEK");
  push("────────────────────────");
  const key: string[] = [];
  for (const d of blocked) key.push(`BLOCKED delivery ${d.id} (${d.customerName})`);
  for (const d of late) key.push(`LATE delivery ${d.id} (${d.customerName})`);
  for (const r of rejected) key.push(`REJECTED promo request: ${r.details}`);
  for (const a of stillOpen.filter((x) => x.severity === "red")) key.push(`OPEN RED alert: ${a.title}`);
  for (const c of pinned) key.push(`Pinned note: ${c.message.slice(0, 60)}`);
  if (key.length === 0) push("  (none)");
  for (const k of key.slice(0, 5)) push(`  • ${k}`);
  push();

  // 8. Trend
  push("8. WEEK-OVER-WEEK");
  push("──────────────────");
  const history = readHistory();
  const prior = history.filter((h) => h.weekKey !== wkKey).slice(-1)[0];
  if (!prior) {
    push("No prior week on record yet — this is the first digest. Future digests will include week-over-week comparison.");
  } else {
    push(`Late deliveries: ${late.length} this week vs ${prior.lateCount} last week.`);
    push(`On-time rate: ${onTimeRate}% this week vs ${prior.onTimeRate}% last week.`);
    push(`Open alerts: ${stillOpen.length} this week vs ${prior.openAlerts} last week.`);
    push(`Promo requests approved: ${approved.length} this week vs ${prior.promoRequestsApproved} last week.`);
  }
  push();
  push("─────────────────────────────────────────────");
  push("This digest is generated automatically from this week's records and can be archived into a monthly digest later.");

  saveHistory({
    weekKey: wkKey,
    onTimeRate,
    lateCount: late.length,
    openAlerts: stillOpen.length,
    promoRequestsApproved: approved.length,
    generatedAt: now.toISOString(),
  });

  return lines.join("\n");
}

export function WeeklyDigestButton(props: DigestSources) {
  const [open, setOpen] = useState(false);
  const [text, setText] = useState("");
  const [copied, setCopied] = useState(false);

  function handleOpen() {
    setText(generateWeeklyDigest(props));
    setCopied(false);
    setOpen(true);
  }

  async function copy() {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {}
  }

  return (
    <>
      <Button variant="outline" size="sm" onClick={handleOpen} className="gap-1.5">
        <FileText className="size-4" /> Weekly digest
      </Button>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle className="flex items-center justify-between gap-4">
              <span>Weekly operations digest</span>
              <Button variant="outline" size="sm" onClick={copy} className="gap-1.5">
                {copied ? <Check className="size-4" /> : <Copy className="size-4" />}
                {copied ? "Copied" : "Copy to clipboard"}
              </Button>
            </DialogTitle>
          </DialogHeader>
          <pre className="max-h-[70vh] overflow-auto whitespace-pre-wrap rounded-md border bg-muted/30 p-4 text-xs leading-relaxed">
            {text}
          </pre>
        </DialogContent>
      </Dialog>
    </>
  );
}