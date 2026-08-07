import type { Role } from "../types";
import { workingDaysBetween, workingDaysUntil } from "./workdays";
import type {
  ClockPeriod,
  ProcessType,
  Rag,
  RegulatoryCase,
  RegulatoryQuery,
  RegTask,
  ResponsibleParty,
  SlaRule,
} from "./types";

/* ---------------------------------- stages --------------------------------- */

export const REGISTRATION_STAGES = [
  "Opportunity / route assessment",
  "Dossier received",
  "Internal gap analysis",
  "Awaiting manufacturer corrections",
  "Final dossier QC",
  "Finance / payment readiness",
  "Ready for submission",
  "Submitted",
  "BoMRA validation / screening",
  "Technical assessment",
  "Query response",
  "Decision pending",
  "Approved / conditionally approved",
  "Rejected / withdrawn",
  "Launch-readiness handover",
  "Closed",
] as const;

export const VARIATION_STAGES = [
  "Change received",
  "Impact assessment",
  "Classification confirmed",
  "Awaiting supporting documents",
  "Submission pack preparation",
  "Internal QC",
  "Submitted",
  "Screening / assessment",
  "Query response",
  "Decision received",
  "Implementation planning",
  "Implemented",
  "Effectiveness check",
  "Closed / rejected / withdrawn",
] as const;

export const EXEMPTION_STAGES = [
  "Request received",
  "Exemption category / eligibility review",
  "Supporting documents requested",
  "Application pack preparation",
  "Internal QC",
  "Payment / submission readiness",
  "Submitted",
  "Screening / query",
  "Decision received",
  "Import/supply authorisation controls",
  "Quantity reconciliation",
  "Closed / expired / rejected",
] as const;

export function stagesFor(p: ProcessType): readonly string[] {
  if (p === "registration") return REGISTRATION_STAGES;
  if (p === "variation") return VARIATION_STAGES;
  return EXEMPTION_STAGES;
}

/** Which party normally owns each stage — used to attribute clocks on transition. */
export function defaultPartyForStage(stage: string): ResponsibleParty {
  const s = stage.toLowerCase();
  if (s.includes("awaiting manufacturer") || s.includes("awaiting supporting") || s.includes("documents requested"))
    return "manufacturer";
  if (
    s.includes("submitted") ||
    s.includes("validation") ||
    s.includes("screening") ||
    s.includes("technical assessment") ||
    s.includes("decision pending")
  )
    return "bomra";
  return "cospharm";
}

export const PROCESS_LABEL: Record<ProcessType, string> = {
  registration: "Product Registration",
  variation: "Product Variation",
  exemption: "Product Exemption",
};

export const PATHWAYS: Record<ProcessType, { key: string; label: string; workingDays: number }[]> = {
  registration: [
    { key: "full", label: "Full evaluation", workingDays: 270 },
    { key: "abridged", label: "Abridged evaluation", workingDays: 180 },
    { key: "verification", label: "Verification", workingDays: 90 },
    { key: "notification", label: "Notification", workingDays: 30 },
  ],
  variation: [
    { key: "major", label: "Major", workingDays: 90 },
    { key: "minor", label: "Minor", workingDays: 60 },
    { key: "notification", label: "Notification", workingDays: 30 },
  ],
  exemption: [
    { key: "patient", label: "Patient-specific", workingDays: 20 },
    { key: "institutional", label: "Institutional / consignment-specific", workingDays: 30 },
    { key: "emergency", label: "Emergency / special access", workingDays: 10 },
    { key: "sample", label: "Registration sample", workingDays: 30 },
    { key: "other", label: "Other BoMRA category", workingDays: 30 },
  ],
};

export function defaultSlaRules(effectiveFrom: string): SlaRule[] {
  const out: SlaRule[] = [];
  (Object.keys(PATHWAYS) as ProcessType[]).forEach((p) => {
    PATHWAYS[p].forEach((v) => {
      out.push({
        id: `sla-${p}-${v.key}`,
        processType: p,
        key: v.key,
        label: v.label,
        workingDays: v.workingDays,
        effectiveFrom,
        version: 1,
      });
    });
  });
  return out;
}

export function slaFor(sla: SlaRule[], processType: ProcessType, key: string): SlaRule | undefined {
  return sla
    .filter((r) => r.processType === processType && r.key === key)
    .sort((a, b) => b.version - a.version)[0];
}

/* ---------------------------------- clocks --------------------------------- */

export type ClockSummary = {
  totalElapsedDays: number;
  cospharmDays: number;
  externalDays: number;
  bomraDays: number;
  currentOwner: ResponsibleParty;
  stageAgeDays: number;
};

export const PARTY_LABEL: Record<ResponsibleParty, string> = {
  cospharm: "Cospharm",
  manufacturer: "Manufacturer / external",
  bomra: "BoMRA",
  other_external: "Other external party",
};

export function summariseClocks(
  c: RegulatoryCase,
  periods: ClockPeriod[],
  nowMs: number,
  holidays: string[],
): ClockSummary {
  const nowIso = new Date(nowMs).toISOString();
  const acc: Record<ResponsibleParty, number> = { cospharm: 0, manufacturer: 0, bomra: 0, other_external: 0 };
  for (const p of periods.filter((x) => x.caseId === c.id)) {
    if (p.paused) continue;
    acc[p.party] += workingDaysBetween(p.startedAt, p.endedAt ?? nowIso, holidays);
  }
  return {
    totalElapsedDays: Math.max(0, Math.floor((nowMs - new Date(c.openedAt).getTime()) / 86_400_000)),
    cospharmDays: acc.cospharm,
    externalDays: acc.manufacturer + acc.other_external,
    bomraDays: acc.bomra,
    currentOwner: c.currentResponsibleParty,
    stageAgeDays: workingDaysBetween(c.stageStartedAt, nowIso, holidays),
  };
}

/* ------------------------------------ RAG ---------------------------------- */

export const RAG_LABEL: Record<Rag, string> = {
  green: "On track",
  amber: "At risk",
  red: "Overdue / critical",
  blue: "With BoMRA",
  purple: "Waiting on manufacturer",
  grey: "Paused / closed",
};

export const RAG_CLASS: Record<Rag, string> = {
  green: "bg-status-green/15 text-status-green ring-status-green/30",
  amber: "bg-status-yellow/25 text-status-yellow-foreground ring-status-yellow/40",
  red: "bg-status-red/15 text-status-red ring-status-red/30",
  blue: "bg-primary/10 text-primary ring-primary/30",
  purple: "bg-accent/15 text-accent-foreground ring-accent/30",
  grey: "bg-muted text-muted-foreground ring-border",
};

export function computeRag(
  c: RegulatoryCase,
  opts: { nowMs: number; holidays: string[]; sla: SlaRule[]; queries: RegulatoryQuery[] },
): Rag {
  const { nowMs, holidays, queries } = opts;
  if (["paused", "rejected", "withdrawn", "closed"].includes(c.status)) return "grey";

  const dues = [c.internalDueAt, c.regulatoryDueAt].filter(Boolean) as string[];
  const remaining = dues
    .map((d) => workingDaysUntil(d, nowMs, holidays))
    .filter((n): n is number => n !== null);
  const overdue = remaining.some((n) => n < 0);

  const criticalQuery = queries.some(
    (q) =>
      q.caseId === c.id &&
      q.severity === "critical" &&
      !["submitted", "accepted", "superseded"].includes(q.status),
  );
  const unlawfulImplementation =
    c.processType === "variation" &&
    !!c.implementationAt &&
    c.lawfulImplementationPoint === "on_approval" &&
    !c.decisionAt;
  const expired = !!c.expiryAt && c.expiryAt.slice(0, 10) < new Date(nowMs).toISOString().slice(0, 10);

  if (overdue || criticalQuery || unlawfulImplementation || expired) return "red";

  const rule = slaFor(opts.sla, c.processType, c.subtypeOrPathway);
  const stageAge = workingDaysBetween(c.stageStartedAt, new Date(nowMs).toISOString(), holidays);
  const stageTarget = Math.max(3, Math.round((rule?.workingDays ?? 30) / 6));
  const nearDeadline = remaining.some((n) => n <= 5);
  if (nearDeadline || stageAge / stageTarget >= 0.75) return "amber";

  if (c.currentResponsibleParty === "bomra") return "blue";
  if (c.currentResponsibleParty === "manufacturer" || c.currentResponsibleParty === "other_external")
    return "purple";
  return "green";
}

/* ---------------------------------- metrics -------------------------------- */

export type Metric = { value: number | null; numerator: number; denominator: number };

function ratio(numerator: number, denominator: number): Metric {
  return { value: denominator > 0 ? numerator / denominator : null, numerator, denominator };
}

export function computeMetrics(args: {
  cases: RegulatoryCase[];
  tasks: RegTask[];
  queries: RegulatoryQuery[];
  nowMs: number;
  holidays: string[];
}) {
  const { cases, tasks, queries, nowMs, holidays } = args;
  const live = cases.filter((c) => !["draft", "closed", "withdrawn", "rejected"].includes(c.status));

  const completedMilestones = tasks.filter((t) => t.status === "done");
  const onTime = completedMilestones.filter((t) => t.completedOnTime);

  const reviewed = cases.filter((c) => c.internalQcReviewed);
  const firstPass = reviewed.filter((c) => !c.internalQcReturned);

  const submitted = cases.filter((c) => !!c.actualSubmissionAt);
  const acceptedFirst = submitted.filter((c) => c.firstValidationAccepted);

  const submittedQueries = queries.filter((q) => !!q.submittedAt);
  const queriesOnTime = submittedQueries.filter((q) => (q.submittedAt ?? "") <= q.regulatorDueAt);

  const overdueCases = live.filter((c) => {
    const dues = [c.internalDueAt, c.regulatoryDueAt].filter(Boolean) as string[];
    return dues.some((d) => (workingDaysUntil(d, nowMs, holidays) ?? 0) < 0);
  });

  return {
    activeRegistrations: live.filter((c) => c.processType === "registration").length,
    activeVariations: live.filter((c) => c.processType === "variation").length,
    activeExemptions: live.filter((c) => c.processType === "exemption").length,
    overdueMilestones: tasks.filter(
      (t) => t.status === "open" && t.dueAt && (workingDaysUntil(t.dueAt, nowMs, holidays) ?? 0) < 0,
    ).length,
    queriesDueIn7: queries.filter(
      (q) =>
        !["submitted", "accepted", "superseded"].includes(q.status) &&
        (workingDaysUntil(q.regulatorDueAt, nowMs, holidays) ?? 99) <= 7,
    ).length,
    waitingManufacturer: live.filter(
      (c) => c.currentResponsibleParty === "manufacturer" || c.currentResponsibleParty === "other_external",
    ).length,
    withBomra: live.filter((c) => c.currentResponsibleParty === "bomra").length,
    onTimeControllableMilestoneRate: ratio(onTime.length, completedMilestones.length),
    firstPassDossierCompleteness: ratio(firstPass.length, reviewed.length),
    bomraScreeningPassRate: ratio(acceptedFirst.length, submitted.length),
    queryResponseCompliance: ratio(queriesOnTime.length, submittedQueries.length),
    overdueCaseRate: ratio(overdueCases.length, live.length),
    activeCases: live.length,
  };
}

export function pct(m: Metric): string {
  return m.value === null ? "—" : `${Math.round(m.value * 100)}%`;
}

/* -------------------------------- permissions ------------------------------- */

export type RegPermission =
  | "reg.view"
  | "reg.edit"
  | "reg.decide"
  | "reg.close"
  | "reg.payment"
  | "reg.sensitive"
  | "reg.settings";

export function regCan(role: Role, p: RegPermission): boolean {
  const matrix: Partial<Record<Role, RegPermission[]>> = {
    admin: ["reg.view", "reg.edit", "reg.decide", "reg.close", "reg.payment", "reg.sensitive", "reg.settings"],
    regulatory: ["reg.view", "reg.edit", "reg.decide", "reg.close", "reg.sensitive"],
    general_manager: ["reg.view"],
    ops_manager: ["reg.view"],
    procurement: ["reg.view", "reg.payment"],
    supervisor: ["reg.view"],
    hr: ["reg.view"],
  };
  return (matrix[role] ?? []).includes(p);
}

export const REG_ROLE_NOTE: Partial<Record<Role, string>> = {
  regulatory: "Regulatory Officer / Reviewer — full case management.",
  admin: "Admin — SLA rules, categories and permissions.",
  procurement: "Finance view — payment tasks only.",
  general_manager: "Executive — dashboards and reports (read-only).",
  ops_manager: "Operations — approved launch/implementation data (read-only).",
};