import { jsPDF } from "jspdf";

/**
 * THE DELIVERY NOTE AS A FILE.
 *
 * The paper the customer keeps, drawn from the note's own snapshot exactly as
 * app/app/cargo/[id]/delivery-note/page.tsx draws it on screen. The record can
 * be corrected afterwards; this document made a claim on a date and has to go
 * on making the same one, or it is no longer evidence of anything — so nothing
 * here reads the live cargo row and nothing here works a figure out.
 */

export type DeliveryNotePdfInput = {
  logo?: string | null;
  /** The consignment's own code, as a PNG data URL. Never composed here. */
  qr?: string | null;
  company: {
    name: string;
    addressLines: string[];
    contact: string | null;
    tagline: string;
  };
  reference: string;
  issuedOn: string;
  stamp: string;
  customer: { name: string; code: string; phone: string; mark: string | null };
  details: [string, string][];
  goods: string;
  lines: {
    reference: string;
    goods: string;
    packedAs: string;
    bale: string | null;
    quantity: string;
    dimensions: string;
    cbm: string;
    weight: string;
  }[];
  totals: { quantity: string; cbm: string; weight: string };
  notes: { heading: string; body: string }[];
  /** Who took the goods in, for the second signature block. */
  receivedBy: string | null;
};

type RGB = [number, number, number];

const PAGE_W = 595.28; // A4 in points
const PAGE_H = 841.89;
const MARGIN = 40;
const RIGHT = PAGE_W - MARGIN;
const CONTENT = RIGHT - MARGIN;
const BOTTOM = PAGE_H - 34;

const NAVY: RGB = [10, 51, 80];
const INK: RGB = [11, 27, 43];
const BODY: RGB = [64, 64, 64];
const MUTED: RGB = [115, 115, 115];
const FAINT: RGB = [163, 163, 163];
const HAIR: RGB = [214, 226, 238];
const PANEL: RGB = [245, 249, 252];
const ZEBRA: RGB = [245, 249, 252];
const WHITE: RGB = [255, 255, 255];
const PEACH: RGB = [255, 242, 234];
const PEACH_INK: RGB = [179, 68, 15];
const SKY: RGB = [159, 216, 245];
const EMERALD: RGB = [5, 150, 105];

function winAnsi(value: string) {
  return String(value ?? "")
    .replace(/[→⟶]/g, "—")
    .replace(/[−–]/g, "-")
    .replace(/[‘’]/g, "'")
    .replace(/[“”]/g, '"')
    .replace(/[^\x20-\x7E\xA0-\xFF—€]/g, "");
}

/**
 * Foshan types descriptions in Chinese, and every Chinese character is dropped
 * from the page rather than drawn. A line whose description vanished is a
 * measurement against nothing, so an emptied label takes a word that cannot
 * itself disappear.
 */
function orElse(text: string | null | undefined, fallback: string): string {
  const kept = winAnsi(text ?? "").replace(/\(\s*\)/g, "").replace(/\s{2,}/g, " ").trim();
  return kept.length > 0 ? kept : fallback;
}

const COLUMNS: { head: string; w: number; right: boolean }[] = [
  { head: "Line", w: 14, right: false },
  { head: "Goods", w: 26, right: false },
  { head: "Packed as", w: 16, right: false },
  { head: "Qty", w: 8, right: true },
  { head: "L × W × H", w: 18, right: true },
  { head: "CBM", w: 9, right: true },
  { head: "Weight", w: 9, right: true },
];

export function renderDeliveryNotePdf(input: DeliveryNotePdfInput): Uint8Array {
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

  function label(value: string, x: number, y: number, colour = MUTED, size = 6.5) {
    put(value.toUpperCase(), x, y, { size, style: "bold", colour, spacing: 1 });
  }

  function clip(value: string, width: number, size: number, style: "normal" | "bold" = "normal") {
    const [first = ""] = wrap(value, width, size, style);
    return first;
  }

  const colW = COLUMNS.map((c) => (c.w / 100) * CONTENT);
  const colX: number[] = [];
  colW.reduce((x, w) => (colX.push(x), x + w), MARGIN);
  const cellPad = 6;

  let y = 0;

  function newPage() {
    doc.addPage();
    fill(NAVY);
    doc.rect(0, 0, PAGE_W, 5, "F");
    put(`${input.reference} — continued`, MARGIN, 32, { size: 8, style: "bold", colour: MUTED });
    y = 48;
  }

  function tableHead() {
    const headH = 19;
    fill(NAVY);
    doc.rect(MARGIN, y, CONTENT, headH, "F");
    COLUMNS.forEach((c, i) => {
      const x = c.right ? colX[i] + colW[i] - cellPad : colX[i] + cellPad;
      put(c.head.toUpperCase(), x, y + 12.5, {
        size: 6.3,
        style: "bold",
        colour: WHITE,
        align: c.right ? "right" : "left",
      });
    });
    y += headH;
  }

  function need(height: number, repeatHead = false) {
    if (y + height > BOTTOM) {
      newPage();
      if (repeatHead) tableHead();
      return true;
    }
    return false;
  }

  // ------------------------------------------------------------- letterhead
  const bandH = 104;
  fill(NAVY);
  doc.rect(0, 0, PAGE_W, bandH, "F");

  const tile = 46;
  fill(WHITE);
  doc.roundedRect(MARGIN, 22, tile, tile, 9, 9, "F");
  if (input.logo) {
    try {
      const props = doc.getImageProperties(input.logo);
      const inner = tile - 6;
      const w = props.width >= props.height ? inner : (inner * props.width) / props.height;
      const h = props.width >= props.height ? (inner * props.height) / props.width : inner;
      doc.addImage(input.logo, "PNG", MARGIN + (tile - w) / 2, 22 + (tile - h) / 2, w, h, "logo", "FAST");
    } catch {
      /* A note without its mark is still the customer's receipt. */
    }
  }
  const textX = MARGIN + tile + 12;
  put(input.company.name.toUpperCase(), textX, 36, { size: 13, style: "bold", colour: WHITE, spacing: 1.2 });
  put(input.company.tagline.toUpperCase(), textX, 46, { size: 6, style: "bold", colour: [255, 178, 125], spacing: 1.4 });
  lines(
    [input.company.addressLines.join(", "), input.company.contact ?? ""]
      .filter(Boolean)
      .flatMap((line) => wrap(line, 250, 6.8))
      .slice(0, 3),
    textX,
    58,
    8.5,
    6.8,
    [200, 214, 228]
  );

  put("DELIVERY NOTE", RIGHT, 34, { size: 7.5, style: "bold", align: "right", colour: SKY });
  put("HATI YA KUPOKEA MZIGO", RIGHT, 43, { size: 6, align: "right", colour: [170, 186, 204] });
  put(input.reference, RIGHT, 64, { size: 17, style: "bold", align: "right", colour: WHITE });
  put(`Issued ${input.issuedOn}`, RIGHT, 76, { size: 7, align: "right", colour: [205, 215, 228] });

  const ruleY = bandH - 12;
  const third = CONTENT / 3;
  ([[234, 74, 92], [255, 178, 125], [92, 205, 239]] as RGB[]).forEach((c, i) => {
    fill(c);
    doc.rect(MARGIN + i * third, ruleY, third + 0.5, 3, "F");
  });

  y = bandH + 18;

  // -------------------------------------------------- whose, and the code
  const qrW = input.qr ? 150 : 0;
  const gap = input.qr ? 12 : 0;
  const whoW = CONTENT - qrW - gap;
  const pad = 14;
  const name = wrap(orElse(input.customer.name.toUpperCase(), input.customer.code), whoW - pad * 2, 15, "bold");
  const whoH = Math.max(pad + 8 + 18 + (name.length - 1) * 17 + 14 + (input.customer.mark ? 13 : 0) + 24 + pad, 132);

  need(whoH);
  const top = y;

  fill(PANEL);
  stroke(HAIR, 0.8);
  doc.roundedRect(MARGIN, top, whoW, whoH, 8, 8, "FD");

  let ly = top + pad + 8;
  label("Customer · Mteja", MARGIN + pad, ly);
  ly += 18;
  lines(name, MARGIN + pad, ly, 17, 15, INK, "bold");
  ly += (name.length - 1) * 17 + 13;
  put(`${input.customer.code} · ${input.customer.phone}`, MARGIN + pad, ly, { size: 9, colour: BODY });
  if (input.customer.mark) {
    ly += 13;
    put("Shipping mark", MARGIN + pad, ly, { size: 8, colour: MUTED });
    font(8);
    put(orElse(input.customer.mark, "—"), MARGIN + pad + doc.getTextWidth("Shipping mark ") + 4, ly, {
      size: 8,
      style: "bold",
    });
  }

  const chipY = top + whoH - pad - 13;
  const stampText = input.stamp.toUpperCase();
  font(7, "bold");
  const stampW = doc.getTextWidth(stampText) + stampText.length * 1.2 + 16;
  fill([236, 253, 245]);
  stroke(EMERALD, 1.1);
  doc.roundedRect(MARGIN + pad, chipY, stampW, 15, 3, 3, "FD");
  put(stampText, MARGIN + pad + 8, chipY + 10, { size: 7, style: "bold", colour: [4, 120, 87], spacing: 1.2 });

  const keep = "KEEP THIS NOTE · HIFADHI HATI HII";
  font(6.5, "bold");
  const keepW = doc.getTextWidth(keep) + keep.length + 18;
  fill(NAVY);
  doc.roundedRect(MARGIN + pad + stampW + 8, chipY, keepW, 15, 7.5, 7.5, "F");
  put(keep, MARGIN + pad + stampW + 17, chipY + 10, { size: 6.5, style: "bold", colour: WHITE, spacing: 1 });

  if (input.qr) {
    const qrX = MARGIN + whoW + gap;
    fill(NAVY);
    doc.roundedRect(qrX, top, qrW, whoH, 8, 8, "F");
    const size = Math.min(qrW - 40, whoH - 52);
    const tileX = qrX + (qrW - size - 10) / 2;
    fill(WHITE);
    doc.roundedRect(tileX, top + 12, size + 10, size + 10, 5, 5, "F");
    try {
      doc.addImage(input.qr, "PNG", tileX + 5, top + 17, size, size, "track", "FAST");
    } catch {
      /* The reference below it is what the counter types. */
    }
    put("SCAN TO TRACK", qrX + qrW / 2, top + whoH - 22, {
      size: 5.8,
      style: "bold",
      align: "center",
      colour: SKY,
    });
    put("Fuatilia mzigo wako", qrX + qrW / 2, top + whoH - 12, { size: 6.5, align: "center", colour: [205, 215, 228] });
  }

  y = top + whoH + 12;

  // ---------------------------------------------------------- the figures
  const cols = 4;
  const cellW = CONTENT / cols;
  const cellH = 34;
  const rows = Math.ceil(input.details.length / cols);
  need(rows * cellH);
  const gridTop = y;
  stroke(HAIR, 0.8);
  doc.roundedRect(MARGIN, gridTop, CONTENT, rows * cellH, 8, 8, "S");
  input.details.forEach(([k, v], i) => {
    const cx = MARGIN + (i % cols) * cellW;
    const cy = gridTop + Math.floor(i / cols) * cellH;
    label(k, cx + 10, cy + 13);
    put(clip(orElse(v, "—"), cellW - 18, 9.5, "bold"), cx + 10, cy + 26, { size: 9.5, style: "bold" });
    if (i % cols !== 0) {
      stroke(HAIR, 0.6);
      doc.line(cx, cy + 7, cx, cy + cellH - 7);
    }
    if (i >= cols) {
      stroke(HAIR, 0.6);
      doc.line(cx + 6, cy, cx + cellW - 6, cy);
    }
  });
  y = gridTop + rows * cellH + 12;

  // Goods, on its own line as the screen carries it.
  need(16);
  label("Goods · Bidhaa", MARGIN, y);
  font(6.5, "bold");
  const goodsX = MARGIN + doc.getTextWidth("GOODS · BIDHAA") + 16;
  put(clip(orElse(input.goods, "Goods"), CONTENT - (goodsX - MARGIN), 9.5, "bold"), goodsX, y, {
    size: 9.5,
    style: "bold",
  });
  y += 14;

  // ------------------------------------------------------------ the lines
  if (input.lines.length > 0) {
    need(40, false);
    tableHead();

    input.lines.forEach((line, index) => {
      const cells = [
        wrap(line.reference, colW[0] - cellPad * 2, 7.5, "bold"),
        wrap(orElse(line.goods, "Goods"), colW[1] - cellPad * 2, 7.5),
        [
          ...wrap(line.packedAs, colW[2] - cellPad * 2, 7.5),
          ...(line.bale ? wrap(`Bale ${line.bale}`, colW[2] - cellPad * 2, 6.5) : []),
        ],
        [line.quantity],
        [line.dimensions],
        [line.cbm],
        [line.weight],
      ];
      const rowH = Math.max(...cells.map((c) => c.length)) * 10 + 10;

      if (need(rowH, true)) {
        /* The heading came with the new page; the row follows it. */
      }

      if (index % 2 === 1) {
        fill(ZEBRA);
        doc.rect(MARGIN, y, CONTENT, rowH, "F");
      }
      cells.forEach((cell, i) => {
        const c = COLUMNS[i];
        const x = c.right ? colX[i] + colW[i] - cellPad : colX[i] + cellPad;
        cell.forEach((text, n) => {
          const minor = i === 2 && n > 0;
          font(minor ? 6.5 : 7.5, i === 0 ? "bold" : "normal");
          ink(minor ? MUTED : i === 4 ? BODY : INK);
          doc.text(text, x, y + 12 + n * 10, { align: c.right ? "right" : "left" });
        });
      });
      stroke(HAIR, 0.6);
      doc.line(MARGIN, y + rowH, RIGHT, y + rowH);
      y += rowH;
    });

    const totalH = 18;
    need(totalH, true);
    stroke(NAVY, 1.4);
    doc.line(MARGIN, y, RIGHT, y);
    put("TOTAL", MARGIN + cellPad, y + 12.5, { size: 7, style: "bold", spacing: 0.8 });
    (
      [
        [3, input.totals.quantity],
        [5, input.totals.cbm],
        [6, input.totals.weight],
      ] as [number, string][]
    ).forEach(([i, v]) => {
      put(v, colX[i] + colW[i] - cellPad, y + 12.5, { size: 8, style: "bold", align: "right" });
    });
    y += totalH + 12;
  }

  // ------------------------------------------------------------- the terms
  const noteW = (CONTENT - 12) / 2;
  const panels = input.notes.slice(0, 2).map((note) => ({
    heading: wrap(note.heading.toUpperCase(), noteW - 24, 8, "bold"),
    body: wrap(note.body, noteW - 24, 7.8),
  }));
  if (panels.length > 0) {
    const innerH = Math.max(...panels.map((p) => p.heading.length * 10 + 4 + p.body.length * 10));
    const panelH = innerH + 24;
    need(panelH);
    panels.forEach((p, i) => {
      const px = MARGIN + i * (noteW + 12);
      fill(i === 0 ? PANEL : PEACH);
      doc.roundedRect(px, y, noteW, panelH, 8, 8, "F");
      lines(p.heading, px + 12, y + 18, 10, 8, i === 0 ? NAVY : PEACH_INK, "bold");
      lines(p.body, px + 12, y + 18 + p.heading.length * 10 + 4, 10, 7.8, i === 0 ? BODY : [82, 62, 52]);
    });
    y += panelH + 16;
  }

  // ---------------------------------------------------------- signatures
  need(46);
  const sigW = (CONTENT - 40) / 2;
  const signatures: [string, string][] = [
    ["Delivered by · Aliyeleta", "Name and signature"],
    [
      "Received by · Aliyepokea",
      input.receivedBy
        ? `${input.company.name} — ${orElse(input.receivedBy, "—")}`
        : input.company.name,
    ],
  ];
  signatures.forEach(([title, sub], i) => {
    const sx = MARGIN + i * (sigW + 40);
    stroke(FAINT, 0.7);
    doc.setLineDashPattern([2, 2], 0);
    doc.line(sx, y + 24, sx + sigW, y + 24);
    doc.setLineDashPattern([], 0);
    put(title.toUpperCase(), sx, y + 34, { size: 6.5, style: "bold", colour: [82, 82, 82], spacing: 0.9 });
    put(sub, sx, y + 43, { size: 6.5, colour: FAINT });
  });
  y += 56;

  need(24);
  stroke(HAIR, 0.8);
  doc.line(MARGIN, y, RIGHT, y);
  y += 12;
  const reach = [input.company.addressLines.join(", "), input.company.contact].filter(Boolean).join("  ·  ");
  if (reach) put(clip(reach, CONTENT - 150, 7), MARGIN, y, { size: 7, colour: MUTED });
  put(input.company.name.toUpperCase(), RIGHT, y, { size: 7, style: "bold", align: "right", colour: NAVY });

  const pages = doc.getNumberOfPages();
  if (pages > 1) {
    for (let p = 1; p <= pages; p++) {
      doc.setPage(p);
      put(`${input.reference} · page ${p} of ${pages}`, RIGHT, PAGE_H - 18, { size: 7, align: "right", colour: MUTED });
    }
  }

  return new Uint8Array(doc.output("arraybuffer"));
}
