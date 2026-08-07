// Botswana working-day arithmetic. Public holidays are configurable (see Settings).

export const DEFAULT_HOLIDAYS_2026 = [
  "2026-01-01",
  "2026-01-02",
  "2026-04-03",
  "2026-04-06",
  "2026-05-01",
  "2026-05-14",
  "2026-07-01",
  "2026-07-20",
  "2026-07-21",
  "2026-09-30",
  "2026-10-01",
  "2026-12-25",
  "2026-12-26",
];

function dayIso(d: Date) {
  return d.toISOString().slice(0, 10);
}

export function isWorkingDay(iso: string, holidays: string[]): boolean {
  const d = new Date(`${iso}T00:00:00Z`);
  const wd = d.getUTCDay();
  if (wd === 0 || wd === 6) return false;
  return !holidays.includes(iso);
}

/** Inclusive of the start day, exclusive of the end day. Never negative. */
export function workingDaysBetween(fromIso: string, toIso: string, holidays: string[]): number {
  const start = new Date(`${fromIso.slice(0, 10)}T00:00:00Z`).getTime();
  const end = new Date(`${toIso.slice(0, 10)}T00:00:00Z`).getTime();
  if (!Number.isFinite(start) || !Number.isFinite(end) || end <= start) return 0;
  let count = 0;
  for (let t = start; t < end; t += 86_400_000) {
    if (isWorkingDay(dayIso(new Date(t)), holidays)) count++;
  }
  return count;
}

export function addWorkingDays(fromIso: string, days: number, holidays: string[]): string {
  let t = new Date(`${fromIso.slice(0, 10)}T00:00:00Z`).getTime();
  let left = Math.max(0, Math.round(days));
  while (left > 0) {
    t += 86_400_000;
    if (isWorkingDay(dayIso(new Date(t)), holidays)) left--;
  }
  return dayIso(new Date(t));
}

/** Positive = days remaining, negative = overdue. */
export function workingDaysUntil(targetIso: string | undefined, nowMs: number, holidays: string[]): number | null {
  if (!targetIso) return null;
  const todayIso = new Date(nowMs).toISOString().slice(0, 10);
  const target = targetIso.slice(0, 10);
  if (target >= todayIso) return workingDaysBetween(todayIso, target, holidays);
  return -workingDaysBetween(target, todayIso, holidays);
}

export function calendarDaysBetween(fromIso: string, toMs: number): number {
  const start = new Date(fromIso).getTime();
  if (!Number.isFinite(start)) return 0;
  return Math.max(0, Math.floor((toMs - start) / 86_400_000));
}