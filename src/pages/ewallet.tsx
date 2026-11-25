// ── SCR-40 E-wallet & cash bond (client view) + top-up request ─────────────
//  • Delbros bank details and the reference to quote on the transfer          • top-up states, pending count, rejection + resubmission
//  • top-up form: transfer date, method and sending bank, rules, upload limits, remarks, confirmation, duplicate check
//  • client-facing ledger types (top-up, rescue, repair, debit memo, credit memo, reversal) · cash bond held and its history
//  • non-VAT Acknowledgement Receipts for cleared top-ups and cash-bond deposits · low-balance email reminders
// Client Portal Document 2 R-11: the cash bond is consumable (applied to amounts owed) and no longer refundable. D-02: notification below ₱10,000.
// Client Portal Document 1 §2.1–§2.3: no e-wallet / cash-bond computation, no refund rules, no withdrawal request, no Adjustment /
// Contract-termination lease / Refund entry types and no Provisional Receipt workflow are shown to the client.
import { useState, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { Link } from "react-router";
import { CheckCircle2, Copy, FileText, Landmark, Mail, Upload, Wallet, X } from "lucide-react";
import logo from "../assets/delbros-logo.png";
import { api } from "../lib/api-client";
import {
  TOPUP_METHODS,
  TOPUP_RULES,
  amountInWords,
  formatDate,
  formatDateTime,
  formatPhp,
  manilaDay,
  topupReference,
} from "../lib/shared";
import {
  Badge,
  Banner,
  Button,
  Card,
  CardHeader,
  DataTable,
  DatePicker,
  Field,
  FormGrid,
  Input,
  KpiTile,
  Modal,
  MoneyInput,
  MoneyText,
  PageHeader,
  Segmented,
  Select,
  Stack,
  StatusBadge,
  Textarea,
  cn,
  useToast,
  type ColumnDef,
} from "../lib/ui";
import { errMessage, useAction, useData } from "../auth";
import { WALLET_STATES, walletStateOf, walletTone } from "./portalUi";

type Fund = "E-wallet" | "Cash bond";
interface LedgerRow { id: string; fund: Fund; at: string; type: string; sign: "in" | "out" | "none"; amount: number; balanceAfter: number; reference: ReactNode; search: string }
type Ledger = Awaited<ReturnType<typeof api.ewallet.ledger>>;
type Topup = Ledger["topups"][number];
type Bond = Awaited<ReturnType<typeof api.portal.cashBonds>>[number];

/**
 * The e-wallet entry types a client sees, with their sign. Client Portal Document 1 §2.2: Contract-termination lease, Refund and ±Adjustment are
 * not client-facing types — an approved correction is a Credit Memo (§2.1), other charges a Debit Memo. Older entries keep their history.
 */
const LEDGER_TYPES: { type: string; sign: "+" | "−" | "±"; when: string }[] = [
  { type: "Top-up", sign: "+", when: "Your transfer, posted after Treasury clears it (Acknowledgement Receipt issued)" },
  { type: "Rescue", sign: "−", when: "Rescue charge after completion, via a debit memo" },
  { type: "Repair", sign: "−", when: "Chargeable repair from a job order" },
  { type: "Debit memo", sign: "−", when: "Other charges raised as a debit memo (e.g. Park & Fix, damage)" },
  { type: "Credit memo", sign: "+", when: "Approved correction in your favour, issued as a Credit Memo" },
  { type: "Reversal", sign: "±", when: "Undoes an earlier entry; both stay on the ledger" },
];
/** Ledger category → client-facing type name. */
const typeName = (t: { type: string; category?: string }) =>
  t.type === "Replenishment" ? "Top-up" : t.type === "Reversal" ? "Reversal"
    : ({ "Debit Memo": "Debit memo", "Credit Memo": "Credit memo", Adjustment: "Credit memo", "Contract-termination lease": "Debit memo" } as Record<string, string>)[t.category ?? ""] ?? t.category ?? t.type;

/** A non-VAT Acknowledgement Receipt (Client Portal Document 1 §2.1) for a cleared top-up or cash-bond deposit — view and print / save as PDF. */
interface ArDoc { receiptNo: string; date: string; amount: number; purpose: string; method?: string; reference?: string }
function ReceiptDialog({ doc, clientName, clientCode, onClose }: { doc: ArDoc | null; clientName?: string; clientCode?: string; onClose: () => void }) {
  if (!doc) return null;
  const rows: [string, ReactNode][] = [
    ["Receipt no.", <span key="n" className="font-mono">{doc.receiptNo}</span>], ["Date", formatDate(doc.date)], ["Received from", `${clientName ?? ""}${clientCode ? ` (${clientCode})` : ""}`],
    ["Amount", formatPhp(doc.amount)], ["Amount in words", amountInWords(doc.amount)], ["For", doc.purpose],
    ...(doc.method ? [["Payment method", doc.method] as [string, ReactNode]] : []), ...(doc.reference ? [["Bank / payment reference", doc.reference] as [string, ReactNode]] : []),
  ];
  const cell = "border border-black/30 px-2 py-1 text-left";
  return (
    <>
      {createPortal(
        <div className="print-root">
          <div className="mb-3 flex items-start justify-between border-b-2 border-brand-600 pb-3">
            <div className="flex items-start gap-3"><img src={logo} alt="" className="h-12" /><p className="text-[15px] font-bold tracking-wide">DELBROS LEASING</p></div>
            <div className="rounded border border-black/60 p-2 text-right"><p className="text-[13px] font-bold">NON-VAT ACKNOWLEDGEMENT RECEIPT</p><p className="font-mono font-semibold">{doc.receiptNo}</p></div>
          </div>
          <table className="w-full border-collapse"><tbody>{rows.map(([l, v]) => <tr key={l}><th className={cn(cell, "w-48 bg-black/5")}>{l}</th><td className={cell}>{v}</td></tr>)}</tbody></table>
          <p className="mt-3 text-[11px]">Issued after Treasury confirmed the funds have cleared. Printed {formatDateTime(new Date().toISOString())} (PHT) from the client portal.</p>
        </div>,
        document.body,
      )}
      <Modal open onClose={onClose} title="Non-VAT Acknowledgement Receipt" description={doc.purpose}
        footer={<><Button variant="secondary" onClick={onClose}>Close</Button><Button variant="secondary" icon={<FileText className="size-4" />} onClick={() => window.print()}>Print / PDF</Button></>}>
        <dl className="grid gap-x-6 gap-y-4 text-sm sm:grid-cols-2">
          {rows.map(([l, v]) => <div key={l} className="min-w-0"><dt className="text-sm text-muted">{l}</dt><dd className="mt-0.5 break-words font-medium text-ink">{v}</dd></div>)}
        </dl>
      </Modal>
    </>
  );
}

/** Delbros's receiving account and the reference to quote (from app-config / settings; demo placeholder until approved). */
export function PayeeBox({ clientCode, compact }: { clientCode?: string; compact?: boolean }) {
  // Timeline 2 review: the receiving account of the entity that bills this client (Delbros Leasing, Nakamura for Mindanao, KNEX) — proposed, Treasury to confirm.
  const p = api.auth.payeeFor(clientCode);
  const toast = useToast();
  const ref = clientCode ? topupReference(clientCode) : "";
  const copy = async (text: string, what: string) => {
    try {
      await navigator.clipboard.writeText(text);
      toast.success(`${what} copied`);
    } catch {
      toast.error("Copy is blocked by this browser — select the text and copy it manually");
    }
  };
  return (
    <div className={cn("rounded-2xl bg-brand-50 text-sm text-ink-2", compact ? "px-4 py-3" : "p-5")}>
      <p className="mb-2 flex items-center gap-1.5 font-medium text-ink"><Landmark className="size-4" aria-hidden /> Pay to</p>
      <dl className="grid gap-x-6 gap-y-3 sm:grid-cols-2">
        <div><dt className="text-sm text-muted">Bank</dt><dd>{p.bank}{p.branch ? ` · ${p.branch}` : ""}</dd></div>
        <div><dt className="text-sm text-muted">Account name</dt><dd>{p.accountName}</dd></div>
        {p.accountNo && (
          <div><dt className="text-sm text-muted">Account no.</dt>
            <dd className="flex items-center gap-1 font-mono">{p.accountNo}
              <button type="button" className="relative text-brand-600 transition-colors duration-150 before:absolute before:-inset-2 hover:text-brand-700" aria-label="Copy account number" onClick={() => void copy(p.accountNo, "Account number")}><Copy className="size-3.5" /></button></dd></div>
        )}
        {ref && (
          <div><dt className="text-sm text-muted">Reference to quote on the transfer</dt>
            <dd className="flex items-center gap-1 font-mono font-semibold text-ink">{ref}
              <button type="button" className="relative text-brand-600 transition-colors duration-150 before:absolute before:-inset-2 hover:text-brand-700" aria-label="Copy reference" onClick={() => void copy(ref, "Reference")}><Copy className="size-3.5" /></button></dd></div>
        )}
      </dl>
      <p className="mt-3 text-sm text-muted">Billing entity: {p.entityName} — {p.basis}.</p>
      {p.isDemo && <p className="mt-1 text-sm text-warning">Demo account details — the approved {p.entityName} account replaces these before release.</p>}
    </div>
  );
}

export function ClientEwalletPage() {
  const dash = useData(["portal-dash"], () => api.portal.dashboard());
  const code = dash.data?.client.clientCode;
  const led = useData(["portal-ledger", code], () => api.ewallet.ledger(code!), !!code);
  const bonds = useData(["portal-cashbonds"], () => api.portal.cashBonds());
  const [topup, setTopup] = useState<{ open: boolean; resubmit?: Topup }>({ open: false });
  const [fund, setFund] = useState<"All" | Fund>("E-wallet");
  const [typeF, setTypeF] = useState("");
  const [fromF, setFromF] = useState("");
  const [toF, setToF] = useState("");
  const [receipt, setReceipt] = useState<ArDoc | null>(null);
  const w = led.data?.wallet;
  const ws = walletStateOf(w);
  const pending = (led.data?.topups ?? []).filter((x) => x.status === "Submitted" || x.status === "Confirmed by Treasury");
  // Ledger rows: e-wallet entries with their client-facing type, and the cash bond history (received, refunded, applied).
  const postedByRequest = new Set((led.data?.topups ?? []).map((t) => t.txnId).filter(Boolean));
  const walletRows: LedgerRow[] = (led.data?.txns ?? []).map((x) => {
    const type = typeName(x);
    const direct = x.type === "Replenishment" && !postedByRequest.has(x.id);
    const topup = (led.data?.topups ?? []).find((t) => t.txnId === x.id);
    const ar: ArDoc | null = x.type === "Replenishment" && x.receiptNo
      ? { receiptNo: x.receiptNo, date: x.at, amount: x.amount, purpose: "E-wallet top-up", method: topup?.method ?? (direct ? w?.paymentMethod : undefined), reference: topup?.paymentRef ?? (direct ? w?.bankRef : undefined) } : null;
    return {
      id: x.id, fund: "E-wallet", at: x.at, type, sign: x.amount > 0 ? "in" : x.amount < 0 ? "out" : "none", amount: x.amount, balanceAfter: x.balanceAfter,
      search: `${type} ${x.referenceType} ${x.referenceId ?? ""} ${x.receiptNo ?? ""} ${x.reason ?? ""}`,
      reference: (
        <span className="block leading-tight">
          {x.referenceType === "Rescue" ? (
            <>Rescue <Link to={`/client/rescue?open=${x.referenceId}`} className="font-mono text-brand-600 hover:underline">{x.referenceId}</Link></>
          ) : x.type === "Reversal" ? (
            <>Reverses <span className="font-mono">{x.reversesId}</span></>
          ) : (
            <>{x.referenceType !== "Top-up" && `${x.referenceType} `}<span className="font-mono">{x.referenceId}</span></>
          )}
          {ar && (
            <button type="button" className="ml-1 align-middle" title="View / print the non-VAT Acknowledgement Receipt" onClick={(ev) => { ev.stopPropagation(); setReceipt(ar); }}>
              <Badge tone="success" dot={false} icon={<FileText className="size-3" aria-hidden />}>Acknowledgement receipt</Badge>
            </button>
          )}
          {x.reversedById && <span className="ml-1"><Badge tone="neutral" dot={false}>Reversed by {x.reversedById}</Badge></span>}
          {(x.reason || direct) && (
            <span className="block text-sm text-muted">
              {[x.reason, direct ? "Posted directly by Treasury — no portal request needed (e.g. the opening deposit)" : ""].filter(Boolean).join(" · ")}
            </span>
          )}
        </span>
      ),
    };
  });
  const bondRows: LedgerRow[] = (led.data?.bond.entries ?? []).map((e) => ({
    id: e.id, fund: "Cash bond", at: e.at, type: e.entry, sign: e.amount > 0 ? "in" : e.amount < 0 ? "out" : "none", amount: e.amount, balanceAfter: e.balanceAfter,
    search: `${e.entry} ${e.reference} ${e.contractNo ?? ""}`,
    reference: (
      <span className="block leading-tight">
        <span className="font-mono">{e.reference}</span>{e.contractNo ? ` · ${e.contractNo}` : ""}
        {e.entry === "Bond received" && (
          <button type="button" className="ml-1 align-middle" title="View / print the non-VAT Acknowledgement Receipt"
            onClick={(ev) => { ev.stopPropagation(); setReceipt({ receiptNo: e.reference, date: e.at, amount: e.amount, purpose: `Cash bond${e.contractNo ? ` — contract ${e.contractNo}` : ""}` }); }}>
            <Badge tone="success" dot={false} icon={<FileText className="size-3" aria-hidden />}>Acknowledgement receipt</Badge>
          </button>
        )}
        <span className="block text-sm text-muted">{"reason" in e && e.reason ? `${e.status} · ${e.reason}` : e.status}</span>
      </span>
    ),
  }));
  const inRange = (r: LedgerRow) => (!fromF || manilaDay(r.at) >= fromF) && (!toF || manilaDay(r.at) <= toF);
  const rows = [...(fund !== "Cash bond" ? walletRows : []), ...(fund !== "E-wallet" ? bondRows : [])]
    .filter((r) => inRange(r) && (!typeF || r.type === typeF))
    .sort((a, b) => a.at.localeCompare(b.at));
  const typeOptions = [...new Set([...(fund !== "Cash bond" ? LEDGER_TYPES.map((t) => t.type) : []), ...(fund !== "E-wallet" ? bondRows.map((r) => r.type) : [])])];
  return (
    <>
      <PageHeader
        title="E-wallet & cash bond"
        description="Your e-wallet is used for rescue, repair and debit-memo charges — keep it above the minimum. Your cash bond is a separate security fund held against your contract. Times are Philippine time (PHT)."
        actions={<Button icon={<Wallet className="size-4" />} onClick={() => setTopup({ open: true })}>Request top-up</Button>}
      />
      <div className="mb-5 grid gap-5 sm:grid-cols-2 lg:grid-cols-4">
        <KpiTile label="E-wallet balance" value={w ? <MoneyText value={w.balance} /> : "—"} tone={walletTone(w)}
          hint={w && ws ? <span>{WALLET_STATES[ws].label} — {WALLET_STATES[ws].advice.toLowerCase()}</span> : undefined} />
        <KpiTile label="E-wallet minimum" value={w ? formatPhp(w.minimumBalance) : "—"} hint="Set in your contract" />
        <KpiTile label="Pending top-ups" value={pending.length} tone={pending.length ? "warning" : "default"}
          hint={pending.length ? `${formatPhp(pending.reduce((a, t) => a + t.amount, 0))} awaiting Treasury` : "None awaiting Treasury"} />
        <KpiTile label="Cash bond balance" value={formatPhp(led.data?.bond.held ?? 0)} hint="Consumable — applied to amounts you owe; not refundable" />
      </div>
      <div className="mb-5 grid gap-5 lg:grid-cols-2">
        <Card>
          <CardHeader title="How to top up" description="Pay by bank transfer or deposit, then send the request with the proof" />
          <PayeeBox clientCode={code} />
          <ol className="mt-4 list-decimal space-y-1.5 pl-5 text-sm text-ink-2">
            <li>Transfer to the account above and quote the reference.</li>
            <li>Click <strong>Request top-up</strong> and attach the bank confirmation.</li>
            <li>Treasury confirms the funds have cleared (usually within 1 working day); only then is it posted to your e-wallet, with a non-VAT Acknowledgement Receipt.</li>
          </ol>
        </Card>
        <LowBalanceCard w={w} reminders={w?.lowBalanceReminders} />
      </div>
      <BondCard bonds={bonds.data} onReceipt={setReceipt} />
      <TopupRequestsCard list={led.data?.topups} onResubmit={(t) => setTopup({ open: true, resubmit: t })}
        onReceipt={(t) => t.receiptNo && setReceipt({ receiptNo: t.receiptNo, date: t.postedAt ?? t.confirmedAt ?? t.submittedAt, amount: t.amount, purpose: "E-wallet top-up", method: t.method, reference: t.paymentRef })} />
      <ReceiptDialog doc={receipt} clientName={dash.data?.client.clientName} clientCode={code} onClose={() => setReceipt(null)} />
      <DataTable<LedgerRow>
        data={rows}
        loading={led.isLoading}
        pageSize={10}
        searchPlaceholder="Search type, reference or receipt…"
        initialSort={[{ id: "at", desc: true }]}
        exportName="my-ledger"
        emptyTitle="No entries for the selected fund, type and dates"
        toolbar={
          <>
            <Segmented value={fund} onChange={(f) => { setFund(f); setTypeF(""); }}
              options={[{ value: "E-wallet", label: "E-wallet" }, { value: "Cash bond", label: "Cash bond" }, { value: "All", label: "All funds" }]} />
            <Select aria-label="Entry type" value={typeF} onChange={(e) => setTypeF(e.target.value)}
              options={[{ value: "", label: "All types" }, ...typeOptions.map((t) => ({ value: t, label: t }))]} />
            <span data-wide className="flex h-11 items-center gap-2 text-sm text-muted">
              <DatePicker aria-label="From" value={fromF} max={toF || undefined} onChange={setFromF} placeholder="From" className="w-[10.5rem] px-3" />–
              <DatePicker aria-label="To" value={toF} min={fromF || undefined} onChange={setToF} placeholder="To" className="w-[10.5rem] px-3" />
              {(fromF || toF) && <button type="button" className="h-9 rounded-full px-3 text-sm font-medium text-brand-600 transition-colors duration-150 hover:bg-brand-50" onClick={() => { setFromF(""); setToF(""); }}>Clear</button>}
            </span>
          </>
        }
        columns={[
          { accessorKey: "at", header: "Date (PHT)", cell: (c) => formatDateTime(c.getValue<string>()) },
          ...(fund === "All" ? [{ accessorKey: "fund", header: "Fund" } as ColumnDef<LedgerRow>] : []),
          {
            accessorKey: "type", header: "Type",
            cell: (c) => <Badge tone={c.row.original.sign === "in" ? "success" : c.row.original.sign === "out" ? "warning" : "neutral"} dot={false}>{c.getValue<string>()}</Badge>,
          },
          { accessorKey: "amount", header: "Amount", meta: { align: "right" }, cell: (c) => (c.getValue<number>() ? <MoneyText value={c.getValue<number>()} /> : <span className="text-muted">—</span>) },
          ...(fund === "All" ? [] : [{ accessorKey: "balanceAfter", header: "Running balance", meta: { align: "right" }, cell: (c) => <MoneyText value={c.getValue<number>()} /> } as ColumnDef<LedgerRow>]),
          { id: "ref", accessorFn: (r) => r.search, header: "Reference", meta: { wrap: true }, cell: (c) => c.row.original.reference },
        ]}
      />
      {fund !== "Cash bond" && (
        <details className="mt-5 rounded-card bg-surface p-6 text-sm shadow-card">
          <summary className="cursor-pointer font-medium text-ink">E-wallet entry types</summary>
          <ul className="mt-4 grid gap-x-6 gap-y-2 sm:grid-cols-2">
            {LEDGER_TYPES.map((t) => (
              <li key={t.type}><span className="inline-block w-5 font-mono font-semibold">{t.sign}</span><span className="text-ink">{t.type}</span> <span className="text-muted">— {t.when}</span></li>
            ))}
          </ul>
          <p className="mt-4 text-sm text-muted">
            Receipts: top-ups and cash-bond deposits are recognised only after Treasury confirms the funds have cleared; you then receive a
            non-VAT <strong>Acknowledgement Receipt</strong>. Only cleared money changes your balances.
          </p>
        </details>
      )}
      <TopupDialog
        open={topup.open}
        resubmit={topup.resubmit}
        ledger={led.data}
        clientCode={code}
        onClose={() => setTopup({ open: false })}
      />
    </>
  );
}

type Reminder = { at: string; balance: number; trigger: number; to: string[]; channel: string; status: string };
/**
 * What a low balance means, without the internal computation (Client Portal Document 1 §2.2: no thresholds, percentages or top-up
 * arithmetic), and the low-balance email reminders sent to the client (§1.2).
 */
function LowBalanceCard({ w, reminders }: { w?: { balance: number; minimumBalance: number } | null; reminders?: Reminder[] }) {
  const ws = walletStateOf(w);
  return (
    <Card>
      <CardHeader title="E-wallet status" description="What a low balance affects" />
      <ul className="space-y-2.5 text-sm">
        {(["healthy", "near", "below", "negative"] as const).map((k) => (
          <li key={k} className={cn("rounded-xl px-4 py-3", k === ws ? "font-medium ring-1 ring-inset ring-current" : "bg-surface-alt", k === ws && (k === "healthy" ? "bg-success-bg text-success" : k === "near" ? "bg-warning-bg text-warning" : "bg-danger-bg text-danger"))}>
            <span className="block">{WALLET_STATES[k].label}{k === ws ? " — your e-wallet now" : ""}</span>
            <span className="mt-0.5 block text-sm font-normal text-ink-2">
              {k === "healthy" && "Nothing to do; charges are deducted as they arise."}
              {k === "near" && "Close to the minimum — consider a top-up. EWAs and rescues work as normal."}
              {k === "below" && "Below the minimum — under ₱10,000 you get a system notification and an email to top up. EWA creation is not restricted."}
              {k === "negative" && "Charges exceeded the balance and the shortfall is owed — please top up."}
            </span>
          </li>
        ))}
      </ul>
      <div className="mt-4 border-t border-line pt-4 text-sm">
        <p className="mb-2 flex items-center gap-1.5 font-medium text-ink"><Mail className="size-4 text-muted" aria-hidden />Low-balance notifications (below ₱10,000)</p>
        {reminders?.length ? (
          <ul className="space-y-1.5">
            {reminders.slice(0, 3).map((r, i) => (
              <li key={i} className="flex flex-wrap items-center justify-between gap-2 text-ink-2">
                <span>{formatDateTime(r.at)} PHT · balance {formatPhp(r.balance)}<span className="block text-sm text-muted">{r.to.join(", ")}</span></span>
                <Badge tone={r.status === "Sent" ? "success" : r.status === "Queued" ? "warning" : "danger"}>{r.status === "Queued" ? "Queued for sending" : r.status}</Badge>
              </li>
            ))}
          </ul>
        ) : <p className="text-muted">None sent. You get a system notification and an email if your balance falls below ₱10,000.</p>}
      </div>
    </Card>
  );
}

/**
 * Cash bond: what is held, its receipt, and — for an ended contract — how it was closed. Client Portal Document 1 §2.2 / §2.3: no
 * computation, deductions, refund rules, withdrawal request or approval chain. Document 2 R-11: the bond is consumable — applied to
 * amounts owed — and no longer refundable (which obligations, when and who authorizes: Delbros to confirm). Past refunds stay as history.
 */
function BondCard({ bonds, onReceipt }: { bonds?: Bond[]; onReceipt: (d: ArDoc) => void }) {
  if (!bonds?.length) return null;
  return (
    <Card className="mb-5">
      <CardHeader title="Cash bond" description="Your cash bond is consumable: Delbros applies it to amounts you owe under your contract, and it is no longer refundable. Each application appears in the ledger below (Cash bond tab)." />
      <ul className="divide-y divide-line">
        {bonds.map((b) => (
          <li key={b.id} className="flex flex-wrap items-start justify-between gap-3 py-3 text-sm first:pt-0 last:pb-0">
            <span className="min-w-0">
              <span className="font-semibold">{formatPhp(b.amount)}</span> · <span className="font-mono">{b.contractNo ?? "No contract"}</span>
              <span className="block text-sm text-muted">
                Received {formatDate(b.dateReceived)} · <span className="font-mono">{b.receiptRef}</span>
                {b.contract ? ` · contract ${b.contract.status.toLowerCase()}${b.contract.expiryDate ? ` (${b.contract.status === "Active" ? "to" : "ended"} ${formatDate(b.contract.expiryDate)})` : ""}` : ""}
              </span>
              {b.outcome && (
                <span className="mt-0.5 block text-sm text-ink-2">
                  {b.outcome.kind} {formatDate(b.outcome.at)} · {formatPhp(b.outcome.amount)} · ref <span className="font-mono">{b.outcome.reference}</span>
                </span>
              )}
              {!b.outcome && b.refund && (
                <span className="mt-0.5 block text-sm text-ink-2">Refunded {formatDate(b.refund.date)} · {formatPhp(b.refund.amount)} · ref <span className="font-mono">{b.refund.reference}</span> (before the consumable rule)</span>
              )}
            </span>
            <span className="flex flex-col items-end gap-2">
              <Badge tone={b.status === "Held" ? "success" : "neutral"}>{b.status}</Badge>
              <Button size="sm" variant="ghost" icon={<FileText className="size-4" />}
                onClick={() => onReceipt({ receiptNo: b.receiptRef, date: b.dateReceived, amount: b.amount, purpose: `Cash bond${b.contractNo ? ` — contract ${b.contractNo}` : ""}`, method: b.paymentMethod })}>
                Acknowledgement receipt
              </Button>
            </span>
          </li>
        ))}
      </ul>
      <p className="mt-4 text-sm text-muted">Bond movements are in the ledger below (Cash bond tab).</p>
    </Card>
  );
}

const TOPUP_STEPS = ["Submitted", "Confirmed by Treasury", "Posted"] as const;
/** Top-up requests with their state (Submitted → Confirmed by Treasury → Posted, or Rejected with the reason and Resubmit). */
function TopupRequestsCard({ list, onResubmit, onReceipt }: { list?: Topup[]; onResubmit: (t: Topup) => void; onReceipt: (t: Topup) => void }) {
  const [openId, setOpenId] = useState<string | null>(null);
  if (!list) return null;
  return (
    <Card className="mb-5">
      <CardHeader title="Top-up requests" description="Submitted → Confirmed by Treasury → Posted to your e-wallet (Acknowledgement Receipt issued), or Rejected with the reason" />
      {list.length ? (
        <ul className="divide-y divide-line">
          {list.map((x) => {
            const step = x.status === "Rejected" ? -1 : TOPUP_STEPS.indexOf(x.status as (typeof TOPUP_STEPS)[number]);
            const resubmitted = list.some((y) => y.resubmitOf === x.id);
            return (
              <li key={x.id} className="py-3 text-sm first:pt-0 last:pb-0">
                <div className="flex flex-wrap items-start justify-between gap-2">
                  <span className="min-w-0">
                    <span className="font-mono font-medium">{x.id}</span> · {formatPhp(x.amount)}
                    <span className="block text-sm text-muted">
                      Sent {formatDateTime(x.submittedAt)}{x.transferDate ? ` · transferred ${formatDate(x.transferDate)}` : ""}{x.method ? ` · ${x.method}` : ""}
                      {x.paymentRef ? <> · ref <span className="font-mono">{x.paymentRef}</span></> : null}
                      {x.resubmitOf ? ` · resubmission of ${x.resubmitOf}` : ""}
                      {x.checkNo ? ` · check ${x.checkNo} (${x.checkBank}, dated ${formatDate(x.checkDate)})` : ""}
                    </span>
                  </span>
                  <span className="flex items-center gap-2">
                    <StatusBadge domain="topup" value={x.status} />
                    {x.status === "Rejected" && !resubmitted && <Button size="sm" variant="secondary" onClick={() => onResubmit(x)}>Resubmit</Button>}
                    {x.status === "Posted" && x.receiptNo && <Button size="sm" variant="ghost" icon={<FileText className="size-4" />} onClick={() => onReceipt(x)}>Receipt</Button>}
                    {x.notified?.length ? <button type="button" className="text-sm font-medium text-brand-600 hover:underline" onClick={() => setOpenId(openId === x.id ? null : x.id)}>{openId === x.id ? "Hide" : "Who was told"}</button> : null}
                  </span>
                </div>
                {step >= 0 ? (
                  <ol className="mt-2 flex flex-wrap gap-1.5 text-sm">
                    {TOPUP_STEPS.map((s, i) => (
                      <li key={s} className={cn("rounded-lg px-2.5 py-1", i <= step ? "bg-brand-50 text-brand-800" : "bg-surface-alt text-muted")}>
                        {s}{i === 0 && step === 0 ? " — pending Treasury confirmation" : ""}{i === 1 && x.confirmedAt ? ` · ${formatDate(x.confirmedAt)}` : ""}{i === 2 && x.postedAt ? ` · ${formatDate(x.postedAt)}${x.receiptNo ? ` · ${x.receiptNo}` : ""}` : ""}
                      </li>
                    ))}
                  </ol>
                ) : (
                  <p className="mt-1.5 text-sm text-danger">
                    Rejected {formatDate(x.rejectedAt)}: {x.rejectReason ?? "No reason given."}
                    {resubmitted ? <span className="text-muted"> · resubmitted</span> : " You can resubmit it with the corrected details."}
                  </p>
                )}
                {openId === x.id && x.notified && (
                  <ul className="mt-2 rounded-xl bg-surface-alt px-4 py-2.5 text-sm text-muted">
                    {x.notified.map((d, i) => <li key={i}>{d.recipient} · {d.to} · <span className="text-success">{d.status}</span></li>)}
                  </ul>
                )}
              </li>
            );
          })}
        </ul>
      ) : (
        <p className="text-sm text-muted">No top-up requests yet. Use <strong>Request top-up</strong> after paying.</p>
      )}
      <p className="mt-4 text-sm text-muted">Treasury can also post a deposit directly (for example the opening deposit at accreditation); those appear only in the ledger, marked “Posted directly by Treasury”.</p>
    </Card>
  );
}

/** Request e-wallet top-up: what Treasury needs to match the transfer, rules, suggested amounts, and the confirmation. */
function TopupDialog({ open, resubmit, ledger, clientCode, onClose }: { open: boolean; resubmit?: Topup; ledger?: Ledger; clientCode?: string; onClose: () => void }) {
  const today = new Date(Date.now() + 8 * 3_600_000).toISOString().slice(0, 10);
  const blank = { amount: 0, transferDate: today, method: "", sendingBank: "", reference: "", file: "", sizeMb: 0, remarks: "", checkNo: "", checkDate: "", checkBank: "" };
  const [v, setV] = useState(blank);
  const [tried, setTried] = useState(false);
  const [done, setDone] = useState<Awaited<ReturnType<typeof api.ewallet.requestTopup>> | null>(null);
  const [key, setKey] = useState<string | null>(null);
  const k = open ? `${resubmit?.id ?? "new"}` : null;
  if (k !== key) {
    setKey(k);
    setTried(false);
    setDone(null);
    setV(resubmit ? { ...blank, amount: resubmit.amount, method: resubmit.method ?? "", sendingBank: resubmit.sendingBank ?? "", transferDate: resubmit.transferDate ?? today, remarks: `Resubmission of ${resubmit.id}` } : blank);
  }
  const req = useAction(
    () => api.ewallet.requestTopup({ amount: v.amount, transferDate: v.transferDate, method: v.method, sendingBank: v.sendingBank, reference: v.reference, proofFileName: v.file, proofSizeMb: v.sizeMb, remarks: v.remarks, resubmitOf: resubmit?.id,
      ...(byCheck ? { checkNo: v.checkNo, checkDate: v.checkDate, checkBank: v.checkBank } : {}) }),
    { onSuccess: (t) => setDone(t) },
  );
  const w = ledger?.wallet;
  // A check payment needs the check number, date and drawee bank.
  const byCheck = /\bcheck\b/i.test(v.method);
  const fieldErr = (f: string) => (req.error as { fields?: Record<string, string> } | null)?.fields?.[f];
  const minDate = new Date(Date.now() + 8 * 3_600_000 - TOPUP_RULES.maxAgeDays * 86_400_000).toISOString().slice(0, 10);
  const amountErr = !(v.amount > 0) ? "Enter the amount you paid" : v.amount < TOPUP_RULES.min ? `At least ${formatPhp(TOPUP_RULES.min)}` : v.amount > TOPUP_RULES.max ? `At most ${formatPhp(TOPUP_RULES.max)} per request` : undefined;
  const fileErr = !v.file ? "Upload the bank slip or transfer confirmation" : !/\.(pdf|jpe?g|png)$/i.test(v.file) ? "PDF, JPG or PNG only" : v.sizeMb > TOPUP_RULES.maxFileMb ? `Max ${TOPUP_RULES.maxFileMb} MB — this file is ${v.sizeMb.toFixed(1)} MB` : undefined;
  const checkOk = !byCheck || (v.checkNo.trim() && v.checkDate && v.checkBank.trim());
  const submit = () => {
    setTried(true);
    if (!amountErr && !fileErr && v.method && v.reference.trim() && v.transferDate && v.remarks.length <= 200 && checkOk) req.mutate(undefined);
  };
  return (
    <Modal
      open={open}
      onClose={onClose}
      title={done ? "Top-up request sent" : resubmit ? `Resubmit top-up — ${resubmit.id}` : "Request e-wallet top-up"}
      description={done ? undefined : "Pay first, then send the details and proof. Treasury confirms the credit and posts it to your e-wallet."}
      size="lg"
      footer={done ? <Button onClick={onClose}>Done</Button> : (<><Button variant="secondary" onClick={onClose}>Cancel</Button><Button loading={req.isPending} onClick={submit}>Submit</Button></>)}
    >
      {done ? (
        <Stack>
          <div className="rounded-2xl bg-brand-50 p-6 text-center">
            <CheckCircle2 className="mx-auto mb-2 size-6 text-success" aria-hidden />
            <p className="font-mono text-3xl font-semibold tracking-tight text-ink">{done.id}</p>
            <p className="mt-1.5 text-sm text-ink-2">{formatPhp(done.amount)} to your <strong>e-wallet</strong> · status <strong>Pending Treasury confirmation</strong></p>
            {done.checkNo && <p className="mt-1 text-sm text-muted">Check {done.checkNo} · {done.checkBank} · dated {formatDate(done.checkDate)}</p>}
          </div>
          <Banner tone="info">Treasury will confirm the funds have cleared in the Delbros account (usually within 1 working day{done.checkNo ? "; a check counts once it clears" : ""}); only then is it posted to your e-wallet, with a non-VAT Acknowledgement Receipt. You will be notified; the request is listed under Top-up requests.</Banner>
          <div>
            <p className="mb-2 text-sm font-medium text-muted">Notified</p>
            <ul className="divide-y divide-line rounded-2xl bg-surface-alt text-sm">
              {done.notified?.map((d, i) => (
                <li key={i} className="flex flex-wrap items-center justify-between gap-2 px-4 py-3">
                  <span>{d.recipient}<span className="block text-sm text-muted">{d.channel} · {d.to}</span></span>
                  <Badge tone={d.status === "Sent" ? "success" : d.status === "Queued" ? "warning" : "danger"}>{d.status === "Queued" ? "Queued for sending" : d.status}</Badge>
                </li>
              ))}
            </ul>
          </div>
        </Stack>
      ) : (
        <Stack>
          {resubmit && <Banner tone="warning" title={`${resubmit.id} was rejected`}>{resubmit.rejectReason} Correct the details below — use the reference shown on your bank confirmation.</Banner>}
          {/* Timeline 2 review: the fund is named — this request tops up the e-wallet only; the cash bond has its own route (proposed). */}
          <p className="rounded-xl bg-surface-alt px-4 py-3 text-sm">
            <span className="text-sm text-muted">Fund</span> <strong>E-wallet</strong> — for rescue, repair and debit-memo charges.
            <span className="block text-sm text-muted">This form does not add to your cash bond. The bond amount is set in your contract; to add to it, ask your Account Executive — Treasury issues a non-VAT Acknowledgement Receipt for the bond once the funds clear.</span>
          </p>
          <PayeeBox clientCode={clientCode} compact />
          {w && (
            <div className="rounded-xl bg-surface-alt px-4 py-3 text-sm text-ink-2">
              Current balance <MoneyText value={w.balance} /> · minimum {formatPhp(w.minimumBalance)}
              <span className="mt-1 block text-sm text-muted">You can top up any amount from {formatPhp(TOPUP_RULES.min)}.</span>
            </div>
          )}
          <FormGrid>
            <MoneyInput label="Amount" required value={v.amount || ""} onChange={(e) => setV({ ...v, amount: Number(e.target.value) })}
              error={(tried ? amountErr : undefined) ?? fieldErr("amount")} hint={`${formatPhp(TOPUP_RULES.min)} to ${formatPhp(TOPUP_RULES.max)}; centavos allowed`} />
            <Field label="Transfer date" required error={(tried && !v.transferDate ? "Required" : undefined) ?? fieldErr("transferDate")} hint={`Today or up to ${TOPUP_RULES.maxAgeDays} days ago`}>
              {(id, d) => <DatePicker id={id} aria-describedby={d} value={v.transferDate} min={minDate} max={today} onChange={(x) => setV({ ...v, transferDate: x })} />}
            </Field>
            <Select label="Payment method" required value={v.method} placeholder="Select" onChange={(e) => setV({ ...v, method: e.target.value })}
              error={(tried && !v.method ? "Required" : undefined) ?? fieldErr("method")} options={TOPUP_METHODS.map((m) => ({ value: m, label: m }))} />
            <Input label="Sending bank (optional)" value={v.sendingBank} onChange={(e) => setV({ ...v, sendingBank: e.target.value })} placeholder="The bank you paid from" />
            <Input label="Bank / payment reference no." required value={v.reference} onChange={(e) => setV({ ...v, reference: e.target.value })}
              error={(tried && !v.reference.trim() ? "Required" : undefined) ?? fieldErr("reference")} placeholder="e.g. TRX-20261110-0001" hint="As shown on your bank confirmation" />
            {byCheck && (
              <>
                <Input label="Check number" required value={v.checkNo} onChange={(e) => setV({ ...v, checkNo: e.target.value })}
                  error={(tried && !v.checkNo.trim() ? "Check number is required" : undefined) ?? fieldErr("checkNo")} placeholder="e.g. 0081234" />
                <Field label="Check date" required error={(tried && !v.checkDate ? "Check date is required" : undefined) ?? fieldErr("checkDate")} hint="A post-dated check counts once it clears">
                  {(id, d) => <DatePicker id={id} aria-describedby={d} value={v.checkDate} onChange={(x) => setV({ ...v, checkDate: x })} />}
                </Field>
                <Input label="Drawee bank" required value={v.checkBank} onChange={(e) => setV({ ...v, checkBank: e.target.value })}
                  error={(tried && !v.checkBank.trim() ? "Drawee bank is required" : undefined) ?? fieldErr("checkBank")} placeholder="The bank the check is drawn on" />
              </>
            )}
          </FormGrid>
          <Field label="Proof of payment" required error={(tried ? fileErr : undefined) ?? fieldErr("proofFileName")} hint={`One file — PDF, JPG or PNG, max ${TOPUP_RULES.maxFileMb} MB`}>
            {(id, d) => (
              <label htmlFor={id} className="flex cursor-pointer items-center gap-3 rounded-2xl border border-dashed border-line-strong bg-surface-alt p-5 text-sm text-muted transition-[border-color,box-shadow] duration-150 hover:border-brand-600 focus-within:border-brand-600 focus-within:ring-4 focus-within:ring-brand-600/12">
                <Upload className="size-5" />
                <span className={cn("min-w-0 flex-1 truncate", v.file && "text-ink")}>{v.file ? `${v.file} · ${v.sizeMb.toFixed(1)} MB` : "Upload the bank slip or transfer confirmation"}</span>
                {v.file && <button type="button" aria-label="Remove file" className="relative shrink-0 text-muted transition-colors duration-150 before:absolute before:-inset-2 hover:text-ink" onClick={(e) => { e.preventDefault(); setV({ ...v, file: "", sizeMb: 0 }); }}><X className="size-4" /></button>}
                <input id={id} aria-describedby={d} type="file" accept=".pdf,.jpg,.jpeg,.png,application/pdf,image/jpeg,image/png" className="sr-only"
                  onChange={(e) => { const f = e.target.files?.[0]; setV({ ...v, file: f?.name ?? "", sizeMb: f ? f.size / 1048576 : 0 }); e.target.value = ""; }} />
              </label>
            )}
          </Field>
          <Textarea label="Remarks (optional)" value={v.remarks} maxLength={200} hint={`${v.remarks.length}/200`} onChange={(e) => setV({ ...v, remarks: e.target.value })} placeholder="e.g. Paid by our Cebu office" />
          {req.error && <Banner tone="danger">{errMessage(req.error)}</Banner>}
        </Stack>
      )}
    </Modal>
  );
}
