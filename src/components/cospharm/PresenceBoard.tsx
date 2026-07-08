import { useEffect, useMemo, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { StatusBadge } from "./StatusBadge";
import { Building2, Home, MapPin, UserCheck, UserMinus, UserX, AlertTriangle } from "lucide-react";
import { INITIAL_PRESENCE, loadPresence, savePresence, type PresenceRecord, type PresenceStatus } from "./presence";

const COLS: { key: PresenceStatus; label: string; tone: string; icon: React.ReactNode }[] = [
  { key: "PRESENT", label: "Present", tone: "border-status-green/40 bg-status-green/5", icon: <UserCheck className="size-4 text-status-green" /> },
  { key: "ABSENT", label: "Absent", tone: "border-status-red/40 bg-status-red/5", icon: <UserX className="size-4 text-status-red" /> },
  { key: "OUT", label: "Out / Off-site", tone: "border-status-yellow/40 bg-status-yellow/5", icon: <UserMinus className="size-4 text-status-yellow-foreground" /> },
];

export function PresenceBoard({ activeAssignments }: { activeAssignments?: Record<string, string[]> }) {
  const [list, setList] = useState<PresenceRecord[]>(INITIAL_PRESENCE);
  const [editing, setEditing] = useState<PresenceRecord | null>(null);
  const [pendingStatus, setPendingStatus] = useState<PresenceStatus>("ABSENT");
  const [delegatedTo, setDelegatedTo] = useState("");
  const [delegationReason, setDelegationReason] = useState("");
  const [expectedReturn, setExpectedReturn] = useState("");
  const [notes, setNotes] = useState("");
  const [warning, setWarning] = useState<string | null>(null);

  useEffect(() => { setList(loadPresence()); }, []);
  useEffect(() => { savePresence(list); }, [list]);

  const byStatus = useMemo(() => {
    const map: Record<PresenceStatus, PresenceRecord[]> = { PRESENT: [], ABSENT: [], OUT: [] };
    for (const p of list) {
      const enriched = { ...p, activeTasks: activeAssignments?.[p.name] ?? p.activeTasks ?? [] };
      map[p.status].push(enriched);
    }
    return map;
  }, [list, activeAssignments]);

  const presentNames = list.filter((p) => p.status === "PRESENT").map((p) => p.name);

  function openMove(p: PresenceRecord, to: PresenceStatus) {
    if (to === "PRESENT") {
      // instant, no delegation needed
      setList((prev) => prev.map((x) => x.name === p.name ? { ...x, status: "PRESENT", delegatedTo: undefined, delegationReason: undefined, expectedReturn: undefined } : x));
      return;
    }
    setEditing(p);
    setPendingStatus(to);
    setDelegatedTo(p.delegatedTo ?? "");
    setDelegationReason(p.delegationReason ?? "");
    setExpectedReturn(p.expectedReturn ?? "");
    setNotes(p.notes ?? "");
    setWarning(null);
  }

  function saveMove() {
    if (!editing) return;
    const activeTasks = activeAssignments?.[editing.name] ?? editing.activeTasks ?? [];
    if (activeTasks.length > 0 && !delegatedTo.trim()) {
      setWarning(`${editing.name} has ${activeTasks.length} active delivery step(s) assigned. Delegate to someone present before saving.`);
      return;
    }
    setList((prev) => prev.map((x) => x.name === editing.name ? {
      ...x,
      status: pendingStatus,
      delegatedTo: delegatedTo.trim() || undefined,
      delegationReason: delegationReason.trim() || undefined,
      expectedReturn: expectedReturn.trim() || undefined,
      notes: notes.trim() || undefined,
    } : x));
    setEditing(null);
  }

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader>
          <CardTitle className="text-base font-semibold flex items-center gap-2">
            <UserCheck className="size-4" /> Presence & delegation board
          </CardTitle>
          <p className="mt-1 text-xs text-muted-foreground">
            Operational visibility only — not a full HR system. Move people between columns to reflect who is available today. When someone with active tasks goes Absent or Out, delegation is required before saving.
          </p>
        </CardHeader>
      </Card>

      <div className="grid gap-4 lg:grid-cols-3">
        {COLS.map((col) => (
          <Card key={col.key} className={`border ${col.tone}`}>
            <CardHeader className="pb-3">
              <CardTitle className="text-sm font-semibold flex items-center gap-2">
                {col.icon} {col.label}
                <span className="ml-auto rounded-full border bg-background px-2 text-[11px] font-medium text-muted-foreground">{byStatus[col.key].length}</span>
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-2">
              {byStatus[col.key].length === 0 ? (
                <p className="rounded-md border border-dashed p-3 text-center text-xs text-muted-foreground">Nobody here.</p>
              ) : byStatus[col.key].map((p) => (
                <PersonCard
                  key={p.name}
                  person={p}
                  onMove={(to) => openMove(p, to)}
                />
              ))}
            </CardContent>
          </Card>
        ))}
      </div>

      <Dialog open={!!editing} onOpenChange={(o) => !o && setEditing(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>
              Move {editing?.name} → {pendingStatus === "ABSENT" ? "Absent" : "Out / Off-site"}
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-3 py-2">
            {editing && (activeAssignments?.[editing.name]?.length ?? editing.activeTasks?.length ?? 0) > 0 ? (
              <div className="flex items-start gap-2 rounded-md border border-status-yellow/40 bg-status-yellow/10 p-3 text-xs">
                <AlertTriangle className="mt-0.5 size-4 text-status-yellow-foreground" />
                <div>
                  <p className="font-medium text-foreground">Active delivery steps assigned</p>
                  <p className="text-muted-foreground">Reassign before saving:</p>
                  <ul className="mt-1 list-disc pl-4 text-muted-foreground">
                    {(activeAssignments?.[editing.name] ?? editing.activeTasks ?? []).slice(0, 6).map((t) => (
                      <li key={t}>{t}</li>
                    ))}
                  </ul>
                </div>
              </div>
            ) : null}

            <div>
              <label className="text-xs font-medium">Delegate active tasks to</label>
              <Select value={delegatedTo} onValueChange={setDelegatedTo}>
                <SelectTrigger><SelectValue placeholder="Select person present" /></SelectTrigger>
                <SelectContent>
                  {presentNames.filter((n) => n !== editing?.name).map((n) => (
                    <SelectItem key={n} value={n}>{n}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <label className="text-xs font-medium">Reason</label>
              <Input value={delegationReason} onChange={(e) => setDelegationReason(e.target.value)} placeholder="e.g. Sick leave, off-site meeting" />
            </div>
            <div>
              <label className="text-xs font-medium">Expected return</label>
              <Input value={expectedReturn} onChange={(e) => setExpectedReturn(e.target.value)} placeholder="e.g. Tomorrow 08:00, 14:30 today" />
            </div>
            <div>
              <label className="text-xs font-medium">Notes</label>
              <Textarea value={notes} onChange={(e) => setNotes(e.target.value)} rows={2} />
            </div>
            {warning ? <p className="text-xs text-status-red">{warning}</p> : null}
          </div>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setEditing(null)}>Cancel</Button>
            <Button onClick={saveMove}>Save</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function PersonCard({ person, onMove }: { person: PresenceRecord & { activeTasks?: string[] }; onMove: (to: PresenceStatus) => void }) {
  const initials = person.name.split(" ").map((n) => n[0]).join("").slice(0, 2);
  const areaIcon = person.area === "Warehouse" ? <Building2 className="size-3" /> : person.area === "Field" ? <MapPin className="size-3" /> : <Home className="size-3" />;
  const activeCount = person.activeTasks?.length ?? 0;
  return (
    <div className="rounded-md border bg-card p-3 shadow-sm">
      <div className="flex items-start gap-2">
        <div className="grid size-9 place-items-center rounded-full bg-secondary text-xs font-semibold text-secondary-foreground">{initials}</div>
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-medium">{person.name}</p>
          <p className="truncate text-[11px] text-muted-foreground">{person.role}</p>
          <p className="mt-0.5 flex items-center gap-1 text-[11px] text-muted-foreground">
            {areaIcon} {person.area}
          </p>
        </div>
        {activeCount > 0 ? (
          <StatusBadge status={person.status === "PRESENT" ? "yellow" : "red"} label={`${activeCount} active`} />
        ) : null}
      </div>
      {person.status !== "PRESENT" && person.delegatedTo ? (
        <p className="mt-2 rounded bg-secondary/60 px-2 py-1 text-[11px]">
          Delegated to <span className="font-medium">{person.delegatedTo}</span>
          {person.expectedReturn ? ` · returns ${person.expectedReturn}` : ""}
        </p>
      ) : null}
      {person.status !== "PRESENT" && !person.delegatedTo && activeCount > 0 ? (
        <p className="mt-2 rounded bg-status-red/10 px-2 py-1 text-[11px] text-status-red">Delegation missing</p>
      ) : null}
      {person.delegationReason ? (
        <p className="mt-1 text-[11px] italic text-muted-foreground">"{person.delegationReason}"</p>
      ) : null}

      <div className="mt-3 flex flex-wrap gap-1.5">
        {(["PRESENT", "ABSENT", "OUT"] as PresenceStatus[]).filter((s) => s !== person.status).map((s) => (
          <Button key={s} size="sm" variant="outline" className="h-7 text-[11px]" onClick={() => onMove(s)}>
            → {s === "PRESENT" ? "Present" : s === "ABSENT" ? "Absent" : "Out"}
          </Button>
        ))}
      </div>
    </div>
  );
}