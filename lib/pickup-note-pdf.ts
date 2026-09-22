import { jsPDF } from "jspdf";

/**
 * THE PICKUP NOTE AS A FILE.
 *
 * The note used to exist only as a page with a print button, which on a phone
 * produces nothing that can be sent to the person actually coming to the
 * counter. This draws the same document — the sheet
 * app/app/finance/pickup-notes/[id]/page.tsx renders, section for section —
 * into a real PDF on the server.
 *
 * Everything arrives already formatted by lib/pickup-note-pdf-data.ts. This
 * module reads no database and works nothing out: the figures on a note are the
 * snapshot taken when it was written, and a second place that recomputed them
 * would be a second place that could disagree with the paper the customer is
 * holding.
 */

export type PickupNoteTone = "green" | "amber" | "grey" | "red";

export type PickupNotePdfInput = {
  /** A data URL of the logo, read from disk by the caller. */
  logo?: string | null;
  /**
   * The note's own counter code, as a PNG data URL — the same payload the
   * screen shows, never a fresh one. Null when the note can no longer be
   * scanned, and then the card says so instead.
   */
  qr?: string | null;
  company: {
    name: string;
    addressLines: string[];
    contact: string | null;
    email: string | null;
    tagline: string;
  };
  /** The note number, repeated on continuation pages. */
  reference: string;
  issuedOn: string;
  /** The state of the note, in both languages, as the counter reads it. */
  stamp: { label: string; swahili: string; tone: PickupNoteTone };
  collector: {
    name: string;
    code: string;
    phone: string;
    /** Named only when the goods were sent by somebody else. */
    sentBy: string | null;
  };
  details: [string, string][];
  /** The Dar warehouse row, which is not the office on the letterhead. */
  collectFrom: string | null;
  /** The amber paragraph a credit release carries, already written out. */
  credit: string | null;
  boxes: { sequence: string; description: string; collected: boolean }[];
  /** Both paragraphs the screen carries, English first and Kiswahili after. */
  notes: { heading: string; body: string }[];
  issuedBy: string | null;
};

type RGB = [number, number, number];

const PAGE_W = 595.28; // A4 in points
const PAGE_H = 841.89;
const MARGIN = 40;
const RIGHT = PAGE_W - MARGIN;
const CONTENT = RIGHT - MARGIN;
const BOTTOM = PAGE_H - 34; // nothing in the body may cross this

const NAVY: RGB = [10, 51, 80]; // the sheet's own #0a3350
const INK: RGB = [11, 27, 43];
const BODY: RGB = [64, 64, 64];
const MUTED: RGB = [115, 115, 115];
const HAIR: RGB = [214, 226, 238];
const PANEL: RGB = [245, 249, 252];
const WHITE: RGB = [255, 255, 255];
const PEACH: RGB = [255, 242, 234];
const PEACH_INK: RGB = [179, 68, 15];
const SKY: RGB = [159, 216, 245];
const AMBER_LINE: RGB = [252, 211, 77];
const AMBER_FILL: RGB = [255, 251, 235];
const AMBER_INK: RGB = [120, 53, 15];
const EMERALD: RGB = [5, 150, 105];

const TONES: Record<PickupNoteTone, { line: RGB; fill: RGB; ink: RGB }> = {
  green: { line: EMERALD, fill: [236, 253, 245], ink: [4, 120, 87] },
  amber: { line: [245, 158, 11], fill: AMBER_FILL, ink: [180, 83, 9] },
  grey: { line: [163, 163, 163], fill: [245, 245, 245], ink: [82, 82, 82] },
  red: { line: [220, 38, 38], fill: [254, 242, 242], ink: [185, 28, 28] },
};

/**
 * Fold text onto the character set the built-in font actually has.
 *
 * Helvetica in jsPDF is WinAnsi. A character outside it does not fall back — it
 * prints as a stray mark with the rest of the line letter-spaced into garbage.
 * The middle dot the Swahili headings are joined with is Latin-1 and survives;
 * a Chinese goods description does not, which is what `orElse` is for.
 */
function winAnsi(value: string) {
  return String(value)
    .replace(/[→⟶]/g, "—")
    .replace(/[−–]/g, "-")
    .replace(/[‘’]/g, "'")
    .replace(/[“”]/g, '"')
    .replace(/[^\x20-\x7E\xA0-\xFF—€]/g, "");
}

/**
 * What is left of a typed label once the font has had it — or the fallback.
 *
 * Foshan types descriptions in Chinese, and every Chinese character is dropped
 * from the page rather than drawn. A box line whose description vanished is a
 * tick box against nothing, so an emptied label is replaced with a word that
 * cannot itself disappear.
 */
function orElse(text: string, fallback: string): string {
  const kept = winAnsi(text).replace(/\(\s*\)/g, "").replace(/\s{2,}/g, " ").trim();
  return kept.length > 0 ? kept : fallback;
}

export function renderPickupNotePdf(input: PickupNotePdfInput): Uint8Array {
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
    // Letter-spacing is left-aligned only: jsPDF measures a right-aligned line
    // without it and the text would overrun its edge.
    doc.text(winAnsi(value), x, y, align === "left" && spacing ? { charSpace: spacing } : { align });
  }

  /** Wrapped lines at the given width, in the font they will be drawn with. */
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

  /** The small uppercase field name every block on the note is titled with. */
  function label(value: string, x: number, y: number, colour = MUTED, size = 6.5) {
    put(value.toUpperCase(), x, y, { size, style: "bold", colour, spacing: 1 });
  }

  /** One line of text cut to a width rather than wrapped, as the screen truncates. */
  function clip(value: string, width: number, size: number, style: "normal" | "bold" = "normal") {
    const [first = ""] = wrap(value, width, size, style);
    return first;
  }

  let y = 0;

  /**
   * A page with no mark on it is a page nobody can attribute, so a continuation
   * carries the band and the note number.
   */
  function newPage() {
    doc.addPage();
    fill(NAVY);
    doc.rect(0, 0, PAGE_W, 5, "F");
    put(`${input.reference} — continued`, MARGIN, 32, { size: 8, style: "bold", colour: MUTED });
    y = 48;
  }

  /** Reserve vertical space, breaking the page rather than running off it. */
  function need(height: number) {
    if (y + height > BOTTOM) {
      newPage();
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
      /* A note without its mark still has to be collectable; the name carries it. */
    }
  }
  const textX = MARGIN + tile + 12;
  put(input.company.name.toUpperCase(), textX, 36, { size: 13, style: "bold", colour: WHITE, spacing: 1.2 });
  put(input.company.tagline.toUpperCase(), textX, 46, { size: 6, style: "bold", colour: [255, 178, 125], spacing: 1.4 });
  const companyInfo = [input.company.addressLines.join(", "), input.company.contact ?? ""]
    .filter(Boolean)
    .flatMap((line) => wrap(line, 250, 6.8));
  lines(companyInfo.slice(0, 3), textX, 58, 8.5, 6.8, [200, 214, 228]);

  put("PICKUP NOTE", RIGHT, 34, { size: 7.5, style: "bold", align: "right", colour: SKY });
  put("HATI YA KUCHUKUA MZIGO", RIGHT, 43, { size: 6, align: "right", colour: [170, 186, 204] });
  put(input.reference, RIGHT, 64, { size: 17, style: "bold", align: "right", colour: WHITE });
  put(`Issued ${input.issuedOn}`, RIGHT, 76, { size: 7, align: "right", colour: [205, 215, 228] });

  // The rule: coral to peach to cyan, in three even steps.
  const ruleY = bandH - 12;
  const third = CONTENT / 3;
  ([[234, 74, 92], [255, 178, 125], [92, 205, 239]] as RGB[]).forEach((c, i) => {
    fill(c);
    doc.rect(MARGIN + i * third, ruleY, third + 0.5, 3, "F");
  });

  y = bandH + 18;

  // ------------------------------------------------ who, and the code
  const qrW = 150;
  const gap = 12;
  const whoW = CONTENT - qrW - gap;
  const qrX = MARGIN + whoW + gap;
  const pad = 14;

  const name = wrap(orElse(input.collector.name.toUpperCase(), input.collector.code), whoW - pad * 2, 15, "bold");
  /* Both languages on the chip, the way the counter reads it off the card. */
  const stampText = `${input.stamp.label.toUpperCase()} · ${input.stamp.swahili}`;
  const idText = "BRING PHOTO ID · LETA KITAMBULISHO";
  const whoH = Math.max(
    pad + 8 + 18 + (name.length - 1) * 17 + 14 + (input.collector.sentBy ? 12 : 0) + 24 + pad,
    132
  );

  need(whoH);
  const infoTop = y;

  fill(PANEL);
  stroke(HAIR, 0.8);
  doc.roundedRect(MARGIN, infoTop, whoW, whoH, 8, 8, "FD");

  let ly = infoTop + pad + 8;
  label("Collect by · Anayechukua", MARGIN + pad, ly);
  ly += 18;
  lines(name, MARGIN + pad, ly, 17, 15, INK, "bold");
  ly += (name.length - 1) * 17 + 13;
  put(`${input.collector.code} · ${input.collector.phone}`, MARGIN + pad, ly, { size: 9, colour: BODY });
  if (input.collector.sentBy) {
    ly += 12;
    put(`Sent by ${orElse(input.collector.sentBy, "—")}`, MARGIN + pad, ly, { size: 7.5, colour: MUTED });
  }

  /* The stamp and the identification pill sit on the floor of the panel, where
     the counter clerk's eye lands after the name. */
  const chipY = infoTop + whoH - pad - 13;
  const tone = TONES[input.stamp.tone];
  font(7, "bold");
  const stampW = doc.getTextWidth(stampText) + stampText.length * 1.2 + 16;
  fill(tone.fill);
  stroke(tone.line, 1.1);
  doc.roundedRect(MARGIN + pad, chipY, stampW, 15, 3, 3, "FD");
  put(stampText, MARGIN + pad + 8, chipY + 10, { size: 7, style: "bold", colour: tone.ink, spacing: 1.2 });

  font(6.5, "bold");
  const idW = doc.getTextWidth(idText) + idText.length * 1 + 18;
  fill(NAVY);
  doc.roundedRect(MARGIN + pad + stampW + 8, chipY, idW, 15, 7.5, 7.5, "F");
  put(idText, MARGIN + pad + stampW + 17, chipY + 10, { size: 6.5, style: "bold", colour: WHITE, spacing: 1 });

  // The code the Dar counter scans.
  fill(NAVY);
  doc.roundedRect(qrX, infoTop, qrW, whoH, 8, 8, "F");
  if (input.qr) {
    const size = Math.min(qrW - 40, whoH - 52);
    const tileX = qrX + (qrW - size - 10) / 2;
    fill(WHITE);
    doc.roundedRect(tileX, infoTop + 12, size + 10, size + 10, 5, 5, "F");
    try {
      doc.addImage(input.qr, "PNG", tileX + 5, infoTop + 17, size, size, "pickup", "FAST");
    } catch {
      /* A code that cannot be drawn leaves the number, which the counter can type. */
    }
    put("SCAN AT THE DAR COUNTER", qrX + qrW / 2, infoTop + whoH - 22, {
      size: 5.8,
      style: "bold",
      align: "center",
      colour: SKY,
      spacing: 0,
    });
    put("Valid once only", qrX + qrW / 2, infoTop + whoH - 12, { size: 6.5, align: "center", colour: [205, 215, 228] });
  } else {
    const gone = wrap("This code can no longer be scanned. The counter reads the note number.", qrW - 24, 7.5);
    lines(gone, qrX + 12, infoTop + whoH / 2 - 6, 10, 7.5, [205, 215, 228]);
  }

  y = infoTop + whoH + 12;

  // ---------------------------------------------------------- the cargo
  const cols = 3;
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
    label(k, cx + 12, cy + 13);
    put(clip(orElse(v, "—"), cellW - 22, 10, "bold"), cx + 12, cy + 26, { size: 10, style: "bold" });
    if (i % cols !== 0) {
      stroke(HAIR, 0.6);
      doc.line(cx, cy + 7, cx, cy + cellH - 7);
    }
    if (i >= cols) {
      stroke(HAIR, 0.6);
      doc.line(cx + 6, cy, cx + cellW - 6, cy);
    }
  });
  y = gridTop + rows * cellH + 10;

  // Where the goods are handed over: the Dar warehouse row, not the letterhead.
  if (input.collectFrom) {
    const where = wrap(input.collectFrom, CONTENT - 24, 10, "bold");
    const boxH = 20 + where.length * 12;
    need(boxH);
    stroke(HAIR, 0.8);
    fill(WHITE);
    doc.roundedRect(MARGIN, y, CONTENT, boxH, 8, 8, "FD");
    label("Collect from · Chukua mzigo", MARGIN + 12, y + 13);
    lines(where, MARGIN + 12, y + 26, 12, 10, INK, "bold");
    y += boxH + 10;
  }

  if (input.credit) {
    const note = wrap(input.credit, CONTENT - 24, 8);
    const boxH = note.length * 10 + 14;
    need(boxH);
    fill(AMBER_FILL);
    stroke(AMBER_LINE, 0.9);
    doc.roundedRect(MARGIN, y, CONTENT, boxH, 6, 6, "FD");
    lines(note, MARGIN + 12, y + 14, 10, 8, AMBER_INK);
    y += boxH + 10;
  }

  // -------------------------------------------- every box, checked out
  if (input.boxes.length > 0) {
    need(34);
    put("BOXES · MIZIGO", MARGIN, y + 8, { size: 9, style: "bold", spacing: 0.8 });
    put("Each box is scanned as it is handed over", RIGHT, y + 8, { size: 7, align: "right", colour: MUTED });
    y += 16;

    const boxCols = 3;
    const boxW = CONTENT / boxCols;
    const lineH = 13;
    const boxRows = Math.ceil(input.boxes.length / boxCols);
    const listH = boxRows * lineH + 16;
    need(listH);
    stroke(HAIR, 0.8);
    doc.roundedRect(MARGIN, y, CONTENT, listH, 8, 8, "S");

    input.boxes.forEach((box, i) => {
      const bx = MARGIN + (i % boxCols) * boxW + 10;
      const by = y + 8 + Math.floor(i / boxCols) * lineH + lineH - 4;
      if (box.collected) {
        fill(EMERALD);
        stroke(EMERALD, 0.7);
        doc.roundedRect(bx, by - 7, 8, 8, 1.5, 1.5, "FD");
        /* A tick drawn rather than typed: the check mark is not WinAnsi. */
        stroke(WHITE, 1);
        doc.line(bx + 1.8, by - 3.2, bx + 3.4, by - 1.4);
        doc.line(bx + 3.4, by - 1.4, bx + 6.3, by - 5.4);
      } else {
        stroke([163, 163, 163], 0.7);
        doc.roundedRect(bx, by - 7, 8, 8, 1.5, 1.5, "S");
      }
      put(box.sequence, bx + 13, by, { size: 7.5, style: "bold" });
      font(7.5, "bold");
      const seqW = doc.getTextWidth(winAnsi(box.sequence)) + 18;
      put(clip(orElse(box.description, "Goods"), boxW - seqW - 22, 7.5), bx + 13 + seqW, by, {
        size: 7.5,
        colour: BODY,
      });
    });
    y += listH + 12;
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
    ["Collected by · Aliyechukua", "Name, ID number and signature"],
    [
      "Released by · Aliyekabidhi",
      input.issuedBy ? `Note issued by ${orElse(input.issuedBy, "—")}` : "Name and signature",
    ],
  ];
  signatures.forEach(([title, sub], i) => {
    const sx = MARGIN + i * (sigW + 40);
    stroke([163, 163, 163], 0.7);
    doc.setLineDashPattern([2, 2], 0);
    doc.line(sx, y + 24, sx + sigW, y + 24);
    doc.setLineDashPattern([], 0);
    put(title.toUpperCase(), sx, y + 34, { size: 6.5, style: "bold", colour: [82, 82, 82], spacing: 0.9 });
    put(sub, sx, y + 43, { size: 6.5, colour: [163, 163, 163] });
  });
  y += 56;

  // ------------------------------------------------------------- footer
  need(24);
  stroke(HAIR, 0.8);
  doc.line(MARGIN, y, RIGHT, y);
  y += 12;
  const reach = [input.company.email, input.company.contact].filter(Boolean).join("  ·  ");
  if (reach) put(reach, MARGIN, y, { size: 7, colour: MUTED });
  put(input.company.name.toUpperCase(), RIGHT, y, { size: 7, style: "bold", align: "right", colour: NAVY, });

  // Page numbers once the page count is known. A one-page note is not told it
  // is page one of one.
  const pages = doc.getNumberOfPages();
  if (pages > 1) {
    for (let p = 1; p <= pages; p++) {
      doc.setPage(p);
      put(`${input.reference} · page ${p} of ${pages}`, RIGHT, PAGE_H - 18, { size: 7, align: "right", colour: MUTED });
    }
  }

  return new Uint8Array(doc.output("arraybuffer"));
}
