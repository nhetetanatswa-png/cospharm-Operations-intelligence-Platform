import { useMemo, useState } from "react";
import {
  Activity,
  AlertTriangle,
  Boxes,
  CheckCircle2,
  ClipboardList,
  Clock,
  LayoutDashboard,
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
import { StatusBadge, StatusDot, type Status } from "./StatusBadge";

type Task = {
  id: string;
  title: string;
  assignee: string;
  shift: "Morning" | "Afternoon" | "Night";
  due: string;
  status: Status;
  note?: string;
};

type StockItem = {
  id: string;
  name: string;
  sku: string;
  category: string;
  onHand: number;
  reorder: number;
  capacity: number;
  expiry: string;
  status: Status;
  issue?: string;
};

const TASKS: Task[] = [
  { id: "T-1042", title: "Morning cold-chain temperature log", assignee: "Ada Bello", shift: "Morning", due: "07:30", status: "green" },
  { id: "T-1043", title: "Restock dispensary shelves A–C", assignee: "John Mensah", shift: "Morning", due: "09:00", status: "yellow", note: "Started — shelf C pending" },
  { id: "T-1044", title: "Sign off overnight delivery manifest", assignee: "Supervisor", shift: "Morning", due: "08:00", status: "red", note: "Not signed — driver waiting" },
  { id: "T-1045", title: "Controlled drugs cabinet count", assignee: "Grace Okoye", shift: "Morning", due: "10:00", status: "green" },
  { id: "T-1046", title: "Clean & sanitise compounding bench", assignee: "Tunde Aliu", shift: "Afternoon", due: "13:00", status: "yellow", note: "In progress" },
  { id: "T-1047", title: "Patient delivery batch #B-228", assignee: "Logistics", shift: "Afternoon", due: "14:30", status: "red", note: "2 items short — see stock" },
  { id: "T-1048", title: "Equipment calibration check", assignee: "Ada Bello", shift: "Afternoon", due: "15:00", status: "green" },
  { id: "T-1049", title: "End-of-day handover log", assignee: "Supervisor", shift: "Night", due: "20:00", status: "yellow", note: "Awaiting pharmacist sign-off" },
];

const STOCK: StockItem[] = [
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

export function CospharmDashboard() {
  const [tab, setTab] = useState("overview");
  const [search, setSearch] = useState("");

  const taskStats = useMemo(() => countByStatus(TASKS.map((t) => t.status)), []);
  const stockStats = useMemo(() => countByStatus(STOCK.map((s) => s.status)), []);

  const filteredTasks = TASKS.filter((t) =>
    [t.title, t.assignee, t.id].join(" ").toLowerCase().includes(search.toLowerCase()),
  );
  const filteredStock = STOCK.filter((s) =>
    [s.name, s.sku, s.category].join(" ").toLowerCase().includes(search.toLowerCase()),
  );

  return (
    <div className="min-h-screen bg-background text-foreground">
      <Header />
      <main className="mx-auto max-w-7xl px-4 py-6 sm:px-6 lg:px-8">
        <div className="mb-6 flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <h1 className="text-2xl font-semibold tracking-tight sm:text-3xl">
              Operations dashboard
            </h1>
            <p className="mt-1 text-sm text-muted-foreground">
              Live traffic-light view of today's tasks, stock condition, and risks.
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
            <Button variant="default" className="gap-1.5">
              <Plus className="size-4" /> New
            </Button>
          </div>
        </div>

        <Tabs value={tab} onValueChange={setTab} className="space-y-6">
          <TabsList className="grid w-full grid-cols-4 sm:w-auto sm:inline-grid">
            <TabsTrigger value="overview" className="gap-1.5">
              <LayoutDashboard className="size-4" /> Overview
            </TabsTrigger>
            <TabsTrigger value="tasks" className="gap-1.5">
              <ClipboardList className="size-4" /> Tasks
            </TabsTrigger>
            <TabsTrigger value="stock" className="gap-1.5">
              <Boxes className="size-4" /> Stock
            </TabsTrigger>
            <TabsTrigger value="admin" className="gap-1.5">
              <UserCog className="size-4" /> Admin
            </TabsTrigger>
          </TabsList>

          <TabsContent value="overview" className="space-y-6">
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
              <KpiCard
                icon={<ClipboardList className="size-5" />}
                label="Tasks today"
                value={TASKS.length}
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
                value={`${Math.round((stockStats.green / STOCK.length) * 100)}%`}
                sub={`${stockStats.green}/${STOCK.length} items green`}
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
                      { label: "Completed", count: taskStats.green, total: TASKS.length, status: "green" },
                      { label: "In progress", count: taskStats.yellow, total: TASKS.length, status: "yellow" },
                      { label: "Overdue / not done", count: taskStats.red, total: TASKS.length, status: "red" },
                    ]}
                  />
                  <Separator className="my-5" />
                  <ul className="space-y-3">
                    {TASKS.filter((t) => t.status !== "green")
                      .slice(0, 4)
                      .map((t) => (
                        <li key={t.id} className="flex items-start gap-3">
                          <StatusDot status={t.status} className="mt-1.5" />
                          <div className="min-w-0 flex-1">
                            <p className="truncate text-sm font-medium">{t.title}</p>
                            <p className="truncate text-xs text-muted-foreground">
                              {t.assignee} · due {t.due} · {t.note}
                            </p>
                          </div>
                          <StatusBadge status={t.status} />
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
                      { label: "Healthy", count: stockStats.green, total: STOCK.length, status: "green" },
                      { label: "Low / minor issue", count: stockStats.yellow, total: STOCK.length, status: "yellow" },
                      { label: "Critical", count: stockStats.red, total: STOCK.length, status: "red" },
                    ]}
                  />
                  <Separator className="my-5" />
                  <ul className="space-y-3">
                    {STOCK.filter((s) => s.status === "red").map((s) => (
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
                  <CardTitle className="text-base font-semibold">All tasks</CardTitle>
                  <p className="mt-1 text-xs text-muted-foreground">
                    Green = completed & logged · Yellow = started, attention needed · Red = not done or overdue.
                  </p>
                </div>
                <Button size="sm" className="gap-1.5">
                  <Plus className="size-4" /> Log task
                </Button>
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
                      <TableRow key={t.id}>
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
                    Green = healthy · Yellow = low or minor damage · Red = critically low, damaged, expired, or delivery-blocking.
                  </p>
                </div>
                <Button size="sm" variant="outline" className="gap-1.5">
                  <Plus className="size-4" /> Report issue
                </Button>
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
                      <TableHead className="text-right">Status</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {filteredStock.map((s) => {
                      const pct = Math.min(100, Math.round((s.onHand / s.capacity) * 100));
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
                            <StatusBadge status={s.status} />
                          </TableCell>
                        </TableRow>
                      );
                    })}
                  </TableBody>
                </Table>
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="admin" className="space-y-6">
            <div className="grid gap-4 sm:grid-cols-3">
              <KpiCard icon={<Users className="size-5" />} label="Staff active today" value={STAFF.length} sub="Across 3 shifts" />
              <KpiCard icon={<ClipboardList className="size-5" />} label="Task templates" value={24} sub="Daily SOP catalog" />
              <KpiCard icon={<Boxes className="size-5" />} label="Stock SKUs tracked" value={STOCK.length} sub="Live counts" />
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
          </TabsContent>
        </Tabs>

        <footer className="mt-12 border-t pt-6 text-xs text-muted-foreground">
          Prototype · Cospharm operations dashboard · data shown is illustrative.
        </footer>
      </main>
    </div>
  );
}

function Header() {
  return (
    <header className="sticky top-0 z-20 border-b bg-background/85 backdrop-blur">
      <div className="mx-auto flex max-w-7xl items-center justify-between gap-4 px-4 py-3 sm:px-6 lg:px-8">
        <div className="flex items-center gap-2.5">
          <div className="grid size-9 place-items-center rounded-md bg-primary text-primary-foreground">
            <Pill className="size-5" />
          </div>
          <div>
            <p className="text-sm font-semibold leading-tight">Cospharm</p>
            <p className="text-xs text-muted-foreground leading-tight">Operations console</p>
          </div>
        </div>
        <div className="hidden items-center gap-2 sm:flex">
          <LegendDot status="green" label="Healthy / done" />
          <LegendDot status="yellow" label="Attention" />
          <LegendDot status="red" label="Critical" />
        </div>
        <div className="flex items-center gap-2">
          <div className="hidden text-right sm:block">
            <p className="text-sm font-medium leading-tight">Mary Adeyemi</p>
            <p className="text-xs text-muted-foreground leading-tight">Supervisor</p>
          </div>
          <div className="grid size-9 place-items-center rounded-full bg-secondary text-sm font-semibold text-secondary-foreground">
            MA
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

function CheckCircle2Inline() {
  return <CheckCircle2 className="size-4" />;
}