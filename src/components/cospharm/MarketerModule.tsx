import { useMemo, useRef, useState } from "react";
import {
  AlertTriangle,
  CalendarDays,
  CheckCircle2,
  ClipboardCheck,
  Clock,
  FileSignature,
  MapPin,
  Megaphone,
  MessageSquare,
  Package,
  Plus,
  Send,
  ShieldCheck,
  Truck,
  XCircle,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Progress } from "@/components/ui/progress";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { StatusBadge } from "./StatusBadge";
import { deliveryStatusBadge, getProgressPercentage, getCurrentStep } from "./operations";
import { ROLE_LABEL } from "./roles";
import type {
  AuthorisationRequest,
  AuthRequestStatus,
  AuthRequestType,
  Comment,
  CommentType,
  CurrentUser,
  Delivery,
  EmergencyOrder,
  FieldLogEntry,
  FieldVisit,
  FieldVisitType,
  PromoStockItem,
  PromoStockNote,
} from "./types";

type MarketerTab = "deliveries" | "promo" | "calendar" | "log" | "auth";

const TAB_META: { value: MarketerTab; label: string; icon: React.ComponentType<{ className?: string }> }[] = [
  { value: "deliveries", label: "My deliveries", icon: Truck },
  { value: "promo", label: "Promo stock room", icon: Package },
  { value: "calendar", label: "Field calendar", icon: CalendarDays },
  { value: "log", label: "Field log", icon: ClipboardCheck },
  { value: "auth", label: "Requests & authorisations", icon: FileSignature },
];

const VISIT_LABEL: Record<FieldVisitType, string> = {
  CUSTOMER_VISIT: "Customer visit",
  ACTIVATION: "Activation",
  OSC: "OSC",
  MEETING: "Meeting",
  TRIP: "Trip",
  AUDIT: "Audit",
  STOCKTAKE: "Stocktake",
  DEADLINE: "Deadline",
  OTHER: "Other",
};

const AUTH_LABEL: Record<AuthRequestType, string> = {
  PROMO_RELEASE: "Promo stock release",
  PRICE_OVERRIDE: "Price override",
  CREDIT_TERM: "Credit term",
  EMERGENCY_ORDER: "Emergency order",
  TRAVEL: "Travel approval",
  EXPENSE: "Expense claim",
};

export function MarketerModule({
  user,
  deliveries,
  comments,
  promoStock,
  visits,
  fieldLog,
  authRequests,
  emergencyOrders = [],
  onOpenDelivery,
  onAddPromoNote,
  onAddVisit,
  onUpdateVisit,
  onAddFieldLog,
  onCreateAuthRequest,
  onDecideAuthRequest,
}: {
  user: CurrentUser;
  deliveries: Delivery[];
  comments: Comment[];
  promoStock: PromoStockItem[];
  visits: FieldVisit[];
  fieldLog: FieldLogEntry[];
  authRequests: AuthorisationRequest[];
  emergencyOrders?: EmergencyOrder[];
  onOpenDelivery: (id: string) => void;
  onAddPromoNote: (promoId: string, message: string) => void;
  onAddVisit: (visit: Omit<FieldVisit, "id">) => void;
  onUpdateVisit: (id: string, patch: Partial<FieldVisit>) => void;
  onAddFieldLog: (entry: Omit<FieldLogEntry, "id" | "createdAt">) => void;
  onCreateAuthRequest: (req: Omit<AuthorisationRequest, "id" | "createdAt" | "status" | "requestedBy" | "requestedByRole">) => void;
  onDecideAuthRequest: (id: string, decision: "APPROVED" | "REJECTED", note: string) => void;
}) {
  const [tab, setTab] = useState<MarketerTab>("deliveries");

  const isMarketer = user.role === "marketer";
  const myDeliveries = useMemo(
    () => (isMarketer ? deliveries.filter((d) => d.assignedMarketer === user.name) : deliveries),
    [deliveries, user, isMarketer],
  );
  const myVisits = useMemo(
    () => (isMarketer ? visits.filter((v) => v.marketer === user.name) : visits),
    [visits, user, isMarketer],
  );
  const myLog = useMemo(
    () => (isMarketer ? fieldLog.filter((l) => l.marketer === user.name) : fieldLog),
    [fieldLog, user, isMarketer],
  );
  const myRequests = useMemo(
    () => (isMarketer ? authRequests.filter((r) => r.requestedBy === user.name) : authRequests),
    [authRequests, user, isMarketer],
  );

  const heading = isMarketer ? "Operations dashboard" : "Marketer control panel";

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-3">
        <div>
          <h2 className="text-lg font-semibold flex items-center gap-2">
            <Megaphone className="size-4" /> {heading}
          </h2>
          <p className="text-[11px] text-muted-foreground">{user.name} · {ROLE_LABEL[user.role]}</p>
        </div>
      </div>

      {/* Horizontal tab strip with navy underline */}
      <div className="border-b border-border">
        <nav className="flex gap-1 overflow-x-auto">
          {TAB_META.map((t) => {
            const Icon = t.icon;
            const active = tab === t.value;
            return (
              <button
                key={t.value}
                onClick={() => setTab(t.value)}
                className={`relative flex shrink-0 items-center gap-2 px-4 py-2.5 text-sm transition ${
                  active
                    ? "font-semibold text-primary"
                    : "font-medium text-muted-foreground hover:text-foreground"
                }`}
              >
                <Icon className="size-4" />
                <span className="whitespace-nowrap">{t.label}</span>
                {active ? (
                  <span className="absolute inset-x-2 -bottom-px h-0.5 rounded-full bg-primary" />
                ) : null}
              </button>
            );
          })}
        </nav>
      </div>

      <div className="min-w-0 space-y-4">
        {tab === "deliveries" && (
          <MyDeliveriesTab deliveries={myDeliveries} comments={comments} onOpen={onOpenDelivery} />
        )}
        {tab === "promo" && (
          <PromoStockRoomTab user={user} items={promoStock} onAddNote={onAddPromoNote} />
        )}
        {tab === "calendar" && (
          <FieldCalendarTab user={user} visits={myVisits} onAdd={onAddVisit} onUpdate={onUpdateVisit} />
        )}
        {tab === "log" && (
          <FieldLogTab user={user} entries={myLog} promoStock={promoStock} onAdd={onAddFieldLog} />
        )}
        {tab === "auth" && (
          <RequestsTab
            user={user}
            requests={myRequests}
            emergencyOrders={emergencyOrders}
            onCreate={onCreateAuthRequest}
            onDecide={onDecideAuthRequest}
          />
        )}
      </div>
    </div>
  );
}

// ===== 1. My Deliveries =====
function MyDeliveriesTab({
  deliveries,
  comments,
  onOpen,
}: {
  deliveries: Delivery[];
  comments: Comment[];
  onOpen: (id: string) => void;
}) {
  const todayIso = new Date().toISOString().slice(0, 10);
  const delivered = deliveries.filter((d) => d.status === "DELIVERED" && d.dueDate === todayIso).length;
  const pending = deliveries.filter((d) => ["PENDING", "IN_PROGRESS"].includes(d.status)).length;
  const late = deliveries.filter((d) => d.status === "LATE").length;
  const followUps = deliveries.filter((d) => ["LATE", "BLOCKED", "AT_RISK"].includes(d.status)).length;

  return (
    <div className="space-y-4">
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <MiniKpi icon={<Truck className="size-4" />} label="Delivered today" value={delivered} tone="green" />
        <MiniKpi icon={<Clock className="size-4" />} label="Pending" value={pending} tone="yellow" />
        <MiniKpi icon={<AlertTriangle className="size-4" />} label="Late" value={late} tone="red" />
        <MiniKpi icon={<MessageSquare className="size-4" />} label="Follow-ups" value={followUps} tone="red" />
      </div>
      <Card>
        <CardHeader>
          <CardTitle className="text-base font-semibold">My deliveries</CardTitle>
        </CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Order</TableHead>
                <TableHead>Customer</TableHead>
                <TableHead>Status</TableHead>
                <TableHead className="w-[160px]">Progress</TableHead>
                <TableHead>Current step</TableHead>
                <TableHead>Due</TableHead>
                <TableHead className="text-right">Action</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {deliveries.map((d) => {
                const badge = deliveryStatusBadge(d.status);
                const pct = getProgressPercentage(d.steps);
                const current = getCurrentStep(d.steps);
                const lastComment = [...comments].reverse().find((c) => c.relatedEntityId === d.id);
                return (
                  <TableRow key={d.id} className="cursor-pointer" onClick={() => onOpen(d.id)}>
                    <TableCell className="font-mono text-xs">{d.id}</TableCell>
                    <TableCell className="text-sm font-medium">
                      {d.customerName}
                      {lastComment ? <p className="text-[11px] text-muted-foreground truncate">{lastComment.message}</p> : null}
                    </TableCell>
                    <TableCell><StatusBadge status={badge.tone} label={badge.label} /></TableCell>
                    <TableCell>
                      <Progress value={pct} className="h-1.5" />
                      <p className="mt-1 text-[10px] text-muted-foreground">{pct}%</p>
                    </TableCell>
                    <TableCell className="text-xs">Step {current.stepNumber} · {current.name}</TableCell>
                    <TableCell className="text-xs">{d.dueDate}</TableCell>
                    <TableCell className="text-right">
                      <Button size="sm" variant="ghost" onClick={(e) => { e.stopPropagation(); onOpen(d.id); }}>Open</Button>
                    </TableCell>
                  </TableRow>
                );
              })}
              {deliveries.length === 0 && (
                <TableRow><TableCell colSpan={7} className="text-center text-xs text-muted-foreground py-6">No deliveries assigned.</TableCell></TableRow>
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  );
}

// ===== 2. Promo Stock Room =====
function PromoStockRoomTab({
  user,
  items,
  onAddNote,
}: {
  user: CurrentUser;
  items: PromoStockItem[];
  onAddNote: (id: string, message: string) => void;
}) {
  return (
    <section className="space-y-4">
      <div>
        <h3 className="text-xl font-semibold tracking-tight">Promo stock room</h3>
        <p className="text-sm text-[color:var(--ring)]">
          Promotional stock allocated for marketing activations, samples and field use. Click an item to
          add a note bubble — visible to all marketers and supervisors.
        </p>
      </div>
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {items.map((it) => (
          <PromoCard key={it.id} item={it} user={user} onAddNote={(msg) => onAddNote(it.id, msg)} />
        ))}
        {items.length === 0 && (
          <p className="rounded-xl border border-dashed p-4 text-center text-xs text-muted-foreground sm:col-span-2 lg:col-span-3">
            No promo stock allocated.
          </p>
        )}
      </div>
    </section>
  );
}

function PromoCard({ item, user, onAddNote }: { item: PromoStockItem; user: CurrentUser; onAddNote: (msg: string) => void }) {
  const [draft, setDraft] = useState("");
  const textareaRef = useRef<HTMLTextAreaElement | null>(null);
  const available = Math.max(0, item.onHand - item.allocated);
  const pct = item.onHand > 0 ? Math.round((available / item.onHand) * 100) : 0;

  function send() {
    if (draft.trim().length < 2) return;
    onAddNote(draft.trim());
    setDraft("");
  }

  return (
    <div
      onClick={() => textareaRef.current?.focus()}
      className="flex cursor-text flex-col gap-3 rounded-xl border border-border bg-card p-4 shadow-sm transition hover:shadow-md"
    >
      <div>
        <p className="text-[15px] font-semibold leading-tight">{item.name}</p>
        <p className="mt-0.5 text-[12px] text-muted-foreground">
          {item.sku} · {item.category}{item.expiry ? ` · exp ${item.expiry}` : ""}
        </p>
      </div>

      <div className="space-y-1.5">
        <div className="flex items-center justify-between text-[12px]">
          <span className="font-medium text-foreground">Available {available} / {item.onHand}</span>
          <span className="text-muted-foreground">{item.allocated} allocated</span>
        </div>
        <div className="h-1.5 w-full overflow-hidden rounded-full bg-secondary">
          <div className="h-full rounded-full bg-primary transition-all" style={{ width: `${pct}%` }} />
        </div>
      </div>

      <div className="space-y-1.5">
        {item.notes.slice(-3).map((n) => (
          <NoteBubble key={n.id} note={n} />
        ))}
        {item.notes.length === 0 && (
          <p className="text-[11px] italic text-muted-foreground">No notes yet.</p>
        )}
      </div>

      <div
        className="flex items-end gap-2"
        onClick={(e) => e.stopPropagation()}
      >
        <Textarea
          ref={textareaRef}
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          rows={1}
          placeholder="Add a note bubble..."
          className="min-h-[36px] resize-none text-xs"
          onKeyDown={(e) => {
            if (e.key === "Enter" && !e.shiftKey) {
              e.preventDefault();
              send();
            }
          }}
        />
        <Button
          size="icon"
          className="size-9 shrink-0"
          disabled={draft.trim().length < 2}
          onClick={send}
          aria-label="Post note"
        >
          <Send className="size-3.5" />
        </Button>
      </div>
      {user ? null : null}
    </div>
  );
}

function NoteBubble({ note }: { note: PromoStockNote }) {
  const initial = note.authorName.trim().charAt(0).toUpperCase();
  const when = new Date(note.createdAt).toLocaleString(undefined, {
    month: "numeric", day: "numeric", year: "numeric", hour: "numeric", minute: "2-digit",
  });
  return (
    <div className="flex items-start gap-2">
      <div className="grid size-6 shrink-0 place-items-center rounded-full bg-primary text-[10px] font-semibold text-primary-foreground">
        {initial}
      </div>
      <div className="flex-1 rounded-lg bg-secondary px-3 py-2">
        <p className="text-[11px] font-medium text-muted-foreground">
          {note.authorName} · {ROLE_LABEL[note.authorRole]} · {when}
        </p>
        <p className="mt-0.5 text-[13px] text-foreground">{note.message}</p>
      </div>
    </div>
  );
}

// ===== 3. Field Calendar =====
function FieldCalendarTab({
  user,
  visits,
  onAdd,
  onUpdate,
}: {
  user: CurrentUser;
  visits: FieldVisit[];
  onAdd: (v: Omit<FieldVisit, "id">) => void;
  onUpdate: (id: string, patch: Partial<FieldVisit>) => void;
}) {
  const [showAdd, setShowAdd] = useState(false);
  const [form, setForm] = useState<Omit<FieldVisit, "id">>({
    title: "",
    date: new Date().toISOString().slice(0, 10),
    time: "09:00",
    type: "CUSTOMER_VISIT",
    marketer: user.name,
    customer: "",
    location: "",
    notes: "",
    status: "PLANNED",
  });

  const upcoming = [...visits].filter((v) => v.status !== "CANCELLED").sort((a, b) => (a.date + (a.time ?? "")).localeCompare(b.date + (b.time ?? "")));
  const grouped = upcoming.reduce<Record<string, FieldVisit[]>>((acc, v) => {
    (acc[v.date] ??= []).push(v);
    return acc;
  }, {});

  function submit() {
    if (form.title.trim().length < 2) return;
    onAdd({ ...form, marketer: form.marketer || user.name });
    setShowAdd(false);
    setForm({ ...form, title: "", customer: "", location: "", notes: "" });
  }

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between">
        <div>
          <CardTitle className="text-base font-semibold flex items-center gap-2"><CalendarDays className="size-4" /> Field calendar</CardTitle>
          <p className="text-xs text-muted-foreground">Visits, activations, OSCs, meetings, trips, audits and deadlines.</p>
        </div>
        <Button size="sm" onClick={() => setShowAdd(true)} className="gap-1.5"><Plus className="size-4" /> New entry</Button>
      </CardHeader>
      <CardContent className="space-y-4">
        {Object.keys(grouped).length === 0 && (
          <p className="rounded-md border border-dashed p-4 text-center text-xs text-muted-foreground">No visits scheduled. Click "New entry" to add one.</p>
        )}
        {Object.entries(grouped).map(([date, items]) => (
          <div key={date}>
            <p className="text-xs font-semibold text-muted-foreground mb-2">{new Date(date + "T00:00:00").toLocaleDateString(undefined, { weekday: "long", day: "numeric", month: "long" })}</p>
            <div className="space-y-2">
              {items.map((v) => (
                <div key={v.id} className="flex items-start gap-3 rounded-md border p-3">
                  <div className="w-16 shrink-0 text-xs text-muted-foreground">{v.time ?? "—"}</div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium">{v.title}</p>
                    <p className="text-[11px] text-muted-foreground">
                      {VISIT_LABEL[v.type]}{v.customer ? ` · ${v.customer}` : ""}{v.location ? ` · ${v.location}` : ""}
                    </p>
                    {v.notes ? <p className="text-[11px] mt-1">{v.notes}</p> : null}
                  </div>
                  <div className="flex flex-col items-end gap-1">
                    <StatusBadge status={v.status === "DONE" ? "green" : "yellow"} label={v.status} />
                    {v.status === "PLANNED" ? (
                      <Button size="sm" variant="ghost" onClick={() => onUpdate(v.id, { status: "DONE" })}>Mark done</Button>
                    ) : null}
                  </div>
                </div>
              ))}
            </div>
          </div>
        ))}
      </CardContent>

      <Dialog open={showAdd} onOpenChange={setShowAdd}>
        <DialogContent>
          <DialogHeader><DialogTitle>New field calendar entry</DialogTitle></DialogHeader>
          <div className="space-y-3">
            <Input placeholder="Title" value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} />
            <div className="grid grid-cols-2 gap-2">
              <Input type="date" value={form.date} onChange={(e) => setForm({ ...form, date: e.target.value })} />
              <Input type="time" value={form.time ?? ""} onChange={(e) => setForm({ ...form, time: e.target.value })} />
            </div>
            <Select value={form.type} onValueChange={(v) => setForm({ ...form, type: v as FieldVisitType })}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                {(Object.keys(VISIT_LABEL) as FieldVisitType[]).map((k) => (
                  <SelectItem key={k} value={k}>{VISIT_LABEL[k]}</SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Input placeholder="Customer (optional)" value={form.customer ?? ""} onChange={(e) => setForm({ ...form, customer: e.target.value })} />
            <Input placeholder="Location (optional)" value={form.location ?? ""} onChange={(e) => setForm({ ...form, location: e.target.value })} />
            <Textarea placeholder="Notes" rows={2} value={form.notes ?? ""} onChange={(e) => setForm({ ...form, notes: e.target.value })} />
          </div>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setShowAdd(false)}>Cancel</Button>
            <Button onClick={submit}>Add entry</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </Card>
  );
}

// ===== 4. Field Log =====
function FieldLogTab({
  user,
  entries,
  promoStock,
  onAdd,
}: {
  user: CurrentUser;
  entries: FieldLogEntry[];
  promoStock: PromoStockItem[];
  onAdd: (e: Omit<FieldLogEntry, "id" | "createdAt">) => void;
}) {
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState<Omit<FieldLogEntry, "id" | "createdAt">>({
    date: new Date().toISOString().slice(0, 10),
    marketer: user.name,
    customer: "",
    visitType: "CUSTOMER_VISIT",
    outcome: "FOLLOW_UP",
    productsUsed: [],
    notes: "",
  });
  const [promoId, setPromoId] = useState<string>(promoStock[0]?.id ?? "");
  const [qty, setQty] = useState(1);

  function addProduct() {
    const p = promoStock.find((x) => x.id === promoId);
    if (!p || qty < 1) return;
    setForm({ ...form, productsUsed: [...form.productsUsed, { promoStockId: p.id, productName: p.name, quantity: qty }] });
    setQty(1);
  }

  function submit() {
    if (form.customer.trim().length < 2) return;
    onAdd(form);
    setOpen(false);
    setForm({ ...form, customer: "", notes: "", productsUsed: [] });
  }

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between">
        <div>
          <CardTitle className="text-base font-semibold flex items-center gap-2"><ClipboardCheck className="size-4" /> Field log</CardTitle>
          <p className="text-xs text-muted-foreground">Record outcomes from customer visits. Promo stock used here is automatically deducted.</p>
        </div>
        <Button size="sm" onClick={() => setOpen(true)} className="gap-1.5"><Plus className="size-4" /> Log visit</Button>
      </CardHeader>
      <CardContent>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Date</TableHead>
              <TableHead>Customer</TableHead>
              <TableHead>Type</TableHead>
              <TableHead>Outcome</TableHead>
              <TableHead>Promo used</TableHead>
              <TableHead>Notes</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {entries.map((e) => (
              <TableRow key={e.id}>
                <TableCell className="text-xs">{e.date}</TableCell>
                <TableCell className="text-sm font-medium">{e.customer}</TableCell>
                <TableCell className="text-xs">{VISIT_LABEL[e.visitType]}</TableCell>
                <TableCell><StatusBadge status={outcomeTone(e.outcome)} label={e.outcome.replace("_", " ")} /></TableCell>
                <TableCell className="text-xs">
                  {e.productsUsed.length === 0 ? "—" : e.productsUsed.map((p) => `${p.productName} ×${p.quantity}`).join(", ")}
                </TableCell>
                <TableCell className="text-xs max-w-[240px] truncate">{e.notes}</TableCell>
              </TableRow>
            ))}
            {entries.length === 0 && (
              <TableRow><TableCell colSpan={6} className="text-center text-xs text-muted-foreground py-6">No field log entries yet.</TableCell></TableRow>
            )}
          </TableBody>
        </Table>
      </CardContent>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent>
          <DialogHeader><DialogTitle>Log field visit</DialogTitle></DialogHeader>
          <div className="space-y-3">
            <div className="grid grid-cols-2 gap-2">
              <Input type="date" value={form.date} onChange={(e) => setForm({ ...form, date: e.target.value })} />
              <Input placeholder="Customer" value={form.customer} onChange={(e) => setForm({ ...form, customer: e.target.value })} />
            </div>
            <div className="grid grid-cols-2 gap-2">
              <Select value={form.visitType} onValueChange={(v) => setForm({ ...form, visitType: v as FieldVisitType })}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>{(Object.keys(VISIT_LABEL) as FieldVisitType[]).map((k) => <SelectItem key={k} value={k}>{VISIT_LABEL[k]}</SelectItem>)}</SelectContent>
              </Select>
              <Select value={form.outcome} onValueChange={(v) => setForm({ ...form, outcome: v as FieldLogEntry["outcome"] })}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="SALE">Sale</SelectItem>
                  <SelectItem value="FOLLOW_UP">Follow up</SelectItem>
                  <SelectItem value="SAMPLE_GIVEN">Sample given</SelectItem>
                  <SelectItem value="INFO_ONLY">Info only</SelectItem>
                  <SelectItem value="NO_INTEREST">No interest</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="rounded-md border p-2 space-y-2">
              <p className="text-xs font-semibold">Promo stock used</p>
              <div className="flex gap-2">
                <Select value={promoId} onValueChange={setPromoId}>
                  <SelectTrigger className="flex-1"><SelectValue placeholder="Choose product" /></SelectTrigger>
                  <SelectContent>
                    {promoStock.map((p) => <SelectItem key={p.id} value={p.id}>{p.name} ({p.onHand - p.allocated} avail)</SelectItem>)}
                  </SelectContent>
                </Select>
                <Input type="number" min={1} value={qty} onChange={(e) => setQty(Number(e.target.value))} className="w-20" />
                <Button type="button" variant="secondary" onClick={addProduct}>Add</Button>
              </div>
              {form.productsUsed.length > 0 && (
                <ul className="text-xs space-y-0.5">
                  {form.productsUsed.map((p, i) => (
                    <li key={i} className="flex items-center justify-between">
                      <span>{p.productName} × {p.quantity}</span>
                      <button className="text-status-red text-[11px]" onClick={() => setForm({ ...form, productsUsed: form.productsUsed.filter((_, j) => j !== i) })}>remove</button>
                    </li>
                  ))}
                </ul>
              )}
            </div>
            <Textarea rows={3} placeholder="Visit notes" value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} />
          </div>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setOpen(false)}>Cancel</Button>
            <Button onClick={submit}>Save log</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </Card>
  );
}

function outcomeTone(o: FieldLogEntry["outcome"]) {
  if (o === "SALE") return "green" as const;
  if (o === "NO_INTEREST") return "red" as const;
  return "yellow" as const;
}

// ===== 5. Requests & Authorisations =====
function RequestsTab({
  user,
  requests,
  emergencyOrders,
  onCreate,
  onDecide,
}: {
  user: CurrentUser;
  requests: AuthorisationRequest[];
  emergencyOrders: EmergencyOrder[];
  onCreate: (r: Omit<AuthorisationRequest, "id" | "createdAt" | "status" | "requestedBy" | "requestedByRole">) => void;
  onDecide: (id: string, decision: "APPROVED" | "REJECTED", note: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const [decideFor, setDecideFor] = useState<AuthorisationRequest | null>(null);
  const [decisionNote, setDecisionNote] = useState("");
  const [form, setForm] = useState({
    type: "PROMO_RELEASE" as AuthRequestType,
    customer: "",
    details: "",
    amount: "" as string | number,
  });

  const canApprove = ["admin", "supervisor", "dispatch_supervisor"].includes(user.role);
  const promoRequests = requests.filter((r) => r.type === "PROMO_RELEASE");
  const otherRequests = requests.filter((r) => r.type !== "PROMO_RELEASE");

  function submit() {
    if (form.details.trim().length < 3) return;
    onCreate({
      type: form.type,
      customer: form.customer || undefined,
      details: form.details,
      amount: form.amount === "" ? undefined : Number(form.amount),
    });
    setOpen(false);
    setForm({ type: "PROMO_RELEASE", customer: "", details: "", amount: "" });
  }

  return (
    <section className="space-y-6">
      <div className="flex items-center justify-between gap-3">
        <div>
          <h3 className="text-xl font-semibold tracking-tight flex items-center gap-2">
            <FileSignature className="size-5" /> Requests & authorisations
          </h3>
          <p className="text-xs text-muted-foreground">
            Raise approval requests for promo releases, price overrides, credit terms, travel and expenses.
          </p>
        </div>
        <Button size="sm" onClick={() => setOpen(true)} className="gap-1.5">
          <Plus className="size-4" /> New request
        </Button>
      </div>

      {/* Section A — Promo stock requests */}
      <div className="space-y-3">
        <h4 className="text-sm font-semibold">Promo stock requests</h4>
        <div className="grid gap-3 sm:grid-cols-2">
          {promoRequests.length === 0 && (
            <p className="rounded-xl border border-dashed p-4 text-center text-xs text-muted-foreground sm:col-span-2">
              No promo stock requests yet.
            </p>
          )}
          {promoRequests.map((r) => (
            <div key={r.id} className="rounded-xl border border-border bg-card p-4 shadow-sm">
              <div className="mb-2 flex items-start justify-between gap-2">
                <p className="text-[14px] font-semibold leading-tight">
                  {r.details.split(" ").slice(0, 3).join(" ")}
                  {r.amount ? <span className="ml-1 text-muted-foreground">× {r.amount}</span> : null}
                </p>
                <PillBadge status={r.status} />
              </div>
              <p className="text-[13px] text-muted-foreground">{r.details}</p>
              <p className="mt-3 text-[12px] text-muted-foreground">
                {r.requestedBy} · {new Date(r.createdAt).toLocaleString(undefined, {
                  month: "numeric", day: "numeric", year: "numeric", hour: "2-digit", minute: "2-digit",
                })}
              </p>
              {r.status === "PENDING" && canApprove ? (
                <div className="mt-3">
                  <Button size="sm" variant="outline" onClick={() => { setDecideFor(r); setDecisionNote(""); }}>
                    Decide
                  </Button>
                </div>
              ) : null}
            </div>
          ))}
        </div>
      </div>

      {/* Section B — Emergency order requests */}
      <div className="space-y-3">
        <h4 className="text-sm font-semibold">Emergency order requests</h4>
        <div className="overflow-hidden rounded-xl border border-border bg-card">
          {emergencyOrders.length === 0 ? (
            <p className="p-4 text-center text-xs text-muted-foreground">No emergency orders.</p>
          ) : (
            <ul className="divide-y divide-border">
              {emergencyOrders.map((o) => (
                <li key={o.id} className="flex items-center justify-between gap-3 px-4 py-3">
                  <div className="min-w-0">
                    <p className="text-[13px] font-semibold">
                      <span className="font-mono">{o.id}</span> · {o.customerName}
                    </p>
                    <p className="text-[12px] text-muted-foreground">
                      {o.items.length} item{o.items.length === 1 ? "" : "s"} · {o.orderedBy}
                    </p>
                  </div>
                  <EmergencyPill status={o.status} />
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>

      {/* Other requests fallback */}
      {otherRequests.length > 0 && (
        <div className="space-y-3">
          <h4 className="text-sm font-semibold">Other authorisations</h4>
          <div className="overflow-hidden rounded-xl border border-border bg-card">
            <ul className="divide-y divide-border">
              {otherRequests.map((r) => (
                <li key={r.id} className="flex items-center justify-between gap-3 px-4 py-3">
                  <div className="min-w-0">
                    <p className="text-[13px] font-semibold">
                      <span className="font-mono">{r.id}</span> · {AUTH_LABEL[r.type]}
                    </p>
                    <p className="truncate text-[12px] text-muted-foreground">{r.details}</p>
                  </div>
                  <div className="flex items-center gap-2">
                    <PillBadge status={r.status} />
                    {r.status === "PENDING" && canApprove ? (
                      <Button size="sm" variant="outline" onClick={() => { setDecideFor(r); setDecisionNote(""); }}>
                        Decide
                      </Button>
                    ) : null}
                  </div>
                </li>
              ))}
            </ul>
          </div>
        </div>
      )}

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent>
          <DialogHeader><DialogTitle>New authorisation request</DialogTitle></DialogHeader>
          <div className="space-y-3">
            <Select value={form.type} onValueChange={(v) => setForm({ ...form, type: v as AuthRequestType })}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                {(Object.keys(AUTH_LABEL) as AuthRequestType[]).map((k) => <SelectItem key={k} value={k}>{AUTH_LABEL[k]}</SelectItem>)}
              </SelectContent>
            </Select>
            <Input placeholder="Customer (optional)" value={form.customer} onChange={(e) => setForm({ ...form, customer: e.target.value })} />
            <Textarea rows={3} placeholder="Details / justification" value={form.details} onChange={(e) => setForm({ ...form, details: e.target.value })} />
            <Input type="number" placeholder="Amount (optional)" value={form.amount} onChange={(e) => setForm({ ...form, amount: e.target.value })} />
          </div>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setOpen(false)}>Cancel</Button>
            <Button onClick={submit}>Submit</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={!!decideFor} onOpenChange={(o) => !o && setDecideFor(null)}>
        <DialogContent>
          <DialogHeader><DialogTitle>Decide on request</DialogTitle></DialogHeader>
          {decideFor && (
            <div className="space-y-3">
              <div className="rounded-md border p-3 text-xs space-y-1">
                <p><span className="font-semibold">{AUTH_LABEL[decideFor.type]}</span> · {decideFor.requestedBy}</p>
                {decideFor.customer ? <p>Customer: {decideFor.customer}</p> : null}
                <p>{decideFor.details}</p>
                {decideFor.amount ? <p>Amount: {decideFor.amount}</p> : null}
              </div>
              <Textarea rows={3} placeholder="Decision note (required)" value={decisionNote} onChange={(e) => setDecisionNote(e.target.value)} />
            </div>
          )}
          <DialogFooter>
            <Button variant="outline" className="gap-1.5" disabled={decisionNote.trim().length < 3} onClick={() => { if (decideFor) { onDecide(decideFor.id, "REJECTED", decisionNote); setDecideFor(null); } }}>
              <XCircle className="size-4" /> Reject
            </Button>
            <Button className="gap-1.5" disabled={decisionNote.trim().length < 3} onClick={() => { if (decideFor) { onDecide(decideFor.id, "APPROVED", decisionNote); setDecideFor(null); } }}>
              <CheckCircle2 className="size-4" /> Approve
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </section>
  );
}

function PillBadge({ status }: { status: AuthRequestStatus }) {
  const styles =
    status === "APPROVED"
      ? "bg-[oklch(0.92_0.05_250)] text-[oklch(0.35_0.13_260)]"
      : status === "REJECTED"
        ? "bg-status-red/15 text-status-red"
        : "bg-status-yellow/30 text-status-yellow-foreground";
  return (
    <span className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-[11px] font-semibold uppercase tracking-wide ${styles}`}>
      {status}
    </span>
  );
}

function EmergencyPill({ status }: { status: EmergencyOrder["status"] }) {
  const label = status.replace(/_/g, " ");
  const isDispatched = status === "DISPATCHED" || status === "DELIVERED" || status === "ASSIGNED_TO_DRIVER";
  const isPending = status === "PENDING_APPROVAL" || status === "APPROVED";
  const styles = isDispatched
    ? "bg-[oklch(0.92_0.05_250)] text-[oklch(0.35_0.13_260)] border-transparent"
    : isPending
      ? "border border-status-yellow/50 bg-status-yellow/15 text-status-yellow-foreground"
      : "bg-status-red/15 text-status-red border-transparent";
  return (
    <span className={`inline-flex shrink-0 items-center rounded-full px-2.5 py-0.5 text-[11px] font-semibold uppercase tracking-wide ${styles}`}>
      {label}
    </span>
  );
}

function statusTone(s: AuthRequestStatus) {
  if (s === "APPROVED") return "green" as const;
  if (s === "REJECTED") return "red" as const;
  return "yellow" as const;
}

// ===== Mini KPI =====
function MiniKpi({ icon, label, value, tone }: { icon: React.ReactNode; label: string; value: number; tone: "green" | "yellow" | "red" }) {
  const toneCls = tone === "green" ? "bg-status-green/15 text-status-green" : tone === "red" ? "bg-status-red/15 text-status-red" : "bg-status-yellow/20 text-status-yellow-foreground";
  return (
    <Card>
      <CardContent className="flex items-center gap-3 p-3">
        <div className={`grid size-9 place-items-center rounded-md ${toneCls}`}>{icon}</div>
        <div>
          <p className="text-[10px] uppercase tracking-wide text-muted-foreground">{label}</p>
          <p className="text-xl font-semibold">{value}</p>
        </div>
      </CardContent>
    </Card>
  );
}