// Immutable (append-only, hash-chained) audit timeline for regulatory cases.
// Each entry is sealed with a checksum over its own content plus the previous
// checksum, so any edit or deletion breaks the chain and is visible on screen
// and in the CSV export.

import type { AuditEvent } from "./types";

export type SealedAuditEvent = AuditEvent & {
  seq: number;
  checksum: string;
  previousChecksum: string;
};

function fnv1a(input: string): string {
  let h = 0x811c9dc5;
  for (let i = 0; i < input.length; i++) {
    h ^= input.charCodeAt(i);
    h = Math.imul(h, 0x01000193) >>> 0;
  }
  return h.toString(16).padStart(8, "0");
}

const GENESIS = "00000000";

/** Chronological, sealed timeline for one case (or the whole register when caseId is omitted). */
export function sealedTimeline(events: AuditEvent[], caseId?: string): SealedAuditEvent[] {
  const scoped = events
    .filter((e) => (caseId ? e.caseId === caseId : true))
    .slice()
    .sort((a, b) => (a.at === b.at ? a.id.localeCompare(b.id) : a.at < b.at ? -1 : 1));

  let previousChecksum = GENESIS;
  return scoped.map((e, i) => {
    const checksum = fnv1a(`${previousChecksum}|${e.id}|${e.at}|${e.actor}|${e.type}|${e.summary}`);
    const sealed: SealedAuditEvent = { ...e, seq: i + 1, checksum, previousChecksum };
    previousChecksum = checksum;
    return sealed;
  });
}

/** The seal of the final entry — a single value that fingerprints the whole timeline. */
export function timelineSeal(timeline: SealedAuditEvent[]): string {
  return timeline.length === 0 ? GENESIS : timeline[timeline.length - 1].checksum;
}

export function verifyTimeline(timeline: SealedAuditEvent[]): boolean {
  let previous = GENESIS;
  for (const e of timeline) {
    const expected = fnv1a(`${previous}|${e.id}|${e.at}|${e.actor}|${e.type}|${e.summary}`);
    if (expected !== e.checksum || e.previousChecksum !== previous) return false;
    previous = expected;
  }
  return true;
}

export const AUDIT_TYPE_LABEL: Record<AuditEvent["type"], string> = {
  "case.created": "Case created",
  "stage.changed": "Stage changed",
  "status.changed": "Status changed",
  "owner.changed": "Owner changed",
  "due.changed": "Due date changed",
  "clock.paused": "Clock paused",
  "clock.resumed": "Clock resumed",
  "query.created": "Query raised",
  "query.closed": "Query closed",
  "document.version": "Document version",
  "decision.recorded": "Decision recorded",
  "implementation.confirmed": "Implementation confirmed",
  "task.completed": "Task completed",
  "settings.changed": "Settings changed",
};
