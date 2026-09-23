import { jsPDF } from "jspdf";

import { latinLabel, type PdfTone } from "@/lib/invoice-pdf";

/**
 * THE COMBINED BILL AS A FILE.
 *
 * One customer, several consignments, one payment: the document that answers
 * "how much do I send?" without asking anybody to add four invoices together.
 * It draws the same form the office prints at
 * app/app/finance/payments/new/[customerId]/bill/page.tsx — the house
 * letterhead, the customer, a line per bill, the totals, where to pay and the
 * terms — so the copy the customer holds and the copy on the desk cannot
 * disagree.
 *
 * NOTHING IS MERGED EXCEPT THE PAYMENT. Every line keeps its own invoice
 * number, its own tracking reference and its own pinned rate; this document
 * groups them financially and does nothing else to them.
 *
 * NO VAT LINE ANYWHERE. BlueWave's prices include it, and a bill that names a
 * tax on top of a price that already contains it is a bill that has been paid
 * twice over on paper.
 *
 * Everything arrives already formatted by lib/combined-bill-pdf-data.ts. This
 * module reads no database and does no arithmetic beyond layout: a second place
 * that worked out a balance would be a second place that could disagree with
 * the screen the money was agreed on.
 */

type PaymentLine = {
  number: string;
  name: string;
  institution: string;
  branch: string | null;
};

export type CombinedBillPdfInput = {
  /** A data URL of the logo, read from disk by the caller. */
  logo?: string | null;
  stamp: { label: string; tone: PdfTone };
  company: {
    name: string;
    addressLines: string[];
    taxLine: string | null;
    email: string | null;
    contact: string | null;
    tagline: string;
  };
  customer: {
    headline: string;
    phone: string;
    address: string;
    code: string;
  };
  /** "3 consignments" — what this document covers, said on the band. */
  countLine: string;
  issuedOn: string;
  details: [string, string][];
  /** One line per bill in the group, each with its own figures. */
  rows: {
    reference: string;
    goods: string;
    container: string;
    invoiceNumber: string;
    issuedOn: string;
    /** This bill's OWN pinned rate, as a figure. Never today's. */
    rate: string;
    /** The amount in the bill's own currency, carrying its code. */
    amount: string;
    /** The same amount in shillings at that bill's own rate. */
    amountTzs: string;
  }[];
  totals: {
    rows: [string, string][];
    /** The figure the customer is asked to send. */
    headline: string;
    sub: string | null;
    settled: boolean;
    /** A dollar bill in the group that never had a rate, kept apart. */
    apart: string | null;
  };
  /** What has landed, one transfer per line. Never rolled into one figure. */
  payments: { date: string; reference: string; invoiceNumber: string; amount: string }[];
  banks: PaymentLine[];
  mobile: PaymentLine[];
  terms: string[];
  /** The one-payment note, Kiswahili beside English. */
  notes: { heading: string; body: string }[];
  /** Repeated on continuation pages. */
  reference: string;
};

type RGB = [number, number, number];

const PAGE_W = 595.28; // A4 in points
const PAGE_H = 841.89;
const MARGIN = 40;
const RIGHT = PAGE_W - MARGIN;
const CONTENT = RIGHT - MARGIN;
const BOTTOM = PAGE_H - 34;

const NAVY: RGB = [11, 94, 142];
const NAVY_DEEP: RGB = [12, 58, 87];
const NAVY_RULE: RGB = [42, 128, 180];
const INK: RGB = [23, 23, 23];
const BODY: RGB = [64, 64, 64];
const MUTED: RGB = [115, 115, 115];
const HAIR: RGB = [229, 229, 229];
const PANEL: RGB = [247, 247, 248];
const WHITE: RGB = [255, 255, 255];
const EMERALD: RGB = [5, 150, 105];
const EMERALD_INK: RGB = [4, 120, 87];
const RED_INK: RGB = [185, 28, 28];
const ORANGE: RGB = [234, 74, 92];

const TONES: Record<PdfTone, { line: RGB; fill: RGB; ink: RGB }> = {
  red: { line: [220, 38, 38], fill: [254, 242, 242], ink: RED_INK },
  amber: { line: [245, 158, 11], fill: [255, 251, 235], ink: [180, 83, 9] },
  green: { line: [5, 150, 105], fill: [236, 253, 245], ink: EMERALD_INK },
  grey: { line: [163, 163, 163], fill: [245, 245, 245], ink: [82, 82, 82] },
};

/** See lib/invoice-pdf.ts: the built-in font is WinAnsi and does not fall back. */
function winAnsi(value: string) {
  return String(value)
    .replace(/[→⟶]/g, "—")
    .replace(/[−–]/g, "-")
    .replace(/[≈]/g, "~")
    .replace(/[‘’]/g, "'")
    .replace(/[“”]/g, '"')
    .replace(/[^\x20-\x7E\xA0-\xFF—€]/g, "");
}

export function renderCombinedBillPdf(input: CombinedBillPdfInput): Uint8Array {
  const doc = new jsPDF({ unit: "pt", format: "a4", compress: true });

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
      size = 8.5,
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

  function label(value: string, x: number, y: number, colour = MUTED, size = 6.8) {
    put(value.toUpperCase(), x, y, { size, style: "bold", colour, spacing: 0.9 });
  }

  let y = 0;

  function newPage() {
    doc.addPage();
    fill(NAVY);
    doc.rect(0, 0, PAGE_W, 5, "F");
    put(`${input.reference} — continued`, MARGIN, 32, { size: 8, style: "bold", colour: MUTED });
    y = 48;
  }

  function need(height: number) {
    if (y + height > BOTTOM) {
      newPage();
      return true;
    }
    return false;
  }

  // ------------------------------------------------------------- letterhead
  // The house letterhead the invoice, pickup note and delivery note wear, with
  // the document naming itself: a customer holding four invoices has to know
  // at a glance which sheet is the one to pay from.
  const bandH = 104;
  fill(NAVY);
  doc.rect(0, 0, PAGE_W, bandH, "F");

  const tile = 46;
  fill(WHITE);
  doc.roundedRect(MARGIN, 24, tile, tile, 9, 9, "F");
  if (input.logo) {
    const props = doc.getImageProperties(input.logo);
    const inner = tile - 6;
    const w = props.width >= props.height ? inner : (inner * props.width) / props.height;
    const h = props.width >= props.height ? (inner * props.height) / props.width : inner;
    doc.addImage(input.logo, "PNG", MARGIN + (tile - w) / 2, 24 + (tile - h) / 2, w, h, "logo", "FAST");
  }
  const textX = MARGIN + tile + 12;
  put(input.company.name.toUpperCase(), textX, 38, { size: 13, style: "bold", colour: WHITE, spacing: 1.2 });
  put(input.company.tagline.toUpperCase(), textX, 48, { size: 6, style: "bold", colour: [248, 170, 178], spacing: 1.4 });
  const companyInfo = [input.company.addressLines.join(", "), input.company.taxLine ?? ""]
    .filter(Boolean)
    .flatMap((line) => wrap(line, 230, 6.8));
  lines(companyInfo, textX, 60, 8.5, 6.8, [200, 214, 228]);

  put("MERGED INVOICE", RIGHT, 34, { size: 7.5, style: "bold", align: "right", colour: [159, 216, 245] });
  put("BILI YA PAMOJA", RIGHT, 43, { size: 6, align: "right", colour: [170, 186, 204] });
  put(input.countLine, RIGHT, 62, { size: 15, style: "bold", align: "right", colour: WHITE });
  const tone = TONES[input.stamp.tone];
  const stampText = input.stamp.label.toUpperCase();
  font(6.8, "bold");
  const stampW = doc.getTextWidth(stampText) + stampText.length * 1.3 + 14;
  fill(tone.fill);
  stroke(tone.line, 1.1);
  doc.roundedRect(RIGHT - stampW, 68, stampW, 14, 3, 3, "FD");
  put(stampText, RIGHT - stampW + 7, 77.5, { size: 6.8, style: "bold", colour: tone.ink, spacing: 1.3 });

  const ruleY = bandH - 12;
  const third = CONTENT / 3;
  ([[234, 74, 92], [248, 170, 178], [64, 192, 232]] as RGB[]).forEach((c, i) => {
    fill(c);
    doc.rect(MARGIN + i * third, ruleY, third + 0.5, 3, "F");
  });

  y = bandH + 16;

  // --------------------------------------------------- who, and what this is
  const boxGap = 12;
  const boxW = (CONTENT - boxGap) / 2;
  const pad = 14;
  const rightX = MARGIN + boxW + boxGap;

  const headline = wrap(latinLabel(input.customer.headline, input.customer.code), boxW - pad * 2, 12, "bold");
  const keyW = 44;
  const customerRows = (
    [
      ["Phone", input.customer.phone],
      ["Address", winAnsi(input.customer.address).trim() || "—"],
      ["Code", input.customer.code],
    ] as const
  ).map(([k, v]) => [k, wrap(v, boxW - pad * 2 - keyW, 8.5)] as const);

  const leftH =
    pad + 6 + 17 + (headline.length - 1) * 14 + 12 + 6 +
    customerRows.reduce((sum, [, v]) => sum + v.length * 11 + 4, 0) - 15 + pad;
  const detailRowH = 15;
  const rightH = pad * 2 + 2 + Math.max(0, input.details.length - 1) * detailRowH;
  const infoH = Math.max(leftH, rightH);

  need(infoH);
  fill(PANEL);
  doc.roundedRect(MARGIN, y, boxW, infoH, 5, 5, "F");
  doc.roundedRect(rightX, y, boxW, infoH, 5, 5, "F");

  let ly = y + pad + 6;
  label("Bill to · Mteja", MARGIN + pad, ly);
  ly += 17;
  lines(headline, MARGIN + pad, ly, 14, 12, INK, "bold");
  ly += (headline.length - 1) * 14 + 12 + 6;
  for (const [k, v] of customerRows) {
    put(k, MARGIN + pad, ly, { size: 8.5, style: "bold", colour: MUTED });
    lines(v, MARGIN + pad + keyW, ly, 11, 8.5, INK);
    ly += v.length * 11 + 4;
  }

  let ry = y + pad + 6;
  input.details.forEach(([k, v], i) => {
    put(k, rightX + pad, ry, { size: 8.5, style: "bold", colour: MUTED });
    put(v, rightX + boxW - pad, ry, { size: 8.5, align: "right", colour: INK });
    if (i < input.details.length - 1) {
      stroke(HAIR, 0.6);
      doc.line(rightX + pad, ry + 5, rightX + boxW - pad, ry + 5);
    }
    ry += detailRowH;
  });

  y += infoH + 16;

  // ------------------------------------------------------------- the bills
  const columns = [
    { head: "Tracking", w: 64, right: false },
    { head: "Goods", w: 0, right: false },
    { head: "Container", w: 58, right: false },
    { head: "Invoice", w: 74, right: false },
    { head: "Issued", w: 54, right: false },
    { head: "Rate", w: 40, right: true },
    { head: "Amount", w: 66, right: true },
    { head: "In shillings", w: 74, right: true },
  ];
  columns[1].w = CONTENT - columns.reduce((sum, c) => sum + c.w, 0);
  const colX: number[] = [];
  columns.reduce((x, c) => (colX.push(x), x + c.w), MARGIN);
  const cellPad = 6;
  const headH = 22;

  function tableHead() {
    fill(NAVY);
    doc.rect(MARGIN, y, CONTENT, headH, "F");
    columns.forEach((c, i) => {
      const x = c.right ? colX[i] + c.w - cellPad : colX[i] + cellPad;
      put(c.head.toUpperCase(), x, y + 14, {
        size: 6.2,
        style: "bold",
        colour: WHITE,
        align: c.right ? "right" : "left",
      });
    });
    y += headH;
  }

  need(headH + 30);
  tableHead();

  input.rows.forEach((row, index) => {
    const cells = [
      row.reference,
      latinLabel(row.goods.toUpperCase(), "Goods").toUpperCase(),
      row.container,
      row.invoiceNumber,
      row.issuedOn,
      row.rate,
      row.amount,
      row.amountTzs,
    ].map((value, i) => wrap(value, columns[i].w - cellPad * 2, 7.6, i === 0 || i === 7 ? "bold" : "normal"));
    const rowH = Math.max(...cells.map((c) => c.length)) * 10 + 12;

    if (need(rowH)) tableHead();

    if (index % 2 === 1) {
      fill([250, 250, 250]);
      doc.rect(MARGIN, y, CONTENT, rowH, "F");
    }
    cells.forEach((cell, i) => {
      const c = columns[i];
      font(7.6, i === 0 || i === 7 ? "bold" : "normal");
      ink(i === 2 || i === 3 || i === 4 || i === 5 ? MUTED : INK);
      cell.forEach((line, n) => {
        const x = c.right ? colX[i] + c.w - cellPad : colX[i] + cellPad;
        doc.text(line, x, y + 14 + n * 10, { align: c.right ? "right" : "left" });
      });
    });
    stroke(HAIR, 0.7);
    doc.line(MARGIN, y, MARGIN, y + rowH);
    doc.line(RIGHT, y, RIGHT, y + rowH);
    doc.line(MARGIN, y + rowH, RIGHT, y + rowH);
    y += rowH;
  });

  y += 18;

  // ------------------------------------------------- how to pay, and totals
  const totalsW = 214;
  const payW = CONTENT - totalsW - 20;
  const totalsX = RIGHT - totalsW;
  const accPad = 12;
  const accGap = 14;
  const accW = (payW - accPad * 2 - accGap) / 2;
  const ACC_LEADING = 9.6;

  type Block = { text: string[]; size: number; style: "normal" | "bold"; colour: RGB };
  const account = (a: PaymentLine, mobile: boolean): Block[] => {
    const number: Block = { text: wrap(a.number, accW, 9.5, "bold"), size: 9.5, style: "bold", colour: INK };
    const name: Block = { text: wrap(a.name.toUpperCase(), accW, 7.5), size: 7.5, style: "normal", colour: BODY };
    const where: Block = { text: wrap(a.institution.toUpperCase(), accW, 7.5, "bold"), size: 7.5, style: "bold", colour: NAVY };
    const branch: Block[] = a.branch
      ? [{ text: wrap(a.branch.toUpperCase(), accW, 7.5), size: 7.5, style: "normal", colour: MUTED }]
      : [];
    return mobile ? [where, number, name] : [number, name, where, ...branch];
  };
  const blockH = (blocks: Block[]) => blocks.reduce((sum, b) => sum + b.text.length * ACC_LEADING, 0);

  const grid = (list: PaymentLine[], mobile: boolean) => {
    const entries = list.map((a) => account(a, mobile));
    const rows: Block[][][] = [];
    for (let i = 0; i < entries.length; i += 2) rows.push(entries.slice(i, i + 2));
    const heights = rows.map((row) => Math.max(...row.map(blockH)));
    const height = heights.reduce((s, h) => s + h, 0) + Math.max(0, rows.length - 1) * 8;
    return { rows, heights, height };
  };
  const bankGrid = grid(input.banks, false);
  const mobileGrid = grid(input.mobile, true);
  const hasAccounts = input.banks.length + input.mobile.length > 0;
  const accountsH = hasAccounts
    ? accPad * 2 + bankGrid.height + mobileGrid.height + (input.banks.length && input.mobile.length ? 18 : 0)
    : 0;
  const payH = 16 + accountsH;

  const rowH = 22;
  const dueH = 42 + (input.totals.sub ? 11 : 0) + (input.totals.apart ? 11 : 0);
  const totalsH = input.totals.rows.length * rowH + dueH;

  need(Math.max(payH, totalsH));
  const top = y;

  label("Pay into · Lipa kupitia", MARGIN, top + 6);
  if (hasAccounts) {
    fill(PANEL);
    doc.roundedRect(MARGIN, top + 16, payW, accountsH, 5, 5, "F");
    let ay = top + 16 + accPad + 8;
    const drawGrid = (g: ReturnType<typeof grid>) => {
      g.rows.forEach((row, r) => {
        row.forEach((blocks, c) => {
          let by = ay;
          for (const b of blocks) {
            lines(b.text, MARGIN + accPad + c * (accW + accGap), by, ACC_LEADING, b.size, b.colour, b.style);
            by += b.text.length * ACC_LEADING;
          }
        });
        ay += g.heights[r] + 8;
      });
      ay -= 8;
    };
    drawGrid(bankGrid);
    if (input.banks.length && input.mobile.length) {
      stroke(HAIR, 0.7);
      doc.line(MARGIN + accPad, ay + 1, MARGIN + payW - accPad, ay + 1);
      ay += 18;
    }
    drawGrid(mobileGrid);
  }

  let ty = top;
  if (input.totals.rows.length > 0) {
    fill(NAVY);
    doc.rect(totalsX, ty, totalsW, input.totals.rows.length * rowH, "F");
    input.totals.rows.forEach(([k, v], i) => {
      if (i > 0) {
        stroke(NAVY_RULE, 0.6);
        doc.line(totalsX, ty, RIGHT, ty);
      }
      put(k.toUpperCase(), totalsX + 14, ty + 14.5, { size: 8.5, colour: [216, 226, 238] });
      put(v, RIGHT - 14, ty + 14.5, { size: 8.5, style: "bold", colour: WHITE, align: "right" });
      ty += rowH;
    });
  }

  // The figure the customer is asked to send, in shillings first.
  fill(input.totals.settled ? EMERALD : NAVY_DEEP);
  doc.rect(totalsX, ty, totalsW, dueH, "F");
  label(input.totals.settled ? "Paid in full" : "Total to pay · Jumla", totalsX + 14, ty + 13, [190, 204, 220], 6.3);
  put(input.totals.headline, totalsX + 14, ty + 33, { size: 17, style: "bold", colour: WHITE });
  let sy = ty + 33;
  if (input.totals.sub) {
    sy += 11;
    put(input.totals.sub, totalsX + 14, sy, { size: 7.5, colour: [205, 215, 228] });
  }
  if (input.totals.apart) {
    sy += 11;
    put(input.totals.apart, totalsX + 14, sy, { size: 7.5, colour: [205, 215, 228] });
  }
  ty += dueH;

  y = Math.max(top + payH, ty) + 18;

  // ------------------------------------------------------- what has landed
  // Each transfer on its own line, in the currency it arrived in. Adding a
  // dollar payment to a shilling one would invent a payment nobody made.
  if (input.payments.length > 0) {
    need(30);
    label("Payments received · Malipo yaliyopokelewa", MARGIN, y);
    y += 12;
    input.payments.forEach((payment) => {
      need(12);
      put(`${payment.date}  ·  ${payment.reference}  ·  ${payment.invoiceNumber}`, MARGIN, y + 8, {
        size: 7.8,
        colour: BODY,
      });
      put(payment.amount, RIGHT, y + 8, { size: 7.8, style: "bold", align: "right", colour: EMERALD_INK });
      stroke(HAIR, 0.5);
      doc.line(MARGIN, y + 12, RIGHT, y + 12);
      y += 15;
    });
    y += 6;
  }

  // ---------------------------------------------------- terms and the note
  stroke(HAIR, 0.8);
  need(40);
  doc.line(MARGIN, y, RIGHT, y);
  y += 18;

  if (input.terms.length > 0) {
    need(30);
    label("Terms & conditions", MARGIN, y, [82, 82, 82]);
    y += 15;
    input.terms.forEach((term, i) => {
      const text = wrap(term, CONTENT - 16, 7.8);
      need(text.length * 10 + 3);
      put(`${i + 1}.`, MARGIN, y, { size: 7.8, colour: BODY });
      lines(text, MARGIN + 16, y, 10, 7.8, BODY);
      y += text.length * 10 + 3;
    });
    y += 8;
  }

  if (input.notes.length > 0) {
    const colW = (CONTENT - 28 - 18) / input.notes.length;
    const parts = input.notes.map((note) => ({
      heading: wrap(note.heading.toUpperCase(), colW, 7.5, "bold"),
      body: wrap(note.body, colW, 7.5),
    }));
    const innerH = Math.max(...parts.map((p) => p.heading.length * 10 + 4 + p.body.length * 10));
    const boxH = 20 + innerH + 8;
    need(boxH);
    fill(PANEL);
    doc.roundedRect(MARGIN, y, CONTENT, boxH, 5, 5, "F");
    parts.forEach((p, i) => {
      const x = MARGIN + 14 + i * (colW + 18);
      let py = y + 18;
      lines(p.heading, x, py, 10, 7.5, NAVY, "bold");
      py += p.heading.length * 10 + 4;
      lines(p.body, x, py, 10, 7.5, BODY);
    });
    y += boxH + 8;
  }

  // How to reach us, at the foot where a customer looks for it.
  need(52);
  stroke(HAIR, 0.8);
  doc.line(MARGIN, y, RIGHT, y);
  y += 14;
  label("Contact us · Wasiliana nasi", MARGIN, y, NAVY, 6.8);
  put(input.company.name.toUpperCase(), RIGHT, y, { size: 7.5, style: "bold", align: "right", colour: NAVY });
  y += 10;
  if (input.company.addressLines.length) {
    put(input.company.addressLines.join(", "), MARGIN, y, { size: 7.2, colour: BODY });
  }
  put(input.company.tagline.toUpperCase(), RIGHT, y, { size: 6, style: "bold", align: "right", colour: ORANGE });
  y += 10;
  const reach = [input.company.contact, input.company.email].filter(Boolean).join("  ·  ");
  if (reach) {
    put(reach, MARGIN, y, { size: 7.2, colour: BODY });
    y += 10;
  }
  put(`Issued ${input.issuedOn}`, MARGIN, y, { size: 6.8, colour: MUTED });

  const pages = doc.getNumberOfPages();
  if (pages > 1) {
    for (let p = 1; p <= pages; p++) {
      doc.setPage(p);
      put(`${input.reference} · page ${p} of ${pages}`, RIGHT, PAGE_H - 18, { size: 7, align: "right", colour: MUTED });
    }
  }

  return new Uint8Array(doc.output("arraybuffer"));
}
