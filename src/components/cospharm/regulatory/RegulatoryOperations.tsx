import { useMemo, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Download, Lock, Plus, Printer, RotateCcw } from "lucide-react";
import { formatDay, useHydratedNow } from "../clock";
import { STAFF_ROSTER } from "../staff";
import type { Role } from "../types";
import { useRegulatoryStore } from "./store";
import {
  computeMetrics, computeRag, PARTY_LABEL, PATHWAYS, pct, PROCESS_LABEL,
  regCan, stagesFor, summariseClocks,
} from "./logic";
import { workingDaysUntil } from "./workdays";
import { Bar, EmptyState, KpiCard, PartyChip, RagBadge } from "./RegBits";
import { RegOverview } from "./RegOverview";
import type { ProcessType, Rag, RegulatoryCase, RegulatoryQuery, ResponsibleParty } from "./types";

const REG_OWNERS = STAFF_ROSTER.filter((s) => s.role === "regulatory").map((s) => s.name);

export function RegulatoryOperations({ role, actor }: { role: Role; actor: string }) {
  const nowMs = useHydratedNow(60_000);
  const store = useRegulatoryStore(nowMs, actor);
  const [openCaseId, setOpenCaseId] = useState<string | null>(null);

  if (!regCan(role, "reg.view")) {
    return (
      <Card>
        <CardContent className="flex items-center gap-3 p-6 text-sm text-muted-foreground">
          <Lock className="size-4" /> Regulatory Operations is restricted to regulatory, management and admin roles.
        </CardContent>
      </Card>
    );
  }

  const state = store.state;
  if (!state || nowMs === null) {
    return <div className="h-40 animate-pulse rounded-lg border bg-muted/40" />;
  }

  const canEdit = regCan(role, "reg.edit");
  const openCase = state.cases.find((c) => c.id === openCaseId) ?? null;

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <h3 className="text-sm font-semibold">Regulatory Operations</h3>
          <p className="text-xs text-muted-foreground">
            Registrations, variations, exemptions and BoMRA queries — demonstration environment, stored in this browser.
          </p>
        </div>
        {regCan(role, "reg.settings") ? (
          <Button size="sm" variant="ghost" onClick={store.reset}><RotateCcw className="mr-1 size-3.5" /> Reset demo data</Button>
        ) : null}
      </div>

      <Tabs defaultValue="overview" className="space-y-4">
        <TabsList className="flex w-full flex-wrap sm:inline-flex">
          <TabsTrigger value="overview">Overview</TabsTrigger>
          <TabsTrigger value="registration">Product Registration</TabsTrigger>
          <TabsTrigger value="variation">Product Variation</TabsTrigger>
          <TabsTrigger value="exemption">Product Exemption</TabsTrigger>
          <TabsTrigger value="queries">Queries &amp; Deadlines</TabsTrigger>
          <TabsTrigger value="reports">Reports</TabsTrigger>
          {regCan(role, "reg.settings") ? <TabsTrigger value="settings">Settings / SLA</TabsTrigger> : null}
        </TabsList>

        <TabsContent value="overview">
          <RegOverview state={state} nowMs={nowMs} onOpenCase={setOpenCaseId} />
        </TabsContent>

        {(["registration", "variation", "exemption"] as ProcessType[]).map((p) => (
          <TabsContent key={p} value={p}>
            <CaseBoard process={p} store={store} nowMs={nowMs} role={role} onOpenCase={setOpenCaseId} canEdit={canEdit} />
          </TabsContent>
        ))}

        <TabsContent value="queries">
          <QueriesTab store={store} nowMs={nowMs} canEdit={canEdit} onOpenCase={setOpenCaseId} />
        </TabsContent>

        <TabsContent value="reports">
          <ReportsTab store={store} nowMs={nowMs} />
        </TabsContent>

        {regCan(role, "reg.settings") ? (
          <TabsContent value="settings"><SettingsTab store={store} /></TabsContent>
        ) : null}
      </Tabs>

      <Sheet open={!!openCase} onOpenChange={(o) => !o && setOpenCaseId(null)}>
        <SheetContent side="right" className="w-full overflow-y-auto sm:max-w-3xl">
          {openCase ? (
            <>
              <SheetHeader>
                <SheetTitle className="text-left text-base">{openCase.caseNumber} — {openCase.title}</SheetTitle>
              </SheetHeader>
              <CaseDetail c={openCase} store={store} nowMs={nowMs} role={role} />
            </>
          ) : null}
        </SheetContent>
      </Sheet>
    </div>
  );
}

type Store = ReturnType<typeof useRegulatoryStore>;

/* --------------------------------- board ---------------------------------- */

function CaseBoard({
  process, store, nowMs, role, onOpenCase, canEdit,
}: {
  process: ProcessType; store: Store; nowMs: number; role: Role;
  onOpenCase: (id: string) => void; canEdit: boolean;
}) {
  const state = store.state!;
  const [q, setQ] = useState("");
  const [ragFilter, setRagFilter] = useState<"ALL" | Rag>("ALL");
  const [pathway, setPathway] = useState("ALL");

  const rows = useMemo(() => {
    return state.cases
      .filter((c) => c.processType === process)
      .map((c) => ({
        c,
        rag: computeRag(c, { nowMs, holidays: state.holidays, sla: state.sla, queries: state.queries }),
        clocks: summariseClocks(c, state.clocks, nowMs, state.holidays),
      }))
      .filter((r) => ragFilter === "ALL" || r.rag === ragFilter)
      .filter((r) => pathway === "ALL" || r.c.subtypeOrPathway === pathway)
      .filter((r) => {
        const t = q.trim().toLowerCase();
        if (!t) return true;
        return [r.c.caseNumber, r.c.title, r.c.productName, r.c.manufacturerName, r.c.caseOwnerId]
          .join(" ").toLowerCase().includes(t);
      });
  }, [state, process, nowMs, ragFilter, pathway, q]);

  return (
    <Card>
      <CardHeader className="gap-3">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <CardTitle className="text-base font-semibold">{PROCESS_LABEL[process]} cases</CardTitle>
          {canEdit ? <NewCaseDialog process={process} store={store} /> : null}
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search case, product, manufacturer…" className="w-64" />
          <Select value={pathway} onValueChange={setPathway}>
            <SelectTrigger className="w-56"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="ALL">All pathways / classes</SelectItem>
              {PATHWAYS[process].map((p) => <SelectItem key={p.key} value={p.key}>{p.label}</SelectItem>)}
            </SelectContent>
          </Select>
          <Select value={ragFilter} onValueChange={(v) => setRagFilter(v as "ALL" | Rag)}>
            <SelectTrigger className="w-44"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="ALL">All RAG states</SelectItem>
              {(["red", "amber", "green", "blue", "purple", "grey"] as Rag[]).map((r) => (
                <SelectItem key={r} value={r}>{r}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </CardHeader>
      <CardContent>
        {rows.length === 0 ? <EmptyState message="No cases match these filters." /> : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Case</TableHead><TableHead>Stage</TableHead><TableHead>Owner</TableHead>
                <TableHead>Responsible</TableHead><TableHead>Clocks (C/E/B)</TableHead>
                <TableHead>Next deadline</TableHead><TableHead className="text-right">RAG</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {rows.map(({ c, rag, clocks }) => {
                const due = c.regulatoryDueAt ?? c.internalDueAt;
                const left = workingDaysUntil(due, nowMs, state.holidays);
                const sensitiveBlocked = c.sensitive && !regCan(role, "reg.sensitive");
                return (
                  <TableRow key={c.id} className="cursor-pointer" onClick={() => onOpenCase(c.id)}>
                    <TableCell>
                      <div className="font-medium">{sensitiveBlocked ? "Restricted record" : c.title}</div>
                      <div className="text-xs text-muted-foreground">{c.caseNumber} · {c.productName}</div>
                    </TableCell>
                    <TableCell className="text-xs">{c.currentStage}<div className="text-[10px] text-muted-foreground">{clocks.stageAgeDays}d in stage</div></TableCell>
                    <TableCell className="text-xs">{c.caseOwnerId}</TableCell>
                    <TableCell><PartyChip party={c.currentResponsibleParty} /></TableCell>
                    <TableCell className="font-mono text-[11px]">{clocks.cospharmDays}/{clocks.externalDays}/{clocks.bomraDays}</TableCell>
                    <TableCell className="text-xs">
                      {due ? <>{formatDay(due)}<div className={`text-[10px] ${left !== null && left < 0 ? "text-status-red" : "text-muted-foreground"}`}>{left === null ? "" : left < 0 ? `${Math.abs(left)} working days overdue` : `${left} working days left`}</div></> : "—"}
                    </TableCell>
                    <TableCell className="text-right"><RagBadge rag={rag} /></TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        )}
      </CardContent>
    </Card>
  );
}

function NewCaseDialog({ process, store }: { process: ProcessType; store: Store }) {
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState({
    title: "", productName: "", manufacturerName: "",
    pathway: PATHWAYS[process][0].key, owner: REG_OWNERS[0] ?? "Tariro",
    priority: "routine" as RegulatoryCase["priority"],
  });
  const valid = form.title.trim() && form.productName.trim() && form.manufacturerName.trim();
  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild><Button size="sm"><Plus className="mr-1 size-3.5" /> New case</Button></DialogTrigger>
      <DialogContent>
        <DialogHeader><DialogTitle>New {PROCESS_LABEL[process].toLowerCase()} case</DialogTitle></DialogHeader>
        <div className="space-y-3">
          <div><Label className="text-xs">Case title</Label><Input value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} /></div>
          <div className="grid gap-3 sm:grid-cols-2">
            <div><Label className="text-xs">Product</Label><Input value={form.productName} onChange={(e) => setForm({ ...form, productName: e.target.value })} /></div>
            <div><Label className="text-xs">Manufacturer</Label><Input value={form.manufacturerName} onChange={(e) => setForm({ ...form, manufacturerName: e.target.value })} /></div>
          </div>
          <div className="grid gap-3 sm:grid-cols-3">
            <div>
              <Label className="text-xs">Pathway / class</Label>
              <Select value={form.pathway} onValueChange={(v) => setForm({ ...form, pathway: v })}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>{PATHWAYS[process].map((p) => <SelectItem key={p.key} value={p.key}>{p.label}</SelectItem>)}</SelectContent>
              </Select>
            </div>
            <div>
              <Label className="text-xs">Case owner</Label>
              <Select value={form.owner} onValueChange={(v) => setForm({ ...form, owner: v })}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>{REG_OWNERS.map((o) => <SelectItem key={o} value={o}>{o}</SelectItem>)}</SelectContent>
              </Select>
            </div>
            <div>
              <Label className="text-xs">Priority</Label>
              <Select value={form.priority} onValueChange={(v) => setForm({ ...form, priority: v as RegulatoryCase["priority"] })}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>{["routine", "high", "critical"].map((p) => <SelectItem key={p} value={p}>{p}</SelectItem>)}</SelectContent>
              </Select>
            </div>
          </div>
          <Button
            disabled={!valid}
            onClick={() => {
              store.createCase({
                processType: process, title: form.title, productName: form.productName,
                manufacturerName: form.manufacturerName, subtypeOrPathway: form.pathway,
                caseOwnerId: form.owner, priority: form.priority,
              });
              setOpen(false);
              setForm({ ...form, title: "", productName: "", manufacturerName: "" });
            }}
          >
            Create case
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}

/* ------------------------------- case detail ------------------------------- */

function CaseDetail({ c, store, nowMs, role }: { c: RegulatoryCase; store: Store; nowMs: number; role: Role }) {
  const state = store.state!;
  const canEdit = regCan(role, "reg.edit");
  const canDecide = regCan(role, "reg.decide");
  const sensitiveBlocked = !!c.sensitive && !regCan(role, "reg.sensitive");
  const clocks = summariseClocks(c, state.clocks, nowMs, state.holidays);
  const rag = computeRag(c, { nowMs, holidays: state.holidays, sla: state.sla, queries: state.queries });
  const [comment, setComment] = useState("");
  const [stage, setStage] = useState(c.currentStage);

  const events = state.stageEvents.filter((e) => e.caseId === c.id).sort((a, b) => (a.at < b.at ? 1 : -1));
  const caseQueries = state.queries.filter((q) => q.caseId === c.id);
  const docs = state.documents.filter((d) => d.caseId === c.id);
  const tasks = state.tasks.filter((t) => t.caseId === c.id);
  const comments = state.comments.filter((x) => x.caseId === c.id);
  const audit = state.audit.filter((a) => a.caseId === c.id);

  if (sensitiveBlocked) {
    return (
      <div className="mt-6 rounded-md border border-dashed p-6 text-center text-sm text-muted-foreground">
        <Lock className="mx-auto mb-2 size-4" />
        This exemption contains patient-identifiable information and is restricted to regulatory and admin roles.
      </div>
    );
  }

  return (
    <div className="mt-4 grid gap-4 lg:grid-cols-[1.15fr_0.85fr]">
      <div className="space-y-4">
        <Section title="Stage timeline">
          <ol className="space-y-2">
            {events.map((e) => (
              <li key={e.id} className="rounded-md border p-2 text-xs">
                <div className="flex items-center justify-between gap-2">
                  <span className="font-medium">{e.toStage}</span>
                  <PartyChip party={e.responsibleParty} />
                </div>
                <p className="mt-0.5 text-[11px] text-muted-foreground">{formatDay(e.at)} · {e.actor}{e.note ? ` · ${e.note}` : ""}</p>
              </li>
            ))}
          </ol>
        </Section>

        <Section title="Clock history">
          <div className="space-y-1">
            {state.clocks.filter((p) => p.caseId === c.id).map((p) => (
              <div key={p.id} className="flex items-center justify-between gap-2 rounded-md border px-2 py-1 text-[11px]">
                <span className="truncate">{PARTY_LABEL[p.party]} · {p.stage}</span>
                <span className="shrink-0 text-muted-foreground">{formatDay(p.startedAt)} → {p.endedAt ? formatDay(p.endedAt) : "running"}</span>
              </div>
            ))}
          </div>
        </Section>

        <Section title="Tasks">
          {tasks.length === 0 ? <EmptyState message="No tasks on this case." /> : tasks.map((t) => (
            <div key={t.id} className="flex items-center justify-between gap-2 rounded-md border p-2 text-xs">
              <div className="min-w-0">
                <p className="truncate font-medium">{t.title}</p>
                <p className="text-[11px] text-muted-foreground">{t.assignedToId} · {t.kind} · due {formatDay(t.dueAt)}</p>
              </div>
              {t.status === "open" && (canEdit || (t.kind === "payment" && regCan(role, "reg.payment"))) ? (
                <Button size="sm" variant="ghost" onClick={() => store.completeTask(t.id)}>Complete</Button>
              ) : <span className="text-[11px] text-muted-foreground">{t.status === "done" ? (t.completedOnTime ? "Done, on time" : "Done, late") : "Open"}</span>}
            </div>
          ))}
        </Section>

        <Section title="Queries">
          {caseQueries.length === 0 ? <EmptyState message="No queries raised." /> : caseQueries.map((q) => (
            <div key={q.id} className="rounded-md border p-2 text-xs">
              <div className="flex items-center justify-between gap-2">
                <span className="font-medium">{q.queryNumber} · cycle {q.cycleNumber}</span>
                <span className="capitalize text-muted-foreground">{q.status.replace(/_/g, " ")}</span>
              </div>
              <p className="mt-0.5 text-[11px] text-muted-foreground">
                {q.category} · {q.severity} · received {formatDay(q.receivedAt)} · regulator due {formatDay(q.regulatorDueAt)}
              </p>
            </div>
          ))}
        </Section>

        <Section title="Documents">
          {docs.length === 0 ? <EmptyState message="No controlled documents." /> : docs.map((d) => (
            <div key={d.id} className="flex items-center justify-between gap-2 rounded-md border p-2 text-xs">
              <div className="min-w-0">
                <p className="truncate font-medium">{d.name} <span className="text-muted-foreground">v{d.version}</span></p>
                <p className="text-[11px] text-muted-foreground">{d.documentType} · {d.uploadedBy} · {formatDay(d.uploadedAt)} · {d.approvalStatus}</p>
              </div>
              {canEdit ? (
                <Button size="sm" variant="ghost" onClick={() => store.addDocument({ caseId: c.id, documentType: d.documentType, name: d.name, reviewStatus: "pending", approvalStatus: "draft", stage: c.currentStage, supersedes: d.id })}>
                  New version
                </Button>
              ) : null}
            </div>
          ))}
        </Section>

        <Section title="Audit trail">
          <div className="space-y-1">
            {audit.map((a) => (
              <div key={a.id} className="rounded-md border px-2 py-1 text-[11px]">
                <span className="font-medium">{a.type.replace(/\./g, " ")}</span> — {a.summary}
                <span className="block text-muted-foreground">{formatDay(a.at)} · {a.actor}</span>
              </div>
            ))}
          </div>
        </Section>
      </div>

      <div className="space-y-4">
        <Section title="Case summary">
          <div className="space-y-1 text-xs">
            <Row k="RAG" v={<RagBadge rag={rag} />} />
            <Row k="Status" v={c.status} />
            <Row k="Process" v={`${PROCESS_LABEL[c.processType]} · ${PATHWAYS[c.processType].find((p) => p.key === c.subtypeOrPathway)?.label ?? c.subtypeOrPathway}`} />
            <Row k="Responsible party" v={PARTY_LABEL[c.currentResponsibleParty]} />
            <Row k="Case owner" v={c.caseOwnerId} />
            <Row k="Next action" v={c.nextAction} />
            <Row k="Opened" v={formatDay(c.openedAt)} />
            <Row k="Internal due" v={formatDay(c.internalDueAt)} />
            <Row k="Regulatory due" v={formatDay(c.regulatoryDueAt)} />
            <Row k="Submitted" v={formatDay(c.actualSubmissionAt)} />
            <Row k="Decision" v={c.decisionAt ? `${formatDay(c.decisionAt)} — ${c.outcome ?? ""}` : "—"} />
            {c.conditions ? <Row k="Conditions" v={c.conditions} /> : null}
            {c.bomraReference ? <Row k="BoMRA reference" v={c.bomraReference} /> : null}
          </div>
        </Section>

        <Section title="Clocks">
          <div className="grid grid-cols-2 gap-2 text-xs">
            <Metric label="Total elapsed" value={`${clocks.totalElapsedDays}d`} />
            <Metric label="Stage age" value={`${clocks.stageAgeDays} wd`} />
            <Metric label="Cospharm" value={`${clocks.cospharmDays} wd`} />
            <Metric label="Manufacturer / external" value={`${clocks.externalDays} wd`} />
            <Metric label="BoMRA" value={`${clocks.bomraDays} wd`} />
            <Metric label="Current owner" value={PARTY_LABEL[clocks.currentOwner]} />
          </div>
        </Section>

        <Section title="Product & regulatory details">
          <div className="space-y-1 text-xs">
            <Row k="Product" v={c.productName} />
            {c.innOrGenericName ? <Row k="INN / generic" v={c.innOrGenericName} /> : null}
            {c.strength ? <Row k="Strength" v={c.strength} /> : null}
            {c.dosageForm ? <Row k="Dosage form" v={c.dosageForm} /> : null}
            {c.packSize ? <Row k="Pack size" v={c.packSize} /> : null}
            <Row k="Manufacturer" v={c.manufacturerName} />
            {c.affectedSkus ? <Row k="Affected SKUs" v={c.affectedSkus} /> : null}
            {c.requestedQuantity !== undefined ? <Row k="Requested / approved qty" v={`${c.requestedQuantity} / ${c.approvedQuantity ?? "—"}`} /> : null}
            {c.reconciliationStatus ? <Row k="Reconciliation" v={c.reconciliationStatus.replace(/_/g, " ")} /> : null}
          </div>
          {c.processType === "variation" && c.implementationAt && c.lawfulImplementationPoint === "on_approval" && !c.decisionAt ? (
            <p className="mt-2 rounded-md border border-status-red/40 bg-status-red/10 p-2 text-[11px] font-medium text-status-red">
              Critical: this variation was marked implemented before approval was recorded.
            </p>
          ) : null}
        </Section>

        {canEdit ? (
          <Section title="Actions">
            <div className="space-y-2">
              <Label className="text-xs">Change stage</Label>
              <div className="flex gap-2">
                <Select value={stage} onValueChange={setStage}>
                  <SelectTrigger className="flex-1"><SelectValue /></SelectTrigger>
                  <SelectContent>{stagesFor(c.processType).map((s) => <SelectItem key={s} value={s}>{s}</SelectItem>)}</SelectContent>
                </Select>
                <Button size="sm" disabled={stage === c.currentStage} onClick={() => store.changeStage(c.id, stage)}>Apply</Button>
              </div>

              <div className="grid grid-cols-2 gap-2">
                <Select value={c.caseOwnerId} onValueChange={(v) => store.assign(c.id, v)}>
                  <SelectTrigger><SelectValue placeholder="Assign" /></SelectTrigger>
                  <SelectContent>{REG_OWNERS.map((o) => <SelectItem key={o} value={o}>{o}</SelectItem>)}</SelectContent>
                </Select>
                <Button size="sm" variant="outline" onClick={() => store.togglePause(c.id)}>
                  {c.status === "paused" ? "Resume clocks" : "Pause case"}
                </Button>
              </div>

              <div className="grid grid-cols-2 gap-2">
                <div>
                  <Label className="text-[11px]">Internal due</Label>
                  <Input type="date" value={c.internalDueAt ?? ""} onChange={(e) => store.setDue(c.id, "internalDueAt", e.target.value)} />
                </div>
                <div>
                  <Label className="text-[11px]">Regulatory due</Label>
                  <Input type="date" value={c.regulatoryDueAt ?? ""} onChange={(e) => store.setDue(c.id, "regulatoryDueAt", e.target.value)} />
                </div>
              </div>

              <div className="flex flex-wrap gap-2">
                <Button size="sm" variant="outline" onClick={() => store.recordSubmission(c.id, new Date(nowMs).toISOString().slice(0, 10), "BoMRA e-portal")}>Record submission</Button>
                {canDecide ? (
                  <>
                    <Button size="sm" variant="outline" onClick={() => store.recordDecision(c.id, { outcome: "approved", decidedAt: new Date(nowMs).toISOString().slice(0, 10) })}>Record approval</Button>
                    <Button size="sm" variant="outline" onClick={() => store.closeCase(c.id, "closed")}>Close case</Button>
                  </>
                ) : null}
                <Button size="sm" variant="outline" onClick={() => store.addTask({ caseId: c.id, title: "Implementation verification", kind: "implementation", assignedToId: c.caseOwnerId, dueAt: store.suggestDue(5) })}>
                  Add implementation task
                </Button>
              </div>
            </div>
          </Section>
        ) : null}

        <Section title="Comments">
          <div className="space-y-2">
            {comments.map((cm) => (
              <div key={cm.id} className="rounded-md border p-2 text-xs">
                <p className="font-medium">{cm.author} <span className="font-normal text-muted-foreground">· {formatDay(cm.at)}</span></p>
                <p className="mt-0.5 text-muted-foreground">{cm.body}</p>
              </div>
            ))}
            {canEdit ? (
              <div className="space-y-2">
                <Textarea value={comment} onChange={(e) => setComment(e.target.value)} placeholder="Add a case note…" rows={2} />
                <Button size="sm" disabled={!comment.trim()} onClick={() => { store.addComment(c.id, comment.trim()); setComment(""); }}>Add note</Button>
              </div>
            ) : null}
          </div>
        </Section>
      </div>
    </div>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <Card>
      <CardHeader className="pb-2"><CardTitle className="text-sm font-semibold">{title}</CardTitle></CardHeader>
      <CardContent className="space-y-2">{children}</CardContent>
    </Card>
  );
}

function Row({ k, v }: { k: string; v: React.ReactNode }) {
  return (
    <div className="flex items-start justify-between gap-3 border-b py-1 last:border-0">
      <span className="shrink-0 text-muted-foreground">{k}</span>
      <span className="text-right font-medium">{v}</span>
    </div>
  );
}

function Metric({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-md border p-2">
      <p className="text-[10px] uppercase tracking-wide text-muted-foreground">{label}</p>
      <p className="text-sm font-semibold">{value}</p>
    </div>
  );
}

/* --------------------------------- queries --------------------------------- */

function QueriesTab({ store, nowMs, canEdit, onOpenCase }: { store: Store; nowMs: number; canEdit: boolean; onOpenCase: (id: string) => void }) {
  const state = store.state!;
  const [status, setStatus] = useState("ALL");
  const rows = state.queries
    .filter((q) => status === "ALL" || q.status === status)
    .map((q) => ({
      q,
      days: workingDaysUntil(q.regulatorDueAt, nowMs, state.holidays) ?? 0,
      ageing: workingDaysUntil(q.receivedAt, nowMs, state.holidays) ?? 0,
      c: state.cases.find((x) => x.id === q.caseId),
    }))
    .sort((a, b) => a.days - b.days);

  return (
    <Card>
      <CardHeader className="gap-2">
        <CardTitle className="text-base font-semibold">Queries &amp; deadlines</CardTitle>
        <Select value={status} onValueChange={setStatus}>
          <SelectTrigger className="w-56"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="ALL">All statuses</SelectItem>
            {["open", "waiting_external", "internal_review", "submitted", "accepted", "superseded"].map((s) => (
              <SelectItem key={s} value={s}>{s.replace(/_/g, " ")}</SelectItem>
            ))}
          </SelectContent>
        </Select>
      </CardHeader>
      <CardContent>
        {rows.length === 0 ? <EmptyState message="No queries match." /> : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Query</TableHead><TableHead>Case</TableHead><TableHead>Category</TableHead>
                <TableHead>Owner</TableHead><TableHead>Ageing</TableHead><TableHead>Regulator due</TableHead>
                <TableHead className="text-right">Status</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {rows.map(({ q, days, ageing, c }) => (
                <TableRow key={q.id}>
                  <TableCell className="text-xs font-medium">{q.queryNumber}<div className="text-[10px] text-muted-foreground capitalize">{q.severity}</div></TableCell>
                  <TableCell className="text-xs">
                    <button className="underline-offset-2 hover:underline" onClick={() => c && onOpenCase(c.id)}>{c?.caseNumber ?? q.caseId}</button>
                  </TableCell>
                  <TableCell className="text-xs capitalize">{q.category}</TableCell>
                  <TableCell className="text-xs">{q.assignedToId}</TableCell>
                  <TableCell className="text-xs">{Math.abs(ageing)} wd</TableCell>
                  <TableCell className={`text-xs ${days < 0 ? "text-status-red" : days <= 5 ? "text-status-yellow-foreground" : ""}`}>
                    {formatDay(q.regulatorDueAt)}<div className="text-[10px]">{days < 0 ? `${Math.abs(days)} overdue` : `${days} left`}</div>
                  </TableCell>
                  <TableCell className="text-right">
                    {canEdit ? (
                      <Select value={q.status} onValueChange={(v) => store.updateQuery(q.id, { status: v as RegulatoryQuery["status"], submittedAt: v === "submitted" ? new Date(nowMs).toISOString().slice(0, 10) : q.submittedAt })}>
                        <SelectTrigger className="ml-auto w-40"><SelectValue /></SelectTrigger>
                        <SelectContent>
                          {["open", "waiting_external", "internal_review", "submitted", "accepted", "superseded"].map((s) => (
                            <SelectItem key={s} value={s}>{s.replace(/_/g, " ")}</SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    ) : <span className="text-xs capitalize">{q.status.replace(/_/g, " ")}</span>}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </CardContent>
    </Card>
  );
}

/* --------------------------------- reports --------------------------------- */

function ReportsTab({ store, nowMs }: { store: Store; nowMs: number }) {
  const state = store.state!;
  const m = computeMetrics({ cases: state.cases, tasks: state.tasks, queries: state.queries, nowMs, holidays: state.holidays });

  const exportCsv = () => {
    const header = ["Case number", "Process", "Pathway", "Title", "Product", "Manufacturer", "Owner", "Stage", "Responsible", "Status", "Internal due", "Regulatory due", "Submitted", "Decision", "Outcome"];
    const lines = state.cases.map((c) =>
      [c.caseNumber, c.processType, c.subtypeOrPathway, c.title, c.productName, c.manufacturerName, c.caseOwnerId, c.currentStage, c.currentResponsibleParty, c.status, c.internalDueAt ?? "", c.regulatoryDueAt ?? "", c.actualSubmissionAt ?? "", c.decisionAt ?? "", c.outcome ?? ""]
        .map((v) => `"${String(v).replace(/"/g, '""')}"`).join(","),
    );
    const blob = new Blob([[header.join(","), ...lines].join("\n")], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `cospharm-regulatory-cases-${new Date(nowMs).toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const byMonth = useMemo(() => {
    const map = new Map<string, { submissions: number; decisions: number }>();
    for (const c of state.cases) {
      if (c.actualSubmissionAt) {
        const k = c.actualSubmissionAt.slice(0, 7);
        const cur = map.get(k) ?? { submissions: 0, decisions: 0 };
        map.set(k, { ...cur, submissions: cur.submissions + 1 });
      }
      if (c.decisionAt) {
        const k = c.decisionAt.slice(0, 7);
        const cur = map.get(k) ?? { submissions: 0, decisions: 0 };
        map.set(k, { ...cur, decisions: cur.decisions + 1 });
      }
    }
    return [...map.entries()].sort((a, b) => (a[0] < b[0] ? -1 : 1));
  }, [state.cases]);
  const maxMonth = Math.max(1, ...byMonth.map(([, v]) => Math.max(v.submissions, v.decisions)));

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap gap-2">
        <Button size="sm" variant="outline" onClick={exportCsv}><Download className="mr-1 size-3.5" /> Export case register (CSV)</Button>
        <Button size="sm" variant="outline" onClick={() => window.print()}><Printer className="mr-1 size-3.5" /> Print summary</Button>
      </div>

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <KpiCard label="On-time milestones" value={pct(m.onTimeControllableMilestoneRate)} sub={`${m.onTimeControllableMilestoneRate.numerator}/${m.onTimeControllableMilestoneRate.denominator}`} />
        <KpiCard label="First-pass completeness" value={pct(m.firstPassDossierCompleteness)} sub={`${m.firstPassDossierCompleteness.numerator}/${m.firstPassDossierCompleteness.denominator}`} />
        <KpiCard label="BoMRA screening pass rate" value={pct(m.bomraScreeningPassRate)} sub={`${m.bomraScreeningPassRate.numerator}/${m.bomraScreeningPassRate.denominator}`} />
        <KpiCard label="Query response compliance" value={pct(m.queryResponseCompliance)} sub={`${m.queryResponseCompliance.numerator}/${m.queryResponseCompliance.denominator}`} />
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base font-semibold">Submissions and decisions by month</CardTitle>
          <p className="text-xs text-muted-foreground">Counted from recorded submission and decision dates on the case register.</p>
        </CardHeader>
        <CardContent className="space-y-3">
          {byMonth.length === 0 ? <EmptyState message="No submissions recorded yet." /> : byMonth.map(([month, v]) => (
            <div key={month} className="space-y-1">
              <div className="flex justify-between text-xs"><span className="font-medium">{month}</span><span className="text-muted-foreground">{v.submissions} submitted · {v.decisions} decided</span></div>
              <Bar value={v.submissions} max={maxMonth} />
              <Bar value={v.decisions} max={maxMonth} tone="red" />
            </div>
          ))}
        </CardContent>
      </Card>
    </div>
  );
}

/* --------------------------------- settings -------------------------------- */

function SettingsTab({ store }: { store: Store }) {
  const state = store.state!;
  const [holidayText, setHolidayText] = useState(state.holidays.join("\n"));
  const latest = useMemo(() => {
    const map = new Map<string, typeof state.sla[number]>();
    for (const r of [...state.sla].sort((a, b) => a.version - b.version)) map.set(`${r.processType}-${r.key}`, r);
    return [...map.values()];
  }, [state.sla]);

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader>
          <CardTitle className="text-base font-semibold">Regulatory targets (SLA rules)</CardTitle>
          <p className="text-xs text-muted-foreground">Editing creates a new version with an effective date. Historical versions are retained for audit.</p>
        </CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow><TableHead>Process</TableHead><TableHead>Pathway / class</TableHead><TableHead>Working days</TableHead><TableHead>Effective from</TableHead><TableHead className="text-right">Version</TableHead></TableRow>
            </TableHeader>
            <TableBody>
              {latest.map((r) => (
                <TableRow key={r.id}>
                  <TableCell className="text-xs">{PROCESS_LABEL[r.processType]}</TableCell>
                  <TableCell className="text-xs">{r.label}</TableCell>
                  <TableCell>
                    <Input
                      type="number"
                      defaultValue={r.workingDays}
                      className="w-24"
                      onBlur={(e) => {
                        const v = Number(e.target.value);
                        if (Number.isFinite(v) && v > 0 && v !== r.workingDays) {
                          store.updateSla(r, v, new Date().toISOString().slice(0, 10));
                        }
                      }}
                    />
                  </TableCell>
                  <TableCell className="text-xs">{formatDay(r.effectiveFrom)}</TableCell>
                  <TableCell className="text-right text-xs">v{r.version}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base font-semibold">Botswana public holidays</CardTitle>
          <p className="text-xs text-muted-foreground">One ISO date per line. Working-day clocks and deadlines exclude weekends and these dates.</p>
        </CardHeader>
        <CardContent className="space-y-2">
          <Textarea rows={8} value={holidayText} onChange={(e) => setHolidayText(e.target.value)} className="font-mono text-xs" />
          <Button size="sm" onClick={() => store.setHolidays(holidayText.split("\n").map((s) => s.trim()).filter((s) => /^\d{4}-\d{2}-\d{2}$/.test(s)))}>
            Save holiday calendar
          </Button>
        </CardContent>
      </Card>

      <Card>
        <CardHeader><CardTitle className="text-base font-semibold">Settings audit</CardTitle></CardHeader>
        <CardContent className="space-y-1">
          {state.audit.filter((a) => a.type === "settings.changed").slice(0, 12).map((a) => (
            <p key={a.id} className="text-[11px] text-muted-foreground">{formatDay(a.at)} · {a.actor} — {a.summary}</p>
          ))}
        </CardContent>
      </Card>
    </div>
  );
}

export type { ResponsibleParty };