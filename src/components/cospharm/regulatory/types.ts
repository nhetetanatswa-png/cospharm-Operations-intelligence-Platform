// Regulatory Operations — data model.
// Demonstration environment: all records live in browser storage.

export type ProcessType = "registration" | "variation" | "exemption";

export type ResponsibleParty = "cospharm" | "manufacturer" | "bomra" | "other_external";

export type CaseStatus =
  | "draft"
  | "active"
  | "paused"
  | "approved"
  | "rejected"
  | "withdrawn"
  | "closed";

export type Rag = "green" | "amber" | "red" | "blue" | "purple" | "grey";

export type Priority = "routine" | "high" | "critical";

export type RegulatoryCase = {
  id: string;
  caseNumber: string;
  processType: ProcessType;
  subtypeOrPathway: string;
  title: string;
  productName: string;
  innOrGenericName?: string;
  strength?: string;
  dosageForm?: string;
  packSize?: string;
  manufacturerId?: string;
  manufacturerName: string;
  supplierName?: string;
  priority: Priority;
  caseOwnerId: string;
  currentActionOwnerId?: string;
  currentResponsibleParty: ResponsibleParty;
  currentStage: string;
  status: CaseStatus;
  openedAt: string;
  stageStartedAt: string;
  internalDueAt?: string;
  regulatoryDueAt?: string;
  targetSubmissionAt?: string;
  actualSubmissionAt?: string;
  acknowledgementAt?: string;
  decisionAt?: string;
  implementationAt?: string;
  expiryAt?: string;
  bomraReference?: string;
  submissionChannel?: string;
  paymentReference?: string;
  outcome?: string;
  conditions?: string;
  nextAction: string;
  nextMilestone?: string;
  createdAt: string;
  updatedAt: string;

  /** Variation-specific */
  proposedImplementationAt?: string;
  lawfulImplementationPoint?: "on_approval" | "on_acknowledgement" | "immediate";
  affectedDossierSections?: string;
  affectedSkus?: string;
  artworkImpact?: boolean;
  stockImpact?: string;

  /** Exemption-specific (restricted fields) */
  requesterName?: string;
  patientOrInstitutionRef?: string;
  sensitive?: boolean;
  justification?: string;
  requestedQuantity?: number;
  approvedQuantity?: number;
  importedQuantity?: number;
  receivedQuantity?: number;
  suppliedQuantity?: number;
  separateImportPermitRequired?: boolean;
  validityUntil?: string;
  reconciliationStatus?: "not_started" | "in_progress" | "reconciled" | "variance";

  /** QC / first-pass tracking */
  internalQcReturned?: boolean;
  internalQcReviewed?: boolean;
  firstValidationAccepted?: boolean;
};

export type StageEvent = {
  id: string;
  caseId: string;
  fromStage?: string;
  toStage: string;
  actor: string;
  ownerId?: string;
  responsibleParty: ResponsibleParty;
  at: string;
  note?: string;
  onTime?: boolean;
  dueAt?: string;
};

export type ClockPeriod = {
  id: string;
  caseId: string;
  party: ResponsibleParty;
  startedAt: string;
  endedAt?: string;
  stage: string;
  paused?: boolean;
};

export type QueryCategory =
  | "administrative"
  | "quality"
  | "safety"
  | "efficacy"
  | "gmp"
  | "labelling"
  | "payment"
  | "other";

export type RegulatoryQuery = {
  id: string;
  caseId: string;
  cycleNumber: number;
  queryNumber: string;
  category: QueryCategory;
  severity: "minor" | "major" | "critical";
  receivedAt: string;
  regulatorDueAt: string;
  internalDueAt: string;
  assignedToId: string;
  externalContributionRequired: boolean;
  sentToExternalAt?: string;
  externalResponseAt?: string;
  internalQcAt?: string;
  submittedAt?: string;
  status: "open" | "waiting_external" | "internal_review" | "submitted" | "accepted" | "superseded";
  responseSummary?: string;
};

export type DocumentRecord = {
  id: string;
  caseId: string;
  queryId?: string;
  stage?: string;
  documentType: string;
  name: string;
  version: number;
  effectiveDate?: string;
  uploadedBy: string;
  uploadedAt: string;
  reviewStatus: "pending" | "reviewed" | "returned";
  approvalStatus: "draft" | "approved" | "submitted" | "superseded";
  supersededById?: string;
};

export type RegTask = {
  id: string;
  caseId: string;
  title: string;
  kind: "internal" | "payment" | "quality" | "implementation";
  assignedToId: string;
  dueAt?: string;
  status: "open" | "done";
  completedAt?: string;
  completedOnTime?: boolean;
};

export type RegComment = {
  id: string;
  caseId: string;
  author: string;
  at: string;
  body: string;
};

export type DecisionRecord = {
  id: string;
  caseId: string;
  outcome: "approved" | "conditionally_approved" | "rejected" | "withdrawn" | "objection" | "acknowledged";
  decidedAt: string;
  reference?: string;
  conditions?: string;
  recordedBy: string;
};

export type AuditEvent = {
  id: string;
  caseId?: string;
  at: string;
  actor: string;
  type:
    | "case.created"
    | "stage.changed"
    | "status.changed"
    | "owner.changed"
    | "due.changed"
    | "clock.paused"
    | "clock.resumed"
    | "query.created"
    | "query.closed"
    | "document.version"
    | "decision.recorded"
    | "implementation.confirmed"
    | "task.completed"
    | "settings.changed";
  summary: string;
};

export type SlaRule = {
  id: string;
  processType: ProcessType;
  key: string;
  label: string;
  workingDays: number;
  effectiveFrom: string;
  version: number;
};

export type RegulatoryState = {
  cases: RegulatoryCase[];
  stageEvents: StageEvent[];
  clocks: ClockPeriod[];
  queries: RegulatoryQuery[];
  documents: DocumentRecord[];
  tasks: RegTask[];
  comments: RegComment[];
  decisions: DecisionRecord[];
  audit: AuditEvent[];
  sla: SlaRule[];
  holidays: string[];
};