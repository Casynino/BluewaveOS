import { jsPDF } from "jspdf";

import type { StickerData } from "@/components/app/cargo-sticker";

/**
 * THE BOX LABELS AS A FILE.
 *
 * Foshan prints these at the counter while the cartons are still on the floor,
 * and the browser's print path is the right one for that. This is the other
 * half: the same sheet as a file, for the floor that has no printer on the
 * network, for a label shop down the road, and for the record of what was stuck
 * on which box.
 *
 * One page per physical box, cut to the courier standard every thermal roll is
 * already cut to — 100 × 150 mm — so a PDF sent to a label printer comes out
 * the size the sticker was designed at rather than shrunk onto A4.
 *
 * Laid out down the card exactly as components/app/cargo-sticker.tsx lays it
 * out: whose box it is, then the code, then the details that settle an
 * argument. Everything arrives already formatted by lib/box-labels.ts; the
 * codes are drawn there, one per box, and never composed here.
 */

export type LabelPdfInput = {
  /** The company on the letterhead, from CompanySetting — never a literal. */
  company: string;
  tagline: string;
  logo?: string | null;
  stickers: StickerData[];
};

type RGB = [number, number, number];

/** 100 × 150 mm, in millimetres, because a label is a physical object. */
const W = 100;
const H = 150;
const PAD = 4;
const RIGHT = W - PAD;
const INNER = W - PAD * 2;

const BLACK: RGB = [0, 0, 0];
const RULE: RGB = [70, 70, 70];

/* The built-in Helvetica only draws Windows-1252. A Chinese product name would
   print as a row of stray marks across a sticker nobody can then read, so it is
   dropped and the reference carries the box. */
function plain(value: string | null | undefined) {
  return String(value ?? "")
    .replace(/[→⟶]/g, "-")
    .replace(/[−–]/g, "-")
    .replace(/[‘’]/g, "'")
    .replace(/[“”]/g, '"')
    .replace(/[^\x20-\x7E\xA0-\xFF]/g, "");
}

function orElse(value: string | null | undefined, fallback: string) {
  const kept = plain(value).replace(/\s{2,}/g, " ").trim();
  return kept.length > 0 ? kept : fallback;
}

export function renderLabelsPdf(input: LabelPdfInput): Uint8Array {
  const doc = new jsPDF({ unit: "mm", format: [W, H], compress: true });

  const font = (size: number, style: "normal" | "bold" = "normal", colour: RGB = BLACK) => {
    doc.setFontSize(size);
    doc.setFont("helvetica", style);
    doc.setTextColor(colour[0], colour[1], colour[2]);
  };
  /** One line, cut to the width rather than wrapped: a sticker has no spare row. */
  const clip = (value: string, width: number) => {
    const [first = ""] = doc.splitTextToSize(plain(value), width) as string[];
    return first;
  };

  input.stickers.forEach((sticker, index) => {
    if (index > 0) doc.addPage([W, H], "portrait");

    doc.setDrawColor(RULE[0], RULE[1], RULE[2]);
    doc.setLineWidth(0.3);
    doc.rect(0.5, 0.5, W - 1, H - 1, "S");

    // --------------------------------------------------------------- header
    let x = PAD;
    if (input.logo) {
      try {
        const props = doc.getImageProperties(input.logo);
        const side = 10;
        const w = props.width >= props.height ? side : (side * props.width) / props.height;
        const h = props.width >= props.height ? (side * props.height) / props.width : side;
        doc.addImage(input.logo, "PNG", PAD, PAD, w, h, "logo", "FAST");
        x = PAD + w + 2;
      } catch {
        /* A sticker without the mark still has its code, which is the part the
           counter scans. */
      }
    }
    font(10, "bold");
    doc.text(plain(input.company.toUpperCase()), x, PAD + 4.5, { charSpace: 0.3 });
    font(6);
    doc.text(clip(input.tagline, 52), x, PAD + 8);

    font(6, "bold");
    doc.text("BOX", RIGHT, PAD + 3, { align: "right", charSpace: 0.3 });
    font(16, "bold");
    const seq = String(sticker.sequence);
    doc.text(seq, RIGHT - doc.getTextWidth(` / ${sticker.total}`) * 0.56 - 0.5, PAD + 9.5, {
      align: "right",
    });
    font(9, "bold");
    doc.text(` / ${sticker.total}`, RIGHT, PAD + 9.5, { align: "right" });

    doc.setLineWidth(0.6);
    doc.line(PAD, PAD + 11.2, RIGHT, PAD + 11.2);

    // ------------------------------------------------------ whose box it is
    // The name is the biggest thing on the card: a clerk sorting a pallet is
    // looking for a person, not a number.
    font(17, "bold");
    doc.text(clip(orElse(sticker.shippingMark ?? sticker.customerName, sticker.reference).toUpperCase(), INNER), PAD, PAD + 18);
    const second = [
      sticker.shippingMark &&
      sticker.shippingMark.trim().toLowerCase() !== sticker.customerName.trim().toLowerCase()
        ? sticker.customerName
        : "",
      sticker.customerPhone ?? "",
    ]
      .filter(Boolean)
      .join(" · ");
    if (second) {
      font(9);
      doc.text(clip(second, INNER), PAD, PAD + 23);
    }

    // ------------------------------------------------------------- the code
    const qrSide = 58;
    const qrX = (W - qrSide) / 2;
    const qrY = PAD + 26;
    try {
      if (sticker.qr) doc.addImage(sticker.qr, "PNG", qrX, qrY, qrSide, qrSide, `qr${index}`, "FAST");
    } catch {
      /* A code that cannot be drawn leaves the reference below it, which the
         counter can type. */
    }

    font(20, "bold");
    doc.text(plain(sticker.reference), W / 2, qrY + qrSide + 8, { align: "center", charSpace: 0.4 });
    font(7.5);
    doc.text(
      clip(`${sticker.receiptNo ? `Receipt ${sticker.receiptNo} · ` : ""}${sticker.packageRef}`, INNER),
      W / 2,
      qrY + qrSide + 12,
      { align: "center" }
    );

    // -------------------------------------------------------------- footing
    const footY = H - PAD - 10;
    doc.setLineWidth(0.6);
    doc.line(PAD, footY, RIGHT, footY);
    font(9, "bold");
    doc.text(clip(orElse(sticker.description, "Goods"), INNER), PAD, footY + 4.2);

    const facts = [
      sticker.packagesLabel,
      sticker.weightLabel ?? "",
      sticker.cbmLabel ?? "",
      sticker.receivedOn,
    ].filter(Boolean);
    font(7.5);
    /* Spread across the foot the way the sticker spreads them, so the same four
       facts sit where the floor is used to finding them. */
    facts.forEach((fact, i) => {
      const align = i === 0 ? "left" : i === facts.length - 1 ? "right" : "center";
      const at = i === 0 ? PAD : i === facts.length - 1 ? RIGHT : PAD + (INNER * i) / (facts.length - 1);
      doc.text(plain(fact), at, footY + 8, { align });
    });
  });

  return new Uint8Array(doc.output("arraybuffer"));
}
