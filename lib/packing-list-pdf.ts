import { jsPDF } from "jspdf";

import { formatDate } from "@/lib/format";
import type { PackingSnapshot } from "@/lib/packing-list";

/**
 * THE PACKING LIST AS A FILE.
 *
 * The manifest goes to a shipping line, to a clearing agent and to customs, and
 * every one of them asks for it by email. A print dialog is no answer to that,
 * so this draws the same sheet components/app/packing-list-sheet.tsx renders —
 * letterhead, parties, shipment, totals, every consignment line and the
 * issued-by footing — into a real PDF on the server.
 *
 * Sideways, because the list is eleven columns wide: portrait would set the
 * goods in type nobody can read at a counter.
 *
 * Nothing here computes a figure. The snapshot is the container read back out
 * by lib/packing-list.ts, and every total on the page is summed from the rows
 * printed under it in `packingListPdfInput` — a second arithmetic here would be
 * a second answer to what is in the box.
 */

export type PackingListRow = {
  inquiry: string;
  cargoRef: string;
  description: string;
  /** Printed only when it says something the customer band does not. */
  mark: string | null;
  bale: string | null;
  model: string;
  qty: string;
  pcs: string;
  unit: string;
  amount: string;
  cbm: string;
  gw: string;
  nw: string;
};

export type PackingListGroup = {
  index: string;
  customer: string;
  code: string;
  phone: string;
  /** The shipping mark, when it is not simply the customer's name again. */
  mark: string | null;
  rows: PackingListRow[];
  subtotal: { qty: string; pcs: string; amount: string; cbm: string; gw: string; nw: string };
};

export type PackingListPdfInput = {
  logo?: string | null;
  company: { name: string; tagline: string; address: string | null; contact: string | null };
  /** "PL-2026-000001" or "PROVISIONAL", with the line that dates it. */
  title: { number: string; dateLine: string };
  parties: { label: string; name: string; detail: string | null }[];
  shipment: [string, string][];
  glance: [string, string][];
  groups: PackingListGroup[];
  totals: {
    headline: string;
    qty: string;
    pcs: string;
    amount: string;
    cbm: string;
    gw: string;
    nw: string;
  };
  /** Who issued it and when, or that nobody has — and what the value column means. */
  footnote: string;
  /** The container's own reference, repeated on continuation pages. */
  reference: string;
};

type RGB = [number, number, number];

const PAGE_W = 841.89; // A4 landscape in points
const PAGE_H = 595.28;
const MARGIN = 32;
const RIGHT = PAGE_W - MARGIN;
const CONTENT = RIGHT - MARGIN;
const BOTTOM = PAGE_H - 28;

const NAVY: RGB = [10, 51, 80]; // the sheet's own #0a3350
const INK: RGB = [11, 27, 43];
const BODY: RGB = [64, 64, 64];
const MUTED: RGB = [115, 115, 115];
const FAINT: RGB = [163, 163, 163];
const HAIR: RGB = [214, 226, 238];
const ROW_LINE: RGB = [227, 234, 241];
const PANEL: RGB = [245, 249, 252];
const ZEBRA: RGB = [247, 250, 252];
const WHITE: RGB = [255, 255, 255];
const CORAL: RGB = [234, 74, 92];
const PEACH: RGB = [255, 242, 234];
const PEACH_LINE: RGB = [244, 199, 169];
const PEACH_INK: RGB = [179, 68, 15];
const APRICOT: RGB = [255, 178, 125];
const SKY: RGB = [159, 216, 245];

/* The built-in Helvetica only draws Windows-1252. A Chinese product name would
   print as a row of stray marks with the rest of the line letter-spaced into
   garbage, so it is dropped here and the English name carries the row. */
function winAnsi(value: string) {
  return String(value ?? "")
    .replace(/[→⟶]/g, "—")
    .replace(/[−–]/g, "-")
    .replace(/[‘’]/g, "'")
    .replace(/[“”]/g, '"')
    .replace(/[^\x20-\x7E\xA0-\xFF—€]/g, "");
}

function orElse(text: string | null | undefined, fallback: string): string {
  const kept = winAnsi(text ?? "").replace(/\(\s*\)/g, "").replace(/\s{2,}/g, " ").trim();
  return kept.length > 0 ? kept : fallback;
}

type Column = { head: string; w: number; right: boolean };

const COLUMNS: Column[] = [
  { head: "Inquiry no.", w: 11, right: false },
  { head: "Description", w: 26, right: false },
  { head: "Model", w: 9, right: false },
  { head: "Qty", w: 6, right: true },
  { head: "Pcs/set", w: 7, right: true },
  { head: "Unit USD", w: 8, right: true },
  { head: "Amount USD", w: 9, right: true },
  { head: "CBM", w: 8, right: true },
  { head: "G.W. kg", w: 8, right: true },
  { head: "N.W. kg", w: 8, right: true },
];

export function renderPackingListPdf(input: PackingListPdfInput): Uint8Array {
  const doc = new jsPDF({ unit: "pt", format: "a4", orientation: "landscape", compress: true });

  const ink = (c: RGB) => doc.setTextColor(c[0], c[1], c[2]);
  const fill = (c: RGB) => doc.setFillColor(c[0], c[1], c[2]);
  const stroke = (c: RGB, width = 0.6) => {
    doc.setDrawColor(c[0], c[1], c[2]);
    doc.setLineWidth(width);
  };
  const font = (size: number, style: "normal" | "bold" = "normal") => {
    doc.setFontSize(size);
    doc.setFont("helvetica", style);
  };

  function put(
    value: string,
    x: number,
    y: number,
    {
      size = 8,
      style = "normal" as "normal" | "bold",
      align = "left" as "left" | "right" | "center",
      colour = INK,
      spacing = 0,
    } = {}
  ) {
    font(size, style);
    ink(colour);
    doc.text(winAnsi(value), x, y, align === "left" && spacing ? { charSpace: spacing } : { align });
  }

  function wrap(value: string, width: number, size: number, style: "normal" | "bold" = "normal"): string[] {
    font(size, style);
    return doc.splitTextToSize(winAnsi(value), width) as string[];
  }

  function lines(
    value: string[],
    x: number,
    y: number,
    leading: number,
    size: number,
    colour: RGB,
    style: "normal" | "bold" = "normal"
  ) {
    font(size, style);
    ink(colour);
    value.forEach((line, i) => doc.text(line, x, y + i * leading));
  }

  function label(value: string, x: number, y: number, colour = MUTED, size = 6) {
    put(value.toUpperCase(), x, y, { size, style: "bold", colour, spacing: 0.8 });
  }

  const colW = COLUMNS.map((c) => (c.w / 100) * CONTENT);
  const colX: number[] = [];
  colW.reduce((x, w) => (colX.push(x), x + w), MARGIN);
  const cellPad = 4;

  let y = 0;

  function newPage() {
    doc.addPage();
    fill(NAVY);
    doc.rect(0, 0, PAGE_W, 4, "F");
    put(`${input.reference} · ${input.title.number} — continued`, MARGIN, 26, {
      size: 7.5,
      style: "bold",
      colour: MUTED,
    });
    y = 38;
  }

  /** The column heading, repeated at the top of every page the table runs onto. */
  function tableHead() {
    const headH = 17;
    fill(NAVY);
    doc.rect(MARGIN, y, CONTENT, headH, "F");
    COLUMNS.forEach((c, i) => {
      const x = c.right ? colX[i] + colW[i] - cellPad : colX[i] + cellPad;
      put(c.head.toUpperCase(), x, y + 11, {
        size: 6,
        style: "bold",
        colour: WHITE,
        align: c.right ? "right" : "left",
      });
    });
    y += headH;
  }

  function need(height: number) {
    if (y + height > BOTTOM) {
      newPage();
      tableHead();
      return true;
    }
    return false;
  }

  // ------------------------------------------------------------- letterhead
  const logoW = 44;
  let textX = MARGIN;
  if (input.logo) {
    try {
      const props = doc.getImageProperties(input.logo);
      const h = Math.min(logoW, (logoW * props.height) / props.width);
      doc.addImage(input.logo, "PNG", MARGIN, 26, (h * props.width) / props.height, h, "logo", "FAST");
      textX = MARGIN + (h * props.width) / props.height + 12;
    } catch {
      /* A list without its mark still has to clear customs; the name carries it. */
    }
  }
  put(input.company.name.toUpperCase(), textX, 42, { size: 15, style: "bold", colour: NAVY, spacing: 1.1 });
  put(input.company.tagline.toUpperCase(), textX, 51, { size: 6, style: "bold", colour: CORAL, spacing: 1.3 });
  let hy = 61;
  if (input.company.address) {
    const addr = wrap(input.company.address, 300, 6.5);
    lines(addr.slice(0, 2), textX, hy, 8, 6.5, BODY);
    hy += Math.min(addr.length, 2) * 8;
  }
  if (input.company.contact) put(input.company.contact, textX, hy, { size: 6.5, colour: BODY });

  put("PACKING LIST", RIGHT, 42, { size: 15, style: "bold", align: "right", colour: NAVY });
  put("& INVOICE", RIGHT, 51, { size: 6.5, style: "bold", align: "right", colour: CORAL, spacing: 1.2 });
  put(input.title.number, RIGHT, 65, { size: 11, style: "bold", align: "right" });
  put(input.title.dateLine, RIGHT, 74, { size: 6.5, align: "right", colour: MUTED });

  stroke(NAVY, 2);
  doc.line(MARGIN, 82, RIGHT, 82);
  y = 92;

  // ---------------------------------------------------------------- parties
  const partyGap = 10;
  const partyW = (CONTENT - partyGap) / Math.max(input.parties.length, 1);
  const partyDetails = input.parties.map((p) =>
    p.detail ? wrap(p.detail, partyW - 20, 6.5) : []
  );
  const partyH = 26 + Math.max(0, ...partyDetails.map((d) => d.length * 8));
  input.parties.forEach((party, i) => {
    const px = MARGIN + i * (partyW + partyGap);
    fill(PANEL);
    stroke(HAIR, 0.7);
    doc.roundedRect(px, y, partyW, partyH, 4, 4, "FD");
    label(party.label, px + 9, y + 11, CORAL, 5.8);
    put(orElse(party.name.toUpperCase(), "—"), px + 9, y + 21, { size: 8.5, style: "bold" });
    lines(partyDetails[i], px + 9, y + 30, 8, 6.5, BODY);
  });
  y += partyH + 8;

  // --------------------------------------------------------------- shipment
  const shipCols = 5;
  const shipW = CONTENT / shipCols;
  const shipRows = Math.ceil(input.shipment.length / shipCols);
  const shipRowH = 22;
  stroke(HAIR, 0.7);
  doc.roundedRect(MARGIN, y, CONTENT, shipRows * shipRowH, 4, 4, "S");
  input.shipment.forEach(([k, v], i) => {
    const sx = MARGIN + (i % shipCols) * shipW;
    const sy = y + Math.floor(i / shipCols) * shipRowH;
    label(k, sx + 7, sy + 9, MUTED, 5.5);
    put(orElse(v, "—"), sx + 7, sy + 18, { size: 8, style: "bold" });
    if (i % shipCols !== 0) {
      stroke(HAIR, 0.6);
      doc.line(sx, sy + 4, sx, sy + shipRowH - 4);
    }
    if (i >= shipCols) {
      stroke(HAIR, 0.6);
      doc.line(sx + 4, sy, sx + shipW - 4, sy);
    }
  });
  y += shipRows * shipRowH + 8;

  // ------------------------------------------------------------- at a glance
  const glanceW = CONTENT / Math.max(input.glance.length, 1);
  const glanceH = 24;
  fill(NAVY);
  doc.roundedRect(MARGIN, y, CONTENT, glanceH, 4, 4, "F");
  input.glance.forEach(([k, v], i) => {
    const gx = MARGIN + i * glanceW;
    label(k, gx + 8, y + 10, SKY, 5.5);
    put(v, gx + 8, y + 19, { size: 9, style: "bold", colour: WHITE });
    if (i > 0) {
      stroke([255, 255, 255], 0.4);
      doc.line(gx, y + 5, gx, y + glanceH - 5);
    }
  });
  y += glanceH + 10;

  // ------------------------------------------------------------- the goods
  tableHead();

  const bandH = 20;
  const subH = 14;

  input.groups.forEach((group) => {
    // The customer heads their own block rather than running down a margin
    // column: a block split across a page break would otherwise lose its name,
    // and a mixed container is read by somebody looking for one name.
    need(bandH + 16);
    fill(PANEL);
    doc.rect(MARGIN, y, CONTENT, bandH, "F");
    fill(CORAL);
    doc.circle(MARGIN + 13, y + 10, 5.5, "F");
    put(group.index, MARGIN + 13, y + 12, { size: 6, style: "bold", align: "center", colour: WHITE });
    put(orElse(group.customer.toUpperCase(), group.code), MARGIN + 24, y + 13, { size: 9, style: "bold" });
    font(9, "bold");
    const nameW = doc.getTextWidth(winAnsi(orElse(group.customer.toUpperCase(), group.code)));
    put(`${group.code} · ${group.phone}`, MARGIN + 30 + nameW, y + 13, { size: 7, colour: MUTED });
    if (group.mark) {
      put(`Mark: ${orElse(group.mark.toUpperCase(), "—")}`, RIGHT - 8, y + 13, {
        size: 7,
        style: "bold",
        align: "right",
        colour: NAVY,
      });
    }
    y += bandH;

    group.rows.forEach((row, ri) => {
      const description = [
        ...wrap(orElse(row.description.toUpperCase(), "GOODS"), colW[1] - cellPad * 2, 7.5, "bold"),
        ...(row.mark ? wrap(`Mark: ${row.mark.toUpperCase()}`, colW[1] - cellPad * 2, 6.5) : []),
        ...(row.bale ? wrap(`Bale ${row.bale}`, colW[1] - cellPad * 2, 6.5) : []),
      ];
      const inquiry = [orElse(row.inquiry, "—"), row.cargoRef];
      const cells: string[][] = [
        [],
        description,
        wrap(orElse(row.model, "—"), colW[2] - cellPad * 2, 7.5),
        [row.qty],
        [row.pcs],
        [row.unit],
        [row.amount],
        [row.cbm],
        [row.gw],
        [row.nw],
      ];
      const rowH = Math.max(inquiry.length * 9 + 8, ...cells.map((c) => c.length * 9 + 8), 18);

      need(rowH + subH);

      if (ri % 2 === 1) {
        fill(ZEBRA);
        doc.rect(MARGIN, y, CONTENT, rowH, "F");
      }

      put(inquiry[0], colX[0] + cellPad, y + 11, { size: 7.5, style: "bold" });
      put(inquiry[1], colX[0] + cellPad, y + 19, { size: 6.5, colour: FAINT });

      cells.forEach((cell, i) => {
        if (i === 0 || cell.length === 0) return;
        const c = COLUMNS[i];
        const x = c.right ? colX[i] + colW[i] - cellPad : colX[i] + cellPad;
        font(7.5, i === 1 || i === 6 ? "bold" : "normal");
        ink(i === 2 ? BODY : INK);
        cell.forEach((line, n) => {
          /* The mark and the bale under a description are smaller and greyer,
             the way the screen sets them. */
          const minor = i === 1 && n >= 1 && line !== cell[0];
          font(minor ? 6.5 : 7.5, !minor && (i === 1 || i === 6) ? "bold" : "normal");
          ink(minor ? MUTED : i === 2 ? BODY : INK);
          doc.text(line, x, y + 11 + n * 9, { align: c.right ? "right" : "left" });
        });
      });

      stroke(ROW_LINE, 0.6);
      doc.line(MARGIN, y + rowH, RIGHT, y + rowH);
      y += rowH;
    });

    // Subtotal, under each customer, as the paper list has always carried it.
    need(subH);
    fill(PEACH);
    doc.rect(MARGIN, y, CONTENT, subH, "F");
    put(`SUBTOTAL · ${orElse(group.customer.toUpperCase(), group.code)}`, MARGIN + cellPad, y + 10, {
      size: 6.5,
      style: "bold",
      colour: PEACH_INK,
      spacing: 0.8,
    });
    (
      [
        [3, group.subtotal.qty],
        [4, group.subtotal.pcs],
        [6, group.subtotal.amount],
        [7, group.subtotal.cbm],
        [8, group.subtotal.gw],
        [9, group.subtotal.nw],
      ] as [number, string][]
    ).forEach(([i, v]) => {
      put(v, colX[i] + colW[i] - cellPad, y + 10, { size: 7, style: "bold", align: "right", colour: PEACH_INK });
    });
    stroke(PEACH_LINE, 1.2);
    doc.line(MARGIN, y + subH, RIGHT, y + subH);
    y += subH + 2;
  });

  // ------------------------------------------------------------ grand total
  const totalH = 18;
  need(totalH);
  fill(NAVY);
  doc.rect(MARGIN, y, CONTENT, totalH, "F");
  put(input.totals.headline.toUpperCase(), MARGIN + cellPad, y + 12, {
    size: 6.8,
    style: "bold",
    colour: WHITE,
    spacing: 0.8,
  });
  (
    [
      [3, input.totals.qty, WHITE],
      [4, input.totals.pcs, WHITE],
      [6, input.totals.amount, WHITE],
      [7, input.totals.cbm, APRICOT],
      [8, input.totals.gw, WHITE],
      [9, input.totals.nw, WHITE],
    ] as [number, string, RGB][]
  ).forEach(([i, v, colour]) => {
    put(v, colX[i] + colW[i] - cellPad, y + 12, { size: 8, style: "bold", align: "right", colour });
  });
  y += totalH + 14;

  // ------------------------------------------------------------- signatures
  if (y + 52 > BOTTOM) newPage();
  const sigW = (CONTENT - 60) / 3;
  ["Prepared by (Foshan)", "Checked by", "Received at Dar es Salaam"].forEach((title, i) => {
    const sx = MARGIN + i * (sigW + 30);
    stroke(FAINT, 0.7);
    doc.setLineDashPattern([2, 2], 0);
    doc.line(sx, y + 20, sx + sigW, y + 20);
    doc.setLineDashPattern([], 0);
    put(title.toUpperCase(), sx, y + 29, { size: 6, style: "bold", colour: [82, 82, 82], spacing: 0.8 });
    put("Name · signature · date", sx, y + 37, { size: 6, colour: FAINT });
  });
  y += 48;

  stroke(HAIR, 0.8);
  doc.line(MARGIN, y, RIGHT, y);
  y += 10;
  const foot = wrap(input.footnote, CONTENT - 160, 6.5);
  lines(foot, MARGIN, y, 8, 6.5, MUTED);
  put(input.company.name.toUpperCase(), RIGHT, y, { size: 7, style: "bold", align: "right", colour: NAVY, spacing: 1 });

  const pages = doc.getNumberOfPages();
  if (pages > 1) {
    for (let p = 1; p <= pages; p++) {
      doc.setPage(p);
      put(`${input.title.number} · page ${p} of ${pages}`, RIGHT, PAGE_H - 14, {
        size: 6.5,
        align: "right",
        colour: MUTED,
      });
    }
  }

  return new Uint8Array(doc.output("arraybuffer"));
}

const num = (v: number | null, digits = 0) =>
  v === null
    ? "—"
    : v.toLocaleString("en-US", { minimumFractionDigits: digits, maximumFractionDigits: digits });
const usd = (v: number | null) => (v === null ? "—" : num(v, 2));
const kg = (v: number | null) => (v === null ? "—" : num(v, 2));
const maybe = (v: string | null | undefined) => (v == null || v === "" ? null : Number(v));

/**
 * The snapshot, set out the way the printed sheet sets it out.
 *
 * One block per customer in the order they were loaded, every kind of goods on
 * its own row, a subtotal under each customer and a grand total under them all
 * — the shape of the paper list Foshan has always sent, so nobody reading it at
 * a port has to learn a new document.
 *
 * Pure, and kept beside the renderer rather than in the route: the file a
 * clearing agent is sent and the file a script writes on a laptop are laid out
 * by one function.
 */
export function packingListPdfInput(
  snap: PackingSnapshot,
  list: { number: string; issuedAt: Date; issuedBy: string | null } | null,
  company: {
    name: string | null;
    tagline: string | null;
    chinaEntity: string | null;
    darEntity: string | null;
    chinaAddress: string | null;
    darAddress: string | null;
    phone: string | null;
    altPhone: string | null;
    email: string | null;
  } | null
): PackingListPdfInput {
  type Row = PackingListRow & { qtyN: number; pcsN: number | null; amountN: number | null; cbmN: number; gwN: number | null; nwN: number | null };

  const groups: { code: string; customer: string; phone: string; mark: string | null; rows: Row[] }[] = [];
  const byCode = new Map<string, (typeof groups)[number]>();

  for (const line of snap.lines) {
    let group = byCode.get(line.customerCode);
    if (!group) {
      group = { code: line.customerCode, customer: line.customer, phone: line.phone, mark: null, rows: [] };
      byCode.set(line.customerCode, group);
      groups.push(group);
    }
    const row = (values: {
      reference: string;
      inquiry: string | null;
      description: string;
      mark: string | null;
      bale: string | null;
      model: string | null;
      qty: number;
      pcs: number | null;
      unit: number | null;
      amount: number | null;
      cbm: number;
      gw: number | null;
      nw: number | null;
    }): Row => ({
      inquiry: values.inquiry ?? "—",
      cargoRef: values.reference,
      description: values.description,
      mark: values.mark,
      bale: values.bale,
      model: values.model ?? "—",
      qty: num(values.qty),
      pcs: num(values.pcs),
      unit: usd(values.unit),
      amount: usd(values.amount),
      /* A line whose volume was measured on the consignment above it says so,
         rather than printing a zero somebody would read as "no space". */
      cbm: values.cbm > 0 ? num(values.cbm, 3) : "with above",
      gw: kg(values.gw),
      nw: kg(values.nw),
      qtyN: values.qty,
      pcsN: values.pcs,
      amountN: values.amount,
      cbmN: values.cbm,
      gwN: values.gw,
      nwN: values.nw,
    });

    if (line.items && line.items.length > 0) {
      for (const item of line.items) {
        group.rows.push(
          row({
            reference: line.cargoReference,
            inquiry: item.paperReceiptNo ?? line.paperReceiptNo,
            description: item.description ?? line.description,
            mark: line.shippingMark,
            bale: item.balerNumber,
            model: item.modelNo ?? null,
            qty: item.quantity,
            pcs: item.pieces,
            unit: maybe(item.unitValue),
            amount: maybe(item.amount),
            cbm: Number(item.cbm),
            gw: maybe(item.weightKg),
            nw: maybe(item.netWeightKg),
          })
        );
      }
    } else {
      group.rows.push(
        row({
          reference: line.cargoReference,
          inquiry: line.paperReceiptNo,
          description: line.description,
          mark: line.shippingMark,
          bale: null,
          model: null,
          qty: line.packages,
          pcs: line.pieces,
          unit: null,
          amount: null,
          cbm: Number(line.cbm),
          gw: maybe(line.weightKg),
          nw: null,
        })
      );
    }
  }

  const sum = (rows: Row[], pick: (r: Row) => number | null) => {
    const values = rows.map(pick).filter((v): v is number => v !== null);
    return values.length ? values.reduce((a, b) => a + b, 0) : null;
  };
  const all = groups.flatMap((g) => g.rows);
  const totals = {
    qty: sum(all, (r) => r.qtyN) ?? 0,
    pcs: sum(all, (r) => r.pcsN),
    amount: sum(all, (r) => r.amountN),
    cbm: sum(all, (r) => r.cbmN) ?? 0,
    gw: sum(all, (r) => r.gwN),
    nw: sum(all, (r) => r.nwN),
  };

  const shipper = company?.chinaEntity || company?.name || "BlueWave Cargo";
  const consignee = company?.darEntity || company?.name || "BlueWave Cargo";
  const date = (value: string | null) => (value ? formatDate(new Date(value)) : "—");

  return {
    company: {
      name: company?.name ?? "BlueWave Cargo",
      tagline: company?.tagline ?? "From sourcing to delivery",
      address: company?.chinaAddress ?? null,
      contact: [company?.phone, company?.altPhone, company?.email].filter(Boolean).join(" · ") || null,
    },
    title: {
      number: list ? list.number : "PROVISIONAL",
      dateLine: `${list ? `Date ${formatDate(list.issuedAt)}` : "Updates as cargo is loaded"}${
        snap.version > 1 ? ` · drawing ${snap.version}` : ""
      }`,
    },
    parties: [
      { label: "Shipper", name: shipper, detail: company?.chinaAddress ?? null },
      { label: "Consignee (To)", name: consignee, detail: company?.darAddress ?? null },
    ],
    shipment: [
      ["Container no.", snap.container],
      ["Seal no.", snap.sealNumber ?? "—"],
      ["Vessel / voyage", snap.vessel ? `${snap.vessel}${snap.voyage ? ` / ${snap.voyage}` : ""}` : "—"],
      ["Shipping line", snap.shippingLine ?? "—"],
      ["Our reference", snap.reference],
      ["Port of loading", snap.originPort ?? "—"],
      ["Port of discharge", snap.destinationPort ?? "—"],
      ["Packed", date(snap.packedAt)],
      ["Sailed", date(snap.shippedAt)],
      ["ETA", date(snap.eta)],
    ],
    glance: [
      ["Customers", num(groups.length)],
      ["Consignments", num(snap.lines.length)],
      ["Packages", num(totals.qty)],
      ["Pieces", num(totals.pcs)],
      ["Volume CBM", num(totals.cbm, 3)],
      ["Gross kg", kg(totals.gw)],
      ["Value USD", usd(totals.amount)],
    ],
    groups: groups.map((group, i) => {
      /* The mark only when it says something the name does not. */
      const groupMark = group.rows[0]?.mark ?? group.customer;
      const distinct = groupMark.trim().toLowerCase() !== group.customer.trim().toLowerCase();
      return {
        index: String(i + 1),
        customer: group.customer,
        code: group.code,
        phone: group.phone,
        mark: distinct ? groupMark : null,
        rows: group.rows.map((row) => ({
          ...row,
          mark: row.mark && row.mark !== groupMark ? row.mark : null,
        })),
        subtotal: {
          qty: num(sum(group.rows, (r) => r.qtyN) ?? 0),
          pcs: num(sum(group.rows, (r) => r.pcsN)),
          amount: usd(sum(group.rows, (r) => r.amountN)),
          cbm: num(sum(group.rows, (r) => r.cbmN) ?? 0, 3),
          gw: kg(sum(group.rows, (r) => r.gwN)),
          nw: kg(sum(group.rows, (r) => r.nwN)),
        },
      };
    }),
    totals: {
      headline: `Grand total · ${groups.length} customer${groups.length === 1 ? "" : "s"} · ${
        snap.lines.length
      } consignment${snap.lines.length === 1 ? "" : "s"}`,
      qty: num(totals.qty),
      pcs: num(totals.pcs),
      amount: usd(totals.amount),
      cbm: num(totals.cbm, 3),
      gw: kg(totals.gw),
      nw: kg(totals.nw),
    },
    footnote: `${
      list
        ? `Issued by ${snap.issuedBy ?? list.issuedBy ?? "BlueWave Cargo"} on ${formatDate(
            snap.issuedAt ? new Date(snap.issuedAt) : list.issuedAt
          )}${snap.version > 1 ? ` · drawing ${snap.version}, frozen at the seal` : ""}.`
        : "Not yet issued — drawn from what is in the container now, and frozen when it is sealed."
    } Unit price and amount are the declared value of the goods for customs, in US dollars — not the freight charge.`,
    reference: snap.reference,
  };
}
