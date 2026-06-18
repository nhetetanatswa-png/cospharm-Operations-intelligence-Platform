import { useMemo, useState } from "react";
import { CalendarDays, ChevronLeft, ChevronRight, Plus, Star } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Checkbox } from "@/components/ui/checkbox";
import type { CalendarEvent, CalendarEventType, CurrentUser } from "./types";

const TYPE_META: Record<CalendarEventType, { label: string; color: string }> = {
  MEETING: { label: "Meeting", color: "bg-blue-100 text-blue-800 border-blue-200" },
  AUDIT: { label: "Audit", color: "bg-red-100 text-red-800 border-red-200" },
  TRIP: { label: "Trip", color: "bg-purple-100 text-purple-800 border-purple-200" },
  ACTIVATION: { label: "Activation", color: "bg-orange-100 text-orange-800 border-orange-200" },
  OSC: { label: "OSC", color: "bg-pink-100 text-pink-800 border-pink-200" },
  DEADLINE: { label: "Deadline", color: "bg-amber-100 text-amber-800 border-amber-200" },
  STOCKTAKE: { label: "Stocktake", color: "bg-emerald-100 text-emerald-800 border-emerald-200" },
  TRAINING: { label: "Training", color: "bg-indigo-100 text-indigo-800 border-indigo-200" },
  HOLIDAY: { label: "Holiday", color: "bg-slate-100 text-slate-800 border-slate-200" },
  OTHER: { label: "Other", color: "bg-secondary text-secondary-foreground border-border" },
};

export function OperationsCalendar({
  events,
  user,
  canCreate,
  onAdd,
}: {
  events: CalendarEvent[];
  user: CurrentUser;
  canCreate: boolean;
  onAdd: (e: Omit<CalendarEvent, "id">) => void;
}) {
  const [cursor, setCursor] = useState(() => {
    const d = new Date();
    return { year: d.getFullYear(), month: d.getMonth() };
  });
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState<Omit<CalendarEvent, "id">>({
    title: "",
    date: new Date().toISOString().slice(0, 10),
    time: "",
    type: "MEETING",
    owner: user.name,
    location: "",
    description: "",
    important: false,
  });

  const byDate = useMemo(() => {
    const m: Record<string, CalendarEvent[]> = {};
    for (const e of events) (m[e.date] ??= []).push(e);
    return m;
  }, [events]);

  const days = buildMonthGrid(cursor.year, cursor.month);
  const monthName = new Date(cursor.year, cursor.month, 1).toLocaleString(undefined, { month: "long", year: "numeric" });

  const upcoming = useMemo(() => {
    const today = new Date().toISOString().slice(0, 10);
    return [...events].filter((e) => e.date >= today).sort((a, b) => a.date.localeCompare(b.date)).slice(0, 6);
  }, [events]);

  function submit() {
    if (form.title.trim().length < 2) return;
    onAdd(form);
    setOpen(false);
    setForm({ ...form, title: "", location: "", description: "", important: false });
  }

  return (
    <div className="grid gap-4 lg:grid-cols-3">
      <Card className="lg:col-span-2">
        <CardHeader className="flex flex-row items-center justify-between gap-2">
          <div className="flex items-center gap-2">
            <Button size="icon" variant="ghost" onClick={() => setCursor(prevMonth(cursor))}><ChevronLeft className="size-4" /></Button>
            <CardTitle className="text-base font-semibold flex items-center gap-2">
              <CalendarDays className="size-4" /> {monthName}
            </CardTitle>
            <Button size="icon" variant="ghost" onClick={() => setCursor(nextMonth(cursor))}><ChevronRight className="size-4" /></Button>
          </div>
          {canCreate ? (
            <Button size="sm" className="gap-1.5" onClick={() => setOpen(true)}><Plus className="size-4" /> Add event</Button>
          ) : null}
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-7 gap-1 text-[10px] font-semibold uppercase text-muted-foreground mb-1">
            {["Mon","Tue","Wed","Thu","Fri","Sat","Sun"].map((d) => <div key={d} className="px-1">{d}</div>)}
          </div>
          <div className="grid grid-cols-7 gap-1">
            {days.map((d, i) => {
              const iso = d ? toIso(cursor.year, cursor.month, d) : null;
              const dayEvents = iso ? byDate[iso] ?? [] : [];
              const isToday = iso === new Date().toISOString().slice(0, 10);
              return (
                <div key={i} className={`min-h-[78px] rounded-md border p-1 text-[10px] ${d ? "" : "bg-secondary/30"} ${isToday ? "ring-2 ring-primary" : ""}`}>
                  {d ? (
                    <>
                      <div className="font-semibold text-foreground/70">{d}</div>
                      <div className="space-y-0.5 mt-0.5">
                        {dayEvents.slice(0, 3).map((e) => (
                          <div key={e.id} className={`truncate rounded px-1 py-0.5 border ${TYPE_META[e.type].color}`} title={e.title}>
                            {e.important ? "★ " : ""}{e.title}
                          </div>
                        ))}
                        {dayEvents.length > 3 ? <p className="text-[9px] text-muted-foreground">+{dayEvents.length - 3} more</p> : null}
                      </div>
                    </>
                  ) : null}
                </div>
              );
            })}
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base font-semibold">Upcoming</CardTitle>
        </CardHeader>
        <CardContent className="space-y-2">
          {upcoming.length === 0 && (
            <p className="rounded-md border border-dashed p-3 text-center text-xs text-muted-foreground">No upcoming events.</p>
          )}
          {upcoming.map((e) => (
            <div key={e.id} className="rounded-md border p-2 text-xs">
              <div className="flex items-center justify-between gap-2">
                <span className={`rounded px-1.5 py-0.5 border text-[10px] ${TYPE_META[e.type].color}`}>{TYPE_META[e.type].label}</span>
                {e.important ? <Star className="size-3 fill-amber-500 text-amber-500" /> : null}
              </div>
              <p className="mt-1 font-medium">{e.title}</p>
              <p className="text-[11px] text-muted-foreground">
                {new Date(e.date + "T00:00:00").toLocaleDateString(undefined, { weekday: "short", day: "numeric", month: "short" })}
                {e.time ? ` · ${e.time}` : ""}{e.owner ? ` · ${e.owner}` : ""}
              </p>
              {e.location ? <p className="text-[11px] text-muted-foreground">📍 {e.location}</p> : null}
              {e.description ? <p className="text-[11px] mt-1">{e.description}</p> : null}
            </div>
          ))}
        </CardContent>
      </Card>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent>
          <DialogHeader><DialogTitle>New calendar event</DialogTitle></DialogHeader>
          <div className="space-y-3">
            <Input placeholder="Title" value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} />
            <div className="grid grid-cols-2 gap-2">
              <Input type="date" value={form.date} onChange={(e) => setForm({ ...form, date: e.target.value })} />
              <Input type="time" value={form.time ?? ""} onChange={(e) => setForm({ ...form, time: e.target.value })} />
            </div>
            <Select value={form.type} onValueChange={(v) => setForm({ ...form, type: v as CalendarEventType })}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                {(Object.keys(TYPE_META) as CalendarEventType[]).map((k) => <SelectItem key={k} value={k}>{TYPE_META[k].label}</SelectItem>)}
              </SelectContent>
            </Select>
            <Input placeholder="Owner" value={form.owner ?? ""} onChange={(e) => setForm({ ...form, owner: e.target.value })} />
            <Input placeholder="Location (optional)" value={form.location ?? ""} onChange={(e) => setForm({ ...form, location: e.target.value })} />
            <Textarea rows={3} placeholder="Description" value={form.description ?? ""} onChange={(e) => setForm({ ...form, description: e.target.value })} />
            <label className="flex items-center gap-2 text-xs">
              <Checkbox checked={!!form.important} onCheckedChange={(v) => setForm({ ...form, important: Boolean(v) })} />
              Mark as important
            </label>
          </div>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setOpen(false)}>Cancel</Button>
            <Button onClick={submit}>Add event</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function buildMonthGrid(year: number, month: number): (number | null)[] {
  const first = new Date(year, month, 1);
  const daysInMonth = new Date(year, month + 1, 0).getDate();
  // Monday-first offset
  const offset = (first.getDay() + 6) % 7;
  const cells: (number | null)[] = [];
  for (let i = 0; i < offset; i++) cells.push(null);
  for (let d = 1; d <= daysInMonth; d++) cells.push(d);
  while (cells.length % 7 !== 0) cells.push(null);
  return cells;
}

function prevMonth({ year, month }: { year: number; month: number }) {
  return month === 0 ? { year: year - 1, month: 11 } : { year, month: month - 1 };
}
function nextMonth({ year, month }: { year: number; month: number }) {
  return month === 11 ? { year: year + 1, month: 0 } : { year, month: month + 1 };
}
function toIso(year: number, month: number, day: number) {
  return `${year}-${String(month + 1).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
}