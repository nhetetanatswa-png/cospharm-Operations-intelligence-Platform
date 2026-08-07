// Demonstration data for the Regulatory Operations workspace.
// Built from the hydrated browser clock so dates are always current and never 1970.

import { addWorkingDays, DEFAULT_HOLIDAYS_2026 } from "./workdays";
import { defaultPartyForStage, defaultSlaRules, PATHWAYS } from "./logic";
import type {
  AuditEvent,
  ClockPeriod,
  DecisionRecord,
  DocumentRecord,
  ProcessType,
  RegComment,
  RegTask,
  RegulatoryCase,
  RegulatoryQuery,
  RegulatoryState,
  ResponsibleParty,
  StageEvent,
} from "./types";

const iso = (ms: number) => new Date(ms).toISOString();
const day = (ms: number) => iso(ms).slice(0, 10);
const DAY = 86_400_000;

type Spec = {
  n: number;
  processType: ProcessType;
  pathway: string;
  title: string;
  product: string;
  inn?: string;
  strength?: string;
  form?: string;
  pack?: string;
  manufacturer: string;
  supplier?: string;
  owner: string;
  stageIndex: number;
  stage: string;
  openedDaysAgo: number;
  stageDaysAgo: number;
  priority: RegulatoryCase["priority"];
  status: RegulatoryCase["status"];
  internalDueIn?: number;
  regulatoryDueIn?: number;
  submittedDaysAgo?: number;
  decisionDaysAgo?: number;
  outcome?: string;
  party?: ResponsibleParty;
  extra?: Partial<RegulatoryCase>;
};

const SPECS: Spec[] = [
  {
    n: 1, processType: "registration", pathway: "abridged",
    title: "Amoxicillin/Clavulanate 625 mg — abridged registration",
    product: "Amoclav 625", inn: "Amoxicillin + Clavulanic acid", strength: "500/125 mg",
    form: "Film-coated tablet", pack: "14 tablets", manufacturer: "Aurobindo Pharma Ltd",
    supplier: "Aurobindo Southern Africa", owner: "Tariro", stageIndex: 9,
    stage: "Technical assessment", openedDaysAgo: 168, stageDaysAgo: 34,
    priority: "high", status: "active", regulatoryDueIn: 46, submittedDaysAgo: 88,
    extra: { bomraReference: "BoMRA/MR/2026/0412", submissionChannel: "BoMRA e-portal", internalQcReviewed: true, firstValidationAccepted: true, paymentReference: "PMT-3391" },
  },
  {
    n: 2, processType: "registration", pathway: "full",
    title: "Insulin Glargine 100 IU/mL — full evaluation",
    product: "Glarvia 100", inn: "Insulin glargine", strength: "100 IU/mL",
    form: "Solution for injection", pack: "5 x 3 mL pens", manufacturer: "Biocon Biologics",
    owner: "Aman", stageIndex: 3, stage: "Awaiting manufacturer corrections",
    openedDaysAgo: 96, stageDaysAgo: 29, priority: "critical", status: "active",
    internalDueIn: -4, party: "manufacturer",
    extra: { internalQcReviewed: true, internalQcReturned: true },
  },
  {
    n: 3, processType: "registration", pathway: "verification",
    title: "Paracetamol 500 mg tablets — verification pathway",
    product: "Panadex 500", inn: "Paracetamol", strength: "500 mg", form: "Tablet",
    pack: "1000 tablets", manufacturer: "Cipla Ltd", owner: "Alaska",
    stageIndex: 5, stage: "Finance / payment readiness", openedDaysAgo: 41,
    stageDaysAgo: 6, priority: "routine", status: "active", internalDueIn: 3,
    extra: { targetSubmissionAt: undefined, internalQcReviewed: true },
  },
  {
    n: 4, processType: "registration", pathway: "abridged",
    title: "Azithromycin 200 mg/5 mL suspension",
    product: "Azimed Susp", inn: "Azithromycin", strength: "200 mg/5 mL",
    form: "Powder for oral suspension", pack: "30 mL", manufacturer: "Sandoz GmbH",
    owner: "Tariro", stageIndex: 12, stage: "Approved / conditionally approved",
    openedDaysAgo: 320, stageDaysAgo: 12, priority: "routine", status: "approved",
    submittedDaysAgo: 210, decisionDaysAgo: 12, outcome: "Approved with conditions",
    extra: {
      bomraReference: "BoMRA/MR/2025/1180", conditions: "Submit 12-month stability update within 6 months.",
      internalQcReviewed: true, firstValidationAccepted: true,
    },
  },
  {
    n: 5, processType: "variation", pathway: "major",
    title: "Change of finished product manufacturing site — Amoclav 625",
    product: "Amoclav 625", manufacturer: "Aurobindo Pharma Ltd", owner: "Aman",
    stageIndex: 7, stage: "Screening / assessment", openedDaysAgo: 62, stageDaysAgo: 19,
    priority: "high", status: "active", regulatoryDueIn: 24, submittedDaysAgo: 19,
    extra: {
      affectedDossierSections: "3.2.P.3, 3.2.P.5", affectedSkus: "AMC-625-14",
      artworkImpact: false, stockImpact: "No stock impact until approval.",
      lawfulImplementationPoint: "on_approval", internalQcReviewed: true, firstValidationAccepted: true,
    },
  },
  {
    n: 6, processType: "variation", pathway: "minor",
    title: "Shelf-life extension 24 → 36 months — Panadex 500",
    product: "Panadex 500", manufacturer: "Cipla Ltd", owner: "Alaska",
    stageIndex: 3, stage: "Awaiting supporting documents", openedDaysAgo: 33,
    stageDaysAgo: 14, priority: "routine", status: "active", internalDueIn: 5,
    party: "manufacturer",
    extra: { affectedDossierSections: "3.2.P.8", affectedSkus: "PDX-500-1000", artworkImpact: true, lawfulImplementationPoint: "on_approval" },
  },
  {
    n: 7, processType: "variation", pathway: "notification",
    title: "Secondary packaging text update — Azimed Susp",
    product: "Azimed Susp", manufacturer: "Sandoz GmbH", owner: "Tariro",
    stageIndex: 11, stage: "Implemented", openedDaysAgo: 58, stageDaysAgo: 4,
    priority: "routine", status: "active", submittedDaysAgo: 26,
    extra: {
      lawfulImplementationPoint: "on_acknowledgement", acknowledgementAt: undefined,
      artworkImpact: true, affectedSkus: "AZM-200-30", internalQcReviewed: true,
      stockImpact: "New artwork applies to batches packed after implementation.",
    },
  },
  {
    n: 8, processType: "exemption", pathway: "patient",
    title: "Named-patient access — Nusinersen 12 mg",
    product: "Nusinersen 12 mg", manufacturer: "Biogen Idec", owner: "Aman",
    stageIndex: 8, stage: "Decision received", openedDaysAgo: 27, stageDaysAgo: 3,
    priority: "critical", status: "active", submittedDaysAgo: 12, decisionDaysAgo: 3,
    outcome: "Approved — 4 vials",
    extra: {
      sensitive: true, requesterName: "Princess Marina Hospital — Paediatrics",
      patientOrInstitutionRef: "PMH/NP/2026/017", justification: "No registered alternative available in Botswana.",
      requestedQuantity: 6, approvedQuantity: 4, separateImportPermitRequired: true,
      reconciliationStatus: "in_progress", importedQuantity: 4, receivedQuantity: 4, suppliedQuantity: 2,
      internalQcReviewed: true, firstValidationAccepted: true,
    },
  },
  {
    n: 9, processType: "exemption", pathway: "institutional",
    title: "Consignment exemption — Oxytocin 10 IU/mL (tender supply)",
    product: "Oxytocin 10 IU/mL", manufacturer: "Rotexmedica GmbH", owner: "Alaska",
    stageIndex: 6, stage: "Submitted", openedDaysAgo: 19, stageDaysAgo: 8,
    priority: "high", status: "active", regulatoryDueIn: 9, submittedDaysAgo: 8,
    extra: {
      requesterName: "Central Medical Stores", requestedQuantity: 20000,
      justification: "Registered supplier stock-out; national tender obligation.",
      separateImportPermitRequired: true, reconciliationStatus: "not_started",
      internalQcReviewed: true, firstValidationAccepted: true,
    },
  },
  {
    n: 10, processType: "exemption", pathway: "sample",
    title: "Registration samples — Glarvia 100 pens",
    product: "Glarvia 100", manufacturer: "Biocon Biologics", owner: "Tariro",
    stageIndex: 2, stage: "Supporting documents requested", openedDaysAgo: 11,
    stageDaysAgo: 7, priority: "routine", status: "active", internalDueIn: -2,
    party: "manufacturer",
    extra: { requestedQuantity: 10, justification: "Samples required for laboratory verification." },
  },
  {
    n: 11, processType: "registration", pathway: "notification",
    title: "Sodium chloride 0.9% irrigation — notification",
    product: "NormaSal 0.9%", manufacturer: "Fresenius Kabi", owner: "Aman",
    stageIndex: 15, stage: "Closed", openedDaysAgo: 240, stageDaysAgo: 30,
    priority: "routine", status: "closed", submittedDaysAgo: 120, decisionDaysAgo: 40,
    outcome: "Approved", extra: { internalQcReviewed: true, firstValidationAccepted: true, bomraReference: "BoMRA/NT/2025/0904" },
  },
  {
    n: 12, processType: "variation", pathway: "major",
    title: "API supplier change — Glarvia 100",
    product: "Glarvia 100", manufacturer: "Biocon Biologics", owner: "Alaska",
    stageIndex: 1, stage: "Impact assessment", openedDaysAgo: 8, stageDaysAgo: 2,
    priority: "high", status: "active", internalDueIn: 6,
    extra: { affectedDossierSections: "3.2.S.2", lawfulImplementationPoint: "on_approval" },
  },
];

export function buildRegulatorySeed(nowMs: number): RegulatoryState {
  const holidays = [...DEFAULT_HOLIDAYS_2026];
  const sla = defaultSlaRules(day(nowMs - 365 * DAY));

  const cases: RegulatoryCase[] = [];
  const stageEvents: StageEvent[] = [];
  const clocks: ClockPeriod[] = [];
  const queries: RegulatoryQuery[] = [];
  const documents: DocumentRecord[] = [];
  const tasks: RegTask[] = [];
  const comments: RegComment[] = [];
  const decisions: DecisionRecord[] = [];
  const audit: AuditEvent[] = [];

  for (const s of SPECS) {
    const id = `RC-${String(s.n).padStart(3, "0")}`;
    const openedAt = iso(nowMs - s.openedDaysAgo * DAY);
    const stageStartedAt = iso(nowMs - s.stageDaysAgo * DAY);
    const party = s.party ?? defaultPartyForStage(s.stage);
    const pathwayLabel = PATHWAYS[s.processType].find((p) => p.key === s.pathway)?.label ?? s.pathway;

    const c: RegulatoryCase = {
      id,
      caseNumber: `${s.processType.slice(0, 3).toUpperCase()}-2026-${String(s.n).padStart(3, "0")}`,
      processType: s.processType,
      subtypeOrPathway: s.pathway,
      title: s.title,
      productName: s.product,
      innOrGenericName: s.inn,
      strength: s.strength,
      dosageForm: s.form,
      packSize: s.pack,
      manufacturerName: s.manufacturer,
      supplierName: s.supplier,
      priority: s.priority,
      caseOwnerId: s.owner,
      currentActionOwnerId: party === "cospharm" ? s.owner : undefined,
      currentResponsibleParty: party,
      currentStage: s.stage,
      status: s.status,
      openedAt,
      stageStartedAt,
      internalDueAt:
        s.internalDueIn !== undefined
          ? s.internalDueIn >= 0
            ? addWorkingDays(day(nowMs), s.internalDueIn, holidays)
            : day(nowMs + s.internalDueIn * DAY)
          : undefined,
      regulatoryDueAt:
        s.regulatoryDueIn !== undefined ? addWorkingDays(day(nowMs), s.regulatoryDueIn, holidays) : undefined,
      actualSubmissionAt: s.submittedDaysAgo !== undefined ? day(nowMs - s.submittedDaysAgo * DAY) : undefined,
      acknowledgementAt:
        s.submittedDaysAgo !== undefined ? day(nowMs - (s.submittedDaysAgo - 2) * DAY) : undefined,
      decisionAt: s.decisionDaysAgo !== undefined ? day(nowMs - s.decisionDaysAgo * DAY) : undefined,
      outcome: s.outcome,
      nextAction:
        party === "cospharm"
          ? `Progress "${s.stage}" and record evidence`
          : party === "bomra"
            ? "Await BoMRA feedback and monitor deadline"
            : "Chase manufacturer for outstanding items",
      nextMilestone: pathwayLabel,
      createdAt: openedAt,
      updatedAt: stageStartedAt,
      ...s.extra,
    };
    cases.push(c);

    // Stage history: a compressed but truthful trail up to the current stage.
    const stageList = stagesForSpec(s.processType);
    const span = Math.max(1, s.openedDaysAgo - s.stageDaysAgo);
    for (let i = 0; i <= s.stageIndex; i++) {
      const at = iso(nowMs - (s.openedDaysAgo - Math.round((span * i) / Math.max(1, s.stageIndex))) * DAY);
      const toStage = stageList[i] ?? s.stage;
      const p = defaultPartyForStage(toStage);
      stageEvents.push({
        id: `${id}-se-${i}`,
        caseId: id,
        fromStage: i === 0 ? undefined : stageList[i - 1],
        toStage,
        actor: s.owner,
        ownerId: s.owner,
        responsibleParty: p,
        at: i === s.stageIndex ? stageStartedAt : at,
        onTime: i % 4 !== 3,
      });
      clocks.push({
        id: `${id}-ck-${i}`,
        caseId: id,
        party: p,
        stage: toStage,
        startedAt: i === s.stageIndex ? stageStartedAt : at,
        endedAt:
          i === s.stageIndex
            ? undefined
            : iso(nowMs - (s.openedDaysAgo - Math.round((span * (i + 1)) / Math.max(1, s.stageIndex))) * DAY),
      });
    }

    // Tasks
    tasks.push({
      id: `${id}-t1`,
      caseId: id,
      title: "Complete internal gap analysis checklist",
      kind: "internal",
      assignedToId: s.owner,
      dueAt: day(nowMs - Math.round(s.openedDaysAgo / 2) * DAY),
      status: "done",
      completedAt: day(nowMs - Math.round(s.openedDaysAgo / 2) * DAY),
      completedOnTime: s.n % 5 !== 0,
    });
    if (s.status === "active") {
      tasks.push({
        id: `${id}-t2`,
        caseId: id,
        title: s.processType === "exemption" ? "Confirm quantity reconciliation evidence" : "Prepare next submission item",
        kind: s.processType === "registration" && s.stageIndex === 5 ? "payment" : "internal",
        assignedToId: s.owner,
        dueAt: addWorkingDays(day(nowMs), s.n % 3 === 0 ? -2 : 4, holidays),
        status: "open",
      });
    }

    // Documents
    documents.push({
      id: `${id}-d1`,
      caseId: id,
      documentType: s.processType === "exemption" ? "Application form" : "Dossier module 1",
      name: `${c.caseNumber}-module1.pdf`,
      version: 1,
      uploadedBy: s.owner,
      uploadedAt: iso(nowMs - (s.openedDaysAgo - 2) * DAY),
      reviewStatus: "reviewed",
      approvalStatus: s.actualSubmissionAt ? "submitted" : "approved",
      effectiveDate: day(nowMs - (s.openedDaysAgo - 2) * DAY),
      stage: stageList[0],
    });

    comments.push({
      id: `${id}-c1`,
      caseId: id,
      author: s.owner,
      at: stageStartedAt,
      body:
        party === "manufacturer"
          ? "Reminder sent to the manufacturer; response still outstanding."
          : "Stage progressed — evidence filed against the case record.",
    });

    if (s.decisionDaysAgo !== undefined) {
      decisions.push({
        id: `${id}-dec`,
        caseId: id,
        outcome: (s.outcome ?? "").toLowerCase().includes("condition") ? "conditionally_approved" : "approved",
        decidedAt: day(nowMs - s.decisionDaysAgo * DAY),
        reference: c.bomraReference,
        conditions: c.conditions,
        recordedBy: s.owner,
      });
    }

    audit.push({
      id: `${id}-a1`,
      caseId: id,
      at: openedAt,
      actor: s.owner,
      type: "case.created",
      summary: `Case ${c.caseNumber} opened — ${c.title}`,
    });
    audit.push({
      id: `${id}-a2`,
      caseId: id,
      at: stageStartedAt,
      actor: s.owner,
      type: "stage.changed",
      summary: `Stage set to "${s.stage}" (responsible party: ${party})`,
    });
  }

  // Query cycles
  const q = (
    n: number,
    caseId: string,
    cycle: number,
    category: RegulatoryQuery["category"],
    severity: RegulatoryQuery["severity"],
    receivedDaysAgo: number,
    dueIn: number,
    status: RegulatoryQuery["status"],
    assignee: string,
    external: boolean,
  ): RegulatoryQuery => ({
    id: `RQ-${String(n).padStart(3, "0")}`,
    caseId,
    cycleNumber: cycle,
    queryNumber: `${caseId}/Q${cycle}`,
    category,
    severity,
    receivedAt: day(nowMs - receivedDaysAgo * DAY),
    regulatorDueAt: dueIn >= 0 ? addWorkingDays(day(nowMs), dueIn, holidays) : day(nowMs + dueIn * DAY),
    internalDueAt: dueIn >= 3 ? addWorkingDays(day(nowMs), dueIn - 3, holidays) : day(nowMs + (dueIn - 1) * DAY),
    assignedToId: assignee,
    externalContributionRequired: external,
    sentToExternalAt: external ? day(nowMs - Math.max(1, receivedDaysAgo - 2) * DAY) : undefined,
    externalResponseAt: external && status !== "waiting_external" ? day(nowMs - 3 * DAY) : undefined,
    submittedAt: ["submitted", "accepted"].includes(status) ? day(nowMs - 2 * DAY) : undefined,
    status,
    responseSummary:
      status === "open" ? undefined : "Response compiled with manufacturer input and QC-checked before submission.",
  });

  queries.push(
    q(1, "RC-001", 1, "quality", "major", 18, 4, "internal_review", "Tariro", true),
    q(2, "RC-001", 2, "labelling", "minor", 6, 9, "open", "Alaska", false),
    q(3, "RC-005", 1, "gmp", "critical", 12, -1, "waiting_external", "Aman", true),
    q(4, "RC-009", 1, "administrative", "minor", 5, 6, "submitted", "Alaska", false),
    q(5, "RC-004", 1, "efficacy", "major", 60, -30, "accepted", "Tariro", true),
    q(6, "RC-008", 1, "payment", "minor", 9, 2, "submitted", "Aman", false),
  );

  for (const item of queries) {
    audit.push({
      id: `${item.id}-a`,
      caseId: item.caseId,
      at: item.receivedAt,
      actor: item.assignedToId,
      type: "query.created",
      summary: `${item.queryNumber} received (${item.category}, ${item.severity})`,
    });
  }

  audit.sort((a, b) => (a.at < b.at ? 1 : -1));

  return { cases, stageEvents, clocks, queries, documents, tasks, comments, decisions, audit, sla, holidays };
}

function stagesForSpec(p: ProcessType): readonly string[] {
  // local copy to avoid a circular import at module init
  const reg = [
    "Opportunity / route assessment", "Dossier received", "Internal gap analysis",
    "Awaiting manufacturer corrections", "Final dossier QC", "Finance / payment readiness",
    "Ready for submission", "Submitted", "BoMRA validation / screening", "Technical assessment",
    "Query response", "Decision pending", "Approved / conditionally approved",
    "Rejected / withdrawn", "Launch-readiness handover", "Closed",
  ];
  const varn = [
    "Change received", "Impact assessment", "Classification confirmed", "Awaiting supporting documents",
    "Submission pack preparation", "Internal QC", "Submitted", "Screening / assessment", "Query response",
    "Decision received", "Implementation planning", "Implemented", "Effectiveness check",
    "Closed / rejected / withdrawn",
  ];
  const exm = [
    "Request received", "Exemption category / eligibility review", "Supporting documents requested",
    "Application pack preparation", "Internal QC", "Payment / submission readiness", "Submitted",
    "Screening / query", "Decision received", "Import/supply authorisation controls",
    "Quantity reconciliation", "Closed / expired / rejected",
  ];
  return p === "registration" ? reg : p === "variation" ? varn : exm;
}