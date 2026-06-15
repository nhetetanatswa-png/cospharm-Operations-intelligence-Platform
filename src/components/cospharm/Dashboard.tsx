import { useMemo, useState } from "react";
import {
  Activity,
  AlertTriangle,
  Boxes,
  ClipboardList,
  Clock,
  History,
  LayoutDashboard,
  Lock,
  Pill,
  Plus,
  Search,
  Settings,
  ShieldCheck,
  TrendingDown,
  UserCog,
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
import { StatusBadge, StatusDot, type Status } from "./StatusBadge";
import { TaskDetailSheet } from "./TaskDetailSheet";
import { StockUpdateDialog } from "./StockUpdateDialog";
import { AuditTrailCard } from "./AuditTrailCard";
import { can, ROLE_DESCRIPTION, ROLE_LABEL } from "./roles";
import type { AuditEntry, CurrentUser, Role, StockItem, Task } from "./types";
import cospharmLogo from "@/assets/cospharm-logo.png.asset.json";

const INITIAL_TASKS: Task[] = [
  { id: "T-1042", title: "Morning cold-chain temperature log", assignee: "Ada Bello", shift: "Morning", due: "07:30", status: "green", note: "All readings within range." },
  { id: "T-1043", title: "Restock dispensary shelves A–C", assignee: "John Mensah", shift: "Morning", due: "09:00", status: "yellow", note: "Started — shelf C pending" },
  { id: "T-1044", title: "Sign off overnight delivery manifest", assignee: "Mary Adeyemi", shift: "Morning", due: "08:00", status: "red", note: "Not signed — driver waiting" },
  { id: "T-1045", title: "Controlled drugs cabinet count", assignee: "Grace Okoye", shift: "Morning", due: "10:00", status: "green", note: "Counts match register." },
  { id: "T-1046", title: "Clean & sanitise compounding bench", assignee: "Tunde Aliu", shift: "Afternoon", due: "13:00", status: "yellow", note: "In progress" },
  { id: "T-1047", title: "Patient delivery batch #B-228", assignee: "John Mensah", shift: "Afternoon", due: "14:30", status: "red", note: "2 items short — see stock" },
  { id: "T-1048", title: "Equipment calibration check", assignee: "Ada Bello", shift: "Afternoon", due: "15:00", status: "green", note: "Calibrated, certificate filed." },
  { id: "T-1049", title: "End-of-day handover log", assignee: "Mary Adeyemi", shift: "Night", due: "20:00", status: "yellow", note: "Awaiting pharmacist sign-off" },
];

const INITIAL_STOCK: StockItem[] = [
  { id: "S-001", name: "Paracetamol 500mg", sku: "PCM-500", category: "Analgesics", onHand: 1240, reorder: 400, capacity: 2000, expiry: "2027-04", status: "green" },
  { id: "S-002", name: "Amoxicillin 250mg", sku: "AMX-250", category: "Antibiotics", onHand: 320, reorder: 500, capacity: 1500, expiry: "2026-09", status: "yellow", issue: "Below reorder level" },
  { id: "S-003", name: "Insulin Glargine 100IU", sku: "INS-GLA", category: "Cold chain", onHand: 28, reorder: 60, capacity: 200, expiry: "2026-03", status: "red", issue: "Critically low — affects 3 deliveries" },
  { id: "S-004", name: "Salbutamol Inhaler", sku: "SAL-INH", category: "Respiratory", onHand: 145, reorder: 80, capacity: 300, expiry: "2026-11", status: "green" },
  { id: "S-005", name: "Metformin 500mg", sku: "MET-500", category: "Diabetes", onHand: 880, reorder: 300, capacity: 1500, expiry: "2027-01", status: "green" },
  { id: "S-006", name: "Ceftriaxone 1g Vial", sku: "CEF-1G", category: "Antibiotics", onHand: 60, reorder: 100, capacity: 400, expiry: "2026-02", status: "yellow", issue: "12 units damaged on receipt" },
  { id: "S-007", name: "Loratadine 10mg", sku: "LOR-10", category: "Antihistamines", onHand: 12, reorder: 150, capacity: 600, expiry: "2025-12", status: "red", issue: "Near expiry & critically low" },
  { id: "S-008", name: "ORS Sachets", sku: "ORS-S", category: "Rehydration", onHand: 540, reorder: 200, capacity: 1000, expiry: "2027-08", status: "green" },
];

const STAFF = [
  { name: "Ada Bello", role: "Pharmacy Tech", shift: "Morning", tasksDone: 6, tasksPending: 1 },
  { name: "John Mensah", role: "Stock Clerk", shift: "Morning", tasksDone: 4, tasksPending: 2 },
  { name: "Grace Okoye", role: "Pharmacist", shift: "Morning", tasksDone: 5, tasksPending: 0 },
  { name: "Tunde Aliu", role: "Pharmacy Tech", shift: "Afternoon", tasksDone: 3, tasksPending: 1 },
  { name: "Mary Adeyemi", role: "Supervisor", shift: "All-day", tasksDone: 7, tasksPending: 2 },
];

const ROLE_USERS: Record<Role, CurrentUser> = {
  admin: { name: "Olu Adebayo", role: "admin" },
  supervisor: { name: "Mary Adeyemi", role: "supervisor" },
  staff: { name: "John Mensah", role: "staff" },
};

const seedAudit = (): AuditEntry[] => [
  {
    id: "A-001",
    entityType: "task",
    entityId: "T-1045",
    entityLabel: "Controlled drugs cabinet count",
    field: "status",
    oldValue: "yellow",
    newValue: "green",
    user: "Grace Okoye",
    role: "staff",
    comment: "Counts match register; witnessed by supervisor.",
    timestamp: new Date(Date.now() - 1000 * 60 * 90).toISOString(),
  },
  {
    id: "A-002",
    entityType: "stock",
    entityId: "S-006",
    entityLabel: "Ceftriaxone 1g Vial",
    field: "issue",
    oldValue: "—",
    newValue: "12 units damaged on receipt",
    user: "John Mensah",
    role: "staff",
    comment: "Damage report filed against shipment INV-9921.",
    timestamp: new Date(Date.now() - 1000 * 60 * 45).toISOString(),
  },
];

export function CospharmDashboard() {
  const [tab, setTab] = useState("overview");
  const [search, setSearch] = useState("");
  const [role, setRole] = useState<Role>("supervisor");
  const currentUser = ROLE_USERS[role];

  const [tasks, setTasks] = useState<Task[]>(INITIAL_TASKS);
  const [stock, setStock] = useState<StockItem[]>(INITIAL_STOCK);
  const [audit, setAudit] = useState<AuditEntry[]>(seedAudit);
  const [openTaskId, setOpenTaskId] = useState<string | null>(null);
  const [stockDialog, setStockDialog] = useState<StockItem | null>(null);

  const visibleTasks = useMemo(() => {
    if (role === "staff") {
      return tasks.filter((t) => t.assignee === currentUser.name);
    }
    return tasks;
  }, [tasks, role, currentUser.name]);

  const taskStats = useMemo(() => countByStatus(visibleTasks.map((t) => t.status)), [visibleTasks]);
  const stockStats = useMemo(() => countByStatus(stock.map((s) => s.status)), [stock]);

  const filteredTasks = visibleTasks.filter((t) =>
    [t.title, t.assignee, t.id].join(" ").toLowerCase().includes(search.toLowerCase()),
  );
  const filteredStock = stock.filter((s) =>
    [s.name, s.sku, s.category].join(" ").toLowerCase().includes(search.toLowerCase()),
  );

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
    setTasks((prev) => prev.map((t) => (t.id === task.id ? { ...t, status: next, note: comment } : t)));
    logAudit({
      entityType: "task",
      entityId: task.id,
      entityLabel: task.title,
      field: "status",
      oldValue: task.status,
      newValue: next,
      comment,
    });
  }

  function updateStock(item: StockItem, next: { onHand: number; issue?: string; status: Status }, comment: string) {
    setStock((prev) =>
      prev.map((s) =>
        s.id === item.id ? { ...s, onHand: next.onHand, issue: next.issue, status: next.status } : s,
      ),
    );
    if (next.onHand !== item.onHand) {
      logAudit({
        entityType: "stock",
        entityId: item.id,
        entityLabel: item.name,
        field: "onHand",
        oldValue: String(item.onHand),
        newValue: String(next.onHand),
        comment,
      });
    }
    if ((next.issue ?? "") !== (item.issue ?? "")) {
      logAudit({
        entityType: "stock",
        entityId: item.id,
        entityLabel: item.name,
        field: "issue",
        oldValue: item.issue ?? "—",
        newValue: next.issue ?? "—",
        comment,
      });
    }
  }

  const openTask = tasks.find((t) => t.id === openTaskId) ?? null;
  const taskAudit = audit.filter((a) => a.entityType === "task" && a.entityId === openTaskId);

  return (
    <div className="min-h-screen bg-background text-foreground">
      <Header role={role} setRole={setRole} user={currentUser} />
      <main className="mx-auto max-w-7xl px-4 py-6 sm:px-6 lg:px-8">
        <div className="mb-6 flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <h1 className="text-2xl font-semibold tracking-tight sm:text-3xl">
              Operations dashboard
            </h1>
            <p className="mt-1 text-sm text-muted-foreground">
              Signed in as <span className="font-medium text-foreground">{currentUser.name}</span> ·{" "}
              {ROLE_LABEL[role]} — {ROLE_DESCRIPTION[role]}
            </p>
          </div>
          <div className="flex items-center gap-2">
            <div className="relative">
              <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Search tasks or stock…"
                className="w-64 pl-9"
              />
            </div>
            {can(role, "task.create") ? (
              <Button variant="default" className="gap-1.5">
                <Plus className="size-4" /> New
              </Button>
            ) : null}
          </div>
        </div>

        <Tabs value={tab} onValueChange={setTab} className="space-y-6">
          <TabsList className="grid w-full grid-cols-5 sm:w-auto sm:inline-grid">
            <TabsTrigger value="overview" className="gap-1.5">
              <LayoutDashboard className="size-4" /> Overview
            </TabsTrigger>
            <TabsTrigger value="tasks" className="gap-1.5">
              <ClipboardList className="size-4" /> Tasks
            </TabsTrigger>
            <TabsTrigger value="stock" className="gap-1.5">
              <Boxes className="size-4" /> Stock
            </TabsTrigger>
            <TabsTrigger value="audit" className="gap-1.5">
              <History className="size-4" /> Audit
            </TabsTrigger>
            <TabsTrigger value="admin" className="gap-1.5" disabled={!can(role, "users.manage")}>
              <UserCog className="size-4" /> Admin
            </TabsTrigger>
          </TabsList>

          <TabsContent value="overview" className="space-y-6">
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
              <KpiCard
                icon={<ClipboardList className="size-5" />}
                label={role === "staff" ? "My tasks today" : "Tasks today"}
                value={visibleTasks.length}
                sub={`${taskStats.green} completed`}
              />
              <KpiCard
                icon={<Clock className="size-5" />}
                label="In progress"
                value={taskStats.yellow}
                sub="Needs attention"
                tone="yellow"
              />
              <KpiCard
                icon={<AlertTriangle className="size-5" />}
                label="Overdue / red"
                value={taskStats.red + stockStats.red}
                sub="Tasks + critical stock"
                tone="red"
              />
              <KpiCard
                icon={<ShieldCheck className="size-5" />}
                label="Stock healthy"
                value={`${Math.round((stockStats.green / stock.length) * 100)}%`}
                sub={`${stockStats.green}/${stock.length} items green`}
                tone="green"
              />
            </div>

            <div className="grid gap-6 lg:grid-cols-3">
              <Card className="lg:col-span-2">
                <CardHeader className="flex flex-row items-center justify-between">
                  <CardTitle className="text-base font-semibold">Today's task status</CardTitle>
                  <Button variant="ghost" size="sm" onClick={() => setTab("tasks")}>
                    View all
                  </Button>
                </CardHeader>
                <CardContent>
                  <StatusBars
                    rows={[
                      { label: "Completed", count: taskStats.green, total: visibleTasks.length, status: "green" },
                      { label: "In progress", count: taskStats.yellow, total: visibleTasks.length, status: "yellow" },
                      { label: "Overdue / not done", count: taskStats.red, total: visibleTasks.length, status: "red" },
                    ]}
                  />
                  <Separator className="my-5" />
                  <ul className="space-y-3">
                    {visibleTasks.filter((t) => t.status !== "green")
                      .slice(0, 4)
                      .map((t) => (
                        <li key={t.id}>
                          <button
                            onClick={() => setOpenTaskId(t.id)}
                            className="flex w-full items-start gap-3 rounded-md p-1.5 text-left transition hover:bg-secondary/60"
                          >
                            <StatusDot status={t.status} className="mt-1.5" />
                            <div className="min-w-0 flex-1">
                              <p className="truncate text-sm font-medium">{t.title}</p>
                              <p className="truncate text-xs text-muted-foreground">
                                {t.assignee} · due {t.due} · {t.note}
                              </p>
                            </div>
                            <StatusBadge status={t.status} />
                          </button>
                        </li>
                      ))}
                  </ul>
                </CardContent>
              </Card>

              <Card>
                <CardHeader>
                  <CardTitle className="text-base font-semibold">Stock at risk</CardTitle>
                </CardHeader>
                <CardContent>
                  <StatusBars
                    rows={[
                      { label: "Healthy", count: stockStats.green, total: stock.length, status: "green" },
                      { label: "Low / minor issue", count: stockStats.yellow, total: stock.length, status: "yellow" },
                      { label: "Critical", count: stockStats.red, total: stock.length, status: "red" },
                    ]}
                  />
                  <Separator className="my-5" />
                  <ul className="space-y-3">
                    {stock.filter((s) => s.status === "red").map((s) => (
                      <li key={s.id} className="flex items-start gap-3">
                        <Pill className="mt-0.5 size-4 text-status-red" />
                        <div className="min-w-0 flex-1">
                          <p className="truncate text-sm font-medium">{s.name}</p>
                          <p className="truncate text-xs text-muted-foreground">{s.issue}</p>
                        </div>
                        <StatusBadge status={s.status} />
                      </li>
                    ))}
                  </ul>
                </CardContent>
              </Card>
            </div>

            <Card>
              <CardHeader>
                <CardTitle className="text-base font-semibold">Operational risks</CardTitle>
              </CardHeader>
              <CardContent className="grid gap-3 sm:grid-cols-3">
                <RiskTile
                  icon={<TrendingDown className="size-4" />}
                  title="Delivery shortfall"
                  body="Batch B-228 short 2 items — Insulin Glargine critical."
                  status="red"
                />
                <RiskTile
                  icon={<Activity className="size-4" />}
                  title="Cold chain"
                  body="Morning temperature log completed — all readings within range."
                  status="green"
                />
                <RiskTile
                  icon={<AlertTriangle className="size-4" />}
                  title="Handover risk"
                  body="Overnight manifest unsigned — accountability gap forming."
                  status="yellow"
                />
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="tasks">
            <Card>
              <CardHeader className="flex flex-row items-center justify-between">
                <div>
                  <CardTitle className="text-base font-semibold">
                    {role === "staff" ? "My tasks" : "All tasks"}
                  </CardTitle>
                  <p className="mt-1 text-xs text-muted-foreground">
                    Click any row to view detail and audit history. Marking a task green requires a comment.
                  </p>
                </div>
                {can(role, "task.create") ? (
                  <Button size="sm" className="gap-1.5">
                    <Plus className="size-4" /> Log task
                  </Button>
                ) : null}
              </CardHeader>
              <CardContent>
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead className="w-[90px]">ID</TableHead>
                      <TableHead>Task</TableHead>
                      <TableHead>Assignee</TableHead>
                      <TableHead>Shift</TableHead>
                      <TableHead>Due</TableHead>
                      <TableHead className="text-right">Status</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {filteredTasks.map((t) => (
                      <TableRow
                        key={t.id}
                        onClick={() => setOpenTaskId(t.id)}
                        className="cursor-pointer"
                      >
                        <TableCell className="font-mono text-xs text-muted-foreground">{t.id}</TableCell>
                        <TableCell>
                          <div className="font-medium">{t.title}</div>
                          {t.note ? (
                            <div className="text-xs text-muted-foreground">{t.note}</div>
                          ) : null}
                        </TableCell>
                        <TableCell className="text-sm">{t.assignee}</TableCell>
                        <TableCell className="text-sm text-muted-foreground">{t.shift}</TableCell>
                        <TableCell className="text-sm">{t.due}</TableCell>
                        <TableCell className="text-right">
                          <StatusBadge status={t.status} />
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="stock">
            <Card>
              <CardHeader className="flex flex-row items-center justify-between">
                <div>
                  <CardTitle className="text-base font-semibold">Stock condition</CardTitle>
                  <p className="mt-1 text-xs text-muted-foreground">
                    Every stock change is recorded in the audit trail with a comment.
                  </p>
                </div>
                {can(role, "stock.report") ? (
                  <Button
                    size="sm"
                    variant="outline"
                    className="gap-1.5"
                    onClick={() => setStockDialog(stock[0])}
                  >
                    <Plus className="size-4" /> Report issue
                  </Button>
                ) : null}
              </CardHeader>
              <CardContent>
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Item</TableHead>
                      <TableHead>Category</TableHead>
                      <TableHead>On hand</TableHead>
                      <TableHead className="w-[180px]">Level</TableHead>
                      <TableHead>Expiry</TableHead>
                      <TableHead className="text-right">Action</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {filteredStock.map((s) => {
                      const pct = Math.min(100, Math.round((s.onHand / s.capacity) * 100));
                      const canEdit = can(role, "stock.update");
                      const canReport = can(role, "stock.report");
                      return (
                        <TableRow key={s.id}>
                          <TableCell>
                            <div className="font-medium">{s.name}</div>
                            <div className="font-mono text-xs text-muted-foreground">{s.sku}</div>
                          </TableCell>
                          <TableCell className="text-sm text-muted-foreground">{s.category}</TableCell>
                          <TableCell className="text-sm">
                            {s.onHand}
                            <span className="text-muted-foreground"> / reorder {s.reorder}</span>
                          </TableCell>
                          <TableCell>
                            <Progress value={pct} className="h-1.5" />
                            {s.issue ? (
                              <div className="mt-1 text-xs text-muted-foreground">{s.issue}</div>
                            ) : null}
                          </TableCell>
                          <TableCell className="text-sm">{s.expiry}</TableCell>
                          <TableCell className="text-right">
                            <div className="flex items-center justify-end gap-2">
                              <StatusBadge status={s.status} />
                              {canEdit || canReport ? (
                                <Button size="sm" variant="ghost" onClick={() => setStockDialog(s)}>
                                  {canEdit ? "Update" : "Report"}
                                </Button>
                              ) : null}
                            </div>
                          </TableCell>
                        </TableRow>
                      );
                    })}
                  </TableBody>
                </Table>
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="audit">
            <AuditTrailCard entries={audit} />
          </TabsContent>

          <TabsContent value="admin" className="space-y-6">
            {!can(role, "users.manage") ? (
              <Card>
                <CardContent className="flex items-center gap-3 p-6 text-sm text-muted-foreground">
                  <Lock className="size-4" /> Admin tools are restricted to administrators.
                </CardContent>
              </Card>
            ) : (
              <>
                <div className="grid gap-4 sm:grid-cols-3">
                  <KpiCard icon={<Users className="size-5" />} label="Staff active today" value={STAFF.length} sub="Across 3 shifts" />
                  <KpiCard icon={<ClipboardList className="size-5" />} label="Task templates" value={24} sub="Daily SOP catalog" />
                  <KpiCard icon={<Boxes className="size-5" />} label="Stock SKUs tracked" value={stock.length} sub="Live counts" />
                </div>

                <Card>
                  <CardHeader className="flex flex-row items-center justify-between">
                    <CardTitle className="text-base font-semibold">Staff & accountability</CardTitle>
                    <Button size="sm" variant="outline" className="gap-1.5">
                      <Plus className="size-4" /> Add staff
                    </Button>
                  </CardHeader>
                  <CardContent>
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead>Name</TableHead>
                          <TableHead>Role</TableHead>
                          <TableHead>Shift</TableHead>
                          <TableHead>Completed</TableHead>
                          <TableHead>Pending</TableHead>
                          <TableHead className="text-right">Health</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {STAFF.map((p) => {
                          const health: Status = p.tasksPending === 0 ? "green" : p.tasksPending > 1 ? "red" : "yellow";
                          return (
                            <TableRow key={p.name}>
                              <TableCell className="font-medium">{p.name}</TableCell>
                              <TableCell className="text-sm text-muted-foreground">{p.role}</TableCell>
                              <TableCell className="text-sm">{p.shift}</TableCell>
                              <TableCell className="text-sm">{p.tasksDone}</TableCell>
                              <TableCell className="text-sm">{p.tasksPending}</TableCell>
                              <TableCell className="text-right">
                                <StatusBadge status={health} />
                              </TableCell>
                            </TableRow>
                          );
                        })}
                      </TableBody>
                    </Table>
                  </CardContent>
                </Card>

                <Card>
                  <CardHeader>
                    <CardTitle className="text-base font-semibold">Settings</CardTitle>
                  </CardHeader>
                  <CardContent className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                    <SettingRow icon={<Settings className="size-4" />} title="SOP templates" body="Manage recurring daily task templates per shift." />
                    <SettingRow icon={<Boxes className="size-4" />} title="Stock catalog" body="Add SKUs, reorder thresholds, and expiry tracking." />
                    <SettingRow icon={<Users className="size-4" />} title="Roles & permissions" body="Staff, supervisor, and admin access levels." />
                  </CardContent>
                </Card>
              </>
            )}
          </TabsContent>
        </Tabs>

        <footer className="mt-12 border-t pt-6 text-xs text-muted-foreground">
          Prototype · Cospharm operations dashboard · data shown is illustrative.
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
    </div>
  );
}

function Header({
  role,
  setRole,
  user,
}: {
  role: Role;
  setRole: (r: Role) => void;
  user: CurrentUser;
}) {
  const initials = user.name
    .split(" ")
    .map((n) => n[0])
    .join("")
    .slice(0, 2);
  return (
    <header className="sticky top-0 z-20 border-b bg-background/85 backdrop-blur">
      <div className="mx-auto flex max-w-7xl items-center justify-between gap-4 px-4 py-3 sm:px-6 lg:px-8">
        <div className="flex items-center gap-3">
          <img
            src={cospharmLogo.url}
            alt="Cospharm logo"
            className="size-11 object-contain"
          />
          <div>
            <p className="text-base font-semibold leading-tight tracking-tight text-primary">
              Cospharm
            </p>
            <p className="text-[11px] font-medium italic leading-tight text-status-red">
              Believe in Good
            </p>
          </div>
        </div>
        <div className="hidden items-center gap-2 md:flex">
          <LegendDot status="green" label="Healthy / done" />
          <LegendDot status="yellow" label="Attention" />
          <LegendDot status="red" label="Critical" />
        </div>
        <div className="flex items-center gap-2">
          <Select value={role} onValueChange={(v) => setRole(v as Role)}>
            <SelectTrigger className="w-[150px]" aria-label="Switch role">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="admin">Admin view</SelectItem>
              <SelectItem value="supervisor">Supervisor view</SelectItem>
              <SelectItem value="staff">Staff view</SelectItem>
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

function KpiCard({
  icon,
  label,
  value,
  sub,
  tone = "neutral",
}: {
  icon: React.ReactNode;
  label: string;
  value: string | number;
  sub: string;
  tone?: "neutral" | "green" | "yellow" | "red";
}) {
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

function StatusBars({
  rows,
}: {
  rows: { label: string; count: number; total: number; status: Status }[];
}) {
  return (
    <div className="space-y-3">
      {rows.map((r) => {
        const pct = r.total === 0 ? 0 : Math.round((r.count / r.total) * 100);
        const barColor =
          r.status === "green"
            ? "bg-status-green"
            : r.status === "yellow"
              ? "bg-status-yellow"
              : "bg-status-red";
        return (
          <div key={r.label}>
            <div className="mb-1 flex items-center justify-between text-sm">
              <span className="flex items-center gap-2">
                <StatusDot status={r.status} />
                {r.label}
              </span>
              <span className="text-muted-foreground">
                {r.count}/{r.total}
              </span>
            </div>
            <div className="h-1.5 w-full overflow-hidden rounded-full bg-secondary">
              <div className={`h-full ${barColor}`} style={{ width: `${pct}%` }} />
            </div>
          </div>
        );
      })}
    </div>
  );
}

function RiskTile({
  icon,
  title,
  body,
  status,
}: {
  icon: React.ReactNode;
  title: string;
  body: string;
  status: Status;
}) {
  const border =
    status === "red"
      ? "border-status-red/40"
      : status === "yellow"
        ? "border-status-yellow/50"
        : "border-status-green/40";
  return (
    <div className={`rounded-lg border ${border} bg-card p-4`}>
      <div className="mb-1.5 flex items-center justify-between">
        <div className="flex items-center gap-1.5 text-sm font-medium">
          {icon}
          {title}
        </div>
        <StatusDot status={status} />
      </div>
      <p className="text-xs text-muted-foreground">{body}</p>
    </div>
  );
}

function SettingRow({
  icon,
  title,
  body,
}: {
  icon: React.ReactNode;
  title: string;
  body: string;
}) {
  return (
    <div className="rounded-lg border bg-card p-4">
      <div className="mb-1 flex items-center gap-2 text-sm font-medium">
        {icon}
        {title}
      </div>
      <p className="text-xs text-muted-foreground">{body}</p>
    </div>
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
    (acc, s) => {
      acc[s] += 1;
      return acc;
    },
    { green: 0, yellow: 0, red: 0 } as Record<Status, number>,
  );
}