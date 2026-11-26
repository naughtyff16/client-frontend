import { useState } from 'react';
import { Download, RotateCcw, Upload } from 'lucide-react';
import { api } from '../lib/api-client';
import { formatDate, formatDateTime, formatPhp, manilaDay } from '../lib/shared';
import { Banner, Button, DataTable, Field, FormGrid, Input, KpiTile, Modal, PageHeader, Select, Stack, StatusBadge } from '../lib/ui';
import { errMessage, useAction, useData } from '../auth';

// ── SCR-33 Vendor Portal (strictly scoped to the signed-in vendor) ─────────
// Timeline 3 review: an invoice is one tranche of PO-line quantities already received and not yet invoiced (the API refuses excess invoicing);
// each PO shows ordered / received / outstanding / invoiced per line with its receiving and invoice tranches; each invoice shows its review
// history, and a rejected one shows the reason and can be resubmitted.
const MAX_FILE_MB = 10; // UI limit for the invoice attachment (proposed — confirm with Procurement / document service)
const todayIso = () => new Date(Date.now() + 8 * 3_600_000).toISOString().slice(0, 10);
type Draft = { poNo: string; invoiceNo: string; invoiceDate: string; fileName: string; qty: Record<string, number>; resubmitOf?: string };
const blank = (): Draft => ({ poNo: '', invoiceNo: '', invoiceDate: todayIso(), fileName: '', qty: {} });

export function VendorPortalPage() {
  const data = useData(['vendor'], () => api.vendorPortal.data());
  const [open, setOpen] = useState(false);
  const [v, setV] = useState<Draft>(blank);
  const [tried, setTried] = useState(false);
  const [tooBig, setTooBig] = useState(false);
  const d = data.data;
  type Po = NonNullable<typeof d>['pos'][number];
  type Inv = NonNullable<typeof d>['invoices'][number];
  const [poView, setPoView] = useState<Po | null>(null);
  const [invView, setInvView] = useState<Inv | null>(null);
  const selPo = d?.pos.find((p) => p.poNo === v.poNo);
  const lines = (selPo?.lineBalance ?? []).map((l) => ({ partCode: l.partCode, qty: v.qty[l.partCode] ?? 0 })).filter((l) => l.qty > 0);
  const over = (selPo?.lineBalance ?? []).filter((l) => (v.qty[l.partCode] ?? 0) > l.invoiceable);
  const amount = (selPo?.lineBalance ?? []).reduce((a, l) => a + (v.qty[l.partCode] ?? 0) * l.unitPrice, 0);
  const up = useAction(() => api.vendorPortal.uploadInvoice({ poNo: v.poNo, invoiceNo: v.invoiceNo, invoiceDate: v.invoiceDate, fileName: v.fileName, lines, resubmitOf: v.resubmitOf }),
    { success: 'Invoice submitted — status: Submitted', onSuccess: () => { setOpen(false); setTried(false); } });
  const submit = () => { setTried(true); if (v.poNo && v.invoiceNo.trim() && v.invoiceDate && lines.length && !over.length && v.fileName) up.mutate(undefined); };
  const openUpload = (poNo = '', resubmit?: Inv) => {
    setV({ ...blank(), poNo, resubmitOf: resubmit?.id, qty: Object.fromEntries((resubmit?.lines ?? []).map((l) => [l.partCode, l.qty])) });
    setTried(false); setTooBig(false); setOpen(true);
  };
  const vendorName = d?.vendor?.name.replace(/\s*\(demo\)\s*$/i, '');
  const invoiceablePos = (d?.pos ?? []).filter((p) => !['Closed', 'Cancelled'].includes(p.status) && p.lineBalance.some((l) => l.invoiceable > 0));
  const underReview = (d?.invoices ?? []).filter((i) => ['Submitted', 'Under Review'].includes(i.status)).length;
  const paid = (d?.invoices ?? []).filter((i) => i.status === 'Paid').reduce((a, i) => a + i.amount, 0);
  const exportCsv = () => {
    const rows = [['Type', 'Ref', 'Date', 'Amount', 'Status'], ...(d?.pos ?? []).map((p) => ['PO', p.poNo, manilaDay(p.createdAt), String(p.total), p.status]), ...(d?.invoices ?? []).map((i) => ['Invoice', i.invoiceNo, i.invoiceDate, String(i.amount), i.status])];
    const url = URL.createObjectURL(new Blob([rows.map((r) => r.join(',')).join('\n')], { type: 'text/csv' }));
    const a = document.createElement('a'); a.href = url; a.download = 'vendor-statement.csv'; a.click(); URL.revokeObjectURL(url);
  };
  const th = 'py-2.5 pr-3 font-medium';
  const balanceTable = (po: Po) => (
    <div className="overflow-x-auto"><table className="w-full min-w-[560px] text-sm"><thead><tr className="border-b border-line text-left text-muted"><th className={th}>Item</th><th className={`${th} text-right`}>Ordered</th><th className={`${th} text-right`}>Received</th><th className={`${th} text-right`}>Outstanding</th><th className={`${th} text-right`}>Invoiced</th><th className={`${th} text-right`}>Can inv.</th><th className="py-2.5 text-right font-medium whitespace-nowrap">Unit price</th></tr></thead>
      <tbody>{po.lineBalance.map((l) => <tr key={l.partCode} className="border-b border-line last:border-0"><td className="py-2.5 pr-3"><span className="block font-mono text-muted">{l.partCode}</span> {l.description}</td><td className="pr-3 text-right tabular">{l.ordered}</td><td className="pr-3 text-right tabular">{l.received}</td><td className="pr-3 text-right tabular">{l.outstanding}</td><td className="pr-3 text-right tabular">{l.invoiced}</td><td className="pr-3 text-right tabular font-medium">{l.invoiceable}</td><td className="whitespace-nowrap text-right tabular">{formatPhp(l.unitPrice)}</td></tr>)}</tbody>
      <tfoot><tr className="text-muted"><td className="py-2.5" colSpan={7}>Values: ordered {formatPhp(po.total)} · received {formatPhp(po.receivedValue)} · invoiced {formatPhp(po.invoicedValue)} (rejected invoices are not counted)</td></tr></tfoot></table></div>
  );
  return (
    <>
      <PageHeader title={vendorName ?? 'Vendor portal'} description="Upload invoices against what Delbros has received on your purchase orders, track their review status and export your statement. You only ever see your own transactions."
        actions={<span className="flex flex-col items-end gap-1">
          <span className="flex flex-wrap justify-end gap-2"><Button variant="secondary" icon={<Download className="size-4" />} onClick={exportCsv}>Export statement</Button>
            {/* Grey (secondary) when disabled so it never reads as an enabled tinted button; the reason is shown inline for touch users. */}
            <Button variant={invoiceablePos.length ? 'primary' : 'secondary'} icon={<Upload className="size-4" />} disabled={!invoiceablePos.length} aria-describedby={!invoiceablePos.length ? 'upload-why' : undefined} onClick={() => openUpload()}>Upload invoice</Button></span>
          {!invoiceablePos.length && d && <span id="upload-why" className="text-sm text-muted">Nothing received and not yet invoiced</span>}
        </span>} />
      <div className="grid gap-5 sm:grid-cols-3">
        <KpiTile label="Open POs" value={(d?.pos ?? []).filter((p) => !['Closed', 'Cancelled'].includes(p.status)).length} />
        <KpiTile label="Invoices under review" value={underReview} tone={underReview ? 'warning' : 'default'} />
        <KpiTile label="Paid" value={formatPhp(paid)} tone={paid ? 'success' : 'default'} hint="All time" />
      </div>
      <h2 className="mb-3 mt-8 text-lg font-semibold tracking-tight text-ink">My purchase orders</h2>
      <DataTable<Po> data={d?.pos} loading={data.isLoading} searchable={false} emptyTitle="No purchase orders" emptyHint="Purchase orders issued to you by Delbros appear here. You can upload an invoice once Delbros has received the goods." onRowClick={setPoView} columns={[
        { accessorKey: 'poNo', header: 'PO', cell: (c) => <span className="font-mono">{c.getValue<string>()}</span> }, { accessorKey: 'createdAt', header: 'Issued', cell: (c) => formatDate(c.getValue<string>()) },
        { accessorKey: 'deliveryDate', header: 'Delivery', cell: (c) => formatDate(c.getValue<string>()) },
        { id: 'recv', header: 'Received', cell: (c) => { const b = c.row.original.lineBalance; return `${b.reduce((a, l) => a + l.received, 0)} of ${b.reduce((a, l) => a + l.ordered, 0)}`; } },
        { id: 'inv', header: 'Invoiced', meta: { align: 'right' }, cell: (c) => formatPhp(c.row.original.invoicedValue) },
        { accessorKey: 'total', header: 'Total', meta: { align: 'right' }, cell: (c) => formatPhp(c.getValue<number>()) }, { accessorKey: 'status', header: 'Status', cell: (c) => <StatusBadge domain="po" value={c.getValue<string>()} /> }]} />
      <Modal open={!!poView} onClose={() => setPoView(null)} title={<span className="font-mono">{poView?.poNo}</span>} description={poView ? `Issued ${formatDate(poView.createdAt)} · delivery ${formatDate(poView.deliveryDate)} · ${poView.terms}` : undefined} size="lg"
        footer={<><Button variant="secondary" onClick={() => setPoView(null)}>Close</Button>{poView && poView.lineBalance.some((l) => l.invoiceable > 0) && <Button icon={<Upload className="size-4" />} onClick={() => { openUpload(poView.poNo); setPoView(null); }}>Invoice what was received</Button>}</>}>
        {poView && <Stack>
          {balanceTable(poView)}
          <div><p className="mb-1.5 text-sm font-medium text-ink">Receiving tranches</p>
            {poView.receipts.length ? <ul className="space-y-1 text-sm">{poView.receipts.map((r) => <li key={r.rrNo}><span className="font-mono">{r.rrNo}</span> · {formatDate(r.receivedDate)} · {r.lines.map((l) => `${l.partCode} ${l.qtyReceived} received${l.qtyRejected ? `, ${l.qtyRejected} rejected` : ''}`).join(' · ')}</li>)}</ul> : <p className="text-sm text-muted">Nothing received yet.</p>}</div>
          <div><p className="mb-1.5 text-sm font-medium text-ink">Invoice tranches</p>
            {poView.invoiceTranches.length ? <ul className="space-y-1 text-sm">{poView.invoiceTranches.map((i) => <li key={i.id}><span className="font-mono">{i.invoiceNo}</span> · {formatDate(i.invoiceDate)} · {i.lines.length ? i.lines.map((l) => `${l.partCode} × ${l.qty}`).join(', ') : 'amount only'} · {formatPhp(i.amount)} · {i.status}</li>)}</ul> : <p className="text-sm text-muted">No invoices yet.</p>}</div>
        </Stack>}
      </Modal>
      <h2 className="mb-3 mt-8 text-lg font-semibold tracking-tight text-ink">My invoices</h2>
      <DataTable<Inv> data={d?.invoices} loading={data.isLoading} searchable={false} onRowClick={setInvView} emptyTitle="No invoices submitted" emptyHint="Invoices you upload against a purchase order appear here with their review status." columns={[
        { accessorKey: 'invoiceNo', header: 'Invoice no.', cell: (c) => <span className="font-mono">{c.getValue<string>()}</span> }, { accessorKey: 'poNo', header: 'PO', cell: (c) => <span className="font-mono">{c.getValue<string>()}</span> }, { accessorKey: 'invoiceDate', header: 'Date', cell: (c) => formatDate(c.getValue<string>()) },
        { accessorKey: 'amount', header: 'Amount', meta: { align: 'right' }, cell: (c) => formatPhp(c.getValue<number>()) }, { accessorKey: 'fileName', header: 'File' },
        { accessorKey: 'status', header: 'Status', cell: (c) => <span className="flex flex-col"><StatusBadge domain="po" value={c.getValue<string>()} />{c.row.original.status === 'Rejected' && <span className="mt-1 text-xs text-muted">{c.row.original.resubmitted ? 'Resubmitted' : 'Open to see why'}</span>}</span> }]} />
      <Modal open={!!invView} onClose={() => setInvView(null)} title={<span className="font-mono">{invView?.invoiceNo}</span>} description={invView ? `${invView.poNo} · dated ${formatDate(invView.invoiceDate)} · ${formatPhp(invView.amount)} · ${invView.fileName}` : undefined}
        footer={<><Button variant="secondary" onClick={() => setInvView(null)}>Close</Button>{invView?.status === 'Rejected' && !invView.resubmitted && <Button icon={<RotateCcw className="size-4" />} onClick={() => { openUpload(invView.poNo, invView); setInvView(null); }}>Resubmit</Button>}</>}>
        {invView && <Stack>
          {invView.status === 'Rejected' && <Banner tone="danger">Rejected: {invView.rejectReason ?? 'no reason recorded'}{invView.resubmitted ? ' — a corrected invoice has been submitted.' : ''}</Banner>}
          {!!invView.lines?.length && <p className="text-sm">Invoiced lines: {invView.lines.map((l) => `${l.partCode} × ${l.qty} @ ${formatPhp(l.unitPrice)}`).join(' · ')}</p>}
          <div><p className="mb-1.5 text-sm font-medium text-ink">Status history</p>
            <ol className="space-y-1 text-sm">{invView.history.map((h, k) => <li key={k}><span className="font-medium">{h.status}</span> · {formatDateTime(h.at)} · {h.byName}{h.note ? ` — ${h.note}` : ''}</li>)}</ol></div>
        </Stack>}
      </Modal>
      <Modal open={open} onClose={() => setOpen(false)} title={v.resubmitOf ? 'Resubmit invoice' : 'Upload invoice'} size="lg" footer={<><Button variant="secondary" onClick={() => setOpen(false)}>Cancel</Button><Button loading={up.isPending} disabled={!invoiceablePos.length} onClick={submit}>Submit invoice</Button></>}>
        <Stack>
          <FormGrid>
            <Select label="Purchase order" required error={tried && !v.poNo ? 'Required' : undefined} value={v.poNo} disabled={!!v.resubmitOf || !invoiceablePos.length} onChange={(e) => setV({ ...v, poNo: e.target.value, qty: {} })} placeholder={invoiceablePos.length ? 'Select' : 'Nothing to invoice'}
              options={(v.resubmitOf ? d?.pos.filter((p) => p.poNo === v.poNo) ?? [] : invoiceablePos).map((p) => ({ value: p.poNo, label: `${p.poNo} · ${formatPhp(p.total)}` }))} />
            <Input label="Invoice no." required error={tried && !v.invoiceNo.trim() ? 'Required' : undefined} value={v.invoiceNo} onChange={(e) => setV({ ...v, invoiceNo: e.target.value })} placeholder="e.g. SI-2026-000123" />
            <Input label="Invoice date" type="date" required error={tried && !v.invoiceDate ? 'Required' : undefined} value={v.invoiceDate} onChange={(e) => setV({ ...v, invoiceDate: e.target.value })} />
          </FormGrid>
          {selPo && <div className="rounded-2xl bg-surface-alt p-4">
            <p className="mb-2 text-sm font-medium text-muted">Quantities on this invoice — up to what was received and not yet invoiced</p>
            <div className="space-y-2">{selPo.lineBalance.map((l) => (
              <div key={l.partCode} className="flex flex-wrap items-end gap-3">
                <div className="w-28"><Input label={l.partCode} type="number" min={0} max={l.invoiceable} step={1} value={v.qty[l.partCode] ?? ''} disabled={!l.invoiceable}
                  error={(v.qty[l.partCode] ?? 0) > l.invoiceable ? `Max ${l.invoiceable}` : undefined} onChange={(e) => setV({ ...v, qty: { ...v.qty, [l.partCode]: Math.max(0, Math.floor(Number(e.target.value) || 0)) } })} /></div>
                <p className="pb-2.5 text-sm text-muted">{l.description} · {l.received} received of {l.ordered} · {l.invoiced} invoiced · <span className="text-ink">can invoice {l.invoiceable}</span> × {formatPhp(l.unitPrice)}</p>
              </div>))}</div>
            <p className="mt-3 text-sm">Invoice amount (PO prices): <span className="font-semibold tabular">{formatPhp(amount)}</span></p>
            {tried && !lines.length && <p className="mt-1 text-sm text-danger">Enter a quantity on at least one line.</p>}
          </div>}
          <Field label="Invoice file" required error={tooBig ? `File is larger than ${MAX_FILE_MB} MB` : tried && !v.fileName ? 'Attach the invoice' : undefined}>
            {(id, dsc) => (
              <label htmlFor={id} className="flex cursor-pointer items-center gap-3 rounded-2xl border border-dashed border-line-strong bg-surface-alt p-5 text-sm text-muted transition-[border-color,box-shadow] duration-150 hover:border-brand-600 focus-within:border-brand-600 focus-within:ring-4 focus-within:ring-brand-600/12">
                <Upload className="size-5" /><span className={v.fileName ? 'text-ink' : undefined}>{v.fileName || `Attach the invoice (PDF or image, max ${MAX_FILE_MB} MB)`}</span>
                <input id={id} aria-describedby={dsc} type="file" accept="application/pdf,image/*" className="sr-only" onChange={(e) => { const f = e.target.files?.[0]; const big = !!f && f.size > MAX_FILE_MB * 1024 * 1024; setTooBig(big); setV({ ...v, fileName: f && !big ? f.name : '' }); }} />
              </label>
            )}
          </Field>
          {up.error && <Banner tone="danger">{errMessage(up.error)}</Banner>}
        </Stack>
      </Modal>
    </>
  );
}
