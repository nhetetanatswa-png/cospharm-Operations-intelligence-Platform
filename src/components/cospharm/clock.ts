// Hydration-safe clock helpers.
//
// The server (Cloudflare Worker / prerender) does not share the browser's clock —
// module-scope `Date.now()` can even evaluate to 0 there, which is where the
// "1969 / 1970" dates came from. Everything time-dependent in this app therefore
// resolves through `useHydratedNow()`, which returns `null` until after hydration.

import { useEffect, useState } from "react";

/** Returns the current epoch ms, but only after hydration. `null` on the server
 *  and on the very first client render, so SSR and client markup always agree. */
export function useHydratedNow(intervalMs = 60_000): number | null {
  const [now, setNow] = useState<number | null>(null);
  useEffect(() => {
    setNow(Date.now());
    if (!intervalMs) return;
    const id = setInterval(() => setNow(Date.now()), intervalMs);
    return () => clearInterval(id);
  }, [intervalMs]);
  return now;
}

export function isoDay(ms: number, offsetDays = 0): string {
  const d = new Date(ms + offsetDays * 86_400_000);
  return d.toISOString().slice(0, 10);
}

/** "Thu 6 Aug 2026" — fixed locale so the string never depends on the viewer. */
export function formatDay(iso?: string): string {
  if (!iso) return "—";
  const d = new Date(iso.length <= 10 ? `${iso}T00:00:00` : iso);
  if (!Number.isFinite(d.getTime()) || d.getFullYear() < 2000) return "—";
  return d.toLocaleDateString("en-GB", { weekday: "short", day: "numeric", month: "short", year: "numeric" });
}

export function formatTime(iso?: string): string {
  if (!iso) return "—";
  const d = new Date(iso);
  if (!Number.isFinite(d.getTime()) || d.getFullYear() < 2000) return "—";
  return d.toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit" });
}

/** Complete relative phrase — never renders a dangling "— ago". */
export function formatRelative(iso: string | undefined, now: number | null): string {
  if (!iso) return "at an unrecorded time";
  const t = new Date(iso).getTime();
  if (!Number.isFinite(t) || new Date(t).getFullYear() < 2000) return "at an unrecorded time";
  if (now === null) return "recently";
  const mins = Math.round((now - t) / 60_000);
  if (mins < 0) return "just now";
  if (mins < 1) return "moments ago";
  if (mins < 60) return `${mins} ${plural(mins, "minute")} ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h ${mins % 60}m ago`;
  const days = Math.floor(hours / 24);
  return `${days} ${plural(days, "day")} ago`;
}

/** Correct English pluralisation — "1 delivery" / "2 deliveries". */
export function plural(count: number, singular: string, pluralForm?: string): string {
  if (count === 1) return singular;
  if (pluralForm) return pluralForm;
  if (/[^aeiou]y$/i.test(singular)) return `${singular.slice(0, -1)}ies`;
  if (/(s|x|z|ch|sh)$/i.test(singular)) return `${singular}es`;
  return `${singular}s`;
}

/** "3 deliveries" */
export function countLabel(count: number, singular: string, pluralForm?: string): string {
  return `${count} ${plural(count, singular, pluralForm)}`;
}

/** Renders unavailable metrics honestly instead of substituting zero. */
export const NO_DATA = "Not enough data";
