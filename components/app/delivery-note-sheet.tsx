import Image from "next/image";

import { formatDateTime } from "@/lib/format";
import { distinctMark } from "@/lib/customer-name";

import { Tx } from "@/components/app/tx";

/** The snapshot the note was issued with — never the live cargo record. */
type Snapshot = {
  cargoReference: string;
  shippingMark: string | null;
  sender: { name: string; phone: string; code: string };
  receiver: { name: string; phone: string };
  supplier: string | null;
  supplierRef: string | null;
  description: string;
  warehouse: string;
  receivedAt: string;
  packagesCount: number;
  piecesCount: number | null;
  weightKg: string | null;
  cbm: string;
  condition: string;
  lines: {
    reference: string;
    type: string;
    description: string | null;
    quantity: number;
    unit: string;
    length: string | null;
    width: string | null;
    height: string | null;
    cbm: string;
    weightKg: string | null;
    balerNumber: string | null;
  }[];
};

export type DeliveryNoteSheetData = {
  number: string;
  issuedAt: Date;
  issuedByName: string | null;
  snapshot: Snapshot;
};

export type DeliveryNoteCompany = {
  name: string | null;
  tagline: string | null;
  chinaAddress: string | null;
  darAddress: string | null;
  phone: string | null;
  altPhone: string | null;
} | null;

/**
 * THE PAPER THE CUSTOMER KEEPS, AS ONE SHEET.
 *
 * Drawn ENTIRELY from the note's own snapshot, never from the live cargo
 * record. The record can be corrected afterwards; this document made a claim
 * on a date and has to go on making the same one, or it is no longer evidence
 * of anything.
 *
 * A component rather than a page, because the same sheet is printed on its own
 * and again inside the receiving package the Foshan counter hands over — one
 * sheet, one place to change it.
 */
export function DeliveryNoteSheet({
  note,
  company,
  containerReference,
  qr,
}: {
  note: DeliveryNoteSheetData;
  company: DeliveryNoteCompany;
  containerReference: string | null;
  /** Pre-rendered on the server; a token never reaches the client. */
  qr: string | null;
}) {
  const snap = note.snapshot;
  const container = containerReference ? { reference: containerReference } : null;
  const label = "text-[8px] font-bold uppercase tracking-[0.18em] text-neutral-500";
  const mark = distinctMark(snap.sender.name, snap.shippingMark) ? snap.shippingMark : null;

  return (
  <article className="dn-sheet mx-auto overflow-hidden bg-white text-[#0b1b2b] shadow-raised ring-1 ring-black/5 print:shadow-none print:ring-0">
    {/* ------------------------------------------------------ Letterhead */}
    <header className="relative overflow-hidden bg-[#0a3350] px-8 py-6 text-white print:rounded-xl">
      <div
        aria-hidden
        className="absolute inset-0 bg-[radial-gradient(ellipse_at_90%_-20%,rgba(79,201,240,0.35),transparent_60%),radial-gradient(ellipse_at_0%_130%,rgba(244,97,31,0.35),transparent_55%)]"
      />
      <div className="relative flex items-center justify-between gap-6">
        <div className="flex items-center gap-3">
          <span className="grid size-14 place-items-center rounded-2xl bg-white p-1">
            <Image src="/brand/bluewave-cargo.png" alt="" width={52} height={52} className="object-contain" />
          </span>
          <div>
            <p className="text-xl font-extrabold uppercase tracking-[0.12em]">{company?.name ?? "BlueWave Cargo"}</p>
            <p className="text-[9px] font-semibold uppercase tracking-[0.22em] text-[#ffb27d]">
              {company?.tagline ?? "From sourcing to delivery"}
            </p>
            <p className="mt-1 max-w-sm text-[10px] leading-snug text-white/75">
              {company?.chinaAddress ?? "Foshan, China"}
            </p>
          </div>
        </div>
        <div className="text-right">
          <p className="text-[10px] font-bold uppercase tracking-[0.3em] text-[#9fd8f5]">Delivery note</p>
          <p className="text-[9px] uppercase tracking-[0.2em] text-white/60">Hati ya kupokea mzigo · 收货单</p>
          <p className="tnum mt-1 text-2xl font-extrabold tracking-tight">{note.number}</p>
          <p className="text-[10px] text-white/70">Issued {formatDateTime(note.issuedAt)}</p>
        </div>
      </div>
      <div className="relative mt-5 h-1 rounded-full bg-gradient-to-r from-[#ea4a5c] via-[#ffb27d] to-[#5ccdef]" />
    </header>

    <div className="px-8 py-6">
      {/* ------------------------------------------ Whose, and the code */}
      <section className="grid grid-cols-[1fr_auto] items-stretch gap-6">
        <div className="flex flex-col justify-between rounded-2xl border border-[#d6e2ee] bg-[#f5f9fc] p-5">
          <div>
            <p className={label}>Customer · Mteja · 客户</p>
            <p className="mt-1 text-2xl font-extrabold uppercase leading-tight">{snap.sender.name}</p>
            <p className="tnum text-sm text-neutral-600">
              {snap.sender.code} · {snap.sender.phone}
            </p>
            {mark ? (
              <p className="mt-1 text-sm">
                <span className="text-neutral-500">Shipping mark · 唛头 </span>
                <span className="font-bold">{mark}</span>
              </p>
            ) : null}
          </div>
          <div className="mt-4 flex flex-wrap items-center gap-3">
            <span className="rotate-[-4deg] rounded-md border-2 border-emerald-600 px-3 py-1 text-xs font-extrabold uppercase tracking-[0.2em] text-emerald-600">
              Received · {snap.condition.toLowerCase().replace("_", " ")}
            </span>
            <span className="rounded-full bg-[#0a3350] px-3 py-1 text-[10px] font-bold uppercase tracking-[0.18em] text-white">
              Keep this note · Hifadhi hati hii
            </span>
          </div>
        </div>
        {qr ? (
          <div className="flex w-[52mm] flex-col items-center justify-center rounded-2xl bg-[#0a3350] p-3 text-center text-white">
            <span className="rounded-xl bg-white p-1.5">
              <Image src={qr} alt="" width={170} height={170} unoptimized style={{ width: "40mm", height: "40mm" }} />
            </span>
            <p className="mt-2 text-[9px] font-bold uppercase tracking-[0.18em] text-[#9fd8f5]">Scan to track</p>
            <p className="text-[8px] text-white/60">Fuatilia mzigo wako</p>
          </div>
        ) : null}
      </section>

      {/* ------------------------------------------------ The figures */}
      <section className="mt-5 grid grid-cols-4 gap-px overflow-hidden rounded-2xl border border-[#d6e2ee] bg-[#d6e2ee]">
        {[
          ["Tracking no.", snap.cargoReference],
          ["Received", formatDateTime(snap.receivedAt)],
          ["At", snap.warehouse],
          ["Container", container?.reference ?? "—"],
          ["Packages · 件数", String(snap.packagesCount)],
          ["Pieces", snap.piecesCount ? String(snap.piecesCount) : "—"],
          ["Weight · 重量", snap.weightKg ? `${snap.weightKg} kg` : "—"],
          ["Volume · 体积", `${Number(snap.cbm).toFixed(3)} CBM`],
        ].map(([k, v]) => (
          <div key={k} className="bg-white px-4 py-3">
            <p className={label}>{k}</p>
            <p className="tnum mt-0.5 truncate text-sm font-bold">{v}</p>
          </div>
        ))}
      </section>

      <p className="mt-4 text-sm">
        <span className={label}>Goods · Bidhaa</span>
        <span className="ml-2 font-semibold"><Tx>{snap.description}</Tx></span>
      </p>

      {/* ------------------------------------------------ The lines */}
      {snap.lines.length > 0 ? (
        <section className="mt-3 overflow-hidden rounded-2xl border border-[#d6e2ee]">
          <table className="w-full text-[11px]">
            <thead className="bg-[#0a3350] text-white">
              <tr className="text-[8px] uppercase tracking-[0.16em]">
                <th className="px-3 py-2 text-left font-bold">Line</th>
                <th className="px-3 py-2 text-left font-bold">Goods</th>
                <th className="px-3 py-2 text-left font-bold">Packed as</th>
                <th className="px-3 py-2 text-right font-bold">Qty</th>
                <th className="px-3 py-2 text-right font-bold">L × W × H</th>
                <th className="px-3 py-2 text-right font-bold">CBM</th>
                <th className="px-3 py-2 text-right font-bold">Weight</th>
              </tr>
            </thead>
            <tbody>
              {snap.lines.map((l, i) => (
                <tr key={l.reference} className={i % 2 ? "bg-[#f5f9fc]" : ""}>
                  <td className="tnum px-3 py-2 font-semibold">{l.reference}</td>
                  <td className="px-3 py-2">{l.description ?? "—"}</td>
                  <td className="px-3 py-2">
                    {l.type.charAt(0) + l.type.slice(1).toLowerCase()}
                    {l.balerNumber ? <span className="block text-[10px] text-neutral-500">Bale {l.balerNumber}</span> : null}
                  </td>
                  <td className="tnum px-3 py-2 text-right">{l.quantity}</td>
                  <td className="tnum px-3 py-2 text-right text-neutral-600">
                    {l.length && l.width && l.height
                      ? `${l.length} × ${l.width} × ${l.height} ${l.unit.toLowerCase()}`
                      : "—"}
                  </td>
                  <td className="tnum px-3 py-2 text-right">{Number(l.cbm).toFixed(3)}</td>
                  <td className="tnum px-3 py-2 text-right text-neutral-600">
                    {l.weightKg ? `${Number(l.weightKg).toFixed(2)} kg` : "—"}
                  </td>
                </tr>
              ))}
              <tr className="border-t-2 border-[#0a3350] font-extrabold">
                <td colSpan={3} className="px-3 py-2 uppercase tracking-wide">Total</td>
                <td className="tnum px-3 py-2 text-right">{snap.packagesCount}</td>
                <td />
                <td className="tnum px-3 py-2 text-right">{Number(snap.cbm).toFixed(3)}</td>
                <td className="tnum px-3 py-2 text-right">{snap.weightKg ? `${snap.weightKg} kg` : ""}</td>
              </tr>
            </tbody>
          </table>
        </section>
      ) : null}

      {/* --------------------------------------------- The terms */}
      <section className="mt-5 grid grid-cols-2 gap-4 text-[10.5px] leading-relaxed">
        <div className="rounded-2xl bg-[#f5f9fc] p-4">
          <p className="font-extrabold uppercase tracking-wide text-[#0a3350]">What we received</p>
          <p className="mt-1 text-neutral-600">
            This note records the goods BlueWave Cargo received for you at our Foshan warehouse. The final charge
            is worked out from the measured volume and the rate for its category.
          </p>
        </div>
        <div className="rounded-2xl bg-[#fff2ea] p-4">
          <p className="font-extrabold uppercase tracking-wide text-[#b3440f]">Tulichopokea</p>
          <p className="mt-1 text-neutral-700">
            Hati hii inaonyesha mzigo tuliopokea kwa ajili yako kwenye ghala letu Foshan. Gharama ya mwisho
            inahesabiwa kwa ujazo (CBM) uliopimwa na bei ya aina ya bidhaa.
          </p>
        </div>
      </section>

      {/* ------------------------------------------ Signatures */}
      <section className="mt-8 grid grid-cols-2 gap-8">
        {[
          ["Delivered by · Aliyeleta", "Name and signature"],
          ["Received by · Aliyepokea", note.issuedByName ? `BlueWave Cargo — ${note.issuedByName}` : "BlueWave Cargo"],
        ].map(([title, sub]) => (
          <div key={title}>
            <div className="h-10 border-b border-dashed border-neutral-400" />
            <p className="mt-1 text-[9px] font-bold uppercase tracking-[0.16em] text-neutral-600">{title}</p>
            <p className="text-[9px] text-neutral-400">{sub}</p>
          </div>
        ))}
      </section>

      <footer className="mt-6 flex flex-wrap items-center justify-between gap-2 border-t border-[#d6e2ee] pt-3 text-[9px] text-neutral-500">
        <span>
          {company?.darAddress ?? ""}
          {company?.phone ? ` · ${company.phone}` : ""}
          {company?.altPhone ? ` · ${company.altPhone}` : ""}
        </span>
        <span className="font-bold uppercase tracking-[0.2em] text-[#0a3350]">{company?.name ?? "BlueWave Cargo"}</span>
      </footer>
    </div>
  </article>
  );
}
