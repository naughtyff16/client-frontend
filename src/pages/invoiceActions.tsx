// ── SUP-07 Invoices & SOA — pieces for the portal invoice review (2026-11-11) ──
//  • net, VAT and total; billing basis (lease = units × days × contract rate; one-off charges are not lease periods)
//  • billing coverage: lease periods run without gaps; the current week is invoiced on the next weekly run
//  • SOA period with an opening balance
// Client Portal Document 2 D-05: the separate proof-of-payment and invoice-dispute forms are removed (the client uses Send feedback).
// Client Portal Document 3 points 1–2: the credit term starts on the receipt / acknowledgment date entered by Delbros staff.
import { useState } from "react";
import { api } from "../lib/api-client";
import { addDays, formatDate, formatPhp, manilaDay } from "../lib/shared";
import { cn } from "../lib/ui";

export type InvRow = Awaited<ReturnType<typeof api.billing.invoices>>[number];
export type SoaLine = Awaited<ReturnType<typeof api.credit.soa>>["lines"][number];

/** How the amount is made up, in one sentence (review: DWLCI-261118 ₱5,040 = ₱4,500 damage + ₱540 VAT). */
export function billingBasis(i: InvRow) {
  if (i.isLease) {
    const units = i.lines.filter((l) => l.lineType === "Lease" && !l.held);
    const days = units.reduce((a, l) => a + (l.days ?? 0), 0);
    return `Lease: ${units.length} unit${units.length === 1 ? "" : "s"}, ${days} unit-days at the contract daily rates (net ${formatPhp(i.subtotal)}) + 12% VAT ${formatPhp(i.vat)} = ${formatPhp(i.total)}.`;
  }
  const l = i.lines[0];
  return `${i.billType} charge, not a lease bill: ${l?.description ?? i.billType} ${formatPhp(i.subtotal)} + 12% VAT ${formatPhp(i.vat)} = ${formatPhp(i.total)}. Daily rates do not apply.`;
}
/** The "Period" cell: lease periods as a range; one-off charges say what they are and when they arose. */
export function periodLabel(i: InvRow) {
  if (!i.isLease) return `${i.billType} · ${formatDate(i.periodStart)}`;
  return i.periodStart === i.periodEnd ? formatDate(i.periodStart) : `${formatDate(i.periodStart)} – ${formatDate(i.periodEnd)}`;
}

/** Lease billing coverage: the periods invoiced, any gap, and what is not yet invoiced (review: 28–31 Oct gap). */
export function BillingCoverage({ invs, cycle, week }: { invs: InvRow[]; cycle?: string; week?: string }) {
  const lease = invs.filter((i) => i.isLease && i.status !== "Cancelled").sort((a, b) => a.periodStart.localeCompare(b.periodStart));
  if (!lease.length) return null;
  const gaps: string[] = [];
  for (let k = 1; k < lease.length; k++) {
    const expected = manilaDay(addDays(`${lease[k - 1].periodEnd}T12:00:00+08:00`, 1));
    if (lease[k].periodStart > expected) gaps.push(`${formatDate(expected)} – ${formatDate(manilaDay(addDays(`${lease[k].periodStart}T12:00:00+08:00`, -1)))}`);
  }
  const last = lease[lease.length - 1];
  const nextStart = manilaDay(addDays(`${last.periodEnd}T12:00:00+08:00`, 1));
  const len = cycle === "Monthly" ? 30 : 7;
  const nextEnd = manilaDay(addDays(`${nextStart}T12:00:00+08:00`, len - 1));
  const nextInvoice = manilaDay(addDays(`${nextEnd}T12:00:00+08:00`, 1));
  return (
    <p className={cn("mb-5 rounded-2xl px-4 py-3.5 text-sm", gaps.length ? "bg-warning-bg" : "bg-surface shadow-card")}>
      <span className="font-medium text-ink">Lease billing ({(cycle ?? "weekly").toLowerCase()}{week && (cycle ?? "Weekly") === "Weekly" ? `, ${week} weeks` : ""}):</span>{" "}
      invoiced from {formatDate(lease[0].periodStart)} to {formatDate(last.periodEnd)}{gaps.length ? <span className="text-warning"> — not yet billed: {gaps.join(", ")}</span> : " with no gaps"}.
      {" "}The current period {formatDate(nextStart)} – {formatDate(nextEnd)} accrues daily and is invoiced on {formatDate(nextInvoice)}.
      {" "}<span className="text-muted">Repair, damage and other one-off charges are billed separately and are not lease periods.</span>
    </p>
  );
}

/** Client Portal Document 3: the Due cell — a receipt-basis invoice has no due date until Delbros records the receipt date. */
export function dueText(i: { dueDate: string; dueBasis?: string; status?: string }) {
  if (i.status === "Cancelled") return "—";
  if (!i.dueDate) return i.dueBasis === "Acknowledgment" ? "Awaiting receipt date" : "—";
  return formatDate(i.dueDate);
}
/** Client Portal Document 3 points 1–2: what the due date is counted from (the receipt date entered by Delbros), for the invoice view and the printed copy. */
export function dueBasisNote(i: { dueDate: string; dueBasis?: string; acknowledgedAt?: string; acknowledgedVia?: string; creditTermDays: number; invoiceDate: string }) {
  if (i.dueBasis === "Acknowledgment") {
    return i.acknowledgedAt
      ? `Due ${formatDate(i.dueDate)} = billing received ${formatDate(i.acknowledgedAt)} (${i.acknowledgedVia ?? "recorded by Delbros"}) + ${i.creditTermDays} days.`
      : `The ${i.creditTermDays}-day term starts on the date you received this billing, as recorded by Delbros (for example the date on your signed copy) — no due date until then.`;
  }
  if (i.dueBasis === "Invoice date") return `Due ${formatDate(i.dueDate)} = invoice date ${formatDate(i.invoiceDate)} + ${i.creditTermDays} days.`;
  return `Due ${formatDate(i.dueDate)} — the due date recorded when this invoice was issued (issued before the acknowledgment rule; kept as is).`;
}

type Coverage = Awaited<ReturnType<typeof api.portal.hireCoverage>>;
/** Timeline 3 ("earlier on-hire rent"): for each unit, Gate Out → Gate In, the billable days and the invoices that carry them, once each. */
export function HireCoverage({ rows }: { rows?: Coverage }) {
  const [open, setOpen] = useState(false);
  if (!rows?.length) return null;
  const bad = rows.filter((r) => r.status !== "Every day invoiced once");
  return (
    <div className={cn("mb-5 rounded-2xl px-4 py-3.5 text-sm", bad.length ? "bg-warning-bg" : "bg-surface shadow-card")}>
      <p>
        <span className="font-medium text-ink">Hire days invoiced:</span>{" "}
        {bad.length ? <span className="text-warning">{bad.length} unit{bad.length === 1 ? "" : "s"} with missing or double-billed days</span> : `every billable day of ${rows.length} unit hires is on exactly one lease invoice`}.{" "}
        <button type="button" className="font-medium text-brand-600 hover:underline" aria-expanded={open} onClick={() => setOpen(!open)}>{open ? "Hide" : "Show"} per unit</button>
      </p>
      {open && (
        <div className="mt-3 overflow-x-auto">
          <table className="w-full min-w-[720px] text-sm">
            <thead><tr className="border-b border-line text-left text-muted"><th className="py-2 pr-3 font-medium">Unit</th><th className="pr-3 font-medium">Gate Out</th><th className="pr-3 font-medium">Gate In</th><th className="pr-3 text-right font-medium">Billable days</th><th className="pr-3 text-right font-medium">Invoiced</th><th className="pr-3 text-right font-medium">Accruing</th><th className="font-medium">Invoices</th></tr></thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.gateOut} className="border-b border-line align-top last:border-0">
                  <td className="py-2 pr-3 font-mono">{r.unitId}</td>
                  <td className="pr-3 whitespace-nowrap">{formatDate(r.outDay)} <span className="block font-mono text-xs text-muted">{r.gateOut}</span></td>
                  <td className="pr-3 whitespace-nowrap">{r.inDay ? <>{formatDate(r.inDay)} <span className="block font-mono text-xs text-muted">{r.gateIn}</span></> : "On hire"}</td>
                  <td className="pr-3 text-right tabular">{r.billableToCutOff}</td>
                  <td className={cn("pr-3 text-right tabular", r.status !== "Every day invoiced once" && "font-medium text-danger")}>{r.invoicedDays}{r.missingDays.length ? ` (${r.missingDays.length} missing)` : ""}{r.billedTwiceDays.length ? ` (${r.billedTwiceDays.length} twice)` : ""}</td>
                  <td className="pr-3 text-right tabular">{r.accruingDays || "—"}</td>
                  <td className="font-mono text-xs">{r.invoices.join(", ")}</td>
                </tr>
              ))}
            </tbody>
          </table>
          <p className="mt-2 text-muted">Billable days count from the day after the Gate Out day to the Gate In day, up to the end of the last invoiced week ({formatDate(rows[0].cutOff)}). Accruing days are in the current week and go on the next weekly invoice.</p>
        </div>
      )}
    </div>
  );
}

/** SOA for a chosen period: a "Balance brought forward" row, the movements in the period, and the closing balance. */
export function soaForPeriod(lines: SoaLine[], from: string, to: string) {
  const day = (iso: string) => manilaDay(iso);
  const before = from ? lines.filter((l) => day(l.date) < from) : [];
  const opening = before.length ? before[before.length - 1].balance : 0;
  const inPeriod = lines.filter((l) => (!from || day(l.date) >= from) && (!to || day(l.date) <= to));
  // Timeline 2 review: the statement always opens with the balance brought forward — ₱0.00 at the account start when no period is chosen.
  const openAt = from ? `${from}T00:00:00+08:00` : lines[0]?.date ?? new Date().toISOString();
  const rows = [{ date: openAt, docType: "Balance brought forward", docNo: "", ref: from ? `Closing balance before ${formatDate(from)}` : "Opening balance — account start", debit: 0, credit: 0, balance: opening } as SoaLine, ...inPeriod];
  const closing = inPeriod.length ? inPeriod[inPeriod.length - 1].balance : opening;
  return { rows, opening, closing, debits: inPeriod.reduce((a, l) => a + l.debit, 0), credits: inPeriod.reduce((a, l) => a + l.credit, 0) };
}
