// ── Assigned-unit OR / CR copies (Client Portal Document 1 §1.7, §1.8, §5) ──
// The Official Receipt (OR) and Certificate of Registration (CR) of every chassis assigned to the client — from the Dashboard (on-hire
// units) and from an EWA's released units. View, print / save as PDF, and download each copy; a clear state when a copy is not uploaded yet.
// Printing a copy is separate from printing the EWA itself (the copy prints on its own).
import { useState, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { Download, FileText } from "lucide-react";
import { api } from "../lib/api-client";
import { formatDate, formatDateTime } from "../lib/shared";
import { Banner, Button, Modal, Stack, cn } from "../lib/ui";
import { errMessage, useData } from "../auth";
import logo from "../assets/delbros-logo.png";

type Docs = Awaited<ReturnType<typeof api.portal.unitDocuments>>;
type Kind = "OR" | "CR";
const TITLE: Record<Kind, string> = { OR: "Official Receipt (OR)", CR: "Certificate of Registration (CR)" };

function rowsOf(d: Docs, k: Kind): [string, string][] {
  return [
    ["Document", TITLE[k]], [k === "OR" ? "OR no." : "CR no.", (k === "OR" ? d.orNo : d.crNo) ?? "—"], ["Chassis no.", d.chassisNo], ["Plate no.", d.plateNo ?? "—"],
    ["Registered owner", d.owner ?? "—"], ["Issued", formatDate(d.issueDate)], ...(k === "OR" ? ([["Registration valid until", formatDate(d.expiryDate)]] as [string, string][]) : []),
    ["Issuing agency", d.agency ?? "LTO"], ["File on record", (k === "OR" ? d.orFile : d.crFile) ?? "—"],
  ];
}

/** The copy as a standalone HTML file (the document service serves the scanned PDF in production). */
function download(d: Docs, k: Kind, client?: string) {
  const esc = (x: string) => x.replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]!);
  const rows = rowsOf(d, k).map(([l, v]) => `<tr><th>${esc(l)}</th><td>${esc(v)}</td></tr>`).join("");
  const html = `<!doctype html><html><head><meta charset="utf-8"><title>${k} ${esc(d.chassisNo)}</title><style>body{font:13px Arial,sans-serif;margin:24px}table{border-collapse:collapse;width:100%}th,td{border:1px solid #999;padding:6px;text-align:left}th{background:#f1f1f1;width:220px}</style></head><body>`
    + `<h2>DELBROS LEASING — ${esc(TITLE[k])} copy</h2><p>Unit ${esc(d.chassisNo)}${client ? ` · assigned to ${esc(client)}` : ""}</p><table>${rows}</table>`
    + `<p style="font-size:11px">Copy downloaded ${esc(formatDateTime(new Date().toISOString()))} (PHT) from the client portal.</p></body></html>`;
  const a = document.createElement("a");
  a.href = URL.createObjectURL(new Blob([html], { type: "text/html;charset=utf-8" }));
  a.download = `${k}-${d.chassisNo}.html`;
  a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 1000);
}

function PrintCopies({ d, kinds, client }: { d: Docs; kinds: Kind[]; client?: string }) {
  const cell = "border border-black/30 px-2 py-1 text-left";
  return createPortal(
    <div className="print-root print-solo">
      {kinds.map((k, i) => (
        <div key={k} className={cn(i > 0 && "mt-8 break-before-page")}>
          <div className="mb-3 flex items-start justify-between border-b-2 border-brand-600 pb-3">
            <div className="flex items-start gap-3"><img src={logo} alt="" className="h-12" /><div><p className="text-[15px] font-bold tracking-wide">DELBROS LEASING</p><p>{TITLE[k]} — copy</p></div></div>
            <div className="rounded border border-black/60 p-2 text-right"><p className="text-[13px] font-bold">{k === "OR" ? d.orNo : d.crNo}</p><p>Unit {d.chassisNo}</p></div>
          </div>
          <table className="w-full border-collapse"><tbody>{rowsOf(d, k).map(([l, v]) => <tr key={l}><th className={cn(cell, "w-56 bg-black/5")}>{l}</th><td className={cell}>{v}</td></tr>)}</tbody></table>
          <p className="mt-3 text-[11px]">{client ? `Unit assigned to ${client}. ` : ""}Printed {formatDateTime(new Date().toISOString())} (PHT) from the client portal.</p>
        </div>
      ))}
    </div>,
    document.body,
  );
}

/** OR / CR dialog for one assigned unit. */
export function UnitDocsDialog({ chassisNo, client, onClose }: { chassisNo: string | null; client?: string; onClose: () => void }) {
  const q = useData(["portal-unit-docs", chassisNo], () => api.portal.unitDocuments(chassisNo!), !!chassisNo);
  const [printing, setPrinting] = useState<Kind[] | null>(null);
  if (!chassisNo) return null;
  const d = q.data;
  const print = (kinds: Kind[]) => { setPrinting(kinds); setTimeout(() => { window.print(); setPrinting(null); }, 60); };
  const card = (k: Kind): ReactNode => (
    <div key={k} className="rounded-2xl bg-surface-alt p-4 text-sm">
      <p className="mb-2 font-medium text-ink">{TITLE[k]}</p>
      <dl className="grid grid-cols-2 gap-x-4 gap-y-2">
        {rowsOf(d!, k).slice(1).map(([l, v]) => <div key={l} className="min-w-0"><dt className="text-sm text-muted">{l}</dt><dd className="break-words text-ink">{v}</dd></div>)}
      </dl>
      <div className="mt-3 flex flex-wrap gap-2">
        <Button size="sm" variant="secondary" icon={<FileText className="size-4" />} onClick={() => print([k])}>View / print</Button>
        <Button size="sm" variant="secondary" icon={<Download className="size-4" />} onClick={() => download(d!, k, client)}>Download</Button>
      </div>
    </div>
  );
  return (
    <>
      {d?.available && printing && <PrintCopies d={d} kinds={printing} client={client} />}
      <Modal open onClose={onClose} size="lg" title={`OR / CR — ${chassisNo}`} description="Registration documents of the unit assigned to you"
        footer={<><Button variant="secondary" onClick={onClose}>Close</Button>{d?.available && <Button variant="secondary" icon={<FileText className="size-4" />} onClick={() => print(["OR", "CR"])}>Print both</Button>}</>}>
        {q.error ? <Banner tone="danger">{errMessage(q.error)}</Banner> : !d ? <p className="text-sm text-muted">Loading…</p> : d.available ? (
          <div className="grid gap-4 sm:grid-cols-2">{card("OR")}{card("CR")}</div>
        ) : (
          <Stack>
            <Banner tone="warning" title="OR / CR copies not available yet">
              Delbros has not uploaded the OR and CR copies of {d.chassisNo} yet. Your Account Executive can send them; they appear here once uploaded.
            </Banner>
          </Stack>
        )}
      </Modal>
    </>
  );
}

/** Compact "OR / CR" action for a unit row, with the not-available state shown in place. */
export function UnitDocsButton({ chassisNo, available, onOpen }: { chassisNo: string; available?: boolean; onOpen: (chassisNo: string) => void }) {
  return available === false ? (
    <button type="button" className="text-sm text-muted hover:underline" title="OR / CR copies not uploaded yet" onClick={() => onOpen(chassisNo)}>OR / CR not yet available</button>
  ) : (
    <Button size="sm" variant="ghost" className="px-2" icon={<FileText className="size-4" />} aria-label={`OR / CR of ${chassisNo}`} title="View, print or download the OR / CR copies" onClick={() => onOpen(chassisNo)}>OR / CR</Button>
  );
}
