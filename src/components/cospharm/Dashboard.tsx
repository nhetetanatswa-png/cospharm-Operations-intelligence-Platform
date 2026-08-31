import { useEffect, useMemo, useState } from "react";
import {
  Activity,
  AlertTriangle,
  Boxes,
  ClipboardList,
  Clock,
  CalendarDays,
  History,
  LayoutDashboard,
  Megaphone,
  Package,
  Plus,
  Search,
  ShieldCheck,
  Truck,
  Users,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Progress } from "@/components/ui/progress";
import { Separator } from "@/components/ui/separator";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { StatusBadge, StatusDot, type Status } from "./StatusBadge";
import { TaskDetailSheet } from "./TaskDetailSheet";
import { StockUpdateDialog } from "./StockUpdateDialog";
import { AuditTrailCard } from "./AuditTrailCard";
import { WeeklyDigestButton } from "./WeeklyDigest";
import { DeliveryDetailSheet } from "./DeliveryDetailSheet";
import { DeliveryProgress } from "./DeliveryProgress";
import { CommentsBox } from "./CommentsBox";
import { DispatchWindowsPanel } from "./DispatchWindowsPanel";
import { DelayReasonDialog } from "./DelayReasonDialog";
import { EmergencyOrders } from "./EmergencyOrders";
import { MarketerModule } from "./MarketerModule";
import { OperationsCalendar } from "./OperationsCalendar";
import { can, ROLE_DESCRIPTION, ROLE_LABEL } from "./roles";
import { ROLE_USERS_FULL, STAFF_ROSTER } from "./staff";
import { ALL_CLIENTS, CLIENT_CONTACTS, HOSPITALS_AND_CLINICS, PHARMA_DISTRIBUTORS } from "./mockClients";
import { NotesDigest } from "./NotesDigest";
import { PerformanceReport } from "./PerformanceReport";
import { EmergencyOrdersBanner } from "./EmergencyOrdersBanner";
import { TimedDeliveries } from "./TimedDeliveries";
import { DeliveryRiskPanel } from "./DeliveryRiskPanel";
import { InventoryIntegrity } from "./InventoryIntegrity";
import { IntelligenceModule } from "./IntelligenceModule";
import { loadCounts, loadDamages, type DamageRecord, type InventoryCount } from "./inventory";
import { loadKyc, type KycRecord } from "./kyc";
import {
  deliveryStatusBadge,
  deriveDeliveryRisk,
  makeSteps,
  shouldMarkLate,
  getProgressPercentage,
  getCurrentStep,
  getCompletedSteps,
  DISPATCH_WINDOW_LABELS,
} from "./operations";
import type {
  ActivityEvent,
  Alert,
  AuditEntry,
  AuthorisationRequest,
  CalendarEvent,
  Comment,
  CommentType,
  CurrentUser,
  Delivery,
  EmergencyOrder,
  EmergencyOrderStatus,
  FieldLogEntry,
  FieldVisit,
  PromoStockItem,
  Role,
  StockItem,
  Task,
  BatchRecord,
  ColdChainZone,
  ControlledDrugLog,
  Inspection,
  License,
} from "./types";
import cospharmLogo from "@/assets/cospharm-logo.png.asset.json";
import { useHydratedNow, countLabel, formatDay, formatTime } from "./clock";
import { buildSeed, TARGET_DELIVERIES_PER_DAY } from "./seed-data";
import { resolveAll, summarise, isActiveDelivery } from "./delivery-status";
import { CommandCentre } from "./CommandCentre";

// ===== Component =====

export function CospharmDashboard() {
  // Every date in this app is derived from a hydration-safe clock. Until the
  // browser clock is available we render a shell, so the server and client
  // markup can never disagree about a date or a relative timestamp.
  const now = useHydratedNow();
  if (now === null) return <DashboardShell />;
  return <DashboardInner now={now} />;
}

function DashboardShell() {
  return (
    <div className="min-h-screen bg-background text-foreground">
      <div className="mx-auto max-w-7xl px-4 py-16 sm:px-6 lg:px-8">
        <div className="flex items-center gap-3">
          <img src={cospharmLogo.url} alt="Cospharm logo" className="size-11 object-contain" />
          <div>
            <p className="text-base font-semibold tracking-tight text-primary">Cospharm</p>
            <p className="text-[11px] font-medium italic text-status-red">Believe in Good</p>
          </div>
        </div>
        <p className="mt-8 text-sm text-muted-foreground">Loading today&apos;s operational position…</p>
        <div className="mt-4 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {[0, 1, 2, 3].map((i) => <div key={i} className="h-24 animate-pulse rounded-xl border bg-secondary/40" />)}
        </div>
      </div>
    </div>
  );
}

function DashboardInner({ now }: { now: number }) {
  const seed = useState(() => buildSeed(now))[0];
  const todayIso = seed.todayIso;
  const [tab, setTab] = useState("overview");
  const [search, setSearch] = useState("");
  const [role, setRole] = useState<Role>("admin");
  const currentUser = ROLE_USERS_FULL[role];

  const [tasks, setTasks] = useState<Task[]>(seed.tasks);
  const [stock, setStock] = useState<StockItem[]>(seed.stock);
  const [audit, setAudit] = useState<AuditEntry[]>(seed.audit);
  const [deliveries, setDeliveries] = useState<Delivery[]>(seed.deliveries);
  const [comments, setComments] = useState<Comment[]>([]);
  const [calendarEvents, setCalendarEvents] = useState<CalendarEvent[]>(seed.calendar);
  const [promoStock, setPromoStock] = useState<PromoStockItem[]>(seed.promoStock);
  const [visits, setVisits] = useState<FieldVisit[]>(seed.visits);
  const [fieldLog, setFieldLog] = useState<FieldLogEntry[]>(seed.fieldLog);
  const [authRequests, setAuthRequests] = useState<AuthorisationRequest[]>(seed.authRequests);
  const [alerts, setAlerts] = useState<Alert[]>([]);
  const [activity, setActivity] = useState<ActivityEvent[]>([]);
  const [emergencyOrders, setEmergencyOrders] = useState<EmergencyOrder[]>(seed.emergencyOrders);
  const [delayDialog, setDelayDialog] = useState<Delivery | null>(null);
  const [deliveriesTab, setDeliveriesTab] = useState<"active" | "emergency">("active");
  const [activeAssignments, setActiveAssignments] = useState<Record<string, string[]>>({});

  const [openTaskId, setOpenTaskId] = useState<string | null>(null);
  const [stockDialog, setStockDialog] = useState<StockItem | null>(null);
  const [openDeliveryId, setOpenDeliveryId] = useState<string | null>(null);

  // Client-only registers (localStorage backed) for the inventory and compliance modules
  const [counts, setCounts] = useState<InventoryCount[]>([]);
  const [damages, setDamages] = useState<DamageRecord[]>([]);
  const [kyc, setKyc] = useState<KycRecord[]>([]);
  useEffect(() => {
    setCounts(loadCounts(seed.stock));
    setDamages(loadDamages(seed.stock));
    setKyc(loadKyc());
  }, []);

  // ===== Late delivery auto-detection (on mount + every 60s) =====
  useEffect(() => {
    runLateCheck();
    const id = setInterval(runLateCheck, 60_000);
    return () => clearInterval(id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function runLateCheck() {
    const now = new Date();
    setDeliveries((prev) => {
      let changed = false;
      const next = prev.map((d) => {
        if (shouldMarkLate(d, now)) {
          changed = true;
          const cutoff = DISPATCH_WINDOW_LABELS[d.dispatchWindow ?? "AFTERNOON"].sub;
          queueMicrotask(() => {
            setAlerts((al) => {
              if (al.find((a) => a.sourceId === d.id && a.title.includes("Late"))) return al;
              return [
                {
                  id: `AL-${al.length + 1}`,
                  severity: "red",
                  source: "delivery",
                  sourceId: d.id,
                  title: `Late delivery: ${d.id}`,
                  body: `${d.customerName} missed its dispatch cutoff. Delay reason required before this delivery can be progressed.`,
                  createdAt: new Date().toISOString(),
                },
                ...al,
              ];
            });
            setAudit((au) => [
              {
                id: `A-${au.length + 100}`,
                entityType: "task",
                entityId: d.id,
                entityLabel: `Delivery ${d.customerName}`,
                field: "status",
                oldValue: d.status,
                newValue: "LATE",
                user: "System",
                role: "admin",
                comment: `Auto-marked LATE after dispatch cutoff. Window: ${d.dispatchWindow ?? "AFTERNOON"} (${cutoff}).`,
                timestamp: new Date().toISOString(),
              },
              ...au,
            ]);
            pushActivity({
              kind: "delivery",
              message: `Delivery ${d.id} (${d.customerName}) auto-marked LATE`,
              actor: "System",
              role: "admin",
            });
          });
          return { ...d, status: "LATE" as const, wasLate: true, lateDetectedAt: now.toISOString() };
        }
        return d;
      });
      return changed ? next : prev;
    });
  }

  function pushActivity(e: Omit<ActivityEvent, "id" | "timestamp">) {
    setActivity((prev) => [
      { ...e, id: `EV-${prev.length + 1}`, timestamp: new Date().toISOString() },
      ...prev,
    ].slice(0, 50));
  }

  function logAudit(entry: Omit<AuditEntry, "id" | "timestamp" | "user" | "role">) {
    setAudit((prev) => [
      {
        ...entry,
        id: `A-${String(prev.length + 100).padStart(3, "0")}`,
        user: currentUser.name,
        role: currentUser.role,
        timestamp: new Date().toISOString(),
      },
      ...prev,
    ]);
  }

  function updateTaskStatus(task: Task, next: Status, comment: string) {
    const isSupervisor = can(role, "task.verify");
    setTasks((prev) =>
      prev.map((t) => {
        if (t.id !== task.id) return t;
        if (next === "green" && !isSupervisor) {
          return { ...t, status: "yellow", note: comment, pendingVerification: true };
        }
        if (next === "green" && isSupervisor) {
          return { ...t, status: "green", note: comment, pendingVerification: false, verifiedBy: currentUser.name, verifiedAt: new Date().toISOString() };
        }
        return { ...t, status: next, note: comment };
      }),
    );
    logAudit({ entityType: "task", entityId: task.id, entityLabel: task.title, field: "status", oldValue: task.status, newValue: next === "green" && !isSupervisor ? "yellow (pending verification)" : next, comment });
    pushActivity({ kind: next === "green" && !isSupervisor ? "verification" : "task", message: `${task.title} → ${next}${next === "green" && !isSupervisor ? " (awaiting supervisor verification)" : ""}`, actor: currentUser.name, role: currentUser.role });
  }

  function verifyTask(task: Task) {
    setTasks((prev) =>
      prev.map((t) =>
        t.id === task.id
          ? { ...t, status: "green", pendingVerification: false, verifiedBy: currentUser.name, verifiedAt: new Date().toISOString() }
          : t,
      ),
    );
    logAudit({ entityType: "task", entityId: task.id, entityLabel: task.title, field: "status", oldValue: "yellow (pending verification)", newValue: "green (verified)", comment: `Verified by ${currentUser.name}` });
    pushActivity({ kind: "verification", message: `Verified ${task.title}`, actor: currentUser.name, role: currentUser.role });
  }

  function updateStock(item: StockItem, next: { onHand: number; issue?: string; status: Status }, comment: string) {
    setStock((prev) =>
      prev.map((s) => (s.id === item.id ? { ...s, onHand: next.onHand, issue: next.issue, status: next.status } : s)),
    );
    if (next.onHand !== item.onHand) {
      logAudit({ entityType: "stock", entityId: item.id, entityLabel: item.name, field: "onHand", oldValue: String(item.onHand), newValue: String(next.onHand), comment });
    }
    if ((next.issue ?? "") !== (item.issue ?? "")) {
      logAudit({ entityType: "stock", entityId: item.id, entityLabel: item.name, field: "issue", oldValue: item.issue ?? "—", newValue: next.issue ?? "—", comment });
    }
    pushActivity({ kind: "stock", message: `Stock ${item.name} updated`, actor: currentUser.name, role: currentUser.role });
  }

  function updateDelivery(next: Delivery, message: string) {
    setDeliveries((prev) => prev.map((d) => (d.id === next.id ? next : d)));
    logAudit({ entityType: "task", entityId: next.id, entityLabel: `Delivery ${next.customerName}`, field: "status", oldValue: String(getCompletedSteps(prev_steps_for(next, deliveries))), newValue: String(getCompletedSteps(next.steps)) + "/7", comment: message });
    pushActivity({ kind: "delivery", message: `Delivery ${next.id}: ${message}`, actor: currentUser.name, role: currentUser.role });
  }

  function addComment(entityId: string, type: CommentType, message: string, entityType: Comment["relatedEntityType"] = "DELIVERY") {
    const c: Comment = {
      id: `C-${comments.length + 1}`,
      relatedEntityType: entityType,
      relatedEntityId: entityId,
      authorName: currentUser.name,
      authorRole: currentUser.role,
      commentType: type,
      message,
      createdAt: new Date().toISOString(),
    };
    setComments((prev) => [...prev, c]);
    pushActivity({ kind: "comment", message: `${type.replace("_", " ")} on ${entityId}`, actor: currentUser.name, role: currentUser.role });
  }

  function hideComment(id: string) {
    setComments((prev) => prev.map((c) => (c.id === id ? { ...c, hidden: true, hiddenBy: currentUser.name } : c)));
  }

  function resolveLateDelivery(d: Delivery, reason: string) {
    setDeliveries((prev) => prev.map((x) => (x.id === d.id ? { ...x, status: "DELIVERED", resolutionNote: reason } : x)));
    setAlerts((prev) => prev.map((a) => (a.sourceId === d.id ? { ...a, resolved: true, resolutionComment: reason } : a)));
    logAudit({ entityType: "task", entityId: d.id, entityLabel: `Delivery ${d.customerName}`, field: "status", oldValue: "LATE", newValue: "DELIVERED", comment: `Resolved: ${reason}` });
    pushActivity({ kind: "alert", message: `Late delivery ${d.id} resolved`, actor: currentUser.name, role: currentUser.role });
  }

  function saveDelayReason(d: Delivery, payload: {
    delayReason: string;
    responsibleDept: string;
    customerNotified: "YES" | "NO" | "PENDING";
    notificationMethod?: "CALL" | "WHATSAPP" | "EMAIL";
    resolutionPlan: string;
  }) {
    setDeliveries((prev) => prev.map((x) => (x.id === d.id ? {
      ...x,
      delayReason: payload.delayReason,
      responsibleDept: payload.responsibleDept,
      customerNotified: payload.customerNotified === "YES",
      notificationMethod: payload.notificationMethod,
      resolutionPlan: payload.resolutionPlan,
      delayReasonAt: new Date().toISOString(),
    } : x)));
    logAudit({ entityType: "task", entityId: d.id, entityLabel: `Delivery ${d.customerName}`, field: "issue", oldValue: "—", newValue: "delay reason recorded", comment: `Delay reason for LATE ${d.id}: ${payload.delayReason} (responsible: ${payload.responsibleDept})` });
    pushActivity({ kind: "delivery", message: `Delay reason recorded for ${d.id}`, actor: currentUser.name, role: currentUser.role });
    setDelayDialog(null);
  }

  function createEmergencyOrder(o: Omit<EmergencyOrder, "id" | "orderedBy" | "orderedAt" | "status">) {
    const id = `EMG-${1000 + emergencyOrders.length + 1}`;
    const next: EmergencyOrder = {
      ...o,
      id,
      orderedBy: currentUser.name,
      orderedAt: new Date().toISOString(),
      status: "PENDING_APPROVAL",
    };
    setEmergencyOrders((prev) => [next, ...prev]);
    setAlerts((prev) => [{
      id: `AL-EMG-${id}`,
      severity: "yellow",
      source: "delivery",
      sourceId: id,
      title: `Emergency order raised: ${id}`,
      body: `${next.customerName} — awaiting supervisor approval.`,
      createdAt: new Date().toISOString(),
    }, ...prev]);
    logAudit({ entityType: "task", entityId: id, entityLabel: `Emergency order ${next.customerName}`, field: "status", oldValue: "—", newValue: "PENDING_APPROVAL", comment: next.reason });
    pushActivity({ kind: "delivery", message: `Emergency order ${id} raised for ${next.customerName}`, actor: currentUser.name, role: currentUser.role });
  }

  function updateEmergencyStatus(id: string, status: EmergencyOrderStatus, note?: string) {
    setEmergencyOrders((prev) => prev.map((o) => o.id === id ? {
      ...o,
      status,
      authorisedBy: status === "APPROVED" || status === "CANCELLED" ? currentUser.name : o.authorisedBy,
      authorisedAt: status === "APPROVED" || status === "CANCELLED" ? new Date().toISOString() : o.authorisedAt,
      cancellationReason: status === "CANCELLED" ? note : o.cancellationReason,
    } : o));
    logAudit({ entityType: "task", entityId: id, entityLabel: `Emergency order ${id}`, field: "status", oldValue: "—", newValue: status, comment: note ?? `Status changed to ${status}` });
    pushActivity({ kind: "delivery", message: `Emergency order ${id} → ${status}`, actor: currentUser.name, role: currentUser.role });
  }

  function assignEmergencyDriver(id: string, driver: string, eta: string) {
    setEmergencyOrders((prev) => prev.map((o) => o.id === id ? { ...o, driverAssigned: driver, estimatedDelivery: eta, status: "ASSIGNED_TO_DRIVER" } : o));
    logAudit({ entityType: "task", entityId: id, entityLabel: `Emergency order ${id}`, field: "status", oldValue: "APPROVED", newValue: "ASSIGNED_TO_DRIVER", comment: `Driver ${driver}, ETA ${eta}` });
    pushActivity({ kind: "delivery", message: `Emergency ${id} assigned to ${driver}`, actor: currentUser.name, role: currentUser.role });
  }

  function addCalendarEvent(e: Omit<CalendarEvent, "id">) {
    const id = `CE-${calendarEvents.length + 100}`;
    setCalendarEvents((prev) => [{ ...e, id }, ...prev]);
    pushActivity({ kind: "delivery", message: `Calendar event added: ${e.title}`, actor: currentUser.name, role: currentUser.role });
  }

  function addPromoNote(promoId: string, message: string) {
    setPromoStock((prev) => prev.map((p) => p.id === promoId ? {
      ...p,
      notes: [...p.notes, { id: `PN-${Date.now()}`, authorName: currentUser.name, authorRole: currentUser.role, message, createdAt: new Date().toISOString() }],
    } : p));
    pushActivity({ kind: "comment", message: `Promo note added`, actor: currentUser.name, role: currentUser.role });
  }

  function addVisit(v: Omit<FieldVisit, "id">) {
    setVisits((prev) => [...prev, { ...v, id: `FV-${prev.length + 100}` }]);
    pushActivity({ kind: "delivery", message: `Visit scheduled: ${v.title}`, actor: currentUser.name, role: currentUser.role });
  }

  function updateVisit(id: string, patch: Partial<FieldVisit>) {
    setVisits((prev) => prev.map((v) => v.id === id ? { ...v, ...patch } : v));
  }

  function addFieldLog(e: Omit<FieldLogEntry, "id" | "createdAt">) {
    const entry: FieldLogEntry = { ...e, id: `FL-${fieldLog.length + 100}`, createdAt: new Date().toISOString() };
    setFieldLog((prev) => [entry, ...prev]);
    // Auto-deduct promo stock
    if (e.productsUsed.length) {
      setPromoStock((prev) => prev.map((p) => {
        const used = e.productsUsed.find((u) => u.promoStockId === p.id);
        return used ? { ...p, onHand: Math.max(0, p.onHand - used.quantity) } : p;
      }));
    }
    pushActivity({ kind: "delivery", message: `Field log added for ${e.customer}`, actor: currentUser.name, role: currentUser.role });
  }

  function createAuthRequest(r: Omit<AuthorisationRequest, "id" | "createdAt" | "status" | "requestedBy" | "requestedByRole">) {
    const req: AuthorisationRequest = {
      ...r,
      id: `AR-${String(authRequests.length + 100).padStart(3, "0")}`,
      createdAt: new Date().toISOString(),
      status: "PENDING",
      requestedBy: currentUser.name,
      requestedByRole: currentUser.role,
    };
    setAuthRequests((prev) => [req, ...prev]);
    pushActivity({ kind: "alert", message: `Authorisation request ${req.id} raised`, actor: currentUser.name, role: currentUser.role });
  }

  function decideAuthRequest(id: string, decision: "APPROVED" | "REJECTED", note: string) {
    setAuthRequests((prev) => prev.map((r) => r.id === id ? {
      ...r, status: decision, decidedBy: currentUser.name, decidedAt: new Date().toISOString(), decisionNote: note,
    } : r));
    pushActivity({ kind: "alert", message: `Request ${id} ${decision.toLowerCase()}`, actor: currentUser.name, role: currentUser.role });
  }

  // ===== Derived =====

  const visibleTasks = useMemo(() => {
    if (["staff", "warehouse_staff", "warehouse_checker", "dispatch_staff"].includes(role)) {
      return tasks.filter((t) => t.assignee === currentUser.name);
    }
    return tasks;
  }, [tasks, role, currentUser.name]);

  const taskStats = useMemo(() => countByStatus(visibleTasks.map((t) => t.status)), [visibleTasks]);
  const stockStats = useMemo(() => countByStatus(stock.map((s) => s.status)), [stock]);

  const filteredStock = stock.filter((s) =>
    [s.name, s.sku, s.category].join(" ").toLowerCase().includes(search.toLowerCase()),
  );

  const deliveriesWithRisk = useMemo(
    () => deliveries.map((d) => ({ d, risk: deriveDeliveryRisk(d, tasks, stock) })),
    [deliveries, tasks, stock],
  );

  // Single source of truth — Overview, Command Centre and the reports all read these.
  const resolved = useMemo(() => resolveAll(deliveries, seed.timings), [deliveries, seed.timings]);
  const activeResolved = useMemo(() => resolved.filter((r) => isActiveDelivery(r, todayIso)), [resolved, todayIso]);
  const todayTotals = useMemo(() => summarise(resolved.filter((r) => r.d.dueDate === todayIso), todayIso), [resolved, todayIso]);
  const allTotals = useMemo(() => summarise(resolved, todayIso), [resolved, todayIso]);

  const deliveredToday = todayTotals.completedToday;
  const pendingDeliveries = todayTotals.pending + todayTotals.awaitingDispatch;
  const atRiskDeliveries = todayTotals.atRisk;
  const lateDeliveries = allTotals.late;
  const blockedDeliveries = todayTotals.blocked;
  const showCommandCentre = ["general_manager", "admin", "ops_manager"].includes(role);

  const openTask = tasks.find((t) => t.id === openTaskId) ?? null;
  const taskAudit = audit.filter((a) => a.entityType === "task" && a.entityId === openTaskId);
  const openDelivery = deliveries.find((d) => d.id === openDeliveryId) ?? null;
  const deliveryComments = comments.filter((c) => c.relatedEntityId === openDeliveryId);

  // Critical actions: red+yellow tasks + critical stock + late/blocked deliveries
  const criticalActions = useMemo(() => {
    const items: { id: string; severity: 0 | 1 | 2; kind: "task" | "stock" | "delivery"; title: string; subtitle: string; due?: string; assignee?: string }[] = [];
    for (const t of visibleTasks) {
      if (t.status === "red") items.push({ id: t.id, severity: 2, kind: "task", title: t.title, subtitle: t.note ?? "", due: t.due, assignee: t.assignee });
      else if (t.status === "yellow") items.push({ id: t.id, severity: 1, kind: "task", title: t.title, subtitle: t.note ?? "", due: t.due, assignee: t.assignee });
    }
    for (const s of stock) {
      if (s.status === "red") items.push({ id: s.id, severity: 2, kind: "stock", title: s.name, subtitle: s.issue ?? "Critical" });
      else if (s.status === "yellow") items.push({ id: s.id, severity: 1, kind: "stock", title: s.name, subtitle: s.issue ?? "Low" });
    }
    for (const d of deliveries) {
      if (d.status === "LATE" || d.status === "BLOCKED") items.push({ id: d.id, severity: 2, kind: "delivery", title: `${d.id} · ${d.customerName}`, subtitle: d.delayReason ?? d.status, due: d.dueDate, assignee: d.assignedOps });
      else if (d.status === "AT_RISK") items.push({ id: d.id, severity: 1, kind: "delivery", title: `${d.id} · ${d.customerName}`, subtitle: "At risk", due: d.dueDate, assignee: d.assignedOps });
    }
    return items.sort((a, b) => b.severity - a.severity || (a.due ?? "").localeCompare(b.due ?? "")).slice(0, 8);
  }, [visibleTasks, stock, deliveries]);

  return (
    <div className="min-h-screen bg-background text-foreground">
      <Header role={role} setRole={setRole} user={currentUser} />
      <main className="mx-auto max-w-7xl px-4 py-6 sm:px-6 lg:px-8">
        <div className="mb-6 flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between print:hidden">
          <div>
            <h1 className="text-2xl font-semibold tracking-tight sm:text-3xl">Operations dashboard</h1>
            <p className="mt-1 text-sm text-muted-foreground">
              Signed in as <span className="font-medium text-foreground">{currentUser.name}</span> · {ROLE_LABEL[role]} — {ROLE_DESCRIPTION[role]}
            </p>
          </div>
          <div className="flex items-center gap-2">
            <div className="relative">
              <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
              <Input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search tasks or stock…" className="w-64 pl-9" />
            </div>
            {can(role, "task.create") ? (
              <Button variant="default" className="gap-1.5">
                <Plus className="size-4" /> New
              </Button>
            ) : null}
          </div>
        </div>

        <Tabs value={tab} onValueChange={setTab} className="space-y-6">
          <TabsList className="flex w-full flex-wrap sm:inline-flex print:hidden">
            <TabsTrigger value="overview" className="gap-1.5"><LayoutDashboard className="size-4" /> Overview</TabsTrigger>
            <TabsTrigger value="deliveries" className="gap-1.5"><Truck className="size-4" /> Deliveries</TabsTrigger>
            <TabsTrigger value="stock" className="gap-1.5"><Boxes className="size-4" /> Inventory</TabsTrigger>
            <TabsTrigger value="marketer" className="gap-1.5" disabled={!can(role, "marketer.view") && role !== "marketer" && role !== "telesales" && role !== "marketing_lead" && role !== "marketing_supervisor"}>
              <Megaphone className="size-4" /> Marketers
            </TabsTrigger>
            <TabsTrigger value="calendar" className="gap-1.5"><CalendarDays className="size-4" /> Calendar</TabsTrigger>
            <TabsTrigger value="audit" className="gap-1.5"><History className="size-4" /> Audit</TabsTrigger>
          </TabsList>

          {/* ============ OVERVIEW ============ */}
          <TabsContent value="overview" className="space-y-6">
            {showCommandCentre ? (
              <CommandCentre
                now={now}
                userName={currentUser.name}
                resolved={resolved}
                todayIso={todayIso}
                tasks={tasks}
                stock={stock}
                emergencyOrders={emergencyOrders}
                alerts={alerts}
                audit={audit}
                onOpenDelivery={setOpenDeliveryId}
                onOpenTask={setOpenTaskId}
                onOpenStock={(id) => { const s = stock.find((x) => x.id === id); if (s) setStockDialog(s); }}
                onOpenEmergency={() => { setTab("deliveries"); setDeliveriesTab("emergency"); }}
              />
            ) : null}
            {showCommandCentre ? (
              <div className="flex items-center gap-3 pt-2">
                <Separator className="flex-1" />
                <span className="text-[11px] font-semibold uppercase tracking-[0.16em] text-muted-foreground">Operational detail</span>
                <Separator className="flex-1" />
              </div>
            ) : null}
            <EmergencyOrdersBanner
              deliveries={deliveries}
              emergencyOrders={emergencyOrders}
              onOpen={() => { setTab("deliveries"); setDeliveriesTab("emergency"); }}
            />
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
              <KpiCard icon={<Truck className="size-5" />} label="Delivered today" value={`${deliveredToday} / ${TARGET_DELIVERIES_PER_DAY}`} sub="Target progress" tone="green" />
              <KpiCard icon={<Clock className="size-5" />} label="Pending" value={pendingDeliveries} sub="Awaiting completion" tone="yellow" />
              <KpiCard icon={<AlertTriangle className="size-5" />} label="At risk / Blocked" value={atRiskDeliveries + blockedDeliveries} sub="Need supervisor action" tone="yellow" />
              <KpiCard icon={<ShieldCheck className="size-5" />} label="Late deliveries" value={lateDeliveries} sub="Past dispatch cutoff" tone="red" />
            </div>

            <div className="grid gap-6 lg:grid-cols-3">
              <DeliveryRiskPanel items={deliveriesWithRisk.filter((x) => x.d.dueDate >= todayIso || !["DELIVERED", "DISPATCHED"].includes(x.d.status))} onOpen={setOpenDeliveryId} className="lg:col-span-2" />
              <CriticalActionsQueue items={criticalActions} onOpenTask={setOpenTaskId} onOpenDelivery={setOpenDeliveryId} onOpenStock={(id) => { const s = stock.find((x) => x.id === id); if (s) setStockDialog(s); }} />
            </div>

            <DispatchWindowsPanel
              deliveries={deliveries}
              emergencyOrders={emergencyOrders}
              onOpenEmergency={() => { setTab("deliveries"); setDeliveriesTab("emergency"); }}
            />

            <div className="grid gap-6 lg:grid-cols-3">
              <LiveActivityFeed events={activity} />
              <StockRiskSummary items={stock} />
              <UpcomingEventsCard events={calendarEvents} onSeeAll={() => setTab("calendar")} />
            </div>

            {tasks.some((t) => t.pendingVerification) && can(role, "task.verify") ? (
              <Card>
                <CardHeader>
                  <CardTitle className="text-base font-semibold flex items-center gap-2">
                    <ShieldCheck className="size-4" /> Awaiting supervisor verification
                  </CardTitle>
                </CardHeader>
                <CardContent className="space-y-2">
                  {tasks.filter((t) => t.pendingVerification).map((t) => (
                    <div key={t.id} className="flex items-center justify-between rounded-md border p-3">
                      <div className="min-w-0">
                        <p className="text-sm font-medium">{t.title}</p>
                        <p className="text-xs text-muted-foreground">Completed by {t.assignee} · {t.note}</p>
                      </div>
                      <Button size="sm" onClick={() => verifyTask(t)}>Verify</Button>
                    </div>
                  ))}
                </CardContent>
              </Card>
            ) : null}
          </TabsContent>

          {/* ============ DELIVERIES ============ */}
          <TabsContent value="deliveries" className="space-y-4">
            <Tabs value={deliveriesTab} onValueChange={(v) => setDeliveriesTab(v as "active" | "emergency")}>
              <TabsList>
                <TabsTrigger value="active">All deliveries</TabsTrigger>
                <TabsTrigger value="emergency" className="gap-1.5">
                  🚨 Emergency orders
                  {emergencyOrders.filter((o) => o.status === "PENDING_APPROVAL").length > 0 ? (
                    <span className="ml-1 rounded-full bg-status-red px-1.5 text-[10px] font-semibold text-white">
                      {emergencyOrders.filter((o) => o.status === "PENDING_APPROVAL").length}
                    </span>
                  ) : null}
                </TabsTrigger>
              </TabsList>
              <TabsContent value="active" className="mt-4">
                <TimedDeliveries
                  deliveries={deliveries}
                  riskItems={deliveriesWithRisk}
                  currentUserName={currentUser.name}
                  onOpenDelivery={setOpenDeliveryId}
                  onActiveAssignmentsChange={setActiveAssignments}
                />
              </TabsContent>
              <TabsContent value="emergency" className="mt-4">
                <EmergencyOrders
                  orders={emergencyOrders}
                  user={currentUser}
                  onCreate={createEmergencyOrder}
                  onUpdateStatus={updateEmergencyStatus}
                  onAssignDriver={assignEmergencyDriver}
                />
              </TabsContent>
            </Tabs>
          </TabsContent>

          {/* ============ STOCK ============ */}
          <TabsContent value="stock">
            <InventoryIntegrity
              stock={filteredStock}
              counts={counts}
              damages={damages}
              deliveries={deliveries}
              role={role}
              onOpenStock={setStockDialog}
              onOpenDelivery={setOpenDeliveryId}
            />
          </TabsContent>

          {/* ============ MARKETER ============ */}
          <TabsContent value="marketer" className="space-y-6">
            <MarketerModule
              user={currentUser}
              deliveries={deliveries}
              comments={comments}
              promoStock={promoStock}
              visits={visits}
              fieldLog={fieldLog}
              authRequests={authRequests}
              emergencyOrders={emergencyOrders}
              onOpenDelivery={setOpenDeliveryId}
              onAddPromoNote={addPromoNote}
              onAddVisit={addVisit}
              onUpdateVisit={updateVisit}
              onAddFieldLog={addFieldLog}
              onCreateAuthRequest={createAuthRequest}
              onDecideAuthRequest={decideAuthRequest}
            />
          </TabsContent>

          {/* ============ CALENDAR ============ */}
          <TabsContent value="calendar" className="space-y-4">
            <OperationsCalendar
              events={calendarEvents}
              user={currentUser}
              canCreate={["admin", "supervisor", "dispatch_supervisor", "marketer"].includes(role)}
              onAdd={addCalendarEvent}
            />
          </TabsContent>

          {/* ============ AUDIT ============ */}
          <TabsContent value="audit">
            <Tabs defaultValue="trail" className="space-y-4">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <TabsList>
                  <TabsTrigger value="intelligence">Weekly intelligence</TabsTrigger>
                  <TabsTrigger value="trail">Audit trail</TabsTrigger>
                  <TabsTrigger value="performance">Performance report</TabsTrigger>
                  <TabsTrigger value="digest">Notes digest</TabsTrigger>
                </TabsList>
                <WeeklyDigestButton
                  deliveries={deliveries}
                  tasks={tasks}
                  stock={stock}
                  audit={audit}
                  comments={comments}
                  alerts={alerts}
                  calendarEvents={calendarEvents}
                  authRequests={authRequests}
                  fieldLog={fieldLog}
                />
              </div>
              <TabsContent value="intelligence">
                <IntelligenceModule
                  inputs={{
                    deliveries, tasks, stock, counts, damages, kyc, audit, alerts, comments,
                    staffCount: STAFF_ROSTER.length,
                  }}
                />
              </TabsContent>
              <TabsContent value="trail"><AuditTrailCard entries={audit} /></TabsContent>
              <TabsContent value="performance">
                <PerformanceReport resolved={resolved} audit={audit} todayIso={todayIso} />
              </TabsContent>
              <TabsContent value="digest">
                <NotesDigest audit={audit} comments={comments} fieldLog={fieldLog} />
              </TabsContent>
            </Tabs>
          </TabsContent>

        </Tabs>

        <footer className="mt-12 border-t pt-6 text-xs text-muted-foreground">
          Demonstration environment · Cospharm Operations Intelligence Platform · the dataset shown is illustrative and contains no financial values.
        </footer>
      </main>

      <TaskDetailSheet
        task={openTask}
        audit={taskAudit}
        role={role}
        user={currentUser}
        onClose={() => setOpenTaskId(null)}
        onUpdate={updateTaskStatus}
      />
      <StockUpdateDialog
        item={stockDialog}
        role={role}
        onClose={() => setStockDialog(null)}
        onSubmit={updateStock}
      />
      <DeliveryDetailSheet
        delivery={openDelivery}
        tasks={tasks}
        stock={stock}
        comments={deliveryComments}
        user={currentUser}
        onClose={() => setOpenDeliveryId(null)}
        onUpdate={updateDelivery}
        onAddComment={(id, t, m) => addComment(id, t, m, "DELIVERY")}
        onHideComment={hideComment}
        onResolveLate={resolveLateDelivery}
      />
      <DelayReasonDialog
        delivery={delayDialog}
        onClose={() => setDelayDialog(null)}
        onSave={(payload) => delayDialog && saveDelayReason(delayDialog, payload)}
      />
    </div>
  );
}

// Helper to look up prior step count for audit
function prev_steps_for(next: Delivery, list: Delivery[]) {
  return list.find((d) => d.id === next.id)?.steps ?? next.steps;
}

// ===== Header =====
function Header({ role, setRole, user }: { role: Role; setRole: (r: Role) => void; user: CurrentUser }) {
  const initials = user.name.split(" ").map((n) => n[0]).join("").slice(0, 2);
  return (
    <header className="sticky top-0 z-20 border-b bg-background/85 backdrop-blur print:hidden">
      <div className="mx-auto flex max-w-7xl items-center justify-between gap-4 px-4 py-3 sm:px-6 lg:px-8">
        <div className="flex items-center gap-3">
          <img src={cospharmLogo.url} alt="Cospharm logo" className="size-11 object-contain" />
          <div>
            <p className="text-base font-semibold leading-tight tracking-tight text-primary">Cospharm</p>
            <p className="text-[11px] font-medium italic leading-tight text-status-red">Believe in Good</p>
          </div>
        </div>
        <div className="hidden items-center gap-2 md:flex">
          <LegendDot status="green" label="Healthy / done" />
          <LegendDot status="yellow" label="Attention" />
          <LegendDot status="red" label="Critical" />
        </div>
        <div className="flex items-center gap-2">
          <Select value={role} onValueChange={(v) => setRole(v as Role)}>
            <SelectTrigger className="w-[220px]" aria-label="Switch role">
              <SelectValue />
            </SelectTrigger>
            <SelectContent className="max-h-[380px]">
              {(Object.keys(ROLE_LABEL) as Role[]).map((r) => (
                <SelectItem key={r} value={r}>{ROLE_LABEL[r]}</SelectItem>
              ))}
            </SelectContent>
          </Select>
          <div className="hidden text-right sm:block">
            <p className="text-sm font-medium leading-tight">{user.name}</p>
            <p className="text-xs text-muted-foreground leading-tight">{ROLE_LABEL[user.role]}</p>
          </div>
          <div className="grid size-9 place-items-center rounded-full bg-secondary text-sm font-semibold text-secondary-foreground">
            {initials}
          </div>
        </div>
      </div>
    </header>
  );
}

function KpiCard({ icon, label, value, sub, tone = "neutral" }: { icon: React.ReactNode; label: string; value: string | number; sub: string; tone?: "neutral" | "green" | "yellow" | "red" }) {
  const toneClasses: Record<typeof tone, string> = {
    neutral: "bg-secondary text-secondary-foreground",
    green: "bg-status-green/15 text-status-green",
    yellow: "bg-status-yellow/20 text-status-yellow-foreground",
    red: "bg-status-red/15 text-status-red",
  };
  return (
    <Card>
      <CardContent className="flex items-start gap-3 p-5">
        <div className={`grid size-10 place-items-center rounded-md ${toneClasses[tone]}`}>{icon}</div>
        <div className="min-w-0 flex-1">
          <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">{label}</p>
          <p className="mt-1 text-2xl font-semibold tracking-tight">{value}</p>
          <p className="mt-0.5 text-xs text-muted-foreground">{sub}</p>
        </div>
      </CardContent>
    </Card>
  );
}

function LegendDot({ status, label }: { status: Status; label: string }) {
  return (
    <span className="flex items-center gap-1.5 rounded-full border bg-card px-2.5 py-1 text-xs text-muted-foreground">
      <StatusDot status={status} />
      {label}
    </span>
  );
}

function countByStatus(items: Status[]) {
  return items.reduce(
    (acc, s) => { acc[s] += 1; return acc; },
    { green: 0, yellow: 0, red: 0 } as Record<Status, number>,
  );
}

// ===== Overview sections =====

function CriticalActionsQueue({
  items,
  onOpenTask,
  onOpenDelivery,
  onOpenStock,
}: {
  items: { id: string; severity: 0 | 1 | 2; kind: "task" | "stock" | "delivery"; title: string; subtitle: string; due?: string; assignee?: string }[];
  onOpenTask: (id: string) => void;
  onOpenDelivery: (id: string) => void;
  onOpenStock: (id: string) => void;
}) {
  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base font-semibold flex items-center gap-2">
          <AlertTriangle className="size-4" /> Critical actions queue
        </CardTitle>
        <p className="mt-1 text-xs text-muted-foreground">Sorted by severity and due time.</p>
      </CardHeader>
      <CardContent className="space-y-2">
        {items.length === 0 ? (
          <p className="rounded-md border border-dashed p-3 text-center text-xs text-muted-foreground">All clear.</p>
        ) : (
          items.map((it) => {
            const tone: Status = it.severity === 2 ? "red" : "yellow";
            return (
              <div key={`${it.kind}-${it.id}`} className="flex items-start justify-between gap-2 rounded-md border p-3">
                <div className="min-w-0">
                  <p className="text-sm font-medium truncate">{it.title}</p>
                  <p className="text-[11px] text-muted-foreground truncate">
                    {it.kind.toUpperCase()} · {it.assignee ?? "—"}{it.due ? ` · due ${it.due}` : ""}
                  </p>
                  <p className="text-xs text-muted-foreground truncate">{it.subtitle}</p>
                </div>
                <div className="flex flex-col items-end gap-1">
                  <StatusBadge status={tone} label={it.severity === 2 ? "Critical" : "Attention"} />
                  <Button size="sm" variant="outline" onClick={() => {
                    if (it.kind === "task") onOpenTask(it.id);
                    else if (it.kind === "delivery") onOpenDelivery(it.id);
                    else onOpenStock(it.id);
                  }}>Open</Button>
                </div>
              </div>
            );
          })
        )}
      </CardContent>
    </Card>
  );
}

function LiveActivityFeed({ events }: { events: ActivityEvent[] }) {
  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base font-semibold flex items-center gap-2">
          <Activity className="size-4" /> Live activity feed
        </CardTitle>
      </CardHeader>
      <CardContent>
        {events.length === 0 ? (
          <p className="rounded-md border border-dashed p-3 text-center text-xs text-muted-foreground">Activity will appear here as you work.</p>
        ) : (
          <ol className="space-y-2 max-h-72 overflow-y-auto pr-1">
            {events.map((e) => (
              <li key={e.id} className="rounded-md border p-2 text-xs">
                <p className="font-medium">{e.message}</p>
                <p className="text-muted-foreground">
                  {e.actor} · {ROLE_LABEL[e.role]} · {new Date(e.timestamp).toLocaleTimeString()}
                </p>
              </li>
            ))}
          </ol>
        )}
      </CardContent>
    </Card>
  );
}

function StockRiskSummary({ items }: { items: StockItem[] }) {
  const now = new Date();
  const nearExpiry = items.filter((s) => {
    const e = new Date(s.expiry + "-01");
    const diffMonths = (e.getFullYear() - now.getFullYear()) * 12 + (e.getMonth() - now.getMonth());
    return diffMonths >= 0 && diffMonths <= 6;
  });
  const expired = items.filter((s) => {
    const e = new Date(s.expiry + "-01");
    return e < now;
  });
  const damaged = items.filter((s) => (s.damagedUnits ?? 0) > 0);

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base font-semibold flex items-center gap-2">
          <Package className="size-4" /> Stock risk summary
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-3 text-xs">
        <SummaryRow label="Near expiry (≤6mo)" count={nearExpiry.length} tone="yellow" />
        <SummaryRow label="Expired" count={expired.length} tone="red" />
        <SummaryRow label="Damaged units flagged" count={damaged.length} tone="red" />
        <Separator />
        <div className="space-y-1.5 max-h-40 overflow-y-auto pr-1">
          {nearExpiry.concat(damaged.filter((d) => !nearExpiry.includes(d))).slice(0, 6).map((s) => (
            <div key={s.id} className="flex items-center justify-between gap-2">
              <span className="truncate">{s.name}</span>
              <span className="font-mono text-[10px] text-muted-foreground">
                {s.batch} · exp {s.expiry}{s.damagedUnits ? ` · ${s.damagedUnits} dmg` : ""}
              </span>
            </div>
          ))}
        </div>
      </CardContent>
    </Card>
  );
}

function SummaryRow({ label, count, tone }: { label: string; count: number; tone: Status }) {
  return (
    <div className="flex items-center justify-between">
      <span className="flex items-center gap-2">
        <StatusDot status={tone} /> {label}
      </span>
      <span className="font-semibold">{count}</span>
    </div>
  );
}

function UpcomingEventsCard({ events, onSeeAll }: { events: CalendarEvent[]; onSeeAll: () => void }) {
  const today = new Date().toISOString().slice(0, 10);
  const upcoming = [...events]
    .filter((e) => e.date >= today)
    .sort((a, b) => a.date.localeCompare(b.date))
    .slice(0, 5);
  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between">
        <CardTitle className="text-base font-semibold flex items-center gap-2">
          <CalendarDays className="size-4" /> Upcoming events
        </CardTitle>
        <Button size="sm" variant="ghost" onClick={onSeeAll}>See all</Button>
      </CardHeader>
      <CardContent className="space-y-2">
        {upcoming.length === 0 ? (
          <p className="rounded-md border border-dashed p-3 text-center text-xs text-muted-foreground">No upcoming events.</p>
        ) : (
          upcoming.map((e) => (
            <div key={e.id} className="rounded-md border p-2 text-xs">
              <div className="flex items-center justify-between gap-2">
                <p className="font-medium truncate">{e.important ? "★ " : ""}{e.title}</p>
                <span className="text-[10px] uppercase text-muted-foreground">{e.type}</span>
              </div>
              <p className="text-[11px] text-muted-foreground">
                {new Date(e.date + "T00:00:00").toLocaleDateString(undefined, { weekday: "short", day: "numeric", month: "short" })}
                {e.time ? ` · ${e.time}` : ""}{e.owner ? ` · ${e.owner}` : ""}
              </p>
            </div>
          ))
        )}
      </CardContent>
    </Card>
  );
}
