import { ALL_CLIENT_RECORDS, type ClientRecord } from "./mockClients";

export type KycStatus = "VERIFIED" | "PENDING" | "EXPIRED" | "MISSING" | "FLAGGED";
export type RiskRating = "LOW" | "MEDIUM" | "HIGH";

export type KycDocument = {
  name: string;
  expiry?: string; // YYYY-MM-DD
  present: boolean;
};

export type KycRecord = {
  customer: string;
  type: ClientRecord["type"];
  phone: string | null;
  status: KycStatus;
  risk: RiskRating;
  documents: KycDocument[];
  lastReviewed?: string;
  note?: string;
};

const KEY = "cospharm_kyc_v1";

function hash(s: string) {
  let h = 0;
  for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) % 9973;
  return h;
}

const DOC_NAMES = ["Trading licence", "Pharmacy/wholesale permit", "Tax clearance", "Signed supply agreement"];

function isoPlusDays(days: number) {
  return new Date(Date.now() + days * 86_400_000).toISOString().slice(0, 10);
}

/** Deterministic seed so the register is stable between renders and reloads. */
export function seedKyc(records: ClientRecord[] = ALL_CLIENT_RECORDS): KycRecord[] {
  return records.map((c) => {
    const h = hash(c.name);
    const bucket = h % 10;
    const status: KycStatus =
      bucket <= 5 ? "VERIFIED" : bucket === 6 ? "PENDING" : bucket === 7 ? "EXPIRED" : bucket === 8 ? "MISSING" : "FLAGGED";
    const risk: RiskRating = status === "FLAGGED" ? "HIGH" : status === "VERIFIED" ? (h % 4 === 0 ? "MEDIUM" : "LOW") : "MEDIUM";
    const documents: KycDocument[] = DOC_NAMES.map((name, i) => {
      const present = status === "MISSING" ? i < 1 : status === "PENDING" ? i < 3 : true;
      const offset = status === "EXPIRED" && i === 0 ? -((h % 60) + 1) : ((h + i * 37) % 400) - 30;
      return { name, present, expiry: present ? isoPlusDays(offset) : undefined };
    });
    return {
      customer: c.name,
      type: c.type,
      phone: c.phone,
      status,
      risk,
      documents,
      lastReviewed: isoPlusDays(-((h % 120) + 5)),
      note:
        status === "FLAGGED"
          ? "Flagged during review — confirm ownership and payment history before releasing orders."
          : status === "EXPIRED"
            ? "At least one document has lapsed."
            : undefined,
    };
  });
}

export function loadKyc(): KycRecord[] {
  if (typeof window === "undefined") return seedKyc();
  try {
    const raw = window.localStorage.getItem(KEY);
    const parsed = raw ? (JSON.parse(raw) as KycRecord[]) : null;
    return parsed?.length ? parsed : seedKyc();
  } catch {
    return seedKyc();
  }
}

export function saveKyc(list: KycRecord[]) {
  if (typeof window === "undefined") return;
  try { window.localStorage.setItem(KEY, JSON.stringify(list)); } catch { /* ignore */ }
}

export const KYC_LABEL: Record<KycStatus, string> = {
  VERIFIED: "Verified",
  PENDING: "Pending",
  EXPIRED: "Expired",
  MISSING: "Missing docs",
  FLAGGED: "Flagged",
};

export function kycTone(status: KycStatus): "green" | "yellow" | "red" {
  if (status === "VERIFIED") return "green";
  if (status === "PENDING") return "yellow";
  return "red";
}

/** Orders for these customers must be blocked or escalated. */
export function isBlocking(status: KycStatus) {
  return status === "FLAGGED" || status === "EXPIRED" || status === "MISSING";
}

export function daysUntil(iso?: string) {
  if (!iso) return null;
  const t = new Date(iso).getTime();
  if (isNaN(t)) return null;
  return Math.round((t - Date.now()) / 86_400_000);
}

export function expiringDocuments(list: KycRecord[], withinDays = 60) {
  const out: { customer: string; doc: KycDocument; days: number }[] = [];
  for (const r of list) {
    for (const d of r.documents) {
      const days = daysUntil(d.expiry);
      if (d.present && days !== null && days <= withinDays) out.push({ customer: r.customer, doc: d, days });
    }
  }
  return out.sort((a, b) => a.days - b.days);
}