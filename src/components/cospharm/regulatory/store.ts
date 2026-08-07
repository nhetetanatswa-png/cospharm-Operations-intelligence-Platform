import { useCallback, useEffect, useMemo, useState } from "react";
import { buildRegulatorySeed } from "./seed";
import { defaultPartyForStage } from "./logic";
import { addWorkingDays } from "./workdays";
import type {
  AuditEvent,
  DecisionRecord,
  DocumentRecord,
  RegComment,
  RegTask,
  RegulatoryCase,
  RegulatoryQuery,
  RegulatoryState,
  ResponsibleParty,
  SlaRule,
} from "./types";

const KEY = "cospharm.regulatory.v1";

function load(nowMs: number): RegulatoryState {
  if (typeof window !== "undefined") {
    try {
      const raw = window.localStorage.getItem(KEY);
      if (raw) {
        const parsed = JSON.parse(raw) as RegulatoryState;
        if (parsed?.cases?.length) return parsed;
      }
    } catch {
      /* fall through to a fresh demo dataset */
    }
  }
  return buildRegulatorySeed(nowMs);
}

let seq = 0;
const uid = (p: string) => `${p}-${Date.now().toString(36)}-${(seq++).toString(36)}`;

export type RegulatoryStore = ReturnType<typeof useRegulatoryStore>;

export function useRegulatoryStore(nowMs: number | null, actor: string) {
  const [state, setState] = useState<RegulatoryState | null>(null);

  useEffect(() => {
    if (nowMs === null || state !== null) return;
    setState(load(nowMs));
  }, [nowMs, state]);

  useEffect(() => {
    if (!state || typeof window === "undefined") return;
    try {
      window.localStorage.setItem(KEY, JSON.stringify(state));
    } catch {
      /* storage full or unavailable — the demo continues in memory */
    }
  }, [state]);

  const mutate = useCallback(
    (fn: (s: RegulatoryState) => RegulatoryState) => setState((s) => (s ? fn(s) : s)),
    [],
  );

  const logged = useCallback(
    (
      s: RegulatoryState,
      caseId: string | undefined,
      type: AuditEvent["type"],
      summary: string,
      at: string,
    ): AuditEvent[] => [{ id: uid("ae"), caseId, at, actor, type, summary }, ...s.audit],
    [actor],
  );

  const api = useMemo(() => {
    const nowIso = () => new Date(nowMs ?? Date.now()).toISOString();

    return {
      reset: () => setState(buildRegulatorySeed(nowMs ?? Date.now())),

      createCase(input: Partial<RegulatoryCase> & Pick<RegulatoryCase, "processType" | "title" | "productName" | "manufacturerName" | "subtypeOrPathway" | "caseOwnerId">) {
        mutate((s) => {
          const at = nowIso();
          const n = s.cases.length + 1;
          const stage = input.currentStage ?? defaultFirstStage(input.processType);
          const party = defaultPartyForStage(stage);
          const c: RegulatoryCase = {
            id: uid("case"),
            caseNumber: `${input.processType.slice(0, 3).toUpperCase()}-2026-${String(100 + n)}`,
            priority: "routine",
            currentResponsibleParty: party,
            currentStage: stage,
            status: "active",
            openedAt: at,
            stageStartedAt: at,
            nextAction: `Progress "${stage}"`,
            createdAt: at,
            updatedAt: at,
            currentActionOwnerId: input.caseOwnerId,
            ...input,
          } as RegulatoryCase;
          return {
            ...s,
            cases: [c, ...s.cases],
            stageEvents: [
              { id: uid("se"), caseId: c.id, toStage: stage, actor, ownerId: c.caseOwnerId, responsibleParty: party, at },
              ...s.stageEvents,
            ],
            clocks: [{ id: uid("ck"), caseId: c.id, party, stage, startedAt: at }, ...s.clocks],
            audit: logged(s, c.id, "case.created", `Case ${c.caseNumber} opened — ${c.title}`, at),
          };
        });
      },

      changeStage(caseId: string, toStage: string, note?: string, partyOverride?: ResponsibleParty) {
        mutate((s) => {
          const c = s.cases.find((x) => x.id === caseId);
          if (!c) return s;
          const at = nowIso();
          const party = partyOverride ?? defaultPartyForStage(toStage);
          return {
            ...s,
            cases: s.cases.map((x) =>
              x.id === caseId
                ? {
                    ...x,
                    currentStage: toStage,
                    stageStartedAt: at,
                    currentResponsibleParty: party,
                    currentActionOwnerId: party === "cospharm" ? x.caseOwnerId : undefined,
                    actualSubmissionAt:
                      toStage.toLowerCase().startsWith("submitted") && !x.actualSubmissionAt
                        ? at.slice(0, 10)
                        : x.actualSubmissionAt,
                    implementationAt: toStage === "Implemented" ? at.slice(0, 10) : x.implementationAt,
                    updatedAt: at,
                  }
                : x,
            ),
            stageEvents: [
              { id: uid("se"), caseId, fromStage: c.currentStage, toStage, actor, ownerId: c.caseOwnerId, responsibleParty: party, at, note },
              ...s.stageEvents,
            ],
            clocks: [
              { id: uid("ck"), caseId, party, stage: toStage, startedAt: at },
              ...s.clocks.map((p) => (p.caseId === caseId && !p.endedAt ? { ...p, endedAt: at } : p)),
            ],
            audit: logged(s, caseId, "stage.changed", `Stage "${c.currentStage}" → "${toStage}" (${party})`, at),
          };
        });
      },

      assign(caseId: string, owner: string) {
        mutate((s) => {
          const at = nowIso();
          return {
            ...s,
            cases: s.cases.map((x) =>
              x.id === caseId ? { ...x, caseOwnerId: owner, currentActionOwnerId: owner, updatedAt: at } : x,
            ),
            audit: logged(s, caseId, "owner.changed", `Case owner set to ${owner}`, at),
          };
        });
      },

      setDue(caseId: string, field: "internalDueAt" | "regulatoryDueAt", value: string) {
        mutate((s) => {
          const at = nowIso();
          return {
            ...s,
            cases: s.cases.map((x) => (x.id === caseId ? { ...x, [field]: value, updatedAt: at } : x)),
            audit: logged(
              s,
              caseId,
              "due.changed",
              `${field === "internalDueAt" ? "Internal" : "Regulatory"} due date set to ${value}`,
              at,
            ),
          };
        });
      },

      togglePause(caseId: string) {
        mutate((s) => {
          const c = s.cases.find((x) => x.id === caseId);
          if (!c) return s;
          const at = nowIso();
          const pausing = c.status !== "paused";
          return {
            ...s,
            cases: s.cases.map((x) => (x.id === caseId ? { ...x, status: pausing ? "paused" : "active", updatedAt: at } : x)),
            clocks: pausing
              ? s.clocks.map((p) => (p.caseId === caseId && !p.endedAt ? { ...p, endedAt: at } : p))
              : [{ id: uid("ck"), caseId, party: c.currentResponsibleParty, stage: c.currentStage, startedAt: at }, ...s.clocks],
            audit: logged(s, caseId, pausing ? "clock.paused" : "clock.resumed", pausing ? "Case paused — clocks stopped" : "Case resumed — clock restarted", at),
          };
        });
      },

      closeCase(caseId: string, status: RegulatoryCase["status"]) {
        mutate((s) => {
          const at = nowIso();
          return {
            ...s,
            cases: s.cases.map((x) => (x.id === caseId ? { ...x, status, updatedAt: at } : x)),
            clocks: s.clocks.map((p) => (p.caseId === caseId && !p.endedAt ? { ...p, endedAt: at } : p)),
            audit: logged(s, caseId, "status.changed", `Case status set to ${status}`, at),
          };
        });
      },

      recordDecision(caseId: string, d: Omit<DecisionRecord, "id" | "caseId" | "recordedBy">) {
        mutate((s) => {
          const at = nowIso();
          const approved = d.outcome === "approved" || d.outcome === "conditionally_approved";
          return {
            ...s,
            decisions: [{ id: uid("dec"), caseId, recordedBy: actor, ...d }, ...s.decisions],
            cases: s.cases.map((x) =>
              x.id === caseId
                ? {
                    ...x,
                    decisionAt: d.decidedAt,
                    outcome: d.outcome.replace(/_/g, " "),
                    conditions: d.conditions ?? x.conditions,
                    bomraReference: d.reference ?? x.bomraReference,
                    status: approved ? "approved" : d.outcome === "rejected" ? "rejected" : x.status,
                    updatedAt: at,
                  }
                : x,
            ),
            audit: logged(s, caseId, "decision.recorded", `Decision recorded: ${d.outcome.replace(/_/g, " ")}`, at),
          };
        });
      },

      recordSubmission(caseId: string, dateIso: string, channel: string, reference?: string) {
        mutate((s) => {
          const at = nowIso();
          return {
            ...s,
            cases: s.cases.map((x) =>
              x.id === caseId
                ? { ...x, actualSubmissionAt: dateIso, submissionChannel: channel, bomraReference: reference ?? x.bomraReference, currentResponsibleParty: "bomra", updatedAt: at }
                : x,
            ),
            clocks: [
              { id: uid("ck"), caseId, party: "bomra" as ResponsibleParty, stage: s.cases.find((x) => x.id === caseId)?.currentStage ?? "Submitted", startedAt: at },
              ...s.clocks.map((p) => (p.caseId === caseId && !p.endedAt ? { ...p, endedAt: at } : p)),
            ],
            audit: logged(s, caseId, "stage.changed", `Submission recorded (${channel}) on ${dateIso}`, at),
          };
        });
      },

      addQuery(input: Omit<RegulatoryQuery, "id" | "status"> & { status?: RegulatoryQuery["status"] }) {
        mutate((s) => {
          const at = nowIso();
          const q: RegulatoryQuery = { id: uid("rq"), status: input.status ?? "open", ...input };
          return {
            ...s,
            queries: [q, ...s.queries],
            audit: logged(s, q.caseId, "query.created", `${q.queryNumber} logged (${q.category}, ${q.severity})`, at),
          };
        });
      },

      updateQuery(id: string, patch: Partial<RegulatoryQuery>) {
        mutate((s) => {
          const at = nowIso();
          const q = s.queries.find((x) => x.id === id);
          return {
            ...s,
            queries: s.queries.map((x) => (x.id === id ? { ...x, ...patch } : x)),
            audit:
              patch.status && q
                ? logged(s, q.caseId, patch.status === "accepted" ? "query.closed" : "query.created", `${q.queryNumber} status → ${patch.status.replace(/_/g, " ")}`, at)
                : s.audit,
          };
        });
      },

      addDocument(input: Omit<DocumentRecord, "id" | "version" | "uploadedBy" | "uploadedAt"> & { supersedes?: string }) {
        mutate((s) => {
          const at = nowIso();
          const prior = input.supersedes ? s.documents.find((d) => d.id === input.supersedes) : undefined;
          const doc: DocumentRecord = {
            id: uid("doc"),
            version: (prior?.version ?? 0) + 1,
            uploadedBy: actor,
            uploadedAt: at,
            ...input,
          };
          return {
            ...s,
            documents: [
              doc,
              ...s.documents.map((d) => (d.id === prior?.id ? { ...d, approvalStatus: "superseded" as const, supersededById: doc.id } : d)),
            ],
            audit: logged(s, doc.caseId, "document.version", `${doc.name} v${doc.version} filed${prior ? ` (supersedes v${prior.version})` : ""}`, at),
          };
        });
      },

      addTask(input: Omit<RegTask, "id" | "status">) {
        mutate((s) => ({ ...s, tasks: [{ id: uid("tk"), status: "open", ...input }, ...s.tasks] }));
      },

      completeTask(id: string) {
        mutate((s) => {
          const at = nowIso();
          const t = s.tasks.find((x) => x.id === id);
          if (!t) return s;
          const onTime = !t.dueAt || at.slice(0, 10) <= t.dueAt;
          return {
            ...s,
            tasks: s.tasks.map((x) => (x.id === id ? { ...x, status: "done", completedAt: at, completedOnTime: onTime } : x)),
            audit: logged(s, t.caseId, t.kind === "implementation" ? "implementation.confirmed" : "task.completed", `${t.title} completed ${onTime ? "on time" : "late"}`, at),
          };
        });
      },

      addComment(caseId: string, body: string) {
        mutate((s) => {
          const c: RegComment = { id: uid("cm"), caseId, author: actor, at: nowIso(), body };
          return { ...s, comments: [c, ...s.comments] };
        });
      },

      updateSla(rule: SlaRule, workingDays: number, effectiveFrom: string) {
        mutate((s) => {
          const at = nowIso();
          const next: SlaRule = { ...rule, id: uid("sla"), workingDays, effectiveFrom, version: rule.version + 1 };
          return {
            ...s,
            sla: [next, ...s.sla],
            audit: logged(s, undefined, "settings.changed", `SLA "${rule.label}" (${rule.processType}) set to ${workingDays} working days from ${effectiveFrom} — v${next.version}`, at),
          };
        });
      },

      setHolidays(list: string[]) {
        mutate((s) => ({
          ...s,
          holidays: list,
          audit: logged(s, undefined, "settings.changed", `Public holiday calendar updated (${list.length} dates)`, nowIso()),
        }));
      },

      suggestDue(days: number) {
        const base = new Date(nowMs ?? Date.now()).toISOString().slice(0, 10);
        return addWorkingDays(base, days, state?.holidays ?? []);
      },
    };
  }, [mutate, logged, actor, nowMs, state?.holidays]);

  return { state, ...api };
}

function defaultFirstStage(p: RegulatoryCase["processType"]) {
  if (p === "registration") return "Opportunity / route assessment";
  if (p === "variation") return "Change received";
  return "Request received";
}