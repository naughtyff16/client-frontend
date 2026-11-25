// ── Weekly lease billing from actual hires ──
// One weekly calendar (fin.weekly_cycle_start — Client Portal Document 1, item 1.9: Monday–Sunday) and one rule for a unit's billable days
// (item 1.10): every day from the day AFTER its Gate Out day to its Gate In day is billed exactly once, in the week it falls in.
// A first or last partial week bills only the days the unit was out. Used by the demo seed and checked by the tests.
import { WEEKDAYS, overlapDays } from './billing';

export interface Hire { unitId: string; equipmentType: string; outDay: string; inDay?: string; outRef?: string; inRef?: string }
export interface LeasePeriod { start: string; end: string; invoiceDate: string }

const shift = (day: string, n: number) => new Date(Date.parse(`${day}T00:00:00Z`) + n * 86_400_000).toISOString().slice(0, 10);
const weekday = (day: string) => new Date(`${day}T12:00:00Z`).getUTCDay();

/** The week (start … end) that contains a day, for weeks starting on the given weekday (0 = Sunday … 5 = Friday). */
export function weekOf(day: string, startIndex: number): LeasePeriod {
  const start = shift(day, -((weekday(day) - startIndex + 7) % 7));
  const end = shift(start, 6);
  return { start, end, invoiceDate: shift(end, 1) };
}

/** Consecutive weeks from the week containing `firstDay` up to the last week that has ended by `lastDay` (inclusive). No gap, no overlap. */
export function weeklyPeriods(firstDay: string, lastDay: string, startIndex = WEEKDAYS.indexOf('Monday')): LeasePeriod[] {
  const out: LeasePeriod[] = [];
  for (let p = weekOf(firstDay, startIndex); p.end <= lastDay; p = weekOf(shift(p.end, 1), startIndex)) out.push(p);
  return out;
}

/** The lease lines of one period: each hire that overlaps it, for the days it was out inside the period, at its contract rate. */
export function leaseLinesFor(hires: Hire[], period: { start: string; end: string }, rateOf: (equipmentType: string) => number) {
  return hires
    .map((h) => ({ h, o: overlapDays(h.outDay, h.inDay, period.start, period.end) }))
    .filter((x): x is { h: Hire; o: NonNullable<ReturnType<typeof overlapDays>> } => !!x.o)
    .sort((a, b) => a.h.outDay.localeCompare(b.h.outDay) || a.h.unitId.localeCompare(b.h.unitId))
    .map(({ h, o }) => { const rate = rateOf(h.equipmentType); return { ...h, from: o.from, to: o.to, days: o.days, rate, amount: o.days * rate }; });
}

/** Every billable day of a hire up to a cut-off day (the last invoiced period end): day after Gate Out … min(Gate In day, cut-off). */
export function billableDaysOf(h: Hire, cutOff: string): string[] {
  const last = h.inDay && h.inDay < cutOff ? h.inDay : cutOff;
  const days: string[] = [];
  for (let d = shift(h.outDay, 1); d <= last; d = shift(d, 1)) days.push(d);
  return days;
}
